#!/usr/bin/env node
/**
 * San luong thuc hien khong tach mien — nhung khong duoc GIAU so cu.
 *
 *   node tools/test-actuals-region.mjs
 *
 * Viec doi chieu chi so TONG voi ke hoach, va nguon ZSD450 cung khong co cot
 * mien, nen luoi Thuc hien chi con mot cot TQ. Cai bay: thang cu co the da
 * duoc nhap tay theo MB/MN. An cac cot do di thi so cu bien mat khoi man hinh
 * trong khi VAN duoc cong vao phan so sanh (getFcVsActual_ cong moi mien) —
 * hai con so lech nhau tren cung mot man hinh ma khong ai giai thich duoc.
 *
 * Nen: luoi giu lai dung nhung mien CO so lieu trong thang dang xem.
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));

const actual = (id, bu, sku, thang, mien, sl) =>
  [id, bu, sku, thang, mien, sl, 'Manual', 'u1', ''];

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
  Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'],
             ['1001','May A','A','G1','N1','RO','GT2','1000','1']],
  ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at'],
                   ['c8','GT2','2026-08-01','4','approved','u1','2026-07-20'],
                   ['c9','GT2','2026-09-01','4','approved','u1','2026-08-20']],
  ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at'],
                     ['v8','c8','1','2026-07-20','W1','u1','2026-07-20','1','2026-07-20'],
                     ['v9','c9','1','2026-08-20','W1','u1','2026-08-20','1','2026-08-20']],
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by'],
    ['m1','v8','1001','2026-08-01',1000,'','',''],
    ['m2','v9','1001','2026-09-01',1000,'','','']],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by']],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at'],
              ['a8','c8','v8','u1','approved','','u1','2026-07-21','2026-07-22'],
              ['a9','c9','v9','u1','approved','','u1','2026-08-21','2026-08-22']],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at'],
    // Thang 8: so CU nhap tay theo hai mien, truoc khi bo tach mien
    actual('r1','GT2','1001','2026-08-01','MB',600),
    actual('r2','GT2','1001','2026-08-01','MN',300),
    // Thang 9: nhap tu ZSD450, mot dong TQ
    actual('r3','GT2','1001','2026-09-01','TQ',900)],
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

console.log('1. Thang moi (chi co so TQ): luoi chi mot cot');
const t9 = ws('getActualsWorkspace', { bu: 'GT2', month: '2026-09-01' });
console.log(`     cot mien: ${t9.regions.map((r) => r.code).join(', ')}`);
say(t9.regions.length === 1 && t9.regions[0].code === 'TQ', 'chi con cot TQ, khong con MB/MN');
say(t9.comparison.totalActual === 900, `so sanh: thuc hien = ${t9.comparison.totalActual}`);
say(t9.comparison.totalForecast === 1000, `ke hoach = ${t9.comparison.totalForecast}`);

console.log('\n2. Thang cu (da nhap tay theo MB/MN): KHONG duoc giau so cu');
const t8 = ws('getActualsWorkspace', { bu: 'GT2', month: '2026-08-01' });
console.log(`     cot mien: ${t8.regions.map((r) => r.code).join(', ')}`);
say(t8.regions.some((r) => r.code === 'MB') && t8.regions.some((r) => r.code === 'MN'),
  'MB/MN van hien vi thang do CO so lieu');
say(t8.regions.some((r) => r.code === 'TQ'), 'TQ cung co de nhap moi');

// Tong tren luoi phai bang tong ma phan so sanh dung — day la cho de lech
const tongLuoi = t8.actuals
  .filter((a) => t8.regions.some((r) => r.code === String(a.region_code)))
  .reduce((s, a) => s + Number(a.quantity), 0);
console.log(`     tong tren luoi = ${tongLuoi}   | tong phan so sanh = ${t8.comparison.totalActual}`);
say(tongLuoi === t8.comparison.totalActual,
  'tong tren luoi KHOP tong phan so sanh (900) — khong co so nao bi an di');

console.log('\n3. Luoi chia tuan cua ke hoach van giu MB/MN');
const tuan = ws('getWeeklyWorkspace', { bu: 'GT2' });
const mienTuan = (tuan.regions || []).map((r) => r.code);
console.log(`     cot mien: ${mienTuan.join(', ')}`);
say(mienTuan.includes('MB') && mienTuan.includes('MN'), 'con MB va MN');
say(!mienTuan.includes('TQ'), 'KHONG moc them cot TQ');

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nThuc hien khong tach mien, va so cu khong bi giau di.');
process.exit(bad ? 1 : 0);
