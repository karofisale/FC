#!/usr/bin/env node
/**
 * Hai quy tac ghi du lieu ke hoach, khong can file that nen chay duoc moi luc:
 *
 *   node tools/test-import-overwrite.mjs
 *
 *   - Sua tay tren luoi  -> GOP: chi o duoc sua moi doi, o khac giu nguyen.
 *   - Nhap lai tu file   -> GHI DE tron ban ke hoach: SKU khong con trong file
 *                           phai bien mat, khong duoc nam lai cong vao tong.
 *   - Chu ky da duyet    -> chan ca hai duong.
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));

function build() {
  const S = {
    Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
            ['u1','Admin','a@k.vn','central_admin','','h','1','0','','']],
    BusinessUnits: [['code','name','is_active'],['GT2','GT2','1']],
    Regions: [['code','name','is_active'],['MB','MB','1'],['MN','MN','1']],
    ProductGroups: [['code','name'],['G1','N1']],
    Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'],
               ['A1','SP A','A','G1','N1','RO','GT2','1000','1'],
               ['A2','SP B','B','G1','N1','RO','GT2','1000','1'],
               ['A3','SP C','C','G1','N1','RO','GT2','1000','1']],
    ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at'],
                     ['c0','GT2','2026-09-01','4','draft','u1','2026-01-01']],
    ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at'],
                       ['v0','c0','1','2026-01-01','W1','u1','2026-01-01','1','2026-01-01']],
    MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by']],
    WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by']],
    Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at']],
    ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at']],
    AuthLog: [['at','user_id','event','detail']]
  };
  const noop = { setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;} };
  const sh = (name) => ({
    getName: () => name,
    getLastRow: () => S[name].length,
    getDataRange: () => ({ getValues: () => S[name].map(r => r.slice()) }),
    getRange: (row, col, nRows, nCols) => ({
      ...noop,
      setValues: (vals) => {
        const g = S[name];
        vals.forEach((v, i) => {
          const r = row - 1 + i;
          while (g.length <= r) g.push(new Array(g[0].length).fill(''));
          for (let c = 0; c < v.length; c++) g[r][col - 1 + c] = v[c];
        });
      },
      clearContent: () => {
        const g = S[name];
        for (let i = 0; i < nRows; i++) {
          const r = row - 1 + i;
          if (g[r]) for (let c = 0; c < nCols; c++) g[r][col - 1 + c] = '';
        }
        while (g.length > 1 && g[g.length - 1].join('') === '') g.pop();
      }
    }),
    appendRow: (r) => S[name].push(r),
    setFrozenRows: () => {}
  });
  let uid = 0;
  const ctx = {
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => (S[n] ? sh(n) : null), insertSheet: (n) => { S[n] = [[]]; return sh(n); } }) },
    Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map(n => ({ values: (S[n] || []).map(r => r.slice()) })) }) } } },
    Utilities: { getUuid: () => 'id' + (++uid), computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }, formatDate: () => '2026-01-01' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'a@k.vn' }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Logger: { log() {} }
  };
  vm.createContext(ctx);
  for (const f of readdirSync(GAS).filter(f => f.endsWith('.gs')).sort())
    vm.runInContext(readFileSync(GAS + '/' + f, 'utf8'), ctx, { filename: f });
  const req = (action, payload) => {
    ctx.__A = action; ctx.__P = payload;
    ctx.__S = { userId: 'u1', fullName: 'A', role: 'central_admin', bu: 'GT2', token: 't' };
    return vm.runInContext('resetTableCache_(); prefetchForAction_(__A); dispatch_(__A, __P, __S);', ctx);
  };
  return { req, S };
}

const M = '2026-09-01';
let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };
const { req, S } = build();
const show = (a) => a.map((l) => `${l.sku_code}=${l.quantity}`).join(', ') || '(rỗng)';

console.log('A. Sửa tay trên lưới — phải GỘP, không được xoá ô khác');
req('saveMonthlyLines', { versionId: 'v0', lines: [
  { skuCode: 'A1', forecastMonth: M, quantity: 100 },
  { skuCode: 'A2', forecastMonth: M, quantity: 200 },
  { skuCode: 'A3', forecastMonth: M, quantity: 300 }
] });
req('saveMonthlyLines', { versionId: 'v0', lines: [{ skuCode: 'A1', forecastMonth: M, quantity: 50 }] });
const manual = req('getMonthlyLines', { versionId: 'v0' });
console.log('   -> ' + show(manual));
say(manual.length === 3 && manual.find((l) => l.sku_code === 'A1').quantity === 50,
  'sửa 1 ô: còn đủ 3 mã, A1 thành 50, A2/A3 nguyên vẹn');

console.log('\nB. Nhập lại từ file — phải GHI ĐÈ trọn bản kế hoạch');
req('saveMonthlyLines', { versionId: 'v0', replaceAll: true, lines: [
  { skuCode: 'A1', forecastMonth: M, quantity: 100 },
  { skuCode: 'A2', forecastMonth: M, quantity: 200 },
  { skuCode: 'A3', forecastMonth: M, quantity: 300 }
] });
console.log('   lần 1: A1=100, A2=200, A3=300');
req('saveMonthlyLines', { versionId: 'v0', replaceAll: true, lines: [{ skuCode: 'A1', forecastMonth: M, quantity: 50 }] });
const imported = req('getMonthlyLines', { versionId: 'v0' });
console.log('   lần 2 (file đã sửa, chỉ còn A1=50) -> ' + show(imported));
say(imported.length === 1 && imported[0].sku_code === 'A1' && imported[0].quantity === 50,
  'còn đúng 1 mã A1=50 — A2, A3 đã bị xoá');
say(imported.reduce((s, l) => s + l.quantity, 0) === 50, 'tổng = 50, không phải 550');

console.log('\nC. Bảng tuần cũng vậy');
req('saveWeeklySplits', { versionId: 'v0', replaceAll: true, splits: [
  { skuCode: 'A1', weekNumber: 1, regionCode: 'MB', quantity: 30 },
  { skuCode: 'A2', weekNumber: 1, regionCode: 'MB', quantity: 70 }
] });
req('saveWeeklySplits', { versionId: 'v0', replaceAll: true, splits: [
  { skuCode: 'A1', weekNumber: 1, regionCode: 'MB', quantity: 50 }
] });
const wk = req('getWeeklySplits', { versionId: 'v0' });
console.log('   -> ' + (wk.map((x) => `${x.sku_code}/T${x.week_number}/${x.region_code}=${x.quantity}`).join(', ') || '(rỗng)'));
say(wk.length === 1 && wk[0].quantity === 50, 'còn đúng 1 dòng tuần — A2 đã bị xoá');

console.log('\nD. Chu kỳ ĐÃ DUYỆT phải bị chặn');
S.ForecastCycles[1][4] = 'approved';
let blocked = false;
try {
  req('saveMonthlyLines', { versionId: 'v0', replaceAll: true, lines: [{ skuCode: 'A1', forecastMonth: M, quantity: 1 }] });
} catch (e) {
  blocked = /duyệt|khoá/i.test(e.message);
}
say(blocked, 'không nhập đè được lên chu kỳ đã duyệt');

console.log(bad ? `\n*** ${bad} chỗ chưa đúng ***`
                : '\nĐúng cả hai: sửa tay thì gộp, nhập lại thì ghi đè trọn kỳ.');
process.exit(bad ? 1 : 0);
