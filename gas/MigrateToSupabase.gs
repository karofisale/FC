/**
 * MigrateToSupabase.gs — nạp dữ liệu THẬT từ Sheet sang Postgres (schema
 * `fc`), MỘT LẦN, trước khi cắt luồng. Chạy tay trong trình soạn thảo Apps
 * Script — không mở qua HTTP.
 *
 * VÌ SAO LÀ FILE RIÊNG, không dùng readObjects_/appendObjects_ trực tiếp:
 * hai hàm đó (SheetDb.gs) giờ đọc/ghi PostgREST — không còn cách nào đọc
 * SHEET qua chúng nữa. File này là CẦU NỐI một lần: đọc Sheet bằng
 * SpreadsheetApp thẳng (như bản cũ), CHUYỂN KIỂU cho khớp cột Postgres, rồi
 * gọi appendObjects_ (đã có sẵn, không viết lại) để ghi.
 *
 * THỨ TỰ BẢNG BẮT BUỘC theo khoá ngoại (schema-fc.sql) — làm sai thứ tự thì
 * bảng sau ghi trước sẽ bị Postgres từ chối vì FK chưa có bảng cha:
 *   business_units, regions, product_groups, products, users,
 *   forecast_cycles, forecast_versions, monthly_forecast_lines,
 *   weekly_region_splits, approvals, actual_sales_results.
 * (auth_log CỐ Ý BỎ QUA — xem migrateGhiThat_.)
 *
 * Quy trình: migrateXemTruoc_() (chỉ đọc, không ghi) → soát kỹ log →
 * migrateGhiThat_() (ghi thật, có đối chiếu số dòng sau khi ghi).
 */

// ---------------------------------------------------------------------
// ĐỌC SHEET THÔ (không qua SheetDb.gs — hàm đó giờ trỏ Postgres)
// ---------------------------------------------------------------------

function msDocSheetTho_(tenTab) {
  var sheet = getSpreadsheet_().getSheetByName(tenTab);
  if (!sheet) throw new Error('Không tìm thấy tab "' + tenTab + '" trên Sheet.');
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  return values.slice(1)
    .filter(function (r) { return r.join('') !== ''; })
    .map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { o[h] = r[i]; });
      return o;
    });
}

// ---------------------------------------------------------------------
// CHUYỂN KIỂU — Sheet không có kiểu (mọi ô có thể là chuỗi/số/Date lẫn lộn),
// Postgres thì có. Một chỗ chịu trách nhiệm diễn giải, không rải khắp nơi.
// ---------------------------------------------------------------------

/** is_active: Ô TRỐNG = ĐANG BẬT — đúng quy ước activeOnly_ (SheetDb.gs). */
function msBoolActive_(v) {
  if (v === '' || v === null || v === undefined) return true;
  var s = String(v).trim().toLowerCase();
  return !(s === '0' || s === 'false' || s === 'no' || s === 'khong');
}

/** is_final: PHẢI ghi rõ mới là true — khác is_active, không có quy ước
 *  "trống = bật" ở đây (mọi version do app tạo đều ghi rõ 0/1 tường minh). */
function msBoolExplicit_(v) {
  return String(v).trim() === '1' || v === true;
}

/**
 * Đọc số, chấp nhận cả hai kiểu dấu phân cách (Excel VN: chấm=nghìn,
 * phẩy=thập phân; Excel Anh: ngược lại) — CÙNG QUY TẮC đã kiểm bằng test ở
 * client/src/utils/productPaste.js (parseGiaNhap). Đây đúng là chỗ đã từng
 * hỏng một lần trong dự án này (xem lịch sử PriceDiag.gs) — bản đầu của hàm
 * này chỉ bỏ dấu phẩy, không xử lý được "1.234.567", nên viết lại theo đúng
 * quy tắc đã có sẵn thay vì để sót lần nữa.
 *
 * Số THẬT (Sheets luôn trả qua .getValues() ở file này, KHÔNG qua Sheets API
 * FORMATTED_VALUE như prefetchSheets_ cũ) đi thẳng nhánh đầu, không cần đoán.
 */
