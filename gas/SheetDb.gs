/**
 * Lớp truy cập Google Sheets: đọc/ghi theo khối, bám theo tên cột
 * Một phần của backend FC App — clasp push gộp mọi file .gs vào cùng
 * một phạm vi toàn cục, nên các file gọi chéo hàm của nhau bình thường.
 */

// ---------------------------------------------------------------------
// LỚP TRUY CẬP GOOGLE SHEETS (đọc/ghi theo khối, đối chiếu theo tên cột)
// ---------------------------------------------------------------------

/**
 * Cache handle Spreadsheet trong phạm vi một lần thực thi (và thường
 * còn sống tiếp qua nhiều request nếu container Apps Script chưa bị thu
 * hồi). SpreadsheetApp.openById() là một round-trip mạng thật — một
 * action gộp như getApprovalsWorkspace từng gọi lại nó tới 9 lần trong
 * CÙNG một request (mỗi lần đọc sheet lại mở lại từ đầu), cộng dồn thành
 * hàng chục giây độ trễ thật ở server, chứ không chỉ là cold-start front-end.
 */
var __ssCache_ = null;

function getSpreadsheet_() {
  if (!__ssCache_) {
    __ssCache_ = SpreadsheetApp.openById(SPREADSHEET_ID);
    diagMark_('openById (lần đầu)');
  }
  return __ssCache_;
}

function getOrCreateSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (SCHEMA[name]) {
      sheet.appendRow(SCHEMA[name]);
      sheet.getRange(1, 1, 1, SCHEMA[name].length)
        .setFontWeight('bold').setBackground('#0284c7').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * Cache theo tên sheet trong phạm vi MỘT request — một action gộp như
 * getApprovalsWorkspace đọc VERSIONS/CYCLES/PRODUCTS nhiều lần trong
 * cùng một lượt xử lý (getApprovals_ rồi lại getVersionSummary_), mỗi
 * lần đọc lại toàn bộ 1141 dòng Products là một round-trip mạng thật.
 * Router.gs gọi resetTableCache_() ở đầu mỗi request để không dính dữ
 * liệu cũ giữa các request khác nhau.
 *
 * Không cần invalidate thủ công: writeRowPatch_ và upsertRows_ (qua
 * writeTable_) đều sửa TRỰC TIẾP lên object đang cache (table.rows[i] =
 * ... hoặc t.rows = t.rows.concat(...)), nên cache tự động phản ánh đúng
 * dữ liệu vừa ghi. appendObjects_ cũng đẩy dòng mới vào t.rows sau khi
 * ghi sheet — xem hàm đó bên dưới. Quy tắc khi thêm hàm ghi mới: LUÔN
 * mutate object cache đang có (không tạo bản sao rời), nếu không cache
 * sẽ lệch với sheet thật trong phần còn lại của request.
 */
var __tableCache_ = {};

function resetTableCache_() {
  __tableCache_ = {};
}

/** Dựng object {sheet, headers, rows, idx} từ dữ liệu 2 chiều đã đọc sẵn. */
function buildTableFromValues_(name, sheet, values) {
  var headers = values.length ? values[0].map(function (h) { return String(h).trim(); }) : (SCHEMA[name] || []);

  if (!values.length || !headers.length || headers.join('') === '') {
    headers = SCHEMA[name] || [];
    if (headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    return { sheet: sheet, headers: headers, rows: [], idx: indexOf_(headers) };
  }

  return {
    sheet: sheet,
    headers: headers,
    rows: values.slice(1).filter(function (r) { return r.join('') !== ''; }),
    idx: indexOf_(headers)
  };
}

/**
 * Đọc toàn bộ sheet đúng một lần. Trả về headers, rows (mảng thô có thể
 * sửa tại chỗ) và idx (tên cột → chỉ số), để mọi thao tác ghi bám theo
 * TÊN CỘT chứ không theo thứ tự cứng.
 *
 * Đường đi CHẬM (một round-trip SpreadsheetApp riêng cho sheet này) —
 * chỉ chạy khi prefetchAllSheets_() chưa gom sẵn dữ liệu (sheet mới tạo
 * sau lúc prefetch, hoặc batchGet lỗi phải rơi về cách cũ).
 */
function readTable_(name) {
  if (__tableCache_[name]) return __tableCache_[name];

  var sheet = getOrCreateSheet_(name);
  var values = sheet.getDataRange().getValues();
  var table = buildTableFromValues_(name, sheet, values);

  __tableCache_[name] = table;
  diagMark_('đọc rời ' + name + ' (' + table.rows.length + ' dòng)');
  return table;
}

/**
 * Đọc TẤT CẢ sheet trong SCHEMA bằng đúng MỘT lệnh Sheets API batchGet,
 * thay vì để readTable_ mở round-trip riêng cho từng sheet một. Đo thực
 * tế: mỗi round-trip SpreadsheetApp tốn ~0.9-1.2 giây CỐ ĐỊNH bất kể
 * sheet rỗng hay 1141 dòng — một action gộp đọc 5-9 sheet khác nhau thì
 * cộng dồn thành nhiều giây dù đã cache handle Spreadsheet. Gộp thành 1
 * lệnh network duy nhất giải quyết tận gốc, không chỉ giảm số lần mở lại.
 *
 * Cần Advanced Service "Sheets" bật trong appsscript.json. Nếu vì lý do
 * gì đó batchGet lỗi (service chưa bật, quota, ...), bắt lỗi và để trống
 * cache — readTable_ ở trên tự động rơi về đọc rời từng sheet như cũ,
 * KHÔNG làm hỏng request đang chạy.
 */
function prefetchAllSheets_() {
  var names = Object.keys(SCHEMA);
  names.forEach(function (name) { getOrCreateSheet_(name); }); // đảm bảo tồn tại, tra cứu local sau openById

  try {
    var response = Sheets.Spreadsheets.Values.batchGet(SPREADSHEET_ID, { ranges: names });
    var valueRanges = response.valueRanges || [];

    names.forEach(function (name, i) {
      var values = (valueRanges[i] && valueRanges[i].values) || [];
      var sheet = getOrCreateSheet_(name);
      __tableCache_[name] = buildTableFromValues_(name, sheet, values);
    });

    diagMark_('batchGet ' + names.length + ' sheet trong 1 lần gọi');
  } catch (err) {
    diagMark_('batchGet lỗi (' + err.message + '), rơi về đọc rời từng sheet');
  }
}

function indexOf_(headers) {
  var idx = {};
  headers.forEach(function (h, i) { idx[h] = i; });
  return idx;
}

function readObjects_(name) {
  var t = readTable_(name);
  return t.rows.map(function (r) { return rowToObject_(t.headers, r); });
}

function rowToObject_(headers, row) {
  var o = {};
  headers.forEach(function (h, i) {
    var v = row[i];
    o[h] = (v instanceof Date) ? v.toISOString() : v;
  });
  return o;
}

function objectToRow_(headers, obj, existingRow) {
  return headers.map(function (h, i) {
    if (Object.prototype.hasOwnProperty.call(obj, h)) return obj[h];
    return existingRow ? existingRow[i] : '';
  });
}

/** Ghi lại toàn bộ vùng dữ liệu bằng MỘT lệnh setValues. */
function writeTable_(name, table) {
  var sheet = table.sheet || getOrCreateSheet_(name);
  var headers = table.headers;
  var lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }
  if (table.rows.length) {
    sheet.getRange(2, 1, table.rows.length, headers.length).setValues(
      table.rows.map(function (r) {
        var out = r.slice(0, headers.length);
        while (out.length < headers.length) out.push('');
        return out;
      })
    );
  }
}

function writeRowPatch_(name, table, rowIndex, patch) {
  if (rowIndex < 0) throw new Error('Không tìm thấy dòng cần cập nhật trong ' + name);
  var sheet = table.sheet || getOrCreateSheet_(name);
  var row = table.rows[rowIndex];

  Object.keys(patch).forEach(function (field) {
    var col = table.idx[field];
    if (col === undefined) throw new Error('Sheet ' + name + ' thiếu cột "' + field + '".');
    row[col] = patch[field];
  });

  sheet.getRange(rowIndex + 2, 1, 1, table.headers.length).setValues([
    row.slice(0, table.headers.length)
  ]);
}

function appendObjects_(name, objects) {
  if (!objects.length) return;
  var t = readTable_(name);
  var sheet = t.sheet;
  var startRow = t.rows.length + 2;
  var values = objects.map(function (o) { return objectToRow_(t.headers, o, null); });
  sheet.getRange(startRow, 1, values.length, t.headers.length).setValues(values);

  // Đẩy luôn vào t.rows (object đang được cache trong readTable_) để một
  // lệnh đọc khác trong CÙNG request thấy ngay dòng vừa thêm, không phải
  // đọc lại sheet từ đầu.
  values.forEach(function (row) { t.rows.push(row); });
}

/**
 * Upsert theo khoá tổ hợp: đọc 1 lần, dựng map khoá → dòng, cập nhật
 * tại chỗ, dòng mới thì nối thêm, rồi ghi bằng một lệnh setValues.
 * Đây là chỗ thay cho appendRow-trong-vòng-lặp của bản cũ.
 */
function upsertRows_(name, keyFields, records) {
  if (!records.length) return { total: 0, updated: 0, inserted: 0 };

  var t = readTable_(name);
  keyFields.forEach(function (f) {
    if (t.idx[f] === undefined) throw new Error('Sheet ' + name + ' thiếu cột khoá "' + f + '".');
  });

  var keyOf = function (getter) {
    return keyFields.map(function (f) { return String(getter(f)); }).join('');
  };

  var index = {};
  t.rows.forEach(function (row, i) {
    index[keyOf(function (f) { return row[t.idx[f]]; })] = i;
  });

  var updated = 0;
  var inserted = 0;
  var newRows = [];

  records.forEach(function (rec) {
    var key = keyOf(function (f) { return rec[f]; });
    var at = index[key];
    if (at === undefined) {
      var row = objectToRow_(t.headers, rec, null);
      index[key] = t.rows.length + newRows.length;
      newRows.push(row);
      inserted++;
    } else {
      var target = at < t.rows.length ? t.rows[at] : newRows[at - t.rows.length];
      t.headers.forEach(function (h, i) {
        // giữ nguyên id gốc để dòng không đổi định danh khi cập nhật
        if (h === 'id') return;
        if (Object.prototype.hasOwnProperty.call(rec, h)) target[i] = rec[h];
      });
      updated++;
    }
  });

  t.rows = t.rows.concat(newRows);
  writeTable_(name, t);

  return { total: records.length, updated: updated, inserted: inserted };
}

function findRowIndex_(table, field, value) {
  var col = table.idx[field];
  if (col === undefined) return -1;
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][col]) === String(value)) return i;
  }
  return -1;
}

