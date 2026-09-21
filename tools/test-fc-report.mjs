#!/usr/bin/env node
/**
 * Form bao cao FC: MOT file, MUOI tab, dung thu tu cot cua file lam tay.
 *
 *   node tools/test-fc-report.mjs
 *
 * Ba thu bai nay canh:
 *
 * 1. VI TRI COT. File nay duoc doc bang cong thuc tro thang vao o — cac bang
 *    ke hoach san xuat ben nha may lien ket sang. Lech mot cot la moi cong
 *    thuc tro sai ma khong co loi nao hien ra. Nen bai kiem so CHI SO O chu
 *    khong chi so tong.
 *
 * 2. 3T VA NSKX VAO KENH ONLINE. Hai don vi nay len SAP o nha may 0200 chung
 *    voi GT2 (sap_channel = GT2) nhung trong bao cao la kenh Online. Lay nham
 *    sap_channel lam cot bao cao thi san luong cua ho chay vao cot GT2: file
 *    van du cot, du dong, tong cong ty van dung — chi hai kenh sai so.
 *
 * 3. KHOI MIEN CHI CO THANG GOC. App chi tach mien o bang chia tuan, ma bang
 *    do chi ton tai cho thang dau chu ky. Ba thang sau phai de TRONG, khong
 *    phai 0: 0 la khang dinh "mien nay khong ban gi".
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  buildFcReport, buildB0SumSheet, buildB0ChannelSheet, buildB1SumSheet,
  buildB1ChannelSheet, busOfChannel, REPORT_CHANNELS, CHANNEL_TABS
} from '../client/src/utils/fcReportWorkbook.js';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));
const BASE = '2026-09-01';

const cycle = (id, bu) => [id, bu, BASE, '4', 'approved', 'u1', '2026-08-01'];
const version = (id, cid, uw, cuoi) =>
  [id, cid, uw, '2026-08-2' + uw, 'W3' + uw, 'u1', '2026-08-2' + uw, cuoi ? '1' : '', '2026-08-01'];
const line = (id, vid, sku, month, qty) => [id, vid, sku, month, qty, '', '', ''];
const tuan = (id, vid, sku, w, mien, qty) => [id, vid, sku, w, mien, qty, '', ''];
const sp = (sku, ten, nhom) => [sku, ten, ten, nhom, nhom === 'NHOM_1' ? 'Máy TCM sx' : 'Lõi',
  'RO', 'GT2', '1000', '1'];

const S = {
  Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
          ['u1','Admin','a@k.vn','central_admin','','h','1','0','','']],
  BusinessUnits: [['code','name','is_active','sap_channel','report_channel','sap_vkorg','sap_vtweg','sap_sold_to'],
    ['GT2','GT2','1','GT2','GT2','0200','13','1009062'],
    ['XK','Export OEM','1','XK','XK','0401','02','*'],
    ['OEM','Domestic OEM','1','OEM','OEM','0400','01','*'],
    ['KRF-Phil','KRF Philippines','1','XK','XK','0202','02','2000562'],
    // Day la hai dong quan trong nhat cua bai kiem: sap_channel GT2 nhung
    // report_channel Online.
    ['3T','Kênh 3T','1','GT2','Online','0200','13','1008903'],
    ['NSKX','Nước Sạch Khí Xanh','1','GT2','Online','0200','13','1011827']],
  Regions: [['code','name','is_active','scope'],
    ['MB','Miền Bắc','1','weekly'],
    ['MN','Miền Nam','1','weekly'],
    // TQ chi dung o man San luong thuc hien — khong duoc moc them cot o day.
    ['TQ','Toàn quốc','1','actual']],
  ProductGroups: [['code','name'],
    ['NHOM_1','Máy TCM sx'], ['NHOM_2','Máy nhập khẩu'], ['NHOM_3','Mockup'],
    ['NHOM_4','Lõi'], ['NHOM_5','Màng'], ['KHAC','Linh kiện / Khác']],
  Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'],
    sp('1001','Máy GT2','NHOM_1'), sp('2001','Máy XK','NHOM_1'),
    sp('3001','Máy Online','NHOM_1'), sp('4001','Lõi OEM','NHOM_4')],
  ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at'],
    cycle('c_gt2','GT2'), cycle('c_xk','XK'), cycle('c_phi','KRF-Phil'),
    cycle('c_3t','3T'), cycle('c_nskx','NSKX'), cycle('c_oem','OEM')],
  ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at'],
    version('v_gt2','c_gt2', 0, true), version('v_xk','c_xk', 0, true),
    version('v_phi','c_phi', 0, true), version('v_nskx','c_nskx', 0, true),
    version('v_oem','c_oem', 0, true),
    // 3T co HAI lan cap nhat: tuan 0 roi tuan 2. Ban chot la ban tuan 2.
    version('v_3t_0','c_3t', 0, false), version('v_3t_2','c_3t', 2, true)],
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by'],
    line('m1','v_gt2','1001','2026-09-01', 380),
    line('m2','v_gt2','1001','2026-10-01', 350),
    line('m3','v_xk','2001','2026-09-01', 9414),
    line('m4','v_phi','2001','2026-09-01', 100),
    line('m5','v_nskx','3001','2026-09-01', 410),
    line('m6','v_oem','4001','2026-09-01', 26280),
    // 3T: ban tuan 0 dat 200, ban chot (tuan 2) ha xuong 150
    line('m7','v_3t_0','3001','2026-09-01', 200),
    line('m8','v_3t_2','3001','2026-09-01', 150)],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by'],
    tuan('w1','v_gt2','1001', 1, 'MB', 180),
    tuan('w2','v_gt2','1001', 2, 'MN', 200),
    tuan('w3','v_nskx','3001', 1, 'MN', 410),
    tuan('w4','v_3t_2','3001', 1, 'MB', 150)],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at']],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at']],
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

const req = (action, payload) => {
  ctx.__A = action; ctx.__P = payload;
  ctx.__SESS = { userId: 'u1', fullName: 'A', role: 'central_admin', bu: '', token: 't' };
  return vm.runInContext('resetTableCache_(); prefetchForAction_(__A); dispatch_(__A, __P, __SESS);', ctx);
};

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };
/** Chi so cot 0-based -> ten cot Excel, de doi chieu voi file goc. */
const C = (i) => {
  let s = '', n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
  return s;
};
const dong = (aoa, sku) => aoa.find((r) => String(r[0]) === sku);

