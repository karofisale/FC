#!/usr/bin/env node
/**
 * Bon thi truong Brand xuat khau phai vao file KH_XK, khong roi vao GT2.
 *
 *   node tools/test-bu-channels.mjs
 *
 * Truoc day quy tac "don vi nao thuoc file SAP nao" nam trong code duoi dang
 * LOAI TRU: file 0200 lay moi ma tru XK va OEM. Them bat ky don vi moi nao
 * (KRF-Phil, KRF-India...) la san luong cua no tu chay sang file GT2 / nha may
 * 0200 — ma file van du cot, du dong, nhin khong ra. Gio quy tac nam o cot
 * sap_channel cua BusinessUnits.
 *
 * Bai nay chay CA HAI chieu: co cot thi 4 don vi vao dung KH_XK, va bo cot di
 * thi tai hien dung cai bay cu — de nguoi doc thay cot nay dang chan cai gi.
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildSapRows, sapChannelOfBU } from '../client/src/utils/sapExport.js';
import { buildB0SumSheet } from '../client/src/utils/excelExport.js';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));
const BASE = '2026-09-01';

const cycle = (id, bu) => [id, bu, BASE, '4', 'approved', 'u1', '2026-08-01'];
const version = (id, cid) => [id, cid, '1', '2026-08-01', 'W1', 'u1', '2026-08-01', '1', '2026-08-01'];
const approval = (id, cid, vid) => [id, cid, vid, 'u1', 'approved', '', 'u1', '2026-08-02', '2026-08-03'];
const line = (id, vid, sku, month, qty) => [id, vid, sku, month, qty, '', '', ''];

const S = {
  Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
          ['u1','Admin','a@k.vn','central_admin','','h','1','0','','']],
  BusinessUnits: [['code','name','is_active','sap_channel'],
                  ['GT2','GT2','1','GT2'],
                  ['XK','Export OEM','1','XK'],
                  ['OEM','Domestic OEM','1','OEM'],
                  ['KRF-Phil','KRF Philippines','1','XK'],
                  ['KRF-India','KRF India','1','XK'],
                  ['KRF-US','KRF US','1','XK'],
                  ['KRF-Indo','KRF Indonesia','1','XK']],
  Regions: [['code','name','is_active'],['MB','MB','1'],['MN','MN','1']],
  ProductGroups: [['code','name'],['G1','Máy lọc nước']],
  Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'],
             ['1001','Máy GT2','GT2','G1','Máy lọc nước','RO','GT2','1000','1'],
             ['2001','Máy XK','XK','G1','Máy lọc nước','RO','XK','1000','1'],
             ['2002','Máy Brand Phil','PHI','G1','Máy lọc nước','RO','KRF-Phil','1000','1']],
  ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at'],
                   cycle('c_gt2','GT2'), cycle('c_xk','XK'), cycle('c_phi','KRF-Phil')],
  ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at'],
                     version('v_gt2','c_gt2'), version('v_xk','c_xk'), version('v_phi','c_phi')],
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by'],
    // GT2: co so o ca ba thang de file 0200 sinh ra dong
    line('l1','v_gt2','1001','2026-09-01',100),
    line('l2','v_gt2','1001','2026-10-01',400),
    line('l3','v_gt2','1001','2026-11-01',400),
    // XK: cot W3/W7/W11 lay thang base+1, +2, +3
    line('l4','v_xk','2001','2026-10-01',200),
    // KRF-Phil: cung ma 2001 (phai CONG vao XK) va ma rieng 2002
    line('l5','v_phi','2001','2026-10-01',50),
    line('l6','v_phi','2002','2026-10-01',70),
    line('l7','v_phi','2002','2026-11-01',800)],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by'],
                       ['w1','v_gt2','1001',1,'MB',100,'','']],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at'],
              approval('a1','c_gt2','v_gt2'), approval('a2','c_xk','v_xk'), approval('a3','c_phi','v_phi')],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at']],
  AuthLog: [['at','user_id','event','detail']]
};

const noop = { setFontWeight(){return this;}, setBackground(){return this;}, setFontColor(){return this;} };
const sh = (n) => ({ getName: () => n, getLastRow: () => S[n].length,
  getDataRange: () => ({ getValues: () => S[n].map((r) => r.slice()) }),
  getRange: () => ({ ...noop, setValues(){}, clearContent(){} }),
  appendRow: (r) => S[n].push(r), setFrozenRows(){} });

const ctx = {
  console,
  SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => (S[n] ? sh(n) : null), insertSheet: (n) => { S[n] = [[]]; return sh(n); } }) },
  Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map((n) => ({ values: (S[n] || []).map((r) => r.slice()) })) }) } } },
  Utilities: { getUuid: () => 'id', computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    formatDate: (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` },
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

const data = req('getSapExport', { baseMonth: BASE });
const at = new Date(2026, 8, 2);
const W3 = 9 + 3 - 1;   // A..I la 9 cot dau, roi W1..W12

console.log('1. Backend tra ve ban do don vi → kenh SAP');
say(data.buChannels && data.buChannels['KRF-Phil'] === 'XK',
  `KRF-Phil → ${data.buChannels?.['KRF-Phil']}`);
say(data.buChannels && data.buChannels['3T'] === undefined ? true : data.buChannels['3T'] === 'GT2',
  'don vi khong khai van co gia tri hop le');

console.log('\n2. File KH_XK cong ca XK lan bon thi truong Brand');
const xk = buildSapRows({ channel: 'XK', baseMonth: data.baseMonth, rows: data.rows,
  weekly: data.weekly, buChannels: data.buChannels, exportedAt: at });
const xkBy = {};
xk.forEach((r) => { xkBy[String(r[1])] = r; });
xk.forEach((r) => console.log(`      ${r[0]} | ${r[1]} | ${r[2]} | W3=${r[W3]}`));
say(!!xkBy['2001'] && xkBy['2001'][W3] === 250, `ma 2001 W3 = ${xkBy['2001']?.[W3]} (XK 200 + KRF-Phil 50)`);
say(!!xkBy['2002'] && xkBy['2002'][W3] === 70, `ma 2002 (hang rieng cua KRF-Phil) co mat, W3 = ${xkBy['2002']?.[W3]}`);
say(xk.every((r) => r[0] === 'KH_XK' && r[2] === '0400'), 'moi dong deu KH_XK / nha may 0400');

console.log('\n3. File GT2 khong duoc nuot hang cua KRF-Phil');
const gt2 = buildSapRows({ channel: 'GT2', baseMonth: data.baseMonth, rows: data.rows,
  weekly: data.weekly, buChannels: data.buChannels, exportedAt: at });
gt2.forEach((r) => console.log(`      ${r[0]} | ${r[1]} | ${r[2]}`));
say(gt2.some((r) => String(r[1]) === '1001'), 'hang GT2 (1001) van co trong file 0200');
say(!gt2.some((r) => String(r[1]) === '2002'), 'hang cua KRF-Phil (2002) KHONG co trong file 0200');

console.log('\n4. Bo cot sap_channel di → tai hien dung cai bay cu');
const cu = buildSapRows({ channel: 'GT2', baseMonth: data.baseMonth, rows: data.rows,
  weekly: data.weekly, exportedAt: at });
say(cu.some((r) => String(r[1]) === '2002'),
  'khong co ban do thi 2002 roi vao file GT2 — dung cai cot nay dang chan');
const xkCu = buildSapRows({ channel: 'XK', baseMonth: data.baseMonth, rows: data.rows,
  weekly: data.weekly, exportedAt: at });
const cu2001 = xkCu.find((r) => String(r[1]) === '2001');
say(cu2001 && cu2001[W3] === 200, `va KH_XK chi con 200 (thieu 50 cua KRF-Phil)`);

console.log('\n5. B0.SUM gop bon thi truong vao mot cot XK');
const b0 = req('getB0SumExport', { baseMonth: BASE });
const aoa = buildB0SumSheet(b0);
const cot = aoa[1];
console.log(`      don vi co chu ky: ${b0.businessUnits.join(', ')}`);
console.log(`      dong tieu de 2  : ${cot.slice(7, 7 + 1 + b0.businessUnits.length).join(' | ')}`);
say(!cot.includes('KRF-Phil'), 'khong co cot rieng cho KRF-Phil');
say(cot.includes('XK'), 'co cot XK');
say(cot.filter((c) => c === 'GT2').length > 0, 'GT2 van giu cot rieng');

// Thang 10 la thang thu hai trong bon thang → khoi cot thu hai
const cols = cot.slice(7).filter((c, i, a) => a.indexOf(c) === i && c !== 'Tổng');
const nCol = 1 + cols.length;
const iXK = cot.indexOf('XK', 7 + nCol);
const r2001 = aoa.find((r) => r[0] === '2001');
say(r2001 && r2001[iXK] === 250, `2001 thang 10 cot XK = ${r2001?.[iXK]} (200 + 50)`);

console.log('\n6. sapChannelOfBU du dung mot minh');
say(sapChannelOfBU('KRF-US', { 'KRF-US': 'XK' }) === 'XK', 'co ban do');
say(sapChannelOfBU('MT', null) === 'GT2', 'khong ban do: MT → GT2');
say(sapChannelOfBU('XK', null) === 'XK', 'khong ban do: XK → XK');

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nBon thi truong Brand vao dung file xuat khau, GT2 khong bi lan.');
process.exit(bad ? 1 : 0);
