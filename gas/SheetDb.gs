/**
 * Lớp truy cập Postgres (Supabase, schema `fc`) qua PostgREST — thay hoàn
 * toàn cơ chế đọc/ghi Google Sheets cũ. Giữ TÊN các hàm cấp cao mà
 * Queries.gs/Mutations.gs/Auth.gs/Admin.gs... đang gọi (`readObjects_`,
 * `readObjectsWhere_`, `findOne_`, `appendObjects_`, `upsertRows_`,
 * `deleteRowsByKeys_`, `replaceRowsForScope_`, `productMap_`,
 * `assertKnownSkus_`, `activeOnly_`, `resetTableCache_`) để không phải sửa
 * lại toàn bộ nghiệp vụ — chỉ tầng lưu trữ bên dưới đổi.
 *
 * BỎ HẲN so với bản Sheets (không phải thiếu sót, là không còn cần nữa):
 *   - readTable_/writeTable_/findRowIndex_/writeRowPatch_ (mô hình "mảng
 *     dòng thô + bảng tên-cột→chỉ-số") — Postgres trả JSON object thật,
 *     không cần mô phỏng lại hình dạng của Sheet.
 *   - prefetchForAction_/prefetchAllSheets_/prefetchSheets_/ACTION_TABLES —
 *     toàn bộ cơ chế "gộp nhiều sheet vào 1 lần batchGet" chỉ tồn tại vì mỗi
 *     round-trip SpreadsheetApp tốn ~1 giây CỐ ĐỊNH. PostgREST rẻ hơn nhiều
 *     lần (xem De-xuat-Supabase-4-App-2026-09.md mục 1) nên đọc rời từng
 *     bảng lúc cần, không đọc trước những bảng không dùng tới, RẺ HƠN việc
 *     luôn kéo cả 12 bảng về mỗi request.
 * Xem Ke-hoach-Buoc2-FC-OEM-Export-Supabase.md để biết bối cảnh chung.
 */

// ---------------------------------------------------------------------
// CẤU HÌNH KẾT NỐI
// ---------------------------------------------------------------------

/**
 * Sheet tab name (SHEETS.*, khai ở Config.gs) -> tên bảng Postgres thật
 * (schema `fc`, xem Karofi-ID/supabase/schema-fc.sql). Giữ nguyên toàn bộ
 * chỗ gọi hiện có (chúng truyền SHEETS.PRODUCTS = 'Products' làm `name`)
 * bằng cách dịch ở ĐÚNG MỘT chỗ này.
 */
var PG_TABLE_MAP_ = {
  Users: 'users',
  BusinessUnits: 'business_units',
  Regions: 'regions',
  ProductGroups: 'product_groups',
  Products: 'products',
  ForecastCycles: 'forecast_cycles',
  ForecastVersions: 'forecast_versions',
  MonthlyForecastLines: 'monthly_forecast_lines',
  WeeklyRegionSplits: 'weekly_region_splits',
  Approvals: 'approvals',
  ActualSalesResults: 'actual_sales_results',
  AuthLog: 'auth_log'
};

function pgTable_(name) {
  var t = PG_TABLE_MAP_[name];
  if (!t) throw new Error('Không biết bảng Postgres tương ứng với "' + name + '".');
  return t;
}

function pgConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Thiếu Script Property SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY — '
      + 'xem Karofi-ID/supabase/schema-fc.sql mục 7.');
  }
  return { url: url, key: key };
}

/**
 * Gọi PostgREST. `path` là phần sau /rest/v1/ (vd 'products?select=*').
 * Luôn gửi Accept-Profile/Content-Profile: fc vì schema `fc` không phải
 * schema mặc định của PostgREST (`public`) — thiếu 2 header này thì mọi
 * bảng trong `fc` trả 404 dù đã bật Exposed schemas.
 */