const data = req('getFcReportExport', { baseMonth: BASE });
const { sheets, weeks, canhBao } = buildFcReport(data);
const day = { ...data, weeks, regions: data.regions };

console.log('1. Mot file, muoi tab, dung ten');
console.log(`     ${sheets.map(([n]) => n).join(' | ')}`);
say(sheets.length === 10, `${sheets.length} tab`);
say(sheets[0][0] === 'B0.SUM (tuần 0)' && sheets[5][0] === 'B1.SUM (tuần 4)',
  'hai tab tong hop dung ten file goc');
say(sheets.every(([n]) => n.length <= 31), 'moi ten tab <= 31 ky tu (gioi han cua Excel)');
say(!canhBao.length, `khong co canh bao: ${canhBao.join(' / ') || '(trong)'}`);

console.log('\n2. 3T va NSKX vao kenh Online, KHONG vao GT2');
console.log(`     report_channel: ${Object.entries(data.reportChannels)
  .map(([k, v]) => `${k}→${v}`).join(', ')}`);
say(busOfChannel('Online', data.businessUnits, data.reportChannels).join(',') === '3T,NSKX',
  'kenh Online gom 3T va NSKX');
say(busOfChannel('GT2', data.businessUnits, data.reportChannels).join(',') === 'GT2',
  'kenh GT2 chi con GT2');
say(busOfChannel('XK', data.businessUnits, data.reportChannels).join(',') === 'KRF-Phil,XK',
  'kenh XK gom ca KRF-Phil');

console.log('\n3. B0.SUM — bon khoi thang x [Tong + 7 kenh], dung vi tri cot');
const b0 = buildB0SumSheet(day);
const hdr = b0.find((r) => r[0] === 'Mã sp');
console.log(`     khoi thang 1 tu cot ${C(8)}: ${hdr.slice(8, 16).join(' ')}`);
console.log(`     khoi thang 2 tu cot ${C(16)}: ${hdr.slice(16, 24).join(' ')}`);
say(hdr.slice(8, 16).join(',') === 'Tổng,' + REPORT_CHANNELS.join(','),
  `${C(8)}..${C(15)} = Tổng, MT, XK, MLT, GT2, OEM, Retail, Online`);
say(C(16) === 'Q' && C(24) === 'Y' && C(32) === 'AG',
  'bon khoi thang bat dau o I, Q, Y, AG — dung file goc');
say(hdr[40] === 'LƯU Ý' && C(40) === 'AO', `cot LƯU Ý o ${C(40)}`);

