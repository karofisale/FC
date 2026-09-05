/**
 * pricesync.test.js — kiểm phần TÍNH TOÁN của gas/PriceSync.gs.
 *
 * Vì sao đáng có test: avg_price nuôi total_revenue của dự báo, nên sai ở đây
 * là sai doanh thu mà không có gì báo. Cụ thể là phép bình quân — nếu ai đó
 * đổi sang trung bình cộng đơn giá (cách app OEM đang dùng cho màn hình của
 * nó) thì với một mã có đơn nhỏ giá cao và đơn lớn giá thấp, doanh thu dự báo
 * lệch tới 50%. Ca đầu tiên trong file này chốt đúng chỗ đó.
 *
 * Chạy Sheet giả trong vm, không chạm dữ liệu thật:
 *   node test/pricesync.test.js gas/PriceSync.gs
 */

const fs = require('fs'), vm = require('vm');

// Sheet gia: tra ve dung mang 2 chieu minh dua vao.
function sheet(rows) {
  return { getDataRange: () => ({ getValues: () => rows }) };
}
const files = {};
function ctx(sheets) {
  const sandbox = {
    SpreadsheetApp: { openById: (id) => ({ getSheetByName: (n) => sheets[id + '/' + n] || null }) },
    Utilities: {
      formatDate: (d, tz, f) => {
        const p = (x) => String(x).padStart(2, '0');
        if (f === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      }
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    PropertiesService: { getScriptProperties: () => ({ setProperty() {} }) },
    Logger: { log() {} },
    // hang so + ham phu tro cua FC ma PriceSync dua vao
    PREP_OEM_SHEET_ID: 'OEM', PREP_OPS2026_ID: 'OPS', PREP_HUB_ID: 'HUB',
    sopMa_: (v) => String(v === null || v === undefined ? '' : v).trim(),
    prepChuan_: (m) => /^\d{6,}$/.test(String(m || '').trim()),
    console, Date, JSON, Math, String, Number, Object, Array, Error, RegExp, isFinite, parseFloat
  };
  sandbox.globalThis = sandbox;
  const c = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), c, { filename: 'PriceSync.gs' });
  return sandbox;
}

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them ? '  -> ' + them : '')); }
}

const thangNay = new Date();
const T = (lui) => { const d = new Date(); d.setMonth(d.getMonth() - lui); return 'T' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear(); };

// --- OEM: binh quan gia quyen ---
// cot: [8]=ma [11]=sl [17]=tien [40]=thang
function rowOem(ma, sl, tien, thang) {
  const r = new Array(41).fill('');
  r[8] = ma; r[11] = sl; r[17] = tien; r[40] = thang;
  return r;
}
const hdr = new Array(41).fill('h');

console.log('1. Binh quan gia quyen (OEM)');
let s = ctx({ 'OEM/Data': sheet([hdr,
  rowOem('1001050029', 1, 100000, T(1)),        // 1 cai gia 100k
  rowOem('1001050029', 1000, 50000000, T(1)),   // 1000 cai gia 50k
]) });
let g = s.psGiaOEM_('2000-01');
// gia quyen = 50.100.000 / 1001 = 50049.95 -> lam tron 50050
check('gia quyen chu khong phai trung binh cong', g['1001050029'] === 50050,
      'duoc ' + g['1001050029'] + ' (trung binh cong se la 75000)');

console.log('2. Cua so thoi gian');
s = ctx({ 'OEM/Data': sheet([hdr,
  rowOem('2001020050', 10, 1000000, T(1)),   // trong cua so -> 100k/cai
  rowOem('2001020050', 10, 9000000, T(30)),  // ngoai cua so -> phai bi loai
]) });
const tuThang = s.psTuThang_(12);
g = s.psGiaOEM_(tuThang);
check('dong ngoai 12 thang bi loai', g['2001020050'] === 100000, 'duoc ' + g['2001020050']);

console.log('3. Loai dong rac');
s = ctx({ 'OEM/Data': sheet([hdr,
  rowOem('NewRO1', 5, 500000, T(1)),        // ma phi chuan
  rowOem('12345', 5, 500000, T(1)),         // < 6 chu so
  rowOem('2003030989', 0, 500000, T(1)),    // sl = 0
  rowOem('2003030989', 5, 0, T(1)),         // tien = 0
  rowOem('2003030989', 5, 250000, T(1)),    // dong duy nhat hop le -> 50k
]) });
g = s.psGiaOEM_('2000-01');
check('ma phi chuan bi loai', g['NewRO1'] === undefined);
check('ma < 6 chu so bi loai', g['12345'] === undefined);
check('dong sl=0 va tien=0 bi loai', g['2003030989'] === 50000, 'duoc ' + g['2003030989']);

console.log('4. XK: gia quyen + loc theo Shipdate that');
const hX = ['Code', 'Ship Qty', 'Value', 'Shipdate'];
const trongCuaSo = new Date(); trongCuaSo.setMonth(trongCuaSo.getMonth() - 2);
const ngoaiCuaSo = new Date(); ngoaiCuaSo.setFullYear(ngoaiCuaSo.getFullYear() - 3);
s = ctx({ 'OPS/Details': sheet([hX,
  ['2013010023', 100, 1000, trongCuaSo],   // 10 USD/cai
  ['2013010023', 100, 3000, ngoaiCuaSo],   // 30 USD/cai — ngoai cua so
  ['2013010023', 0, 500, trongCuaSo],      // sl=0
  ['xxx', 10, 100, trongCuaSo],            // ma phi chuan
]) });
const gx = s.psGiaXK_(s.psTuThang_(12));
check('XK gia quyen dung, loai dong ngoai cua so', Math.abs(gx['2013010023'] - 10) < 1e-9,
      'duoc ' + gx['2013010023']);
check('XK loai ma phi chuan', gx['xxx'] === undefined);

console.log('5. Ty gia');
s = ctx({ 'HUB/Dashboard': sheet([['Index', 'Value'], ['Min_Margin', 0.12], ['Exchange_Rate', 26150]]) });
check('doc dung Exchange_Rate', s.psTyGia_() === 26150);

s = ctx({ 'HUB/Dashboard': sheet([['Index', 'Value'], ['Min_Margin', 0.12]]) });
let nem = false; try { s.psTyGia_(); } catch (e) { nem = true; }
check('thieu Exchange_Rate thi NEM LOI, khong tra 0', nem);

s = ctx({ 'HUB/Dashboard': sheet([['Index', 'Value'], ['Exchange_Rate', 0]]) });
nem = false; try { s.psTyGia_(); } catch (e) { nem = true; }
check('Exchange_Rate = 0 thi cung nem loi', nem);

console.log('6. psSo_');
s = ctx({});
check('so nguyen', s.psSo_(1234) === 1234);
check('chuoi co dau phan cach', s.psSo_('1,234') === 1234);
check('rong -> 0', s.psSo_('') === 0);
check('null -> 0', s.psSo_(null) === 0);

console.log('\n' + pass + ' dat, ' + fail + ' loi');
process.exit(fail ? 1 : 0);