function msSo_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;

  var s = String(v).replace(/[ \s]/g, '').replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return 0;

  var soCham = (s.match(/\./g) || []).length;
  var soPhay = (s.match(/,/g) || []).length;

  if (soCham && soPhay) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
      s = s.replace(/,/g, '');                               // phẩy=nghìn, chấm=thập phân
    } else {
      s = s.replace(/\./g, '').replace(',', '.');             // chấm=nghìn, phẩy=thập phân
    }
  } else if (soCham === 1) {
    var duoiCham = s.split('.')[1];
    if (duoiCham.length === 3) s = s.replace('.', '');        // 1 chấm + đúng 3 số sau -> nghìn
  } else if (soCham > 1) {
    s = s.replace(/\./g, '');                                  // nhiều chấm -> chắc chắn nghìn
  } else if (soPhay === 1) {
    var duoiPhay = s.split(',')[1];
    s = duoiPhay.length === 3 ? s.replace(',', '') : s.replace(',', '.');
  } else if (soPhay > 1) {
    s = s.replace(/,/g, '');
  }

  var n = Number(s);
  return isFinite(n) ? n : 0;
}

function msChu_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

/** Cột NGÀY (không phải tháng) — ForecastVersions.update_date là ví dụ duy
 *  nhất trong 11 bảng. Ô định dạng ngày trên Sheet trả về đối tượng Date
 *  thật, mà msChu_ (String().trim() trần) ép nó thành cả câu
 *  "Sat Aug 01 2026 00:00:00 GMT+0700 (Indochina Time)" — bug thật đã bắt
 *  được qua migrateXemTruoc_ trên dữ liệu thật, KHÔNG phải giả định. */
function msNgay_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v).trim();
  var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  var d = new Date(s);
  return isNaN(d.getTime()) ? s : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Mốc thời gian NULLABLE — '' -> null (không phải chuỗi rỗng, cột Postgres
 *  là timestamptz, chuỗi rỗng sẽ bị từ chối). */