const iOnline = 8 + 1 + REPORT_CHANNELS.indexOf('Online');
const iGT2 = 8 + 1 + REPORT_CHANNELS.indexOf('GT2');
const r3001 = dong(b0, '3001');
console.log(`     ma 3001 thang 9: Tổng=${r3001[8]} GT2(${C(iGT2)})=${r3001[iGT2]} Online(${C(iOnline)})=${r3001[iOnline]}`);
say(r3001[iOnline] === 560, `cot Online = ${r3001[iOnline]} (NSKX 410 + 3T 150 cua ban chot)`);
say(r3001[iGT2] === 0, `cot GT2 = ${r3001[iGT2]} — san luong Online khong lan sang`);
say(r3001[8] === 560, 'cot Tổng = 560, dung bang tong bay cot ben canh');

const r2001 = dong(b0, '2001');
const iXK = 8 + 1 + REPORT_CHANNELS.indexOf('XK');
say(r2001[iXK] === 9514, `ma 2001 cot XK = ${r2001[iXK]} (XK 9414 + KRF-Phil 100)`);

console.log('\n4. B0 tab kenh — khoi Tong/MB/MN o dung I, O, U');
const tabOnline = CHANNEL_TABS.find((t) => t.channel === 'Online');
const b0on = buildB0ChannelSheet(day, tabOnline);
const hOn = b0on.find((r) => r[0] === 'Mã sản phẩm');
console.log(`     ${C(8)}=${hOn[8]}  ${C(14)}=${hOn[14]}  ${C(20)}=${hOn[20]}`);
say(C(8) === 'I' && C(14) === 'O' && C(20) === 'U', 'ba khoi o I, O, U — dung file goc');
say(b0on[0][14] === 'Miền Bắc' && b0on[0][20] === 'Miền Nam', 'ten hai mien o dong 1');
say(!b0on[0].includes('Toàn quốc'), 'mien TQ (scope actual) KHONG moc them cot');
say(String(b0on[0][1]).includes('(3T+NSKX)'),
  `tieu de noi ro kenh gom nhung don vi nao: "${b0on[0][1]}"`);

const on3001 = dong(b0on, '3001');
console.log(`     3001: Tổng=${on3001[8]} thang9=${on3001[9]} | MB=${on3001[15]} MN=${on3001[21]}`);
say(on3001[9] === 560, `thang 9 (cot ${C(9)}) = ${on3001[9]}`);
say(on3001[15] === 150 && on3001[21] === 410, 'MB 150 (3T) + MN 410 (NSKX) = 560, khop thang goc');
say(on3001[16] === null && on3001[17] === null,
  'ba thang sau cua khoi mien de TRONG, khong phai 0');

console.log('\n5. B1 tab kenh — sau cot "So FC Tuan k" o I..N, khoi tuan tu Q');
const b1on = buildB1ChannelSheet(day, tabOnline);
const h1 = b1on.find((r) => r[0] === 'Mã sản phẩm');
console.log(`     ${C(8)}..${C(13)} = So FC Tuan 0..5 | ${C(14)} = chenh lech | ${C(16)} = ${h1[16]}`);
say(C(13) === 'N' && C(14) === 'O' && C(16) === 'Q', 'I..N, O, Q — dung file goc');
say(h1[16] === 'Tổng FC Online', `${C(16)} = "${h1[16]}"`);
const on1 = dong(b1on, '3001');
console.log(`     3001: Tuan0=${on1[8]} Tuan1=${on1[9]} Tuan2=${on1[10]} chenh=${on1[14]}`);
say(on1[8] === 610, `Tuan 0 = ${on1[8]} (NSKX 410 + 3T 200 truoc khi ha)`);
say(on1[10] === 150, `Tuan 2 = ${on1[10]} (chi 3T nop lai o vong nay)`);
say(on1[14] === -460, `chenh lech = ${on1[14]} (vong cuoi 150 - vong 0 la 610)`);

// Khoi rieng cho tung don vi, nam ben PHAI khoi tong
const rongKhoi = 1 + weeks.length * data.regions.length;
const i3T = 16 + (1 + 0) * (rongKhoi + 1);
const iNSKX = 16 + (1 + 1) * (rongKhoi + 1);
console.log(`     khoi don vi: ${C(i3T)}=${h1[i3T]}  ${C(iNSKX)}=${h1[iNSKX]}`);
say(h1[i3T] === '3T' && h1[iNSKX] === 'NSKX', 'kenh nhieu don vi thi co khoi rieng cho tung don vi');
say(on1[i3T] === 150 && on1[iNSKX] === 410, `3T=${on1[i3T]}, NSKX=${on1[iNSKX]}`);