function pgFetch_(method, path, opts) {
  opts = opts || {};
  var cfg = pgConfig_();
  var headers = {
    apikey: cfg.key,
    Authorization: 'Bearer ' + cfg.key,
    'Accept-Profile': 'fc',
    'Content-Profile': 'fc'
  };
  if (opts.prefer) headers.Prefer = opts.prefer;

  var params = { method: method, headers: headers, muteHttpExceptions: true };
  if (opts.body !== undefined) {
    params.contentType = 'application/json';
    params.payload = JSON.stringify(opts.body);
  }

  var resp = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + path, params);
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  var data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = text; }
  }

  if (code >= 400) {
    var msg = (data && typeof data === 'object' && (data.message || data.hint)) || String(data) || ('HTTP ' + code);
    throw new Error('Postgres lỗi (' + method.toUpperCase() + ' ' + path + '): ' + msg);
  }
  return data;
}

/**
 * Tổng số dòng THẬT của 1 bảng — dùng `Prefer: count=exact`, đọc header
 * `Content-Range` (dạng "0-0/5756") thay vì lấy cả mảng dữ liệu rồi đếm
 * `.length`. KHÁC BIỆT QUAN TRỌNG: PostgREST giới hạn số dòng trả về mỗi
 * lượt GET theo cấu hình `max-rows` của project (Settings > API) — nếu bảng
 * có nhiều dòng hơn giới hạn đó, `.length` sẽ báo THIẾU dù dữ liệu ghi đủ.
 * `Content-Range` không bị giới hạn này, luôn là tổng số dòng thật.
 *
 * Bug thật bắt được khi chạy migrateGhiThat_ trên MonthlyForecastLines
 * (5.756 dòng thật, nhưng readObjects_().length báo 2.000 — đúng bằng
 * max-rows của project, không phải ghi thiếu).
 */
function pgCount_(name) {
  var table = pgTable_(name);
  var cfg = pgConfig_();
  var resp = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + table + '?select=*&limit=1', {
    method: 'get',
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'Accept-Profile': 'fc',
      Prefer: 'count=exact'
    },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 400) {
    throw new Error('Postgres lỗi khi đếm ' + name + ': ' + resp.getContentText());
  }
  var headers = resp.getAllHeaders ? resp.getAllHeaders() : resp.getHeaders();
  var range = headers['Content-Range'] || headers['content-range'];
  if (!range) throw new Error('Không đọc được Content-Range khi đếm "' + name + '" — Prefer: count=exact có bị bỏ qua không?');
  var m = String(range).match(/\/(\d+|\*)$/);
  if (!m || m[1] === '*') throw new Error('Content-Range không có tổng số dòng cho "' + name + '": ' + range);
  return Number(m[1]);
}

/**
 * Giá trị cho filter `in.(...)` của PostgREST — bọc nháy kép để an toàn nếu
 * giá trị chứa dấu phẩy, RỒI encodeURIComponent CẢ CỤM (kể cả dấu nháy) mới
 * ghép vào URL. Bug thật (26/09/2026): bản đầu bọc nháy kép nhưng KHÔNG mã
 * hoá — `UrlFetchApp.fetch` của Apps Script từ chối thẳng URL chứa `"` chưa
 * mã hoá bằng lỗi "Invalid argument", chặn ngay phía client, Supabase còn
 * chưa kịp thấy request. PostgREST tự giải mã %XX trước khi đọc cú pháp
 * filter nên gửi dạng mã hoá vẫn đúng ý nghĩa, chỉ là an toàn khi truyền qua
 * URL thật.
 */
