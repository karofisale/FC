#!/usr/bin/env node
/**
 * setupDatabase phai NOI RO no vua lam gi.
 *
 *   node tools/test-setup-report.mjs
 *
 * Ham nay them cot, gieo danh muc va doi ten don vi — toan viec thay doi cau
 * truc — nhung truoc day chay xong chi in dung hai dong ve sheet Users. Khong
 * co cach nao biet cot moi va don vi moi da vao hay chua, nen nguoi chay phai
 * mo Sheet doi chieu tay tung cot.
 *
 * Bai nay cung khoa mot canh bao quan trong: ham chi ghi lai DONG TIEU DE,
 * du lieu ben duoi dung yen. Neu SCHEMA doi CHO mot cot da co thi moi gia tri
 * cua cot do nam duoi ten cot khac — hong du lieu that, ma nhin bang van binh
 * thuong. Phai bao to.
 */
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const GAS = process.argv[2] || fileURLToPath(new URL('../gas', import.meta.url));

const RONG = {
  Users: [['id','full_name','email','role','business_unit_code','pin_hash','is_active','failed_attempts','locked_until','last_login'],
          ['admin','Admin','a@k.vn','central_admin','','h','1','0','','']],
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

function chay(sheetsBanDau) {
  const S = JSON.parse(JSON.stringify({ ...RONG, ...sheetsBanDau }));
  const sh = (n) => ({
    getName: () => n, getLastRow: () => S[n].length, getLastColumn: () => S[n][0].length,
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
    appendRow: (r) => S[n].push(r), setFrozenRows(){}
  });
  const log = [];
  const ctx = {
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => (S[n] ? sh(n) : null), getSheets: () => Object.keys(S).map(sh), insertSheet: (n) => { S[n] = [[]]; return sh(n); } }) },
    Sheets: { Spreadsheets: { Values: { batchGet: (id, o) => ({ valueRanges: o.ranges.map((n) => ({ values: (S[n] || []).map((r) => r.slice()) })) }) } } },
    Utilities: { getUuid: () => 'id' + Math.random(), computeDigest: () => [1], base64Encode: () => 'x', DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }, formatDate: () => '' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'pepper', setProperty() {}, deleteProperty() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'a@k.vn' }), getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    Logger: { log: (m) => log.push(String(m)) }
  };
  vm.createContext(ctx);
  for (const f of readdirSync(GAS).filter((f) => f.endsWith('.gs')).sort())
    vm.runInContext(readFileSync(GAS + '/' + f, 'utf8'), ctx, { filename: f });
  const ket = vm.runInContext('setupDatabase()', ctx);
  return { S, ket, log: log.join('\n') };
}

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

console.log('1. Sheet cu thieu cot moi — phai bao them cot nao');
const cu = chay({
  BusinessUnits: [['code','name','is_active'], ['GT2','Kênh GT2','1'], ['XK','Kênh Xuất khẩu','1'],
                  // don vi tu them tay, khong nam trong danh sach gieo
                  ['TUTHEM','Đơn vị tự thêm','1']],
  Regions: [['code','name','is_active'], ['MB','Miền Bắc','1'], ['MN','Miền Nam','1']]
});
say(/BusinessUnits: thêm cột .*sap_channel/.test(cu.log), 'bao them cot sap_channel');
say(/sap_sold_to/.test(cu.log), 'bao them cot sap_sold_to');
say(/Regions: thêm cột scope/.test(cu.log), 'bao them cot scope cho Regions');
say(cu.S.BusinessUnits[0].includes('sap_sold_to'), 'tieu de that su da co sap_sold_to');
say(cu.S.Regions[0].includes('scope'), 'tieu de Regions that su da co scope');

console.log('\n2. Bao so don vi / mien da them va cap nhat');
say(cu.ket.businessUnits.inserted > 0, `them ${cu.ket.businessUnits.inserted} don vi`);
say(cu.ket.regions.inserted === 1, `them ${cu.ket.regions.inserted} mien (TQ)`);
say(/TQ \(actual\)/.test(cu.log), 'bao mien TQ co scope actual');
say(/KRF-Phil.*0202\/02\/2000562/.test(cu.log), 'liet ke bo loc ZSD450 cua tung don vi');
// XK co y KHONG loc theo ma khach — phai hien la "moi khach", khong phai
// "(chua khai)". Gop hai thu nay lai thi hoac chan nham mot don vi hop le,
// hoac nhan ca file cua don vi khac ma khong ai biet.
say(/XK.*0401\/02\/mọi khách/.test(cu.log), 'XK hien "moi khach", khong phai "(chua khai)"');
say(/TUTHEM.*\(chưa khai\)/.test(cu.log), 'don vi chua khai bo loc thi noi ro la chua khai');

console.log('\n3. Chay lan hai: khong con gi de sua');
const lai = chay(cu.S);   // truyen lai TOAN BO sheet sau lan chay dau
say(/không phải sửa gì/.test(lai.log), 'bao la moi sheet da dung cot');
say(lai.ket.businessUnits.inserted === 0, `khong chen them don vi nao (${lai.ket.businessUnits.inserted})`);
say(lai.ket.canhBao.length === 0, 'khong canh bao gi');

console.log('\n4. Cot bi DOI CHO — hong du lieu that, phai bao to');
const daoCot = chay({
  // is_active va name dao cho nhau: gia tri "1" dang nam duoi cot name
  BusinessUnits: [['code','is_active','name'], ['GT2','1','Kênh GT2']],
  Regions: [['code','name','is_active'], ['MB','Miền Bắc','1']]
});
console.log('     ' + daoCot.ket.canhBao.join('\n     '));
say(daoCot.ket.canhBao.some((c) => /ĐỔI CHỖ/.test(c)), 'co canh bao doi cho cot');
say(daoCot.ket.canhBao.some((c) => /BusinessUnits/.test(c)), 'noi ro sheet nao');

console.log('\n5. Sheet co cot la (khong nam trong SCHEMA)');
const cotLa = chay({
  BusinessUnits: [['code','name','is_active','ghi_chu_tay'], ['GT2','Kênh GT2','1','abc']],
  Regions: [['code','name','is_active'], ['MB','Miền Bắc','1']]
});
say(cotLa.ket.canhBao.some((c) => /ghi_chu_tay/.test(c)), 'bao co cot app khong doc toi');
say(cotLa.S.BusinessUnits[0].includes('ghi_chu_tay') === false
  || cotLa.S.BusinessUnits[0].indexOf('ghi_chu_tay') >= 3, 'khong ghi de mat cot do');

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nsetupDatabase noi ro no vua lam gi, va canh bao dung cho nguy hiem.');
process.exit(bad ? 1 : 0);
