#!/usr/bin/env node
/**
 * Hai duong tai du lieu Bang 0 phai tra ve CUNG MOT dang forecast_month.
 *
 *   node tools/test-month-key.mjs
 *
 * Google Sheets tu doi chuoi "2026-09-01" thanh o kieu ngay. Luoi dung khoa
 * `sku_thang` so voi moc YYYY-MM-01, nen neu mot duong tra ve chuoi ISO thi
 * moi o hien 0 — dung trieu chung "nhap file xong luoi chi co ma va ten,
 * phai tai lai trang moi thay so".
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));

const S = {
  Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
          ['u1','Admin','a@k.vn','central_admin','','h','1','0','','']],
  BusinessUnits: [['code','name','is_active'],['GT2','GT2','1']],
  Regions: [['code','name','is_active'],['MB','MB','1'],['MN','MN','1']],
  ProductGroups: [['code','name'],['G1','N1']],
  Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'],
             ['A1','SP A','A','G1','N1','RO','GT2','1000','1']],
  ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at'],
                   ['c0','GT2','2026-09-01','4','draft','u1','2026-01-01']],
  ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at'],
                     ['v0','c0','1','2026-01-01','W1','u1','2026-01-01','1','2026-01-01']],
  // Ô tháng lưu dưới dạng NGÀY — đúng như Google Sheets tự chuyển
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by'],
                         ['m1','v0','A1', null, 250,'','','']],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by']],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at']],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at']],
  AuthLog: [['at','user_id','event','detail']]
};

const noop = { setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;} };
const sh = (n) => ({ getName: () => n, getLastRow: () => S[n].length,
  getDataRange: () => ({ getValues: () => S[n].map(r => r.slice()) }),
  getRange: () => ({ ...noop, setValues(){}, clearContent(){} }),
  appendRow: (r) => S[n].push(r), setFrozenRows(){} });

const ctx = {
  console,
  SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => (S[n] ? sh(n) : null), insertSheet: (n) => { S[n] = [[]]; return sh(n); } }) },
  Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map(n => ({ values: (S[n] || []).map(r => r.slice()) })) }) } } },
  Utilities: { getUuid: () => 'id', computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    formatDate: (d, tz, fmt) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` },
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

// Date phai tao TRONG vm, neu khong `v instanceof Date` cua rowToObject_ khong
// nhan ra (khac realm) va phep kiem se khong giong Apps Script that.
ctx.__S1 = S;
vm.runInContext('__S1.MonthlyForecastLines[1][3] = new Date(Date.UTC(2026, 8, 1));', ctx);

const req = (action, payload) => {
  ctx.__A = action; ctx.__P = payload;
  ctx.__S = { userId: 'u1', fullName: 'A', role: 'central_admin', bu: 'GT2', token: 't' };
  return vm.runInContext('resetTableCache_(); prefetchForAction_(__A); dispatch_(__A, __P, __S);', ctx);
};

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

const MONTH = '2026-09-01';                                  // mốc tháng lưới dùng
const ws = req('getMonthlyWorkspace', { bu: 'GT2' });
const direct = req('getMonthlyLines', { versionId: 'v0' });

const keyOf = (l) => `${l.sku_code}_${l.forecast_month}`;
console.log('khoá ô lưới cần:      ' + `A1_${MONTH}`);
console.log('mở trang  (workspace): ' + keyOf(ws.lines[0]));
console.log('sau khi nhập (getMonthlyLines): ' + keyOf(direct[0]));
console.log();

say(keyOf(ws.lines[0]) === `A1_${MONTH}`, 'mở trang: khoá khớp → lưới hiện số');
say(keyOf(direct[0]) === `A1_${MONTH}`, 'sau khi nhập: khoá khớp → lưới hiện số');

console.log(bad ? `\n*** ${bad} chỗ lệch — lưới sẽ trống cho tới khi tải lại trang ***`
                : '\nHai đường trả về cùng một dạng, lưới hiện số ngay.');
process.exit(bad ? 1 : 0);
