#!/usr/bin/env node
/**
 * Kiểm các quy tắc của phần xuất ZPP702 không cần tới file thật — chạy được
 * mọi lúc, khác với verify-sap-export.mjs (cần bản FC và file đã upload).
 *
 *   node tools/test-sap-rules.mjs
 *
 * Hai điều được bảo vệ ở đây đều là kiểu lỗi âm thầm:
 *   - thiếu cột requirements_type thì các mã cần ghi đè rơi về quy tắc mã-đầu-1
 *     và sai loại kế hoạch trên SAP, file nhìn vẫn bình thường;
 *   - lấy nhầm bản mới nhất thay vì bản đã duyệt thì số lên SAP là số chưa ai
 *     thẩm định (đúng bẫy cũ của cờ is_final).
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildSapRows } from '../client/src/utils/sapExport.js';

const GAS = fileURLToPath(new URL('../gas', import.meta.url));

function build(withColumn) {
  const head = ['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'];
  const S = {
    Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
            ['u1','Admin','a@k.vn','central_admin','','h','1','0','','']],
    BusinessUnits: [['code','name','is_active'],['XK','XK','1']],
    Regions: [['code','name','is_active'],['MB','MB','1'],['MN','MN','1']],
    ProductGroups: [['code','name'],['G1','N1']],
    Products: [withColumn ? [...head, 'requirements_type'] : head,
      // 2004020297 la ma dau 2 nhung phai la VSE - dung ca 6 ma that
      withColumn ? ['2004020297','Loi loc','L','G1','N1','RO','XK','100','1','VSE']
                 : ['2004020297','Loi loc','L','G1','N1','RO','XK','100','1'],
      withColumn ? ['1001050033','May RO','M','G1','N1','RO','XK','100','1','']
                 : ['1001050033','May RO','M','G1','N1','RO','XK','100','1']],
    ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at'],
                     ['c0','XK','2026-09-01','4','approved','u1','2026-01-01']],
    ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at'],
                       ['v0','c0','1','2026-01-01','W1','u1','2026-01-01','1','2026-01-01'],
                       ['v1','c0','2','2026-01-01','W2','u1','2026-01-01','','2026-01-01']],
    MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by'],
      ['m1','v0','2004020297','2026-10-01','500','','',''],
      ['m2','v0','1001050033','2026-10-01','100','','',''],
      // v1 la ban MOI NHAT (is_final khong con o v0) nhung CHUA duoc duyet
      ['m3','v1','2004020297','2026-10-01','999','','','']],
    WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by']],
    Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at'],
                ['a1','c0','v0','u1','approved','','u2','2026-01-01','2026-01-02']],
    ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at']],
    AuthLog: [['at','user_id','event','detail']]
  };
  const noop = { setValues(){return this;}, clearContent(){return this;}, setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;} };
  const sheet = (n) => ({ getName:()=>n, getLastRow:()=>S[n].length,
    getDataRange:()=>({getValues:()=>S[n].map(r=>r.slice())}), getRange:()=>noop, appendRow(){}, setFrozenRows(){} });
  const ctx = {
    console,
    SpreadsheetApp:{openById:()=>({getSheetByName:(n)=>S[n]?sheet(n):null, insertSheet:(n)=>{S[n]=[[]];return sheet(n);}})},
    Sheets:{Spreadsheets:{Values:{batchGet:(id,o)=>({valueRanges:o.ranges.map(n=>({values:(S[n]||[]).map(r=>r.slice())}))})}}},
    Utilities:{getUuid:()=>'u',computeDigest:()=>[1],base64Encode:()=>'x',DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},formatDate:()=>'2026-01-01'},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,setProperty(){},deleteProperty(){}})},
    Session:{getActiveUser:()=>({getEmail:()=>'a@k.vn'}),getScriptTimeZone:()=>'Asia/Ho_Chi_Minh'},
    ContentService:{createTextOutput:(t)=>({setMimeType:()=>t}),MimeType:{JSON:'json'}}, Logger:{log(){}}
  };
  vm.createContext(ctx);
  for (const f of readdirSync(GAS).filter(f=>f.endsWith('.gs')).sort())
    vm.runInContext(readFileSync(GAS+'/'+f,'utf8'), ctx, {filename:f});
  ctx.__S = { userId:'u1', fullName:'A', role:'central_admin', bu:'XK', token:'t' };
  ctx.__P = { baseMonth:'2026-09-01' };
  return vm.runInContext('resetTableCache_(); prefetchForAction_("getSapExport"); dispatch_("getSapExport", __P, __S);', ctx);
}

let bad = 0;
const check = (l, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`  FAIL ${l}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`); }
  else console.log(`  ok   ${l}`);
};

console.log('=== Products CO cot requirements_type ===');
let d = build(true);
check('bao la co cot', d.hasRequirementsTypeColumn, true);
check('dem dung so ma da dien', d.requirementsTypeOverrides, 1);
let rows = buildSapRows({ channel:'XK', baseMonth:d.baseMonth, rows:d.rows, exportedAt:new Date(2026,8,2) });
let byS = Object.fromEntries(rows.map(r => [String(r[1]), r]));
check('2004020297 (dau 2) -> VSE nho ghi de', byS['2004020297']?.[4], 'VSE');
check('1001050033 (dau 1) -> VSE theo quy tac', byS['1001050033']?.[4], 'VSE');
check('lay so cua BAN DA DUYET (500) chu khong phai ban moi nhat (999)', byS['2004020297']?.[11], 500);

console.log('\n=== Products CHUA co cot ===');
d = build(false);
check('bao la thieu cot', d.hasRequirementsTypeColumn, false);
check('so ma ghi de = 0', d.requirementsTypeOverrides, 0);
rows = buildSapRows({ channel:'XK', baseMonth:d.baseMonth, rows:d.rows, exportedAt:new Date(2026,8,2) });
byS = Object.fromEntries(rows.map(r => [String(r[1]), r]));
check('2004020297 roi ve VSF (dung cai app phai canh bao)', byS['2004020297']?.[4], 'VSF');

console.log(bad ? `\n*** ${bad} loi ***` : '\nDat het.');
process.exit(bad ? 1 : 0);
