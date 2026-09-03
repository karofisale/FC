#!/usr/bin/env node
/**
 * Chứng minh phần nhập đọc đúng file NSKX — bố cục hai bảng xếp chồng dọc
 * trong cùng một sheet, không có cột tuần.
 *
 *   node tools/verify-import-nskx.mjs --file "C:/.../NSKX.xlsx"
 *
 * File này mang sẵn ba mức số kiểm tra, dùng cả ba:
 *   - dòng phân cách của mỗi miền ghi luôn TỔNG của miền đó
 *   - dòng cuối "Tổng (I+II)" ghi tổng hai miền
 *   - tuần được suy ra từ tháng đầu nên tổng tuần phải bằng tổng tháng đầu
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  aggregateRegionBlocks, detectStackedBlocks, readTotalsRow, splitMonthIntoWeeks
} from '../client/src/utils/importAggregate.js';

const XLSX = createRequire(new URL('../client/package.json', import.meta.url))('xlsx');

const flag = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const FILE = flag('--file', 'C:/Users/haict.tecomen/Downloads/NSKX.xlsx');

const wb = XLSX.read(readFileSync(FILE), { type: 'buffer' });
const sheetName = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: true });

// Bố cục NSKX: A=STT, B=Mã hàng, C=Tên model, D..G=4 tháng, H=Ghi chú
const SKU_COL = 1;
const NAME_COL = 2;
const MONTH_START = 3;
const MONTH_COUNT = 4;
const DATA_START = 1;      // ngay sau dòng tiêu đề
const WEEK_COUNT = 4;
const REGIONS = ['MB', 'MN'];

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

console.log(`sheet "${sheetName}", ${rows.length} dòng\n`);

console.log('1. Tách được hai bảng theo dòng phân cách ghi tên miền');
const blocks = detectStackedBlocks(rows, DATA_START, SKU_COL, REGIONS);
blocks.forEach((b) => {
  const withSku = b.rows.filter((r) => String(r?.[SKU_COL] ?? '').trim()).length;
  console.log(`   ${b.region}: dòng phân cách ${b.markerRowIdx + 1}, ${withSku} mã`);
});
say(blocks.length === 2, `tìm được ${blocks.length} bảng`);
say(blocks.map((b) => b.region).join(',') === 'MN,MB', `thứ tự trong file: ${blocks.map((b) => b.region).join(', ')} (MN ở trên)`);

const agg = aggregateRegionBlocks({
  blocks, skuColIdx: SKU_COL, nameColIdx: NAME_COL,
  monthStartCol: MONTH_START, monthCount: MONTH_COUNT,
  weekCount: WEEK_COUNT, deriveWeeks: true, deriveStep: 10
});

console.log('\n2. Tổng từng miền so với chính dòng phân cách của miền đó');
blocks.forEach((b) => {
  const fromFile = readTotalsRow(b.markerRow, MONTH_START, MONTH_COUNT);
  const mine = agg.totalsByRegion[b.region];
  say(fromFile && JSON.stringify(mine) === JSON.stringify(fromFile),
    `${b.region}: app cộng ${JSON.stringify(mine)} — file ghi ${JSON.stringify(fromFile)}`);
});

console.log('\n3. Tổng hai miền so với dòng "Tổng (I+II)" cuối file');
const grandRow = rows.findIndex((r) => /t\u1ed5ng/i.test(String(r?.[0] ?? '')));
const grand = grandRow >= 0 ? readTotalsRow(rows[grandRow], MONTH_START, MONTH_COUNT) : null;
const combined = agg.totalsByRegion.MB.map((v, i) => v + agg.totalsByRegion.MN[i]);
say(grand && JSON.stringify(combined) === JSON.stringify(grand),
  `app cộng ${JSON.stringify(combined)} — dòng ${grandRow + 1} ghi ${JSON.stringify(grand)}`);

console.log('\n4. Chia tuần từ tháng đầu: chẵn chục, phần lẻ vào tuần 1');
[[100, [40, 20, 20, 20]], [10, [10, 0, 0, 0]], [200, [50, 50, 50, 50]],
 [250, [70, 60, 60, 60]], [0, [0, 0, 0, 0]], [7, [7, 0, 0, 0]]].forEach(([m, want]) => {
  const got = splitMonthIntoWeeks(m, 4, 10);
  say(JSON.stringify(got) === JSON.stringify(want), `${m} -> ${JSON.stringify(got)}`);
});

console.log('\n5. Tuần suy ra phải cộng lại đúng bằng tháng đầu, theo từng miền');
REGIONS.forEach((region) => {
  say(agg.weekTotalByRegion[region] === agg.totalsByRegion[region][0],
    `${region}: tuần=${agg.weekTotalByRegion[region]} tháng đầu=${agg.totalsByRegion[region][0]}`);
});

console.log('\n6. Mã có ở cả hai miền phải mang tổng, và tuần tách đúng miền');
const shared = agg.rows.filter((r) => Object.keys(r.monthsByRegion).length > 1);
console.log(`   ${shared.length} mã có mặt ở cả hai miền`);
shared.forEach((r) => {
  const want = Object.values(r.monthsByRegion).reduce((a, b) => a + b, 0);
  say(r.months[0] === want,
    `${r.skuCode}: tháng đầu ${r.months[0]} = ${Object.entries(r.monthsByRegion).map(([k, v]) => `${k} ${v}`).join(' + ')}` +
    `  | tuần MB ${JSON.stringify(REGIONS.map((x) => r.weeks[1]?.[x] ?? 0))}`);
});

console.log(`\n   ${agg.rows.length} mã sau khi gộp hai bảng`);
console.log(bad ? `\n*** ${bad} lỗi ***` : '\nĐọc đúng file NSKX theo chính số liệu của file.');
process.exit(bad ? 1 : 0);