console.log('\n6. B1.SUM — khoi tuan 17 cot, bat dau o S, buoc 18');
const b1 = buildB1SumSheet(day);
const h1s = b1.find((r) => r[0] === 'Mã sản phẩm');
const rong = 1 + data.regions.length + REPORT_CHANNELS.length * data.regions.length;
say(rong === 17, `moi khoi tuan ${rong} cot = 1 Tổng + 2 mien + 7 kenh x 2 mien`);
say(C(18) === 'S' && C(18 + rong + 1) === 'AK', 'khoi tuan 1 o S, khoi tuan 2 o AK — dung file goc');
say(C(14) === 'O' && C(17) === 'R', 'bon cot chenh lech o O..R');
say(h1s[8] === 'Số FC\nTuần 0 - Tháng 9/26', `${C(8)} = "${String(h1s[8]).replace('\n', ' ')}"`);

// Tuan 1, mien MB, cot cua kenh Online
const iTuan1 = 18;
const iOnMB = iTuan1 + 1 + data.regions.length + REPORT_CHANNELS.indexOf('Online') * data.regions.length;
const iGt2MB = iTuan1 + 1 + data.regions.length + REPORT_CHANNELS.indexOf('GT2') * data.regions.length;
const s3001 = dong(b1, '3001');
const s1001 = dong(b1, '1001');
console.log(`     tuan 1: 3001 Online.MB(${C(iOnMB)})=${s3001[iOnMB]} | 1001 GT2.MB(${C(iGt2MB)})=${s1001[iGt2MB]}`);
say(s3001[iOnMB] === 150, `3001 tuan 1 MB kenh Online = ${s3001[iOnMB]} (cua 3T)`);
say(s3001[iGt2MB] === 0, `3001 tuan 1 MB kenh GT2 = ${s3001[iGt2MB]} — khong lan`);
say(s1001[iGt2MB] === 180, `1001 tuan 1 MB kenh GT2 = ${s1001[iGt2MB]}`);
// Ba cot dau cua khoi la cua CA CONG TY, khong phai cua rieng kenh nao:
// tuan 1 co 3T ghi 150 o MB va NSKX ghi 410 o MN.
say(s3001[iTuan1] === 560 && s3001[iTuan1 + 1] === 150 && s3001[iTuan1 + 2] === 410,
  `cot Tổng/MB/MN cua khoi = ${s3001[iTuan1]}/${s3001[iTuan1 + 1]}/${s3001[iTuan1 + 2]}`);
say(s3001[iTuan1] === s3001[iTuan1 + 1] + s3001[iTuan1 + 2], 'Tổng = MB + MN');

console.log('\n7. Nhan tuan theo lich ISO, giong file goc (W36, W37...)');
console.log(`     tuan cua thang 9/2026: ${weeks.join(', ')}`);
console.log(`     nhan: ${weeks.map((w) => b1[0][18 + (w - 1) * (rong + 1)]).join(', ')}`);
say(b1[0][18] === 'W36', `tuan 1 cua thang 9/2026 = ${b1[0][18]} (bat dau thu Hai 31/08)`);

console.log('\n8. Don vi chua khai report_channel thi phai BAO, khong im lang');
S.BusinessUnits[5][4] = '';   // 3T bo trong report_channel
const data2 = req('getFcReportExport', { baseMonth: BASE });
const r2 = buildFcReport(data2);
console.log(`     ${r2.canhBao.join(' / ')}`);
say(data2.undeclaredReportChannel.join(',') === '3T', 'backend chi ra dung don vi chua khai');
say(r2.canhBao.some((c) => c.includes('3T') && c.includes('setupDatabase')),
  'man hinh duoc bao de con chay setupDatabase');
const b0x = buildB0SumSheet({ ...data2, weeks, regions: data2.regions });
say(dong(b0x, '3001')[iGT2] === 150,
  'va tai hien dung cai bay: khong co cot thi 3T roi vao GT2 (150 cai)');
S.BusinessUnits[5][4] = 'Online';

// Xuat file that de soi bang mat:
//   FC_REPORT_XLSX=thu.xlsx node tools/test-fc-report.mjs
if (process.env.FC_REPORT_XLSX) {
  const XLSX = await import('../client/node_modules/xlsx/xlsx.mjs');
  // Ban ESM cua xlsx khong tu noi vao fs (trong trinh duyet khong co fs).
  XLSX.set_fs(await import('node:fs'));
  const wb = XLSX.utils.book_new();
  sheets.forEach(([n, aoa]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n));
  XLSX.writeFile(wb, process.env.FC_REPORT_XLSX);
  console.log(`\n(da ghi ${process.env.FC_REPORT_XLSX})`);
}

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nMuoi tab, dung thu tu cot, 3T va NSKX nam trong kenh Online.');
process.exit(bad ? 1 : 0);
