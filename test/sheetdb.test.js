/**
 * sheetdb.test.js — kiểm việc CHIA NHỎ filter `in.(...)` của gas/SheetDb.gs
 * (pgQueryChunkedIn_/pgExistingKeySet_), đúng bug thật gặp 26/09/2026:
 * "Limit Exceeded: URLFetch URL Length" khi 1 lô có quá nhiều giá trị khác
 * nhau bị nhét vào 1 URL. Test này đếm SỐ LƯỢT UrlFetchApp.fetch() thật sự
 * được gọi — không chỉ tin JSON trả về đúng, vì trả đúng vẫn có thể do vô
 * tình không kích hoạt nhánh chia nhỏ (test giả không đủ dữ liệu).
 *
 *   node test/sheetdb.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { taoCSDLGia, taoUrlFetchAppGia, kiemTraKhopBanGoc } = require('./pg-shim');

const GAS = path.join(__dirname, '..', 'gas');
kiemTraKhopBanGoc(path.join(GAS, 'SheetDb.gs'));

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}

function nap(products) {
  const db = taoCSDLGia({
    Products: [
      ['sku_code', 'name', 'short_name', 'product_group_code', 'product_group_name', 'technology', 'default_channel', 'avg_price', 'is_active', 'requirements_type'],
      ...products
    ]
  });

  let soLuotGoi = 0;
  const fetchGoc = taoUrlFetchAppGia(db).fetch;
  const urlFetchDemLuot = { fetch: (...args) => { soLuotGoi++; return fetchGoc(...args); } };

  const sandbox = {
    UrlFetchApp: urlFetchDemLuot,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'SUPABASE_URL' ? 'https://gia.supabase.co' : (k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'khoa-gia' : null)),
        setProperty: () => {}
      })
    },
    console, JSON, Object, Array, String, Number, Error
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(GAS, 'Config.gs'), 'utf8'), sandbox, { filename: 'Config.gs' });
  vm.runInContext(fs.readFileSync(path.join(GAS, 'SheetDb.gs'), 'utf8'), sandbox, { filename: 'SheetDb.gs' });
  return { sandbox, demLuot: () => soLuotGoi };
}

console.log('1. pgQueryChunkedIn_ — 100 mã (> PG_CO_LON_IN_=40) phải chia thành nhiều lượt gọi');
{
  const products = [];
  for (let i = 0; i < 100; i++) {
    products.push(['SKU' + i, 'Sản phẩm ' + i, '', '', '', '', '', 0, '1', '']);
  }
  const { sandbox, demLuot } = nap(products);
  const maCanTim = products.map((p) => p[0]); // đủ 100 mã, mỗi mã 1 dòng riêng
  const ketQua = sandbox.pgQueryChunkedIn_('Products', '*', 'sku_code', maCanTim);

  check('trả đủ 100 dòng dù chia nhiều lượt', ketQua.length === 100, ketQua.length);
  check('CÓ chia thành nhiều lượt gọi thật (100 mã / 40 mỗi lượt = 3 lượt)', demLuot() === 3, demLuot());
  check('không trùng/thiếu mã nào', new Set(ketQua.map((r) => r.sku_code)).size === 100);
}

console.log('\n2. Dưới ngưỡng thì vẫn 1 lượt gọi (không chia thừa)');
{
  const products = [];
  for (let i = 0; i < 10; i++) products.push(['SKU' + i, 'SP ' + i, '', '', '', '', '', 0, '1', '']);
  const { sandbox, demLuot } = nap(products);
  const ketQua = sandbox.pgQueryChunkedIn_('Products', '*', 'sku_code', products.map((p) => p[0]));
  check('10 mã (< 40) chỉ 1 lượt gọi', demLuot() === 1, demLuot());
  check('vẫn trả đủ 10 dòng', ketQua.length === 10, ketQua.length);
}

console.log('\n3. Mảng rỗng — không gọi mạng lần nào');
{
  const { sandbox, demLuot } = nap([]);
  const ketQua = sandbox.pgQueryChunkedIn_('Products', '*', 'sku_code', []);
  check('mảng rỗng trả về rỗng', ketQua.length === 0);
  check('không gọi UrlFetchApp lần nào', demLuot() === 0, demLuot());
}

console.log('\n4. pgExistingKeySet_ (dùng bởi applyRowChanges_/upsertRows_) cũng chia nhỏ đúng cách');
{
  const products = [];
  for (let i = 0; i < 80; i++) products.push(['SKU' + i, 'SP ' + i, '', '', '', '', '', 0, '1', '']);
  const { sandbox, demLuot } = nap(products);
  // 80 dòng "sắp upsert", TRÙNG sku_code với 80 dòng đã có trong Products —
  // pgExistingKeySet_ phải nhận ra CẢ 80 đều đã tồn tại.
  const upserts = products.map((p) => ({ sku_code: p[0] }));
  const bo = sandbox.pgTable_('Products');
  const tapDaCo = sandbox.pgExistingKeySet_(bo, ['sku_code'], upserts);
  check('nhận đúng cả 80 mã đã tồn tại', Object.keys(tapDaCo).length === 80, Object.keys(tapDaCo).length);
  check('chia nhiều lượt (80/40 = 2 lượt)', demLuot() === 2, demLuot());
}

console.log('\n5. laDangBat_ — bug thật 27/09/2026: boolean Postgres (true/false) bị so nhầm với chuỗi "1"/"0"');
{
  const { sandbox } = nap([]);
  const f = sandbox.laDangBat_;
  check('boolean true -> bật', f(true) === true);
  check('boolean false -> TẮT (đây là ca sập bẫy — String(false)!=="0")', f(false) === false);
  check('chuỗi "1" -> bật', f('1') === true);
  check('chuỗi "0" -> tắt', f('0') === false);
  check('chuỗi "true" -> bật', f('true') === true);
  check('chuỗi "false" -> tắt', f('false') === false);
  check('undefined -> bật (quy ước: trống = đang bật)', f(undefined) === true);
  check('null -> bật', f(null) === true);
  check("'' -> bật", f('') === true);
}

console.log('\n6. pgDeleteByCompositeKeys_ (applyRowChanges_/deleteRowsByKeys_) chia nhỏ theo lô, KHÔNG 1-dòng-1-lượt-gọi');
{
  // Bug thật 28/09/2026: adminRollbackBackfillSeedThangDau_ xoá 1027 dòng
  // bằng vòng lặp CŨ (1 lượt gọi HTTP/dòng) — chạy được nhưng suýt chạm giới
  // hạn 6 phút của Apps Script. 45 dòng ở đây phải ra ĐÚNG 3 lượt gọi
  // (PG_CO_LON_XOA_TO_HOP_ = 15), không phải 45.
  const header = ['id', 'version_id', 'sku_code', 'forecast_month', 'quantity', 'note', 'updated_at', 'updated_by'];
  const rows = [];
  for (let i = 0; i < 45; i++) {
    rows.push(['id' + i, 'v1', 'SKU' + i, '2026-10-01', i, '', '', 'admin-backfill']);
  }
  const db = require('./pg-shim').taoCSDLGia({ MonthlyForecastLines: [header, ...rows] });

  let soLuotGoi = 0;
  const fetchGoc = require('./pg-shim').taoUrlFetchAppGia(db).fetch;
  const sandbox = {
    UrlFetchApp: { fetch: (...args) => { soLuotGoi++; return fetchGoc(...args); } },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'SUPABASE_URL' ? 'https://gia.supabase.co' : (k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'khoa-gia' : null)),
        setProperty: () => {}
      })
    },
    console, JSON, Object, Array, String, Number, Error, encodeURIComponent, decodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(GAS, 'Config.gs'), 'utf8'), sandbox, { filename: 'Config.gs' });
  vm.runInContext(fs.readFileSync(path.join(GAS, 'SheetDb.gs'), 'utf8'), sandbox, { filename: 'SheetDb.gs' });

  const table = sandbox.pgTable_('MonthlyForecastLines');
  const keo = rows.map((r) => ({ version_id: r[1], sku_code: r[2], forecast_month: r[3] }));
  const soDaXoa = sandbox.pgDeleteByCompositeKeys_(table, ['version_id', 'sku_code', 'forecast_month'], keo);

  check('xoá đúng cả 45 dòng', soDaXoa === 45, soDaXoa);
  check('chia đúng 3 lượt gọi (45/15), KHÔNG phải 45 lượt', soLuotGoi === 3, soLuotGoi);
  check('bảng thật sự rỗng sau khi xoá', db.monthly_forecast_lines.length === 0, db.monthly_forecast_lines.length);
}

console.log('\n' + pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
