#!/usr/bin/env node
/**
 * Man San luong thuc hien: MOT cot Tong, va chi hien ma dang can nhin.
 *
 *   node tools/test-actuals-region.mjs
 *
 * Hai quy tac:
 *
 * 1. KHONG TACH MIEN. Nguon ZSD450 khong co cot mien, va phan doi chieu chi so
 *    TONG voi ke hoach. De MB/MN o day la bat nguoi dung chia mot con so ma
 *    chinh ho khong co can cu de chia. Nhung so CU da tro nhap tay theo MB/MN
 *    van phai duoc CONG vao tong — giau di thi luoi hien mot dang con phan doi
 *    chieu cong ra mot dang khac, tren cung mot man hinh.
 *
 * 2. CHI HIEN MA CO SO THUC HIEN HOAC CO TRONG KE HOACH. Truoc day hien toan bo
 *    danh muc cua kenh — vai tram dong ma phan lon khong bao gio co so, nen thu
 *    can nhin bi chon trong do. Thang nao chua co ke hoach thi lay danh sach ma
 *    theo ke hoach BA THANG TOI.
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));

const actual = (id, bu, sku, thang, mien, sl) =>
  [id, bu, sku, thang, mien, sl, 'Manual', 'u1', ''];
const sp = (sku, ten) =>
  [sku, ten, ten, 'G1', 'N1', 'RO', 'GT2', '1000', '1'];

const S = {
  Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
          ['u1','Admin','a@k.vn','central_admin','','h','1','0','','']],
  BusinessUnits: [['code','name','is_active','sap_channel','sap_vkorg','sap_vtweg','sap_sold_to'],
                  ['GT2','GT2','1','GT2','0200','13','1009062']],
  Regions: [['code','name','is_active','scope'],
            ['MB','Miền Bắc','1','weekly'],
            ['MN','Miền Nam','1','weekly'],
            ['TQ','Toàn quốc','1','actual']],
  ProductGroups: [['code','name'],['G1','N1']],
  // Nam ma trong danh muc kenh; chi mot vai ma co so hoac co ke hoach.
  Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'],
             sp('1001','May A'), sp('1002','May B'), sp('1003','May C'),
             sp('1004','May D'), sp('1005','May E')],
  ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at'],
                   ['c8','GT2','2026-08-01','4','approved','u1','2026-07-20'],
                   ['c11','GT2','2026-11-01','4','approved','u1','2026-10-20']],
  ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at'],
                     ['v8','c8','1','2026-07-20','W1','u1','2026-07-20','1','2026-07-20'],
                     ['v11','c11','1','2026-10-20','W1','u1','2026-10-20','1','2026-10-20']],
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by'],
    // Chu ky thang 8: ke hoach cho 1001 va 1002
    ['m1','v8','1001','2026-08-01',1000,'','',''],
    ['m2','v8','1002','2026-08-01',500,'','',''],
    // Chu ky thang 11 (phu 11..02): ke hoach cho 1004 — dung cho phan lui ve
    ['m3','v11','1004','2026-12-01',700,'','','']],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by']],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at'],
              ['a8','c8','v8','u1','approved','','u1','2026-07-21','2026-07-22'],
              ['a11','c11','v11','u1','approved','','u1','2026-10-21','2026-10-22']],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at'],
    // Thang 8: so CU nhap tay theo hai mien, truoc khi bo tach mien
    actual('r1','GT2','1001','2026-08-01','MB',600),
    actual('r2','GT2','1001','2026-08-01','MN',300),
    // ...va mot ma CO so thuc hien nhung KHONG co trong ke hoach thang 8
    actual('r3','GT2','1003','2026-08-01','TQ',77)],
  AuthLog: [['at','user_id','event','detail']]
};

const noop = { setFontWeight(){return this;}, setBackground(){return this;},
  setFontColor(){return this;}, setNumberFormat(){return this;} };
const sh = (n) => ({ getName: () => n, getLastRow: () => S[n].length, getLastColumn: () => S[n][0].length,
  getMaxRows: () => S[n].length + 50,
  getDataRange: () => ({ getValues: () => S[n].map((r) => r.slice()) }),
  getRange: (row, col, nR, nC) => ({ ...noop,
    getValues: () => S[n].slice(row - 1, row - 1 + nR).map((r) => r.slice(col - 1, col - 1 + nC)),
    setValues(){ return noop; }, clearContent(){} }),
  appendRow: (r) => S[n].push(r), setFrozenRows(){} });

const ctx = {
  console,
  SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => (S[n] ? sh(n) : null), getSheets: () => Object.keys(S).map(sh), insertSheet: (n) => { S[n] = [[]]; return sh(n); } }) },
  Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map((n) => ({ values: (S[n] || []).map((r) => r.slice()) })) }) } } },
  Utilities: { getUuid: () => 'id', computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }, formatDate: () => '' },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'a@k.vn' }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Logger: { log() {} }
};
vm.createContext(ctx);
for (const f of readdirSync(GAS).filter((f) => f.endsWith('.gs')).sort())
  vm.runInContext(readFileSync(GAS + '/' + f, 'utf8'), ctx, { filename: f });

const ws = (action, payload) => {
  ctx.__A = action; ctx.__P = payload;
  ctx.__SESS = { userId: 'u1', fullName: 'A', role: 'central_admin', bu: '', token: 't' };
  return vm.runInContext('resetTableCache_(); prefetchForAction_(__A); dispatch_(__A, __P, __SESS);', ctx);
};

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

console.log('1. Mot cot Tong, khong tach mien');
const t8 = ws('getActualsWorkspace', { bu: 'GT2', month: '2026-08-01' });
say(t8.regionCode === 'TQ', `mien de ghi = ${t8.regionCode}`);
say(!('regions' in t8), 'khong con tra ve danh sach mien cho luoi');
say(Array.isArray(t8.legacyRegions), `mien cu con giu so: ${t8.legacyRegions.join(', ') || '(khong)'}`);

console.log('\n2. So cu theo MB/MN van duoc CONG vao tong, khong bi giau');
console.log(`     totals = ${JSON.stringify(t8.totals)}`);
say(t8.totals['1001'] === 900, `1001 = ${t8.totals['1001']} (600 MB + 300 MN)`);
say(t8.totals['1003'] === 77, `1003 = ${t8.totals['1003']} (TQ)`);
say(t8.legacyRegions.join(',') === 'MB,MN', 'bao ro MB/MN dang giu so — luc luu phai dat 0 cho chung');
// Day la phep so quan trong nhat cua man hinh nay: hai con so phai bang nhau.
const tongLuoi = Object.values(t8.totals).reduce((s, q) => s + q, 0);
console.log(`     tong tren luoi = ${tongLuoi}   | tong phan so sanh = ${t8.comparison.totalActual}`);
say(tongLuoi === t8.comparison.totalActual, 'tong tren luoi KHOP tong phan so sanh');

console.log('\n3. Chi hien ma co thuc hien HOAC co trong ke hoach');
const ma8 = t8.products.map((p) => p.sku_code).sort();
console.log(`     ${ma8.join(', ')}  (danh muc kenh co 5 ma)`);
say(ma8.join(',') === '1001,1002,1003', '1001 (ca hai), 1002 (chi ke hoach), 1003 (chi thuc hien)');
say(!ma8.includes('1004') && !ma8.includes('1005'), '1004/1005 khong co so nao thi khong hien');
say(t8.fallbackMonths.length === 0, 'thang 8 co ke hoach that nen khong phai lui ve');

console.log('\n4. Thang chua co ke hoach: lay danh sach ma theo BA THANG TOI');
// Chu ky thang 8 co horizon 4 nen PHU ca thang 10 — nhung khong co DONG nao
// cho thang do. "Co chu ky phu" va "co ke hoach" la hai chuyen khac nhau, va
// phan lui ve phai can cu vao cai thu hai.
// Chu ky thang 11 co ke hoach cho 1004 o thang 12, tuc nam trong 11/12/01 —
// ba thang toi cua thang 10.
const t10 = ws('getActualsWorkspace', { bu: 'GT2', month: '2026-10-01' });
console.log(`     lui ve: ${t10.fallbackMonths.join(', ')}`);
console.log(`     ma hien: ${t10.products.map((p) => p.sku_code).join(', ') || '(khong co)'}`);
say(t10.fallbackMonths.join(',') === '2026-11-01,2026-12-01,2027-01-01', 'dung ba thang ke tiep');
say(t10.products.some((p) => p.sku_code === '1004'), 'lay duoc 1004 tu ke hoach thang 12');
say(t10.comparison.cycleFound && t10.comparison.totalForecast === 0,
  `chu ky thang ${t10.comparison.cycleBaseMonth} co phu thang 10 nhung khong co dong nao (FC=${t10.comparison.totalForecast})`);
say(t10.fallbackMonths.length > 0, 'nen van phai lui ve ba thang toi — "co chu ky phu" khac "co ke hoach"');

console.log('\n5. Luoi chia tuan cua ke hoach van giu MB/MN');
const tuan = ws('getWeeklyWorkspace', { bu: 'GT2' });
const mienTuan = (tuan.regions || []).map((r) => r.code);
console.log(`     cot mien: ${mienTuan.join(', ')}`);
say(mienTuan.includes('MB') && mienTuan.includes('MN'), 'con MB va MN');
say(!mienTuan.includes('TQ'), 'KHONG moc them cot TQ');

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nMot cot Tong, so cu khong bi giau, va chi hien ma dang can nhin.');
process.exit(bad ? 1 : 0);
