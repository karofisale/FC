#!/usr/bin/env node
/**
 * So thuc hien voi ke hoach CUA CHINH THANG DO, khong phai chu ky moi nhat.
 *
 *   node tools/test-fc-vs-actual.mjs
 *
 * Man San luong thuc hien mac dinh mo THANG TRUOC, trong khi chu ky moi nhat
 * cua don vi thuong bat dau tu THANG NAY — ma mot chu ky chi phu
 * base_month..base+3. Truoc day getFcVsActual_ lay "chu ky moi nhat" nen
 * khong tim thay dong nao cho thang truoc: FC = 0, lech = 100% san luong,
 * co cycleFound van true nen man hinh khong bao gi ca.
 *
 * Bai nay cung khoa viec chon BAN ke hoach: uu tien ban DA DUYET, giong file
 * upload SAP. Co is_final bi createVersion_ chuyen sang ban cap nhat tuan
 * moi, nen do theo is_final la con so do chinh xac tu doi moi lan co nguoi
 * tao ban moi.
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));

const S = {
  Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
          ['u1','Admin','a@k.vn','central_admin','','h','1','0','','']],
  BusinessUnits: [['code','name','is_active','sap_channel'],['GT2','GT2','1','GT2']],
  Regions: [['code','name','is_active'],['MB','MB','1'],['MN','MN','1']],
  ProductGroups: [['code','name'],['G1','N1']],
  Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'],
             ['1001','May A','A','G1','N1','RO','GT2','1000','1']],
  // c8 lap ke hoach cho chinh thang 8; c9 la chu ky moi nhat, khong co thang 8
  ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at'],
                   ['c8','GT2','2026-08-01','4','approved','u1','2026-07-20'],
                   ['c9','GT2','2026-09-01','4','draft','u1','2026-08-20']],
  // c8 co HAI ban: v8 da duyet, v8b moi hon va dang giu co is_final
  ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at'],
                     ['v8','c8','1','2026-07-20','W1','u1','2026-07-20','','2026-07-20'],
                     ['v8b','c8','2','2026-08-05','W2','u1','2026-08-05','1','2026-08-05'],
                     ['v9','c9','1','2026-08-20','W1','u1','2026-08-20','1','2026-08-20']],
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by'],
    ['m1','v8','1001','2026-08-01',1000,'','',''],    // ban DA DUYET: 1000
    ['m2','v8b','1001','2026-08-01',1500,'','',''],   // ban moi chua duyet: 1500
    ['m3','v9','1001','2026-09-01',1200,'','','']],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by']],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at'],
              ['a1','c8','v8','u1','approved','','u1','2026-07-21','2026-07-22']],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at'],
    ['r1','GT2','1001','2026-08-01','MB',600,'Manual','u1',''],
    ['r2','GT2','1001','2026-08-01','MN',300,'Manual','u1','']],
  AuthLog: [['at','user_id','event','detail']]
};

const noop = { setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;} };
const sh = (n) => ({ getName: () => n, getLastRow: () => S[n].length, getLastColumn: () => S[n][0].length,
  getDataRange: () => ({ getValues: () => S[n].map((r) => r.slice()) }),
  getRange: (row, col, nR, nC) => ({ ...noop,
    getValues: () => S[n].slice(row - 1, row - 1 + nR).map((r) => r.slice(col - 1, col - 1 + nC)),
    setValues(){}, clearContent(){} }),
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

const doSanh = (thang) => {
  ctx.__M = thang;
  return vm.runInContext("resetTableCache_(); getFcVsActual_('GT2', __M)", ctx);
};

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

console.log('1. Thang 8: co chu ky c8 lap cho chinh thang 8, va chu ky c9 moi hon');
const t8 = doSanh('2026-08-01');
console.log(`      chu ky dung: ${t8.cycleBaseMonth}  ban: ${t8.versionBasis} (${t8.versionId})  lech truoc ${t8.leadMonths} thang`);
console.log(`      FC=${t8.totalForecast}  thuc hien=${t8.totalActual}  lech=${t8.totalVariance} (${t8.totalVariancePct}%)`);
say(t8.cycleBaseMonth === '2026-08-01', 'lay chu ky thang 8, khong phai chu ky moi nhat (thang 9)');
say(t8.versionBasis === 'approved' && t8.versionId === 'v8', 'lay ban DA DUYET (1000), khong phai ban is_final chua duyet (1500)');
say(t8.totalForecast === 1000, `FC = ${t8.totalForecast}`);
say(t8.totalActual === 900, `thuc hien = ${t8.totalActual} (600 MB + 300 MN)`);
say(t8.totalVariance === -100 && t8.totalVariancePct === -10, `lech = ${t8.totalVariance} (${t8.totalVariancePct}%)`);
say(t8.leadMonths === 0, 'leadMonths = 0 — ke hoach lap dau chinh thang do');

console.log('\n2. Thang 9: ca c8 lan c9 deu phu, phai lay chu ky lap DUNG thang 9');
const t9 = doSanh('2026-09-01');
console.log(`      chu ky dung: ${t9.cycleBaseMonth}  ban: ${t9.versionBasis}  FC=${t9.totalForecast}`);
say(t9.cycleBaseMonth === '2026-09-01', 'uu tien base_month == thang dang xem');
say(t9.versionBasis === 'final', 'c9 chua duyet nen roi ve ban is_final, va noi ro la "final"');
say(t9.totalForecast === 1200, `FC = ${t9.totalForecast} (cua c9, khong phai 1100 cua c8)`);

console.log('\n3. Thang 11: chi con c9 phu (thang 9..12), khong co chu ky lap dung thang 11');
const t11 = doSanh('2026-11-01');
console.log(`      chu ky dung: ${t11.cycleBaseMonth}  lech truoc ${t11.leadMonths} thang`);
say(t11.cycleFound && t11.cycleBaseMonth === '2026-09-01', 'roi ve chu ky gan nhat co phu thang do');
say(t11.leadMonths === 2, `leadMonths = ${t11.leadMonths} — man hinh noi duoc "du bao truoc 2 thang"`);

console.log('\n4. Thang 5: khong chu ky nao lap ke hoach cho thang do');
const t5 = doSanh('2026-05-01');
say(!t5.cycleFound, 'cycleFound = false — man hinh bao khong so sanh duoc, thay vi hien FC = 0');
say(t5.totalForecast === 0 && t5.rows.length === 0, 'khong bia ra con so nao');

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nSo dung ke hoach cua thang dang xem, va noi ro lay tu dau.');
process.exit(bad ? 1 : 0);
