#!/usr/bin/env node
/**
 * Nhap tu app nguon phai GOI Y TEN cho ma la, va OEM khong bia ten khi khong co.
 *
 *   node tools/test-import-new-products.mjs
 *
 * Nguon XK (Details/PIDetails) co cot ten hang di kem so luong, con SOP_Plan
 * cua OEM thi khong (chi Ky, Sale, Ma SKU, SL...). Truoc day importSopFromSource_
 * chi tra ve unknownSkus (chi co MA), bat nguoi dung tu go tay ca ten lan ma —
 * trong khi ten da co san o nguon XK, khong dung toi la phi.
 *
 * Bai nay khoa hai hanh vi:
 *   - XK: ma la duoc kem TEN GOI Y, lay tu dong dau tien gap (Details truoc,
 *     PIDetails sau — thu tu doc trong impGomXK_), khong bia neu khong dong
 *     nao co ten.
 *   - OEM: khong co ten nao ca — tenGoi luon rong vi SOP_Plan khong co cot do.
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));
const d = (s) => new Date(s + 'T00:00:00Z');

// --- Operations2026!Details: A Pic|B SO|C Client|D Code|E Product|F Order Qty|
//     G Ship Qty|H Price|I Value|J Shipdate
const det = (client, code, product, shipQty, shipdate) => {
  const r = new Array(22).fill('');
  r[0] = 'Lily'; r[1] = client + '01'; r[2] = client; r[3] = code;
  r[4] = product; r[5] = shipQty; r[6] = shipQty; r[9] = d(shipdate);
  return r;
};

// --- PIDetails: A Pic|B Client|C PI_Number|D PI_Date|E Item_code|
//     F Product_description|G Qty
const pid = (client, pi, code, desc, qty) => {
  const r = new Array(12).fill('');
  r[0] = 'Lily'; r[1] = client; r[2] = pi; r[3] = d('2026-07-22');
  r[4] = code; r[5] = desc; r[6] = qty;
  return r;
};

const pit = (client, pi, load) => {
  const r = new Array(10).fill('');
  r[0] = 'Lily'; r[1] = client; r[2] = pi; r[3] = d('2026-07-22');
  r[4] = 0; r[5] = 0; r[6] = 0; r[7] = d(load);
  return r;
};

const cli = (name, channel) => {
  const r = new Array(12).fill('');
  r[0] = '200' + name.length; r[1] = name; r[4] = 'UAE'; r[7] = 'Lily';
  r[8] = 'FOB'; r[9] = 0.12; r[10] = '01_Trung Dong'; r[11] = channel;
  return r;
};

// --- OEM SOP_Plan: A Ky|B Sale|C Ma SKU|D..G SL T+1..T+4|H Trang thai ---
// KHONG co cot ten hang — dung de khoa "OEM khong bia ten".
const sop = (ky, sale, ma, sl1, sl2, sl3, sl4, trangThai) =>
  [ky, sale, ma, sl1, sl2, sl3, sl4, trangThai];

const SRC = {
  Details: [
    ['Pic', 'SO', 'Client', 'Code', 'Product', 'Order Qty', 'Ship Qty', 'Price', 'Value', 'Shipdate',
      'Category', 'Option', 'qty/ct', 'L', 'W', 'H', 'CBM', 'ICBM', 'Marking', 'Brand', 'NetWeight', 'Note'],
    // 9001 la ma LA — chua co trong danh muc Products. Ten goi y lay tu day.
    det('Egyptgate', '9001000001', 'Máy lọc nước mini XK', 200, '2026-09-15'),
    // 1001040001 la ma DA CO trong danh muc — khong duoc vao unknownSkus/tenGoi.
    det('Egyptgate', '1001040001', 'Máy đã có trong danh mục', 50, '2026-09-20')
  ],
  PITotal: [
    ['PIC', 'Client', 'Order/PI #', 'PI Date', 'FOB', 'Discount', 'Freight', 'Expected_Load', 'Status', 'Note'],
    pit('Alssalam', 'Alssalam01', '2026-11-14')
  ],
  PIDetails: [
    ['Pic', 'Client', 'PI_Number', 'PI_Date', 'Item_code', 'Product_description', 'Qty',
      'Unit Price', 'Amount', 'Marking', 'Note', 'NetWeight'],
    // 9002 chi xuat hien o PIDetails — kiem ten goi y cung lay duoc tu nguon nay.
    pid('Alssalam', 'Alssalam01', '9002000002', 'Lõi lọc XK chưa khai báo', 300)
  ],
  Clients: [
    ['Client_ID', 'Client_Name', 'Full_name', 'Address', 'Country', 'Telephone', 'Destination_Port',
      'Sale_ID', 'Default_Incoterm', 'Target_Margin_%', 'Other', 'Channel'],
    cli('Egyptgate', 'Export OEM'),
    cli('Alssalam', 'Export OEM')
  ],
  // OEM doc tu chinh sheet nay (IMP_OEM_SHEET_ID) — tach rieng SRC.SOP_Plan
  // vi day la spreadsheet KHAC voi Operations2026/ExportSystem.
  SOP_Plan: [
    ['Ky', 'Sale', 'Ma SKU', 'SL T+1', 'SL T+2', 'SL T+3', 'SL T+4', 'Trang thai'],
    // 9003 la ma la ben OEM — khong co cot ten nao de goi y.
    sop('2026-09', 'A', '9003000003', 100, 0, 0, 0, 'Đã duyệt'),
    sop('2026-09', 'A', '1001040001', 40, 0, 0, 0, 'Đã duyệt')
  ]
};

const FC = {
  Users: [['id', 'full_name', 'email', 'role', 'business_unit_code', 'pin_hash', 'is_active', 'failed_attempts', 'locked_until', 'last_login'],
    ['u1', 'Admin', 'a@k.vn', 'central_admin', '', 'h', '1', '0', '', '']],
  BusinessUnits: [['code', 'name', 'is_active', 'sap_channel'], ['XK', 'Export OEM', '1', 'XK'], ['OEM', 'Domestic OEM', '1', 'OEM']],
  Regions: [['code', 'name', 'is_active'], ['MB', 'Miền Bắc', '1'], ['MN', 'Miền Nam', '1']],
  ProductGroups: [['code', 'name'], ['G1', 'Nhóm 1']],
  Products: [['sku_code', 'name', 'short_name', 'product_group_code', 'product_group_name', 'technology', 'default_channel', 'avg_price', 'is_active'],
    ['1001040001', 'Máy đã có trong danh mục', 'X', 'G1', 'Nhóm 1', 'RO', 'XK', '1000', '1']],
  ForecastCycles: [['id', 'business_unit_code', 'base_month', 'horizon_months', 'status', 'created_by', 'created_at']],
  ForecastVersions: [['id', 'cycle_id', 'update_week', 'update_date', 'iso_week_label', 'submitted_by', 'submitted_at', 'is_final', 'created_at']],
  MonthlyForecastLines: [['id', 'version_id', 'sku_code', 'forecast_month', 'quantity', 'note', 'updated_at', 'updated_by']],
  WeeklyRegionSplits: [['id', 'version_id', 'sku_code', 'week_number', 'region_code', 'quantity', 'updated_at', 'updated_by']],
  Approvals: [['id', 'cycle_id', 'version_id', 'approver_id', 'status', 'comment', 'requested_by', 'requested_at', 'decided_at']],
  ActualSalesResults: [['id', 'business_unit_code', 'sku_code', 'actual_month', 'region_code', 'quantity', 'source_system', 'imported_by', 'imported_at']],
  AuthLog: [['at', 'user_id', 'event', 'detail']]
};

const noop = { setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;}, setNumberFormat(){return this;} };
const sheetOf = (store, n) => ({
  getName: () => n,
  getLastRow: () => store[n].length,
  getLastColumn: () => store[n][0].length,
  getMaxRows: () => store[n].length + 50,
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

// SOP_Plan cua OEM song trong MOT spreadsheet rieng (IMP_OEM_SHEET_ID) — tach
// khoi SRC (hub/Operations2026) de dung boi canh "ba nguon khac nhau".
const OEM_SHEET = { SOP_Plan: SRC.SOP_Plan };

const ctx = {
  console,
  SpreadsheetApp: {
    openById: (id) => {
      if (id === ctx.__OEM_ID) return bookOf(OEM_SHEET, 'OEM');
      if (id === ctx.__OPS_ID) return bookOf(SRC, 'Operations2026');
      if (id === ctx.__HUB_ID) return bookOf(SRC, 'ExportSystem');
      return bookOf(FC, 'FC');
    }
  },
  Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map((n) => ({ values: (FC[n] || []).map((r) => r.slice()) })) }) } } },
  Utilities: { getUuid: () => 'id' + Math.random().toString(36).slice(2), computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
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
ctx.__OEM_ID = vm.runInContext('IMP_OEM_SHEET_ID', ctx);
ctx.__OPS_ID = vm.runInContext('IMP_OPS2026_ID', ctx);
ctx.__HUB_ID = vm.runInContext('IMP_HUB_ID', ctx);

const req = (action, payload) => {
  ctx.__A = action; ctx.__P = payload;
  ctx.__SESS = { userId: 'u1', fullName: 'Admin', role: 'central_admin', bu: '', token: 't' };
  return vm.runInContext('resetTableCache_(); prefetchForAction_(__A); dispatch_(__A, __P, __SESS);', ctx);
};

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

console.log('1. XK: ma la duoc kem ten goi y tu Details va PIDetails');
const xk = req('importSopFromSource', { businessUnitCode: 'XK', baseMonth: '2026-09-01', dryRun: true });
console.log(`     unknownSkus     = ${xk.unknownSkus.join(', ')}`);
console.log(`     unknownSkuNames = ${JSON.stringify(xk.unknownSkuNames)}`);
say(xk.unknownSkus.includes('9001000001') && xk.unknownSkus.includes('9002000002'),
  'ca hai ma la (tu Details va tu PIDetails) deu co trong unknownSkus');
say(!xk.unknownSkus.includes('1001040001'), 'ma DA CO trong danh muc khong nam trong unknownSkus');
say(xk.unknownSkuNames['9001000001'] === 'Máy lọc nước mini XK',
  `ten goi y tu Details (cot Product): "${xk.unknownSkuNames['9001000001']}"`);
say(xk.unknownSkuNames['9002000002'] === 'Lõi lọc XK chưa khai báo',
  `ten goi y tu PIDetails (cot Product_description): "${xk.unknownSkuNames['9002000002']}"`);
say(xk.unknownSkuNames['1001040001'] === undefined,
  'ma DA CO trong danh muc khong bi loi vao unknownSkuNames');

console.log('\n2. OEM: khong co cot ten nao trong SOP_Plan — khong duoc bia ten');
const oem = req('importSopFromSource', { businessUnitCode: 'OEM', baseMonth: '2026-09-01', dryRun: true });
console.log(`     unknownSkus     = ${oem.unknownSkus.join(', ')}`);
console.log(`     unknownSkuNames = ${JSON.stringify(oem.unknownSkuNames)}`);
say(oem.unknownSkus.includes('9003000003'), 'ma la cua OEM van duoc bao (khong bi im lang bo qua)');
say(Object.keys(oem.unknownSkuNames).length === 0,
  'unknownSkuNames rong hoan toan — khong co nguon nao de goi y ten cho OEM');

console.log('\n3. So luong van dung nhu truoc (tenGoi khong lam sai phep cong)');
say(xk.skuCount === 1, `XK: ${xk.skuCount} ma da biet (1001040001)`);
say(xk.monthTotals[0] === 50, `thang dau: ${xk.monthTotals[0]} (50 cua ma da biet)`);
say(oem.skuCount === 1, `OEM: ${oem.skuCount} ma da biet (1001040001)`);
say(oem.monthTotals[0] === 40, `thang dau: ${oem.monthTotals[0]} (40 cua ma da biet)`);

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nMa la duoc goi y ten khi nguon co, va khong bia khi nguon khong co.');
process.exit(bad ? 1 : 0);
