/**
 * pg-shim.js — giả lập PostgREST cho test Node, dùng CHUNG cho mọi bài test
 * cần nạp SheetDb.gs THẬT (không tự giả lập SheetDb.gs — đúng tinh thần bài
 * test này viết ra để giữ, xem đầu portalstats.test.js).
 *
 * Kể từ khi FC chuyển CSDL sang Postgres (Karofi-ID/supabase/schema-fc.sql),
 * SheetDb.gs không còn gọi SpreadsheetApp cho dữ liệu nghiệp vụ nữa — nó gọi
 * UrlFetchApp.fetch() tới PostgREST thật. File này giả lập ĐÚNG giao thức đó
 * (query filter kiểu eq./in./ilike./or=, upsert qua on_conflict, patch/delete
 * theo filter) trên một "CSDL" nằm trong bộ nhớ, để bài test không cần dựng
 * Postgres thật mà vẫn chạy nguyên vẹn mã SheetDb.gs.
 *
 * Nhận dữ liệu mẫu ở hình dạng bảng CŨ (mảng 2 chiều: header rồi tới các
 * dòng) — giữ nguyên hình dạng fixture đã có trong các bài test trước khi
 * chuyển CSDL, để không phải viết lại toàn bộ dữ liệu mẫu, chỉ đổi tầng đọc.
 */

// PHẢI khớp PG_TABLE_MAP_ trong gas/SheetDb.gs — bài test cuối file này canh
// việc đó bằng cách đối chiếu trực tiếp với mã nguồn thật, không phải chép
// tay rồi hy vọng không trôi lệch.
const PG_TABLE_MAP_ = {
  Users: 'users', BusinessUnits: 'business_units', Regions: 'regions',
  ProductGroups: 'product_groups', Products: 'products',
  ForecastCycles: 'forecast_cycles', ForecastVersions: 'forecast_versions',
  MonthlyForecastLines: 'monthly_forecast_lines', WeeklyRegionSplits: 'weekly_region_splits',
  Approvals: 'approvals', ActualSalesResults: 'actual_sales_results', AuthLog: 'auth_log'
};

/** {TenTab: [[header...], [dòng...], ...]} -> {ten_bang_postgres: [{...}, ...]} */
function taoCSDLGia(tabs) {
  const db = {};
  Object.keys(tabs || {}).forEach((sheetName) => {
    const pgName = PG_TABLE_MAP_[sheetName];
    if (!pgName) throw new Error('pg-shim: chưa biết bảng Postgres của "' + sheetName + '"');
    const rows = tabs[sheetName] || [];
    const headers = rows[0] || [];
    db[pgName] = rows.slice(1).map((r) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i] === undefined ? null : r[i]; });
      return o;
    });
  });
  return db;
}

function chuoi_(v) { return String(v === null || v === undefined ? '' : v); }

function apDieuKien_(hang, dk) {
  let m;
  if ((m = dk.match(/^([^=]+)=eq\.(.*)$/))) {
    return chuoi_(hang[m[1]]) === decodeURIComponent(m[2]);
  }
  if ((m = dk.match(/^([^=]+)=is\.null$/))) {
    return hang[m[1]] === null || hang[m[1]] === undefined;
  }
  if ((m = dk.match(/^([^=]+)=not\.is\.null$/))) {
    return !(hang[m[1]] === null || hang[m[1]] === undefined);
  }
  if ((m = dk.match(/^([^=]+)=in\.\((.*)\)$/))) {
    // Mỗi giá trị đã được encodeURIComponent('"'+v+'"') phía gửi (SheetDb.gs
    // pgEscapeInValue_, sửa 26/09/2026 vì Apps Script UrlFetchApp từ chối "
    // chưa mã hoá) — phải decodeURIComponent TRƯỚC rồi mới bóc dấu nháy kép,
    // đúng thứ tự ngược lại với lúc dựng.
    const ds = m[2].split(',').map((s) => decodeURIComponent(s.trim()).replace(/^"|"$/g, ''));
    return ds.indexOf(chuoi_(hang[m[1]])) >= 0;
  }
  if ((m = dk.match(/^([^=]+)=ilike\.(.*)$/))) {
    return chuoi_(hang[m[1]]).toLowerCase() === decodeURIComponent(m[2]).toLowerCase();
  }
  throw new Error('pg-shim: chưa hỗ trợ điều kiện "' + dk + '"');
}

/** or=(id.ilike.x,email.ilike.y) — mỗi vế "cot.op.giatri", cách nhau dấu phẩy. */
function apOr_(hang, bieuThuc) {
  return bieuThuc.split(',').some((ve) => {
    const m = ve.match(/^([^.]+)\.(eq|ilike)\.(.*)$/);
    if (!m) throw new Error('pg-shim: or-clause không hiểu: ' + ve);
    return apDieuKien_(hang, m[1] + '=' + m[2] + '.' + m[3]);
  });
}

