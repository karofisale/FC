#!/usr/bin/env node
/**
 * Cua secret cho bo script cao SAP — cho nay khong duoc sai.
 *
 *   node tools/test-sap-bridge.mjs
 *
 * Nut "Cao tu SAP" chay khong co nguoi ngoi truoc may nen khong go PIN duoc,
 * phai xac thuc bang secret. Mot cua khong-PIN chi chap nhan duoc chung nao
 * viec duy nhat qua duoc no la GHI DE san luong thuc hien cua dung mot
 * (don vi, thang) — upsert theo khoa, chay muoi lan ra mot ket qua. Bai nay
 * khoa dung tinh chat do.
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));
const SECRET = 'day-la-mot-secret-du-dai-de-test';

const S = {
  Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
          ['u1','Admin','a@k.vn','central_admin','','h','1','0','','']],
  BusinessUnits: [['code','name','is_active','sap_channel','sap_vkorg','sap_vtweg','sap_sold_to'],
                  ['3T','Kênh 3T','1','GT2','0200','13','1008903'],
                  ['XK','Export OEM','1','XK','0401','02','*'],
                  ['MT','Modern Trade','0','GT2','','','']],
  Regions: [['code','name','is_active','scope'],
            ['MB','Miền Bắc','1','weekly'],['MN','Miền Nam','1','weekly'],['TQ','Toàn quốc','1','actual']],
  ProductGroups: [['code','name'],['G1','N1']],
  Products: [['sku_code','name','short_name','product_group_code','product_group_name','technology','default_channel','avg_price','is_active'],
             ['1001','May A','A','G1','N1','RO','3T','1000','1'],
             ['1002','May B','B','G1','N1','RO','3T','1000','1']],
  ForecastCycles: [['id','business_unit_code','base_month','horizon_months','status','created_by','created_at']],
  ForecastVersions: [['id','cycle_id','update_week','update_date','iso_week_label','submitted_by','submitted_at','is_final','created_at']],
  MonthlyForecastLines: [['id','version_id','sku_code','forecast_month','quantity','note','updated_at','updated_by']],
  WeeklyRegionSplits: [['id','version_id','sku_code','week_number','region_code','quantity','updated_at','updated_by']],
  Approvals: [['id','cycle_id','version_id','approver_id','status','comment','requested_by','requested_at','decided_at']],
  ActualSalesResults: [['id','business_unit_code','sku_code','actual_month','region_code','quantity','source_system','imported_by','imported_at']],
  AuthLog: [['at','user_id','event','detail']],
  JobHeartbeat: [['job','mo_ta','lan_cuoi','so_dong','trang_thai','ghi_chu','han_gio']]
};

const noop = { setFontWeight(){return this;}, setBackground(){return this;},
  setFontColor(){return this;}, setNumberFormat(){return this;}, setWrap(){return this;},
  setHorizontalAlignment(){return this;}, setFontSize(){return this;} };
const sh = (n) => ({
  getName: () => n, getLastRow: () => S[n].length, getLastColumn: () => S[n][0].length,
  getMaxRows: () => S[n].length + 50,
  getDataRange: () => ({ getValues: () => S[n].map((r) => r.slice()) }),
  getRange: (row, col, nR, nC) => ({ ...noop,
    getValues: () => S[n].slice(row - 1, row - 1 + nR).map((r) => r.slice(col - 1, col - 1 + nC)),
    setValues: (vals) => {
      const g = S[n];
      vals.forEach((v, i) => {
        const r = row - 1 + i;
        while (g.length <= r) g.push(new Array(g[0].length).fill(''));
        for (let c = 0; c < v.length; c++) g[r][col - 1 + c] = v[c];
      });
      return noop;
    },
    clearContent(){} }),
  appendRow: (r) => S[n].push(r), setFrozenRows(){}, autoResizeColumn(){}
});

let uid = 0;
const ctx = {
  console,
  SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => (S[n] ? sh(n) : null), getSheets: () => Object.keys(S).map(sh), insertSheet: (n) => { S[n] = [[]]; return sh(n); } }) },
  Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map((n) => ({ values: (S[n] || []).map((r) => r.slice()) })) }) } } },
  Utilities: { getUuid: () => 'id' + (++uid), computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }, formatDate: () => '' },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => (k === 'SAP_BRIDGE_SECRET' ? SECRET : null),
    setProperty() {}, deleteProperty() {}
  }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'a@k.vn' }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
  Logger: { log() {} }
};
vm.createContext(ctx);
for (const f of readdirSync(GAS).filter((f) => f.endsWith('.gs')).sort())
  vm.runInContext(readFileSync(GAS + '/' + f, 'utf8'), ctx, { filename: f });

const goi = (ten, p) => {
  ctx.__P = p;
  return vm.runInContext(`resetTableCache_(); ${ten}(__P);`, ctx);
};
const nem = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

const ROWS = [{ skuCode: '1001', quantity: 600 }, { skuCode: '1002', quantity: 300 }];

console.log('1. Sai secret thi chan, va chan TRUOC khi doc du lieu nao');
['', 'sai', SECRET + 'x', SECRET.slice(0, -1)].forEach((s) => {
  const loi = nem(() => goi('sapBridgeImportActuals_', { secret: s, bu: '3T', month: '2026-09-01', rows: ROWS }));
  say(/Sai secret/.test(loi), `secret "${s.slice(0, 12)}${s.length > 12 ? '…' : ''}" -> ${loi || 'KHONG CHAN'}`);
});
say(S.ActualSalesResults.length === 1, 'khong dong nao duoc ghi');

console.log('\n2. Dung secret: ghi vao mien danh cho thuc hien');
const kq = goi('sapBridgeImportActuals_', { secret: SECRET, bu: '3T', month: '2026-09-01', rows: ROWS });
console.log(`     ${kq.total} ma · ${kq.quantity} cai · mien ${kq.regionCode}`);
say(kq.ok && kq.total === 2, `ghi ${kq.total} ma`);
say(kq.regionCode === 'TQ', `mien = ${kq.regionCode} (KHONG duoc la MB/MN)`);
say(kq.quantity === 900, `tong = ${kq.quantity}`);
say(S.ActualSalesResults.slice(1).every((r) => r[6] === 'ZSD450'), 'source_system = ZSD450');

console.log('\n3. Chay lai chinh no: GHI DE, khong cong don');
const lai = goi('sapBridgeImportActuals_', { secret: SECRET, bu: '3T', month: '2026-09-01', rows: ROWS });
say(lai.inserted === 0 && lai.updated === 2, `insert ${lai.inserted}, update ${lai.updated}`);
say(S.ActualSalesResults.length - 1 === 2, `van con ${S.ActualSalesResults.length - 1} dong`);
const tong = S.ActualSalesResults.slice(1).reduce((s, r) => s + Number(r[5]), 0);
say(tong === 900, `tong van la ${tong} — day la ly do mot cua khong-PIN chap nhan duoc`);

console.log('\n4. Ma khong co trong danh muc: bao ra, khong ghi lang le');
const la = goi('sapBridgeImportActuals_', { secret: SECRET, bu: '3T', month: '2026-10-01',
  rows: [{ skuCode: '1001', quantity: 5 }, { skuCode: '9999', quantity: 7 }] });
say(la.unknownSkus.length === 1 && la.unknownSkus[0] === '9999', `bao ma la: ${la.unknownSkus.join(', ')}`);
say(la.total === 1, `chi ghi ${la.total} ma`);
const loiHet = nem(() => goi('sapBridgeImportActuals_', { secret: SECRET, bu: '3T', month: '2026-10-01',
  rows: [{ skuCode: '8888', quantity: 7 }] }));
say(/không có trong danh mục/.test(loiHet), `moi ma deu la thi BAO LOI: ${loiHet.slice(0, 60)}…`);

console.log('\n5. Don vi khong co trong danh muc');
const loiBu = nem(() => goi('sapBridgeImportActuals_', { secret: SECRET, bu: 'KHONGCO', month: '2026-09-01', rows: ROWS }));
say(/Không có đơn vị/.test(loiBu), `bao ro: ${loiBu}`);

console.log('\n6. sapFilters chi tra don vi DA KHAI bo loc');
const f = goi('sapBridgeFilters_', { secret: SECRET });
const ma = f.units.map((u) => u.code);
console.log(`     ${ma.join(', ')}`);
say(ma.includes('3T') && ma.includes('XK'), 'co 3T va XK');
say(!ma.includes('MT'), 'khong co MT (dang tat va chua khai bo loc)');
say(f.units.find((u) => u.code === 'XK').soldTo === '*', 'XK giu nguyen dau * de ben goi tu quyet');
say(f.units.find((u) => u.code === '3T').vkorg === '0200', 'vkorg giu so 0 dau');
say(/Sai secret/.test(nem(() => goi('sapBridgeFilters_', { secret: 'sai' }))), 'sai secret thi chan');

console.log('\n7. Nhip tim: nut va du lieu la HAI dong khac nhau');
goi('sapBridgeHeartbeat_', { secret: SECRET, bu: '3T', trangThai: 'dang-chay', ghiChu: 'dang cao' });
const nhip = vm.runInContext('docNhipTim_(getSpreadsheet_())', ctx);
const job = nhip.map((n) => n.job);
console.log(`     ${job.join(', ')}`);
say(job.includes('fc.thuc-hien.nut.3t'), 'co dong NUT');
say(job.includes('fc.thuc-hien.3t'), 'co dong DU LIEU');
say(nhip.find((n) => n.job === 'fc.thuc-hien.nut.3t').trangThai === 'dang-chay',
  'trang thai nut = dang-chay (hop dong voi dieu-phoi.ps1 va panel)');
// Moi don vi mot dong rieng: gop chung thi luot cao 3T ghi de moc cua GT2,
// va app dang hoi vong dong kia se tuong viec cua minh vua xong.
goi('sapBridgeHeartbeat_', { secret: SECRET, bu: 'XK', trangThai: 'ok', ghiChu: 'xong' });
const nhip2 = vm.runInContext('resetTableCache_(); docNhipTim_(getSpreadsheet_())', ctx);
say(nhip2.find((n) => n.job === 'fc.thuc-hien.nut.3t').trangThai === 'dang-chay',
  'nhip cua 3T KHONG bi luot XK ghi de');

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nCua secret chan dung, ghi de dung, va nhip tim khong lan nhau.');
process.exit(bad ? 1 : 0);
