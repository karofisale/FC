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
import { parseZsd450, parseZsdMonth, ZSD450_COLUMNS } from '../client/src/utils/zsd450.js';

const XLSX = createRequire(new URL('../client/package.json', import.meta.url))('xlsx');
const DIR = process.argv[2] || 'D:/Operation/Claude/CLAUDE-OUTPUTS/Update Tuan';

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${m}`); };

const sheet1 = (file) => {
  const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1, raw: true, defval: null, blankrows: false
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

console.log('\n4. Doc thang');
say(parseZsdMonth('T09-2026') === '2026-09-01', 'T09-2026 → 2026-09-01');
say(parseZsdMonth('T9-2026') === '2026-09-01', 'T9-2026 → 2026-09-01');
say(parseZsdMonth(44) === '', 'so cua dong danh so → khong doc ra thang');
say(parseZsdMonth('') === '', 'o trong → khong doc ra thang');

console.log('\n5. Thieu cot thi phai noi ro, khong tra bang rong');
const thieu = parseZsd450([['Ma khach', 'Ma vat tu'], [1, 2]], {});
say(thieu.missingColumns.includes(ZSD450_COLUMNS.quantity), `bao thieu: ${thieu.missingColumns.join(', ')}`);
say(Object.keys(thieu.bySku).length === 0, 'khong bia ra so nao');

console.log(bad ? `\n*** ${bad} cho sai ***` : '\nDoc dung file ZSD450 that va chan duoc ba cai bay.');
process.exit(bad ? 1 : 0);
