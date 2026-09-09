#!/usr/bin/env node
/**
 * Nhap XK phai TRU khach Brand ra, va khong duoc im lang bo sot ai.
 *
 *   node tools/test-import-brand.mjs
 *
 * Don vi XK la Export OEM, khong gom Brand. Dau hieu Brand nam o cot Channel
 * cua tab Clients trong hub ExportSystem — khong phai hau to PIC, vi PIC la
 * NGUOI: doi nguoi phu trach la dau hieu di theo, con khach van thuoc thi
 * truong do.
 *
 * Bai nay khoa ba hanh vi:
 *   - khach Brand bi tru khoi so nhap ve, va bao ro tru cua ai bao nhieu;
 *   - khach chua khai kenh VAN duoc tinh vao Export OEM va bi bao ten (bo di
 *     la mat san luong da co don ma khong dau hieu gi);
 *   - dong ngoai bon thang cua ky khong lam sai con so "da bo".
 *
 * Bo cuc cot lay tu run_baoCao_nguonXK() chay tren du lieu that (09/2026).
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));
const d = (s) => new Date(s + 'T00:00:00Z');

// --- Operations2026!Details: 22 cot, A Pic | B SO | C Client | D Code |
//     E Product | F Order Qty | G Ship Qty | H Price | I Value | J Shipdate
const det = (client, code, shipQty, shipdate) => {
  const r = new Array(22).fill('');
  r[0] = 'Lily'; r[1] = client + '01'; r[2] = client; r[3] = code;
  r[4] = 'May loc nuoc'; r[5] = shipQty; r[6] = shipQty; r[9] = d(shipdate);
  return r;
};

// --- PIDetails: A Pic | B Client | C PI_Number | D PI_Date | E Item_code |
//     F Product_description | G Qty
const pid = (client, pi, code, qty) => {
  const r = new Array(12).fill('');
  r[0] = 'Lily'; r[1] = client; r[2] = pi; r[3] = d('2026-07-22');
  r[4] = code; r[5] = 'mo ta'; r[6] = qty;
  return r;
};

// --- PITotal: A Pic | B Client | C Order/PI # | D PI Date | E FOB | F Discount
//     | G Freight | H Expected_Load
const pit = (client, pi, load) => {
  const r = new Array(10).fill('');
  r[0] = 'Lily'; r[1] = client; r[2] = pi; r[3] = d('2026-07-22');
  r[4] = 0; r[5] = 0; r[6] = 0; r[7] = d(load);
  return r;
};

// --- Clients: 12 cot, B Client_Name ... L Channel
const cli = (name, channel) => {
  const r = new Array(12).fill('');
  r[0] = '200' + name.length; r[1] = name; r[4] = 'UAE'; r[7] = 'Lily';
  r[8] = 'FOB'; r[9] = 0.12; r[10] = '01_Trung Dong'; r[11] = channel;
  return r;
};

const SRC = {
  Details: [
    ['Pic','SO','Client','Code','Product','Order Qty','Ship Qty','Price','Value','Shipdate',
     'Category','Option','qty/ct','L','W','H','CBM','ICBM','Marking','Brand','NetWeight','Note'],
    det('Egyptgate', '1001110548', 200, '2026-09-15'),   // giu
    det('PhilCo',    '1001110548', 500, '2026-09-20'),   // bo — KRF-Phil
    det('ThaiCo',    '1001110001', 300, '2026-10-05'),   // bo — KRF-Thai
    det('NewGuy',    '1001110002',  70, '2026-09-11'),   // giu + bao ten
    det('PhilCo',    '1001110548', 900, '2027-05-01')    // ngoai ky — khong tinh vao dau ca
  ],
  PITotal: [
    ['PIC','Client','Order/PI #','PI Date','FOB','Discount','Freight','Expected_Load','Status','Note'],
    pit('Alssalam', 'Alssalam01', '2026-11-14'),
    pit('PhilCo',   'Phil01',     '2026-09-30')
  ],
  PIDetails: [
    ['Pic','Client','PI_Number','PI_Date','Item_code','Product_description','Qty',
     'Unit Price','Amount','Marking','Note','NetWeight'],
    pid('Alssalam', 'Alssalam01', '1001110071', 300),    // giu + bao ten
    pid('PhilCo',   'Phil01',     '1001110071', 999)     // bo — KRF-Phil
  ],
  Clients: [
    ['Client_ID','Client_Name','Full_name','Address','Country','Telephone','Destination_Port',
     'Sale_ID','Default_Incoterm','Target_Margin_%','Other','Channel'],
    cli('Egyptgate', 'Export OEM'),
    cli('Zamil',     'Export OEM'),
    cli('PhilCo',    'KRF-Phil'),
    cli('ThaiCo',    'KRF-Thai')
  ]
};

const FC = {
  Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login']],
  BusinessUnits: [['code','name','is_active','sap_channel'],['XK','Export OEM','1','XK']],
  Regions: [['code','name','is_active'],['MB','MB','1']],
  ProductGroups: [['code','name']],
  Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active']],
  ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at']],
  ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at']],
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by']],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by']],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at']],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at']],
  AuthLog: [['at','user_id','event','detail']]
};

const noop = { setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;} };
const sheetOf = (store, n) => ({
  getName: () => n,
  getLastRow: () => store[n].length,
  getLastColumn: () => store[n][0].length,
  getDataRange: () => ({ getValues: () => store[n].map((r) => r.slice()) }),
  getRange: (row, col, nRows, nCols) => ({
    ...noop,
    getValues: () => store[n].slice(row - 1, row - 1 + nRows).map((r) => r.slice(col - 1, col - 1 + nCols)),
    setValues(){}, clearContent(){}
  }),
  appendRow: (r) => store[n].push(r),
  setFrozenRows(){}
});
const bookOf = (store, name) => ({
  getName: () => name,
  getSheetByName: (n) => (store[n] ? sheetOf(store, n) : null),
  getSheets: () => Object.keys(store).map((n) => sheetOf(store, n)),
  insertSheet: (n) => { store[n] = [[]]; return sheetOf(store, n); }
});

const ctx = {
  console,
  SpreadsheetApp: {
    openById: (id) => {
      if (id === ctx.__OPS_ID) return bookOf(SRC, 'Operations2026');
      if (id === ctx.__HUB_ID) return bookOf(SRC, 'ExportSystem');
      return bookOf(FC, 'FC');
    }
  },
  Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map((n) => ({ values: (FC[n] || []).map((r) => r.slice()) })) }) } } },
  Utilities: { getUuid: () => 'id', computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    formatDate: (x) => `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}` },
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
ctx.__OPS_ID = vm.runInContext('IMP_OPS2026_ID', ctx);
ctx.__HUB_ID = vm.runInContext('IMP_HUB_ID', ctx);

const gom = vm.runInContext("impGomXK_(['2026-09','2026-10','2026-11','2026-12'])", ctx);

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

console.log('San luong gom duoc theo ma:');
Object.keys(gom.theoMa).sort().forEach((ma) => console.log(`      ${ma}  [${gom.theoMa[ma].join(', ')}]`));

console.log('\n1. Khach Export OEM duoc giu');
say(String(gom.theoMa['1001110548']) === '200,0,0,0',
  `1001110548 = [${gom.theoMa['1001110548']}] (chi 200 cua Egyptgate, khong co 500 cua PhilCo)`);

console.log('\n2. Khach Brand bi tru ra');
say(!gom.theoMa['1001110001'], 'ma chi PhilCo/ThaiCo dat (1001110001) khong duoc gom');
say(String(gom.theoMa['1001110071']) === '0,0,300,0',
  `1001110071 = [${gom.theoMa['1001110071']}] (300 cua Alssalam, khong co 999 cua PhilCo)`);

console.log('\n3. Khach chua khai kenh VAN duoc tinh, khong bi bo im lang');
say(String(gom.theoMa['1001110002']) === '70,0,0,0',
  `1001110002 = [${gom.theoMa['1001110002']}] (NewGuy chua co trong Clients)`);

console.log('\n4. Ghi chu tra ve man hinh:');
gom.ghiChu.forEach((g) => console.log(`      • ${g}`));
const boGhi = gom.ghiChu.find((g) => g.indexOf('Brand') >= 0) || '';
say(/KRF-Phil: 1\.499 cái \/ 2 dòng/.test(boGhi), 'bao dung 1.499 cai / 2 dong cua KRF-Phil');
say(/KRF-Thai: 300 cái \/ 1 dòng/.test(boGhi), 'bao ca KRF-Thai — thi truong thu nam chua co don vi trong FC');
say(boGhi.indexOf('PhilCo') >= 0 && boGhi.indexOf('ThaiCo') >= 0, 'neu ten khach bi loai');
say(boGhi.indexOf('900') < 0 && !/KRF-Phil: 2\.399/.test(boGhi),
  'dong thang 5/2027 (ngoai ky) khong lam phong con so da bo');

const laGhi = gom.ghiChu.find((g) => g.indexOf('KHÔNG có trong tab Clients') >= 0) || '';
say(/^2 khách/.test(laGhi), 'bao dung 2 khach chua khai kenh');
say(laGhi.indexOf('NewGuy') >= 0 && laGhi.indexOf('Alssalam') >= 0, 'neu ten ca hai khach do');

console.log('\n5. Thieu cot Channel thi phai dung han, khong doan');
SRC.Clients[0][11] = 'Ghi chu';
let loi = '';
try { vm.runInContext("impGomXK_(['2026-09','2026-10','2026-11','2026-12'])", ctx); }
catch (e) { loi = e.message; }
SRC.Clients[0][11] = 'Channel';
say(loi.indexOf('Channel') >= 0, `bao loi ro rang: ${loi.slice(0, 80)}…`);

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nHang Brand bi tru dung, khach chua khai duoc bao ten.');
process.exit(bad ? 1 : 0);