function phanHoi_(code, data) {
  const text = JSON.stringify(data);
  return { getResponseCode: () => code, getContentText: () => text };
}

/**
 * db bị SỬA TẠI CHỖ bởi các lệnh ghi (post/patch/delete) — cùng đối tượng
 * truyền vào lúc đầu, để bài test đọc lại db sau khi gọi hàm ghi nếu cần.
 */
function taoUrlFetchAppGia(db) {
  return {
    fetch: (url, params) => {
      params = params || {};
      const method = String(params.method || 'get').toLowerCase();
      const sauRest = url.split('/rest/v1/')[1] || '';
      const [duongDan, qs] = sauRest.split('?');

      if (duongDan.indexOf('rpc/') === 0) {
        throw new Error('pg-shim: chưa hỗ trợ RPC (' + duongDan + ') — thêm khi có bài test cần.');
      }

      if (!db[duongDan]) db[duongDan] = [];
      const bang = db[duongDan];

      const dieuKien = [];
      let orClause = null;
      let onConflict = null;
      (qs || '').split('&').filter(Boolean).forEach((p) => {
        if (p.indexOf('select=') === 0) return;
        if (p.indexOf('on_conflict=') === 0) { onConflict = decodeURIComponent(p.slice('on_conflict='.length)); return; }
        if (p.indexOf('or=(') === 0) { orClause = p.slice(4, -1); return; }
        dieuKien.push(p);
      });

      function khop(hang) {
        if (orClause && !apOr_(hang, orClause)) return false;
        return dieuKien.every((dk) => apDieuKien_(hang, dk));
      }

      if (method === 'get') {
        return phanHoi_(200, bang.filter(khop));
      }

      if (method === 'post') {
        const body = JSON.parse(params.payload);
        const list = Array.isArray(body) ? body : [body];
        if (onConflict) {
          const cotKhoa = onConflict.split(',');
          list.forEach((rec) => {
            const i = bang.findIndex((h) => cotKhoa.every((c) => chuoi_(h[c]) === chuoi_(rec[c])));
            if (i >= 0) Object.assign(bang[i], rec); else bang.push(Object.assign({}, rec));
          });
        } else {
          list.forEach((rec) => bang.push(Object.assign({}, rec)));
        }
        return phanHoi_(201, list);
      }

      if (method === 'patch') {
        const body = JSON.parse(params.payload);
        const trung = bang.filter(khop);
        trung.forEach((h) => Object.assign(h, body));
        return phanHoi_(200, trung);
      }

      if (method === 'delete') {
        const conLai = [], xoa = [];
        bang.forEach((h) => (khop(h) ? xoa : conLai).push(h));
        db[duongDan] = conLai;
        return phanHoi_(200, xoa);
      }

      throw new Error('pg-shim: method không hỗ trợ: ' + method);
    }
  };
}

/**
 * Đối chiếu PG_TABLE_MAP_ khai ở trên với bản THẬT trong gas/SheetDb.gs —
 * đúng bài học đã ghi ở đầu portalstats.test.js: một bản giả lệch khỏi mã
 * nguồn thật thì bài test xanh vì lý do sai. Gọi hàm này ở đầu mỗi bài test
 * dùng shim này.
 */
function kiemTraKhopBanGoc(duongDanSheetDb) {
  const fs = require('fs');
  const src = fs.readFileSync(duongDanSheetDb, 'utf8');
  const m = src.match(/var PG_TABLE_MAP_\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error('pg-shim: không tìm thấy PG_TABLE_MAP_ trong ' + duongDanSheetDb);
  const thatSu = {};
  m[1].split(',').forEach((dong) => {
    const kv = dong.match(/(\w+)\s*:\s*'([^']+)'/);
    if (kv) thatSu[kv[1]] = kv[2];
  });
  const a = JSON.stringify(thatSu, Object.keys(thatSu).sort());
  const b = JSON.stringify(PG_TABLE_MAP_, Object.keys(PG_TABLE_MAP_).sort());
  if (a !== b) {
    throw new Error('pg-shim: PG_TABLE_MAP_ đã LỆCH khỏi SheetDb.gs thật.\n  shim : '
      + JSON.stringify(PG_TABLE_MAP_) + '\n  thật : ' + JSON.stringify(thatSu));
  }
}

module.exports = { taoCSDLGia, taoUrlFetchAppGia, kiemTraKhopBanGoc, PG_TABLE_MAP_ };