function msMocNullable_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Mốc thời gian BẮT BUỘC (cột `not null default now()`): '' -> giờ hiện tại
 * (KHÔNG xoá field khỏi object để "nhờ Postgres tự áp default" — bản đầu
 * làm vậy, và PostgREST từ chối cả lượt ghi hàng loạt với lỗi "All object
 * keys must match" vì các dòng khác nhau (dòng có created_at, dòng không)
 * ra KHÁC bộ khoá nhau. Bug thật bắt được ngay lượt ghi đầu tiên, bảng
 * Users. Luôn trả về giá trị thật giữ bộ khoá đồng nhất giữa mọi dòng.
 */
function msMocBatBuoc_(v) {
  return msMocNullable_(v) || new Date().toISOString();
}

// ---------------------------------------------------------------------
// 12 THÔNG SỐ BẢNG — tên Sheet, tên Postgres (qua SheetDb.gs), hàm build 1
// dòng Sheet thành 1 record Postgres.
// ---------------------------------------------------------------------

var MS_BANG_ = [
  {
    sheet: SHEETS.BUSINESS_UNITS, nhan: 'BusinessUnits', khoa: ['code'],
    build: function (r) {
      return {
        code: msChu_(r.code), name: msChu_(r.name), is_active: msBoolActive_(r.is_active),
        sap_channel: msChu_(r.sap_channel), sap_vkorg: msChu_(r.sap_vkorg),
        sap_vtweg: msChu_(r.sap_vtweg), sap_sold_to: msChu_(r.sap_sold_to),
        report_channel: msChu_(r.report_channel)
      };
    }
  },
  {
    sheet: SHEETS.REGIONS, nhan: 'Regions', khoa: ['code'],
    build: function (r) {
      return { code: msChu_(r.code), name: msChu_(r.name), is_active: msBoolActive_(r.is_active), scope: msChu_(r.scope) };
    }
  },
  {
    sheet: SHEETS.PRODUCT_GROUPS, nhan: 'ProductGroups', khoa: ['code'],
    build: function (r) { return { code: msChu_(r.code), name: msChu_(r.name) }; }
  },
  {
    sheet: SHEETS.PRODUCTS, nhan: 'Products', khoa: ['sku_code'],
    build: function (r) {
      return {
        sku_code: normalizeSku_(r.sku_code), name: msChu_(r.name), short_name: msChu_(r.short_name),
        product_group_code: msChu_(r.product_group_code) || null,
        product_group_name: msChu_(r.product_group_name), technology: msChu_(r.technology),
        default_channel: msChu_(r.default_channel), avg_price: msSo_(r.avg_price),
        is_active: msBoolActive_(r.is_active), requirements_type: msChu_(r.requirements_type)
      };
    }
  },
  {
    sheet: SHEETS.USERS, nhan: 'Users', khoa: ['id'],
    build: function (r) {
      return {
        id: msChu_(r.id), full_name: msChu_(r.full_name), email: msChu_(r.email), role: msChu_(r.role),
        business_unit_code: msChu_(r.business_unit_code) || null, pin_hash: msChu_(r.pin_hash),
        is_active: msBoolActive_(r.is_active), failed_attempts: msSo_(r.failed_attempts),
        locked_until: msMocNullable_(r.locked_until), last_login: msMocNullable_(r.last_login)
      };
    }
  },
  {
    sheet: SHEETS.CYCLES, nhan: 'ForecastCycles', khoa: ['id'],
    build: function (r) {
      return {
        id: msChu_(r.id), business_unit_code: msChu_(r.business_unit_code) || null,
        base_month: normalizeMonth_(r.base_month), horizon_months: msSo_(r.horizon_months),
        status: msChu_(r.status), created_by: msChu_(r.created_by),
        created_at: msMocBatBuoc_(r.created_at)
      };
    }
  },
  {
    sheet: SHEETS.VERSIONS, nhan: 'ForecastVersions', khoa: ['id'],
    build: function (r) {
      return {
        id: msChu_(r.id), cycle_id: msChu_(r.cycle_id) || null, update_week: msChu_(r.update_week),
        update_date: msNgay_(r.update_date), iso_week_label: msChu_(r.iso_week_label),
        submitted_by: msChu_(r.submitted_by), submitted_at: msMocNullable_(r.submitted_at),
        is_final: msBoolExplicit_(r.is_final), created_at: msMocBatBuoc_(r.created_at)
      };
    }
  },
  {
    sheet: SHEETS.MONTHLY_LINES, nhan: 'MonthlyForecastLines',
    khoa: ['version_id', 'sku_code', 'forecast_month'],
    build: function (r) {
      return {
        id: msChu_(r.id) || Utilities.getUuid(), version_id: msChu_(r.version_id) || null,
        sku_code: normalizeSku_(r.sku_code) || null, forecast_month: normalizeMonth_(r.forecast_month),
        quantity: msSo_(r.quantity), note: msChu_(r.note),
        updated_at: msMocBatBuoc_(r.updated_at), updated_by: msChu_(r.updated_by)
      };
    }
  },
  {
    sheet: SHEETS.WEEKLY_SPLITS, nhan: 'WeeklyRegionSplits',
    khoa: ['version_id', 'sku_code', 'week_number', 'region_code'],
    build: function (r) {
      return {
        id: msChu_(r.id) || Utilities.getUuid(), version_id: msChu_(r.version_id) || null,
        sku_code: normalizeSku_(r.sku_code) || null, week_number: msSo_(r.week_number),
        region_code: msChu_(r.region_code) || null, quantity: msSo_(r.quantity),
        updated_at: msMocBatBuoc_(r.updated_at), updated_by: msChu_(r.updated_by)
      };
    }
  },
  {
    sheet: SHEETS.APPROVALS, nhan: 'Approvals', khoa: ['id'],
    build: function (r) {
      return {
        id: msChu_(r.id) || Utilities.getUuid(), cycle_id: msChu_(r.cycle_id) || null,
        version_id: msChu_(r.version_id) || null, approver_id: msChu_(r.approver_id) || null,
        status: msChu_(r.status), comment: msChu_(r.comment), requested_by: msChu_(r.requested_by),
        requested_at: msMocNullable_(r.requested_at), decided_at: msMocNullable_(r.decided_at)
      };
    }
  },
  {
    sheet: SHEETS.ACTUALS, nhan: 'ActualSalesResults',
    khoa: ['business_unit_code', 'sku_code', 'actual_month', 'region_code'],
    build: function (r) {
      return {
        id: msChu_(r.id) || Utilities.getUuid(), business_unit_code: msChu_(r.business_unit_code) || null,
        sku_code: normalizeSku_(r.sku_code) || null, actual_month: normalizeMonth_(r.actual_month),
        region_code: msChu_(r.region_code) || null, quantity: msSo_(r.quantity),
        source_system: msChu_(r.source_system), imported_by: msChu_(r.imported_by),
        imported_at: msMocBatBuoc_(r.imported_at)
      };
    }
  }
  // AuthLog CỐ Ý KHÔNG có trong danh sách — xem đầu file.
];

// ---------------------------------------------------------------------
// XEM TRƯỚC — chỉ đọc Sheet + dựng thử record, KHÔNG gọi Postgres.
// ---------------------------------------------------------------------

function migrateXemTruoc_() {
  var out = [];
  out.push('=== XEM TRƯỚC — chưa ghi gì ===');
  var tongDong = 0;

  MS_BANG_.forEach(function (b) {
    var tho = msDocSheetTho_(b.sheet);
    var loi = 0;
    var mau = null;
    tho.forEach(function (r) {
      try {
        var rec = b.build(r);
        if (!mau) mau = rec;
      } catch (e) { loi++; }
    });
    tongDong += tho.length;
    out.push('  ' + (b.nhan + '                      ').slice(0, 24) + tho.length + ' dòng'
      + (loi ? '  — LỖI DỰNG RECORD: ' + loi + ' dòng' : ''));
    if (mau) out.push('     mẫu dòng đầu: ' + JSON.stringify(mau).slice(0, 200));
  });

  out.push('');
  out.push('Tổng ' + tongDong + ' dòng, ' + MS_BANG_.length + ' bảng (AuthLog bỏ qua, xem đầu file).');
  out.push('Soát kỹ log này trước khi chạy migrateGhiThat_().');

  Logger.log(out.join('\n'));
  return out.join('\n');
}

// ---------------------------------------------------------------------
// GHI THẬT — theo đúng thứ tự FK, batch 300 dòng/lượt, đối chiếu sau khi ghi.
// ---------------------------------------------------------------------

/**
 * Bỏ dòng trùng khoá tổ hợp, GIỮ DÒNG CUỐI — đúng quy ước applyRowChanges_
 * bản Sheets cũ đã có TRƯỚC KHI chuyển Postgres (SheetDb.gs, xoá khi viết lại
 * cho PostgREST — quên mang logic này sang là NGUYÊN NHÂN bug dưới đây).
 *
 * VÌ SAO BẮT BUỘC PHẢI TỰ DỌN, không phó mặc cho ON CONFLICT DO UPDATE của
 * Postgres: `INSERT ... ON CONFLICT DO UPDATE` từ chối thẳng nếu bản thân
 * DANH SÁCH VALUES đang ghi có ≥2 dòng cùng khoá xung đột ("ON CONFLICT DO
 * UPDATE command cannot affect row a second time") — Postgres không tự chọn
 * dòng nào giữa 2 dòng trùng trong CÙNG một lượt ghi, phải dọn trước.
 *
 * Bug thật bắt được ở ActualSalesResults (26/09/2026, lỗi "duplicate key
 * value violates unique constraint actuals_key_idx"): Sheet có dòng trùng
 * (business_unit_code, sku_code, actual_month, region_code) mà không ai để ý
 * vì Sheets không ép khoá duy nhất — chỉ lộ ra khi Postgres từ chối thật.
 */
function msBoTrungKhoa_(records, khoa) {
  var lastAt = {};
  records.forEach(function (r, i) {
    lastAt[khoa.map(function (f) { return String(r[f]); }).join('\u0001')] = i;
  });
  var out = records.filter(function (r, i) {
    return lastAt[khoa.map(function (f) { return String(r[f]); }).join('\u0001')] === i;
  });
  return { sach: out, soBoTrung: records.length - out.length };
}

/** Upsert theo lô 300 dòng — KHÔNG dùng appendObjects_ (insert thô) nữa: an
 *  toàn hơn khi lỡ chạy lại (trùng khoá thì ghi đè thay vì Postgres từ chối
 *  cả lô), và tận dụng đúng khoá tự nhiên đã khai ở MS_BANG_.khoa. */
function msGhiTheoLo_(nhan, khoa, records) {
  var CO_LON = 300;
  for (var i = 0; i < records.length; i += CO_LON) {
    upsertRows_(nhan, khoa, records.slice(i, i + CO_LON));
  }
}

/**
 * @param {boolean} [xacNhanGhiDe] truyền true để BỎ QUA việc dừng khi Postgres
 *     đã có dữ liệu KHÁC số dòng Sheet — chỉ dùng khi biết rõ mình đang cố ý
 *     ghi thêm.
 *
 * Xử lý CHẠY LẠI SAU LỖI GIỮA CHỪNG (tình huống thật đã gặp 26/09/2026: 4
 * bảng đầu ghi xong, vỡ ở bảng thứ 5 vì lỗi khác) — với MỖI bảng, so số dòng
 * Postgres ĐANG CÓ với số dòng Sheet (ĐÃ DỌN TRÙNG) SẮP ghi:
 *   - đã có Postgres = 0            -> ghi bình thường.
 *   - đã có Postgres KHỚP Sheet đã dọn trùng -> bảng này đã xong từ lượt
 *     trước, BỎ QUA, sang bảng kế — không phải mọi bảng "có dữ liệu" đều lỗi.
 *   - đã có Postgres LỆCH             -> KHÔNG tự đoán lý do, dừng thật.
 */
function migrateGhiThat_(xacNhanGhiDe) {
  var out = [];
  out.push('=== GHI THẬT ===');

  MS_BANG_.forEach(function (b) {
    var tho = msDocSheetTho_(b.sheet);
    var goc = tho.map(function (r) { return b.build(r); });
    var dedupe = msBoTrungKhoa_(goc, b.khoa);
    var records = dedupe.sach;
    if (dedupe.soBoTrung) {
      out.push('  ' + b.nhan + ': bỏ ' + dedupe.soBoTrung + ' dòng trùng khoá tổ hợp trên Sheet (giữ dòng cuối).');
    }

    var soTruoc = pgCount_(b.sheet);

    if (soTruoc > 0 && !xacNhanGhiDe) {
      if (soTruoc === records.length) {
        out.push('  ' + (b.nhan + '                      ').slice(0, 24)
          + 'đã có đủ ' + soTruoc + ' dòng — BỎ QUA (nạp xong từ lượt chạy trước).');
        return; // forEach: sang bảng kế, không phải return khỏi cả hàm
      }
      out.push('  DỪNG — ' + b.nhan + ': Postgres đang có ' + soTruoc + ' dòng, Sheet có '
        + records.length + ' dòng (sau khi dọn trùng) — KHÁC NHAU, không tự đoán lý do.');
      Logger.log(out.join('\n'));
      throw new Error(b.nhan + ': Postgres có ' + soTruoc + ' dòng, Sheet có ' + records.length
        + ' — kiểm tay trước khi chạy tiếp (xem log). Cố ý ghi thêm thì gọi migrateGhiThat_(true).');
    }

    msGhiTheoLo_(b.sheet, b.khoa, records);

    // Đối chiếu ngay sau khi ghi — bắt được thiếu dòng do lỗi giữa chừng,
    // đúng khuôn "xem trước/ghi thật + đối chiếu" đã dùng ở DaySupabase.js
    // (Export Ops Hub) — không tin một lượt ghi thành công là ĐỦ dòng.
    // pgCount_ (không phải readObjects_().length) vì bảng có thể vượt max-rows.
    var soSauKhiGhi = pgCount_(b.sheet);
    var khop = soSauKhiGhi === soTruoc + records.length;
    out.push('  ' + (b.nhan + '                      ').slice(0, 24)
      + records.length + ' dòng (sau dọn trùng) -> ' + soSauKhiGhi + ' dòng Postgres  '
      + (khop ? 'KHỚP' : '*** LỆCH ***'));
    if (!khop) {
      Logger.log(out.join('\n'));
      throw new Error(b.nhan + ' lệch số dòng sau khi ghi (' + records.length + ' vs ' + soSauKhiGhi
        + ') — DỪNG, không ghi tiếp bảng sau (có thể vỡ khoá ngoại của bảng phụ thuộc).');
    }
  });

  out.push('');
  out.push('XONG — đã nạp đủ ' + MS_BANG_.length + ' bảng, khớp số dòng từng bảng.');
  out.push('AuthLog KHÔNG nạp lịch sử cũ — log mới sẽ tự ghi từ lúc cắt luồng.');
  Logger.log(out.join('\n'));
  return out.join('\n');
}
