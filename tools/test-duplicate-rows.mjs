#!/usr/bin/env node
/**
 * Sua tay mot o ke hoach phai GHI DE dung mot dong, khong sinh dong moi.
 *
 *   node tools/test-duplicate-rows.mjs
 *
 * Google Sheets tu doi chuoi "2026-09-01" thanh o KIEU NGAY. Khoa cua
 * applyRowChanges_ truoc day so gia tri THO, nen dong da luu ("Tue Sep 01
 * 2026...") khong khop ban ghi gui len ("2026-09-01") va moi lan sua tay lai
 * chen them mot dong. Luoi thang van hien dung vi lay dong cuoi, nhung Bang 1
 * CONG moi dong nen so doi chieu phong len — sai o mot man hinh khac.
 *
 * Test nay giu o thang la Date that (tao TRONG ngu canh script, neu khong
 * `v instanceof Date` cua rowToObject_ khong nhan ra vi khac realm).
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
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by'],
                         ['m1','v0','A1', null, 100, '', '', '']],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by'],
                       ['w1','v0','A1', 1, 'MB', 100, '', '']],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at']],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at']],
  AuthLog: [['at','user_id','event','detail']]
};

const noop = { setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;} };
const sh = (name) => ({
  getName: () => name,
  getLastRow: () => S[name].length,
  getDataRange: () => ({ getValues: () => S[name].map((r) => r.slice()) }),
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
  Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map((n) => ({ values: (S[n] || []).map((r) => r.slice()) })) }) } } },
  Utilities: { getUuid: () => 'gen' + (++uid), computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    formatDate: (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'a@k.vn' }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Logger: { log() {} },
  __S: S
};
vm.createContext(ctx);
for (const f of readdirSync(GAS).filter((f) => f.endsWith('.gs')).sort())
  vm.runInContext(readFileSync(GAS + '/' + f, 'utf8'), ctx, { filename: f });

vm.runInContext('__S.MonthlyForecastLines[1][3] = new Date(Date.UTC(2026, 8, 1));', ctx);

const req = (action, payload) => {
  ctx.__A = action; ctx.__P = payload;
  ctx.__SESS = { userId: 'u1', fullName: 'A', role: 'central_admin', bu: 'GT2', token: 't' };
  return vm.runInContext('resetTableCache_(); prefetchForAction_(__A); dispatch_(__A, __P, __SESS);', ctx);
};

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };
const rowCount = () => S.MonthlyForecastLines.length - 1;
const dump = () => S.MonthlyForecastLines.slice(1)
  .forEach((r) => console.log(`      ${r[0]} | ${r[2]} | ${r[3]} | SL=${r[4]}`));

console.log(`1. Ô tháng đang lưu dưới dạng NGÀY, ${rowCount()} dòng (A1 = 100)`);

console.log('\n2. Sửa tay hai lần: 250 rồi 300');
req('saveMonthlyLines', { versionId: 'v0', lines: [{ skuCode: 'A1', forecastMonth: '2026-09-01', quantity: 250 }] });
req('saveMonthlyLines', { versionId: 'v0', lines: [{ skuCode: 'A1', forecastMonth: '2026-09-01', quantity: 300 }] });
dump();
say(rowCount() === 1, `còn ${rowCount()} dòng (phải là 1, không sinh dòng mới)`);

const lines = req('getMonthlyLines', { versionId: 'v0' });
say(lines.length === 1 && lines[0].quantity === 300,
  `đọc ra ${lines.length} dòng, SL=${lines.map((l) => l.quantity).join('+')}`);

console.log('\n3. Số tháng mà Bảng 1 dùng để đối chiếu');
const val = req('validateWeekly', { versionId: 'v0' });
const m = val.mismatches[0];
console.log(`   tháng=${m ? m.month_qty : '(khớp)'}  tuần=${m ? m.week_sum : '-'}`);
// tháng 300 / tuần 100 là lệch THẬT và nên báo; điều phải đúng là con số 300,
// không phải 400 do cộng dồn hai dòng trùng.
say(m && m.month_qty === 300, `Bảng 1 lấy ${m ? m.month_qty : '?'} (phải 300, không phải 400)`);

console.log('\n4. Dòng trùng đã lỡ sinh ra trước đây phải được gộp ở lần lưu kế tiếp');
vm.runInContext([
  "__S.MonthlyForecastLines.push(['d1','v0','A1','2026-10-01',10,'','','']);",
  "__S.MonthlyForecastLines.push(['d2','v0','A1','2026-10-01',20,'','','']);",
  "__S.MonthlyForecastLines.push(['d3','v0','A1', new Date(Date.UTC(2026,9,1)), 30,'','','']);"
].join('\n'), ctx);
console.log(`   trước khi lưu: ${rowCount()} dòng`);
req('saveMonthlyLines', { versionId: 'v0', lines: [{ skuCode: 'A1', forecastMonth: '2026-09-01', quantity: 300 }] });
console.log(`   sau khi lưu  : ${rowCount()} dòng`);
dump();
const oct = req('getMonthlyLines', { versionId: 'v0' }).filter((l) => l.forecast_month === '2026-10-01');
say(oct.length === 1 && oct[0].quantity === 30,
  `tháng 10 còn ${oct.length} dòng, SL=${oct.map((l) => l.quantity).join('+')} (giữ dòng cuối = 30)`);

console.log(bad ? `\n*** ${bad} chỗ sai ***` : '\nSửa tay ghi đè đúng một dòng, dòng trùng cũ được dọn.');
process.exit(bad ? 1 : 0);
