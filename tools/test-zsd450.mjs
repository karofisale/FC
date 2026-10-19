#!/usr/bin/env node
/**
 * Bo doc ZSD450 chay dung tren FILE THAT, khong phai tren du lieu tu bia.
 *
 *   node tools/test-zsd450.mjs [thu-muc-chua-file]
 *
 * Doc ba file da xuat that (07, 08, 09/2026) trong CLAUDE-OUTPUTS\\Update Tuan
 * va doi chieu tong san luong voi phep cong THO tren chinh file do — hai cach
 * tinh doc lap phai ra cung mot so. Neu bo file di thi bao BO QUA chu khong
 * do ENOENT, vi file nam ngoai kho.
 *
 * Phan cuoi chay tren du lieu tu dung de khoa ba cai bay da gap o file that:
 * dong danh so cot, ma ve dang SO, va mot ma nhieu dong trong thang.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseZsd450, parseZsdMonth, ZSD450_COLUMNS, ZSD450_REVENUE_COLUMN, MOI_KHACH } from '../client/src/utils/zsd450.js';

const XLSX = createRequire(new URL('../client/package.json', import.meta.url))('xlsx');
const DIR = process.argv[2] || 'D:/Operation/Claude/CLAUDE-OUTPUTS/Update Tuan';

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

// ĐỌC Y HỆT parseExcelFile của app (cellDates, raw, defval). Lần trước bộ
// kiểm tra đọc khác app ở đúng hai tuỳ chọn này, và cái khe đó giú ba lỗi
// chạy qua mà bài kiểm vẫn xanh.
const sheet1 = (file) => {
  const wb = XLSX.read(readFileSync(file), { type: 'buffer', cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1, raw: true, defval: ''
  });
};

console.log('1. Doc file ZSD450 that');
const FILES = [
  ['ZSD450_20260727_v2.xlsx', '2026-07-01'],
  ['ZSD450_20260831_v2.xlsx', '2026-08-01'],
  ['ZSD450_20260910.xlsx',    '2026-09-01']
];
let docDuoc = 0;
for (const [ten, thang] of FILES) {
  const p = `${DIR}/${ten}`;
  if (!existsSync(p)) { console.log(`  BO QUA ${ten} — khong co file`); continue; }
  docDuoc++;
  const aoa = sheet1(p);
  const r = parseZsd450(aoa, {});           // khong loc khach: lay het

  // Phep cong THO doc lap: bo dong tieu de va dong danh so, cong cot so luong
  const H = aoa[0].map((h) => String(h ?? '').trim());
  const cSL = H.indexOf(ZSD450_COLUMNS.quantity);
  const cMa = H.indexOf(ZSD450_COLUMNS.sku);
  let tho = 0, dongTho = 0;
  aoa.slice(1).forEach((row) => {
    if (row.every((v, i) => v === null || v === '' || Number(v) === i + 1)) return;  // dong danh so
    if (!row.some((v) => v !== null && v !== '')) return;                            // dong trong
    if (!String(row[cMa] ?? '').trim()) return;
    const q = Number(row[cSL]);
    if (Number.isFinite(q)) { tho += q; dongTho++; }
  });

  const tongParse = Object.values(r.bySku).reduce((s, q) => s + q, 0);
  console.log(`  ${ten}: ${r.rowsRead} dong, ${Object.keys(r.bySku).length} ma, tong ${tongParse.toLocaleString('vi-VN')}`);
  console.log(`     thang trong file: ${r.monthsSeen.join(', ')}   | ${r.soldToSeen.length} ma khach`);
  say(Math.abs(tongParse - tho) < 0.001, `tong khop phep cong tho (${tongParse} vs ${tho})`);
  say(r.rowsRead === dongTho, `so dong khop (${r.rowsRead} vs ${dongTho})`);
  say(r.monthsSeen.length === 1 && r.monthsSeen[0] === thang, `thang doc ra = ${r.monthsSeen.join(',')} (mong doi ${thang})`);
  say(!r.missingColumns.length, `du cot${r.missingColumns.length ? ': thieu ' + r.missingColumns.join(', ') : ''}`);
  say(Object.keys(r.bySku).length < r.rowsRead, `co ma xuat hien nhieu dong va da duoc cong lai (${r.rowsRead} dong -> ${Object.keys(r.bySku).length} ma)`);
}
if (!docDuoc) {
  console.log('  (khong co file nao — phan doi chieu voi file that khong chay)');
}

console.log('\n2. Loc theo ma khach cua don vi');
if (docDuoc) {
  const p = FILES.map(([t]) => `${DIR}/${t}`).find(existsSync);
  const r0 = parseZsd450(sheet1(p), {});
  const khachDau = r0.soldToSeen[0];
  const r1 = parseZsd450(sheet1(p), { soldTo: khachDau.code });
  console.log(`     khach ${khachDau.code} (${khachDau.name}): ${r1.rowsMatched} dong`);
  say(r1.rowsMatched === khachDau.rows, `loc dung so dong cua khach do`);
  say(r1.rowsRead === r0.rowsRead, 'rowsRead van la tong ca file — de biet da doc dung file chua');
  const lac = parseZsd450(sheet1(p), { soldTo: '9999999' });
  say(lac.rowsMatched === 0 && lac.soldToSeen.length > 0,
    'ma khach khong co trong file: 0 dong khop, nhung VAN liet ke cac ma khach co that de doi chieu');
}

console.log('\n3. Ba cai bay cua file that (du lieu tu dung)');
const H = [
  ZSD450_COLUMNS.soldTo, ZSD450_COLUMNS.soldToName, ZSD450_COLUMNS.sku,
  ZSD450_COLUMNS.skuName, ZSD450_COLUMNS.quantity, ZSD450_COLUMNS.month
];
const aoa = [
  H,
  [1, 2, 3, 4, 5, 6],                                        // dong danh so cot
  [1008903, 'Cong ty 3T', 1002020024, 'May RO', 100, 'T09-2026'],
  [1008903, 'Cong ty 3T', 1002020024, 'May RO', 250, 'T09-2026'],   // cung ma, hoa don khac
  [1008903, 'Cong ty 3T', 1002020024, 'May RO', -50, 'T09-2026'],   // hoa don tra lai
  [1011827, 'NSKX', 1002020024, 'May RO', 999, 'T09-2026'],         // don vi khac
  [1008903, 'Cong ty 3T', 1002020024, 'May RO', 700, 'T08-2026']    // thang khac
];
const r = parseZsd450(aoa, { soldTo: '1008903', month: '2026-09-01' });
console.log(`     bySku = ${JSON.stringify(r.bySku)}`);
say(r.bySku['1002020024'] === 300, `mot ma nhieu dong da cong lai: ${r.bySku['1002020024']} (100 + 250 - 50)`);
say(r.rowsMatched === 3, `dong khop = ${r.rowsMatched} (khong tinh dong danh so)`);
say(!('6' in r.bySku) && !('3' in r.bySku), 'dong danh so cot KHONG lot vao ket qua');
say(r.soldToSeen.length === 2, `thay ca 2 ma khach trong file (${r.soldToSeen.map((s) => s.code).join(', ')})`);
say(r.monthsSeen.join(',') === '2026-08-01,2026-09-01', `thay ca hai thang: ${r.monthsSeen.join(', ')}`);

console.log('\n3b. Don vi khong loc theo ma khach (XK: VKORG 0401 + VTWEG 02)');
// File cua XK duoc SAP loc san nen moi dong deu la cua XK. Nhung '*' phai
// KHAC HAN chuoi rong: rong = chua khai thi man hinh tu choi; '*' = co y
// khong loc thi phai lay het. Gop hai thu nay lai thi hoac chan nham mot
// don vi hop le, hoac nhan ca file cua don vi khac ma khong ai biet.
const het = parseZsd450(aoa, { soldTo: MOI_KHACH, month: '2026-09-01' });
console.log(`     bySku = ${JSON.stringify(het.bySku)}`);
say(het.bySku['1002020024'] === 1299,
  `lay ca hai ma khach: ${het.bySku['1002020024']} (300 cua 3T + 999 cua NSKX)`);
say(het.rowsMatched === 4, `dong khop = ${het.rowsMatched}`);
say(MOI_KHACH !== '', "'*' khac han chuoi rong");
say(Array.isArray(het.channelsSeen), 'tra ve danh sach kenh ban hang de doi chieu dung file');

console.log('\n3c. Duong KHONG QUA FILE phai ra dung con so nhu duong file');
// export_zsd450.py doc thang workbook SAP dang nhung (Office Integration) roi
// ghi ra JSON — khong sinh Excel, khong hop thoai Save As. Hai duong phai cho
// CUNG MOT ket qua, neu khong thi bo nut mot-cham lai ghi so khac voi nhap tay
// ma khong ai doi chieu duoc.
//
// Mo phong dung phep bien doi cua _o_thuong() trong Python: o ngay -> chuoi
// "YYYY-MM-DD" giu nguyen year/month/day (KHONG quy doi mui gio — SAP dua ra
// mot NGAY, khong phai mot moc thoi gian), o rong -> chuoi rong.
const nhuWorkbook = (aoaFile) => JSON.parse(JSON.stringify(
  aoaFile.map((r) => r.map((v) => {
    if (v instanceof Date) {
      const p2 = (n) => String(n).padStart(2, '0');
      return `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}`;
    }
    return v === null || v === undefined ? '' : v;
  }))
));

if (docDuoc) {
  for (const [ten] of FILES) {
    const duongDan = `${DIR}/${ten}`;
    if (!existsSync(duongDan)) continue;
    const aoaFile = sheet1(duongDan);
    const qFile = parseZsd450(aoaFile, {});
    const qJson = parseZsd450(nhuWorkbook(aoaFile), {});
    const tongF = Object.values(qFile.bySku).reduce((a, b) => a + b, 0);
    const tongJ = Object.values(qJson.bySku).reduce((a, b) => a + b, 0);
    say(tongF === tongJ && qFile.rowsRead === qJson.rowsRead
      && JSON.stringify(qFile.bySku) === JSON.stringify(qJson.bySku),
      `${ten}: file ${tongF} / workbook ${tongJ}, ${qFile.rowsRead} vs ${qJson.rowsRead} dong`);
    say(qJson.monthsSeen.join(',') === qFile.monthsSeen.join(','),
      `  thang doc ra giong nhau: ${qJson.monthsSeen.join(', ')}`);
  }
} else {
  console.log('  (khong co file that — phan doi chieu hai duong khong chay)');
}

console.log('\n4. Doc thang');
say(parseZsdMonth('T09-2026') === '2026-09-01', 'T09-2026 → 2026-09-01');
say(parseZsdMonth('T9-2026') === '2026-09-01', 'T9-2026 → 2026-09-01');
say(parseZsdMonth(44) === '', 'so cua dong danh so → khong doc ra thang');
say(parseZsdMonth('') === '', 'o trong → khong doc ra thang');

console.log('\n5. Thieu cot thi phai noi ro, khong tra bang rong');
const thieu = parseZsd450([['Ma khach', 'Ma vat tu'], [1, 2]], {});
say(thieu.missingColumns.includes(ZSD450_COLUMNS.quantity), `bao thieu: ${thieu.missingColumns.join(', ')}`);
say(Object.keys(thieu.bySku).length === 0, 'khong bia ra so nao');

console.log('\n6. Doanh thu thuan VND (19/10/2026): cung bo loc khach + thang, hoan tra ve so am, thieu cot khong lam hong san luong');
{
  const H = ['Mã khách', 'Tên khách', 'Mã vật tư', 'Tên vật tư', 'Số lượng xuất bán', 'Tháng_Năm', 'Kênh bán hàng (Distribution channel)', ZSD450_REVENUE_COLUMN];
  const aoa = [
    H,
    [1, 2, 3, 4, 5, 6, 7, 8],                                    // dòng đánh số cột — KHÔNG được cộng
    [1009062, 'KH A', 1001040834, 'Máy A', 5, 'T08-2026', 'Khác', 12355000],
    [1009062, 'KH A', 1001040834, 'Máy A', 2, 'T08-2026', 'Khác', 4000000],
    [1009062, 'KH A', 1001040834, 'Máy A', -1, 'T08-2026', 'Khác', -2000000],   // trả hàng: số âm, cộng vào
    [1009062, 'KH A', 2003000001, 'Lõi', 10, 'T08-2026', 'Khác', ''],           // ô doanh thu trống = 0 (dòng vẫn tính)
    [1009062, 'KH A', 2003000002, 'Lõi 2', 4, 'T07-2026', 'Khác', 999],         // tháng khác
    [2222222, 'KH B', 1001040834, 'Máy A', 9, 'T08-2026', 'Khác', 777777]        // khách khác
  ];
  const r = parseZsd450(aoa, { soldTo: '1009062', month: '2026-08-01' });
  say(r.revenueColumn === true, 'nhan ra cot "' + ZSD450_REVENUE_COLUMN + '"');
  say(r.revenueBySku['1001040834'].netRevenueVnd === 14355000, 'doanh thu thuan cong dong, gom ca hoan tra: 12.355.000 + 4.000.000 - 2.000.000 = ' + r.revenueBySku['1001040834'].netRevenueVnd);
  say(r.revenueBySku['1001040834'].quantity === 6 && r.bySku['1001040834'] === 6, 'so luong doanh thu khop so luong san luong (' + r.revenueBySku['1001040834'].quantity + ')');
  say(r.revenueBySku['1001040834'].lines === 3, 'dem 3 dong hoa don cua ma');
  say(r.revenueBySku['2003000001'].netRevenueVnd === 0 && r.revenueBySku['2003000001'].lines === 1, 'o doanh thu trong = 0, dong van duoc dem');
  say(!r.revenueBySku['2003000002'], 'khong lay thang khac');
  say(Object.keys(r.revenueBySku).length === 2 && !('777777' in r.revenueBySku), 'khong lay khach khac / khong lay dong danh so');
  say(Object.keys(r.bySku).join() === Object.keys(r.revenueBySku).join(), 'cung tap ma voi san luong (mot bo loc duy nhat)');
  const hk = parseZsd450(aoa, { soldTo: MOI_KHACH, month: '2026-08-01' });
  say(hk.revenueBySku['1001040834'].netRevenueVnd === 14355000 + 777777, 'don vi khong loc khach: cong ca khach khac');

  // Thiếu cột doanh thu: sản lượng vẫn đọc bình thường, chỉ báo revenueColumn=false
  const aoaSan = aoa.map((row) => row.slice(0, 7));
  const k = parseZsd450(aoaSan, { soldTo: '1009062', month: '2026-08-01' });
  say(k.revenueColumn === false && Object.keys(k.revenueBySku).length === 0 && k.bySku['1001040834'] === 6 && k.missingColumns.length === 0,
    'file khong co cot doanh thu: san luong van doc (6), khong coi la sai bo cuc, khong bia ra doanh thu');
  say(!parseZsd450([], {}).revenueColumn && Object.keys(parseZsd450([], {}).revenueBySku).length === 0, 'file rong: khong co doanh thu, khong loi');

  // Trên file THẬT: tổng doanh thu thuần theo bộ đọc == tổng cột đó cộng thô trên chính file (hai cách tính độc lập)
  const fileGt2 = 'D:/Operation/Claude/CLAUDE-OUTPUTS/DT-FC/ZSD450_GT2_202608.xlsx';
  if (!existsSync(fileGt2)) { console.log('  --   bo qua: khong co file GT2 that (file nam ngoai kho)'); }
  else {
    const rows = sheet1(fileGt2);
    const hdr = rows[0].map((h) => String(h ?? '').trim());
    const iRev = hdr.indexOf(ZSD450_REVENUE_COLUMN), iSold = hdr.indexOf(ZSD450_COLUMNS.soldTo), iM = hdr.indexOf(ZSD450_COLUMNS.month), iSku = hdr.indexOf(ZSD450_COLUMNS.sku);
    let tho = 0, soDong = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[iSku] || String(row[iSold]) !== '1009062' || parseZsdMonth(row[iM]) !== '2026-08-01') continue;
      const v = Number(row[iRev]); if (Number.isFinite(v)) tho += v; soDong++;
    }
    const g = parseZsd450(rows, { soldTo: '1009062', month: '2026-08-01' });
    const tong = Object.values(g.revenueBySku).reduce((a, x) => a + x.netRevenueVnd, 0);
    say(g.revenueColumn && soDong > 0 && Math.abs(tong - tho) < 0.5 && g.rowsMatched === soDong,
      'GT2 thang 8/2026 (file that): ' + soDong + ' dong, tong doanh thu thuan ' + tong.toLocaleString('vi-VN') + ' = cong tho ' + tho.toLocaleString('vi-VN'));
  }
}

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nDoc dung file ZSD450 that va chan duoc ba cai bay.');
process.exit(bad ? 1 : 0);