function pgEscapeInValue_(v) {
  return encodeURIComponent('"' + String(v).replace(/"/g, '\\"') + '"');
}

function uniqueValues_(arr) {
  var seen = {}, out = [];
  arr.forEach(function (v) {
    var k = String(v);
    if (seen[k]) return;
    seen[k] = true;
    out.push(v);
  });
  return out;
}

// ---------------------------------------------------------------------
// CACHE TRONG PHẠM VI MỘT REQUEST
//
// Khác bản Sheets (cache theo TÊN BẢNG, đọc cả bảng): cache theo TỪNG TRUY
// VẤN (tên bảng + bộ lọc), vì lọc đẩy xuống Postgres — hai truy vấn khác bộ
// lọc trên cùng bảng không còn là "đọc lại cùng dữ liệu" nữa. Đây chính là
// đổi để MonthlyForecastLines/WeeklyRegionSplits (phình theo version) không
// còn phải tải cả bảng chỉ để lấy 1 version — lý do FC được ưu tiên chuyển
// trước trong kế hoạch.
// ---------------------------------------------------------------------
var __queryCache_ = {};
var __productMapCache_ = null;

function resetTableCache_() {
  __queryCache_ = {};
  __productMapCache_ = null;
}

function invalidateCacheFor_(name) {
  var prefix = name + '|';
  Object.keys(__queryCache_).forEach(function (k) {
    if (k.indexOf(prefix) === 0) delete __queryCache_[k];
  });
  if (name === SHEETS.PRODUCTS) __productMapCache_ = null;
}

function pgQuery_(name, select, filter) {
  var key = name + '|' + select + '|' + (filter || '');
  if (__queryCache_[key]) return __queryCache_[key];
  var table = pgTable_(name);
  var path = table + '?select=' + encodeURIComponent(select) + (filter ? '&' + filter : '');
  var rows = pgFetch_('get', path) || [];
  __queryCache_[key] = rows;
  return rows;
}

// ---------------------------------------------------------------------
// ĐỌC
// ---------------------------------------------------------------------

function readObjects_(name) {
  return pgQuery_(name, '*');
}

/**
 * @param {string|number|Array|function} accept Giá trị cần khớp (so bằng
 *     eq), MẢNG giá trị (so bằng in — dùng khi trước đây gọi với 1 hàm kiểm
 *     tra "có nằm trong tập id đã tính trước" không), hoặc HÀM (giữ tương
 *     thích ngược — xem cảnh báo trong thân hàm).
 */
function readObjectsWhere_(name, field, accept) {
  if (typeof accept === 'function') {
    // Không dịch được thành SQL filter — rơi về đọc cả bảng rồi lọc tại chỗ,
    // ĐÚNG hành vi bản Sheets cũ. Những bảng lớn (MONTHLY_LINES/WEEKLY_SPLITS)
    // không nên gọi theo kiểu này; các chỗ gọi hiện tại kiểu này (getB0Summary_,
    // getB1Summary_, getSapExport_, getSapGt2Weekly_) đã được sửa để truyền
    // mảng version_id thay vì hàm — xem Queries.gs.
    return readObjects_(name).filter(function (row) { return accept(row[field]); });
  }
  if (Array.isArray(accept)) {
    return pgQueryChunkedIn_(name, '*', field, accept);
  }
  var filter = field + '=eq.' + encodeURIComponent(String(accept));
  return pgQuery_(name, '*', filter);
}

/**
 * `field=in.(...)` CHIA NHỎ theo lô (PG_CO_LON_IN_ giá trị/lượt) rồi gộp kết
 * quả — dùng chung cho readObjectsWhere_ (mảng) và pgExistingKeySet_, tránh
 * sửa cùng 1 lớp bug ("Limit Exceeded: URLFetch URL Length") ở 2 nơi. Xem
 * chú thích đầy đủ ở PG_CO_LON_IN_.
 */
function pgQueryChunkedIn_(name, select, field, values) {
  var vals = uniqueValues_(values);
  if (!vals.length) return [];
  var out = [];
  for (var i = 0; i < vals.length; i += PG_CO_LON_IN_) {
    var phanDoan = vals.slice(i, i + PG_CO_LON_IN_);
    var filter = field + '=in.(' + phanDoan.map(pgEscapeInValue_).join(',') + ')';
    out = out.concat(pgQuery_(name, select, filter));
  }
  return out;
}

function findOne_(name, field, value) {
  var rows = readObjectsWhere_(name, field, value);
  return rows.length ? rows[0] : null;
}

// ---------------------------------------------------------------------
// GHI
// ---------------------------------------------------------------------

function appendObjects_(name, objects) {
  if (!objects || !objects.length) return;
  invalidateCacheFor_(name);
  pgFetch_('post', pgTable_(name), { body: objects, prefer: 'return=minimal' });
}

/**
 * Sửa MỘT dòng theo khoá — thay cho readTable_+findRowIndex_+writeRowPatch_.
 * Ném lỗi nếu không tìm thấy dòng (đối xứng với writeRowPatch_ cũ vốn cũng
 * đòi rowIndex hợp lệ được tìm trước đó).
 */
function patchByKey_(name, keyField, keyValue, patch) {
  invalidateCacheFor_(name);
  var table = pgTable_(name);
  var filter = keyField + '=eq.' + encodeURIComponent(String(keyValue));
  var res = pgFetch_('patch', table + '?' + filter, { body: patch, prefer: 'return=representation' });
  if (!res || !res.length) {
    throw new Error('Không tìm thấy dòng ' + name + ' với ' + keyField + '=' + keyValue + ' để sửa.');
  }
  return res[0];
}

/**
 * Sửa MỌI dòng khớp bộ lọc bằng CÙNG một patch — thay cho vòng lặp
 * readTable_ rồi mutate tại chỗ rồi writeTable_ cả khối (vd: bỏ cờ is_final
 * của các version anh chị em khi tạo version mới; huỷ các yêu cầu duyệt
 * đang chờ của cùng chu kỳ khi gửi duyệt bản mới).
 */
function patchWhere_(name, filters, patch) {
  invalidateCacheFor_(name);
  var table = pgTable_(name);
  var qs = Object.keys(filters).map(function (f) {
    return f + '=eq.' + encodeURIComponent(String(filters[f]));
  }).join('&');
  return pgFetch_('patch', table + '?' + qs, { body: patch, prefer: 'return=minimal' });
}

/** Xoá TOÀN BỘ dòng của 1 bảng — thay cho sheet.getRange(...).clearContent()
 *  trong importProducts_(replace=true). is.not.null luôn đúng nên khớp mọi
 *  dòng; PostgREST DELETE không filter thì bị chặn mặc định, đây là cách
 *  viết tường minh "tôi thật sự muốn xoá hết", không phải quên filter. */
function pgDeleteAll_(name) {
  invalidateCacheFor_(name);
  var table = pgTable_(name);
  var pk = PG_PRIMARY_KEY_[name];
  if (!pk) throw new Error('pgDeleteAll_: chưa khai khoá chính của "' + name + '".');
  pgFetch_('delete', table + '?' + pk + '=not.is.null', { prefer: 'return=minimal' });
}

var PG_PRIMARY_KEY_ = { Products: 'sku_code', Users: 'id' };

/**
 * Số giá trị tối đa cho mỗi lượt gọi filter `in.(...)` — CHIA NHỎ thay vì
 * nhét hết vào 1 URL. Bug thật (26/09/2026, lộ ra khi dữ liệu tăng đủ lớn):
 * 1 lô 300 dòng MonthlyForecastLines có thể trải trên hàng trăm version_id
 * KHÁC NHAU, dựng URL 1 lần cho ngần đó giá trị vượt giới hạn độ dài URL của
 * `UrlFetchApp` ("Limit Exceeded: URLFetch URL Length") — lỗi client-side,
 * Supabase còn chưa kịp thấy request, cùng nguyên nhân gốc với lỗi "Invalid
 * argument" trước đó (dựng URL không giới hạn theo số lượng giá trị đầu vào).
 * Dùng chung cho `pgQueryChunkedIn_` (đọc) và `pgExistingKeySet_` (kiểm tồn
 * tại trước upsert) — 2 nơi độc lập nhau (khác tầng: có/không qua cache của
 * pgQuery_) nhưng CÙNG một lớp bug, nên chia sẻ đúng 1 hằng số.
 */
var PG_CO_LON_IN_ = 40;

/**
 * Tập khoá tổ hợp ĐÃ CÓ trong bảng, trong số các dòng sắp upsert — dùng để
 * đếm chính xác bao nhiêu dòng là "sửa" so với "thêm mới" (upsertProducts_
 * và các báo cáo saveMonthlyLines_/saveWeeklySplits_/saveActuals_ đều hiện
 * 2 con số này ra người dùng). Lọc theo CỘT KHOÁ ĐẦU TIÊN (trong thực tế
 * luôn là version_id/business_unit_code — đã tự giới hạn phạm vi hẹp) rồi so
 * đủ bộ khoá tại chỗ, tránh dựng filter tổ hợp or=(and(...),...) dài cho
 * hàng trăm dòng.
 */
function pgExistingKeySet_(table, keyFields, records) {
  var out = {};
  var firstField = keyFields[0];
  var firstValues = uniqueValues_(records.map(function (r) { return r[firstField]; }));
  if (!firstValues.length) return out;
  var select = keyFields.join(',');

  for (var i = 0; i < firstValues.length; i += PG_CO_LON_IN_) {
    var phanDoan = firstValues.slice(i, i + PG_CO_LON_IN_);
    var filter = firstField + '=in.(' + phanDoan.map(pgEscapeInValue_).join(',') + ')';
    var rows = pgFetch_('get', table + '?select=' + encodeURIComponent(select) + '&' + filter) || [];
    rows.forEach(function (row) {
      var k = keyFields.map(function (f) { return String(row[f]); }).join('\u0001');
      out[k] = true;
    });
  }
  return out;
}

/**
 * Upsert + xoá theo khoá tổ hợp trong MỘT lượt — thay applyRowChanges_ cũ
 * (đọc cả bảng, dựng map, mutate, ghi lại 1 setValues). Postgres làm việc
 * này bằng chính cơ chế của nó: DELETE theo filter, INSERT với
 * on_conflict=<keyFields> + Prefer: resolution=merge-duplicates.
 *
 * `keyNormalizers` KHÔNG còn cần thiết như bản Sheets: đó là lớp vá cho dữ
 * liệu cũ lưu sai định dạng (Sheets tự đổi "2026-09-01" thành ô ngày). Cột
 * Postgres là `text` thuần, ghi gì đọc lại đúng nấy — miễn dữ liệu nạp ban
 * đầu (migrate) đã chuẩn hoá sạch. Tham số vẫn nhận để không phải sửa chữ
 * ký ở các chỗ gọi, nhưng bị bỏ qua.
 */
function applyRowChanges_(name, keyFields, upserts, deletes, keyNormalizers) {
  upserts = upserts || [];
  deletes = deletes || [];
  invalidateCacheFor_(name);
  var table = pgTable_(name);

  var deletedCount = 0;
  deletes.forEach(function (rec) {
    var filter = keyFields.map(function (f) {
      return f + '=eq.' + encodeURIComponent(String(rec[f]));
    }).join('&');
    var res = pgFetch_('delete', table + '?' + filter, { prefer: 'return=representation' });
    deletedCount += (res || []).length;
  });

  var insertedCount = 0, updatedCount = 0;
  if (upserts.length) {
    var existingKeys = pgExistingKeySet_(table, keyFields, upserts);
    upserts.forEach(function (rec) {
      var k = keyFields.map(function (f) { return String(rec[f]); }).join('\u0001');
      if (existingKeys[k]) updatedCount++; else insertedCount++;
    });

    var onConflict = keyFields.join(',');
    pgFetch_('post', table + '?on_conflict=' + encodeURIComponent(onConflict), {
      body: upserts,
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
  }

  return { total: upserts.length + deletes.length, updated: updatedCount, inserted: insertedCount, deleted: deletedCount };
}

function upsertRows_(name, keyFields, records) {
  return applyRowChanges_(name, keyFields, records, []);
}

function deleteRowsByKeys_(name, keyFields, records) {
  return applyRowChanges_(name, keyFields, [], records);
}

/**
 * Thay TOÀN BỘ dữ liệu thuộc 1 version bằng bộ bản ghi mới, TRONG 1 GIAO DỊCH
 * thật (xem hàm RPC fc.replace_monthly_lines/fc.replace_weekly_splits ở
 * schema-fc.sql) — khác 2 lệnh DELETE rồi INSERT rời rạc, vốn có 1 khoảng hở
 * (giữa 2 lệnh HTTP) mà dữ liệu bị xoá nhưng chưa kịp ghi lại nếu request
 * chết giữa chừng.
 */
function replaceRowsForScope_(name, scopeField, scopeValue, records) {
  if (scopeField !== 'version_id') {
    throw new Error('replaceRowsForScope_ (Postgres) hiện chỉ hỗ trợ scopeField = version_id.');
  }
  var rpc;
  if (name === SHEETS.MONTHLY_LINES) rpc = 'replace_monthly_lines';
  else if (name === SHEETS.WEEKLY_SPLITS) rpc = 'replace_weekly_splits';
  else throw new Error('replaceRowsForScope_ (Postgres) chưa có RPC cho bảng ' + name + '.');

  var before = readObjectsWhere_(name, scopeField, scopeValue).length;
  invalidateCacheFor_(name);
  pgFetch_('post', 'rpc/' + rpc, { body: { p_version_id: scopeValue, p_records: records || [] } });
  return { total: (records || []).length, inserted: (records || []).length, updated: 0, deleted: before };
}

// ---------------------------------------------------------------------
// DANH MỤC SẢN PHẨM DÙNG CHUNG TRONG 1 REQUEST (không đổi ý nghĩa/API)
// ---------------------------------------------------------------------

function productMap_() {
  if (!__productMapCache_) {
    var map = {};
    readObjects_(SHEETS.PRODUCTS).forEach(function (p) { map[p.sku_code] = p; });
    __productMapCache_ = map;
  }
  return __productMapCache_;
}

/**
 * Từ chối ghi số cho SKU không có trong danh mục Products — không đổi so
 * với bản Sheets, vẫn dựa trên readObjects_ + productMap_ đã port ở trên.
 */
function assertKnownSkus_(skuCodes) {
  if (!skuCodes.length) return;

  var known = {};
  readObjects_(SHEETS.PRODUCTS).forEach(function (p) {
    known[normalizeSku_(p.sku_code)] = true;
  });

  var unknown = [];
  var seen = {};
  skuCodes.forEach(function (sku) {
    if (!sku || known[sku] || seen[sku]) return;
    seen[sku] = true;
    unknown.push(sku);
  });

  if (unknown.length) {
    throw new Error(
      'Có ' + unknown.length + ' mã SKU chưa có trong danh mục Products: ' +
      unknown.slice(0, 10).join(', ') + (unknown.length > 10 ? ', ...' : '') +
      '. Thêm vào danh mục trước khi nhập số cho các mã này.'
    );
  }
}

/**
 * True nếu is_active coi là ĐANG BẬT — trống/undefined cũng coi là bật (đúng
 * quy ước Sheet cũ, giữ nguyên khi chuyển Postgres). Nhận cả boolean thật
 * (`true`/`false` — Postgres) lẫn chuỗi cũ ('1'/'0'/'true'/'false' — sót lại
 * từ dữ liệu Sheet nếu có).
 *
 * VÌ SAO CẦN HÀM RIÊNG, không để mỗi nơi tự viết `=== '1'`: bug thật
 * (27/09/2026, ngay sau khi cắt luồng) — `createCycle_` (Mutations.gs) tự so
 * `String(buRow.is_active) !== '1'`, mà `String(true)` ra `"true"` chứ không
 * phải `"1"`, nên MỌI đơn vị (kể cả đang bật) đều bị coi là "đã ngừng dùng".
 * Quét lại cả `gas/` thấy thêm 3 chỗ khác cùng lỗi (chỉ so `'1'`/`'0'` một
 * mình, thiếu nhánh boolean) — dùng đúng 1 hàm này thay vì tự so lại.
 */
function laDangBat_(v) {
  if (v === undefined || v === null || v === '') return true;
  return String(v) === '1' || String(v).toLowerCase() === 'true';
}

function activeOnly_(list) {
  return list.filter(function (x) { return laDangBat_(x.is_active); });
}