function findOne_(name, field, value) {
  var t = readTable_(name);
  var i = findRowIndex_(t, field, value);
  return i < 0 ? null : rowToObject_(t.headers, t.rows[i]);
}

function updateCycleStatus_(cycleId, status) {
  var t = readTable_(SHEETS.CYCLES);
  var i = findRowIndex_(t, 'id', cycleId);
  if (i < 0) throw new Error('Không tìm thấy chu kỳ: ' + cycleId);
  writeRowPatch_(SHEETS.CYCLES, t, i, { status: status });
}

function versionContext_(versionId) {
  var version = findOne_(SHEETS.VERSIONS, 'id', versionId);
  if (!version) throw new Error('Không tìm thấy version: ' + versionId);
  var cycle = findOne_(SHEETS.CYCLES, 'id', version.cycle_id);
  if (!cycle) throw new Error('Version không gắn với chu kỳ nào.');
  return { version: version, cycle: cycle };
}

function productMap_() {
  var map = {};
  readObjects_(SHEETS.PRODUCTS).forEach(function (p) { map[p.sku_code] = p; });
  return map;
}

function activeOnly_(list) {
  return list.filter(function (x) {
    if (x.is_active === undefined || x.is_active === '') return true;
    return String(x.is_active) === '1' || String(x.is_active).toLowerCase() === 'true';
  });
}

