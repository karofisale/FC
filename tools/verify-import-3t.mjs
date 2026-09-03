#!/usr/bin/env node
/**
 * Chứng minh phần gộp dữ liệu nhập đọc ĐÚNG file 3T thật, bằng cách so với
 * chính dòng tổng mà file mang sẵn — không phải so với mô tả bằng lời.
 *
 *   node tools/verify-import-3t.mjs --file "D:/.../3TDO-....xlsx" --month 9
 *
 * Ba phép kiểm, tất cả đều dùng số của chính file:
 *   1. tổng từng cột tháng app cộng được  ==  dòng 2 của sheet
 *   2. tổng bốn cột tuần                  ==  cột tháng gốc (quy tắc của app)
 *   3. mã trùng trong cùng sheet phải được CỘNG, không lấy dòng sau
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  aggregateRegionBlocks, readTotalsRow, findTotalsRow, guessRegionSheets
} from '../client/src/utils/importAggregate.js';

const XLSX = createRequire(new URL('../client/package.json', import.meta.url))('xlsx');

const flag = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const FILE = flag('--file', 'D:/Operation/Claude/CLAUDE-OUTPUTS/Sale FC/3TDO-000634. ĐẶT HÀNG HÀNG THÁNG_KRF THÁNG 9 gốc.xlsx');
const MONTH = Number(flag('--month', '9'));

const wb = XLSX.read(readFileSync(FILE), { type: 'buffer' });
const sheets = {};
wb.SheetNames.forEach((n) => {
  sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true });
});

// Bố cục của file 3T (người dùng xác nhận: dữ liệu ở cột A..L)
const SKU_COL = 1;        // B
const NAME_COL = 2;       // C
const MONTH_START = 4;    // E
const MONTH_COUNT = 4;
const WEEK_START = 8;     // I
const WEEK_COUNT = 4;
const DATA_START = 2;     // dòng 3, 0-based

const baseMonth = `2026-${String(MONTH).padStart(2, '0')}-01`;
const guessed = guessRegionSheets(wb.SheetNames, ['MB', 'MN'], baseMonth);
console.log(`file có ${wb.SheetNames.length} sheet; tự đoán cho kỳ ${baseMonth}:`);
console.log(`   MB -> ${guessed.MB || '(không đoán được)'}`);
console.log(`   MN -> ${guessed.MN || '(không đoán được)'}\n`);

let bad = 0;
const say = (ok, msg) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

say(!!guessed.MB && !!guessed.MN, 'đoán đúng cặp sheet của kỳ, không lấy nhầm kỳ cũ');
if (!guessed.MB || !guessed.MN) process.exit(1);

const blocks = [
  { region: 'MB', rows: sheets[guessed.MB].slice(DATA_START) },
  { region: 'MN', rows: sheets[guessed.MN].slice(DATA_START) }
];

const agg = aggregateRegionBlocks({
  blocks, skuColIdx: SKU_COL, nameColIdx: NAME_COL,
  monthStartCol: MONTH_START, monthCount: MONTH_COUNT,
  weekStartCol: WEEK_START, weekCount: WEEK_COUNT
});

console.log('\n1. Tổng từng cột tháng so với DÒNG TỔNG có sẵn trong file');
for (const [region, sheet] of [['MB', guessed.MB], ['MN', guessed.MN]]) {
  const raw = sheets[sheet];
  const idx = findTotalsRow(raw, DATA_START, SKU_COL, MONTH_START, MONTH_COUNT);
  const fromFile = idx >= 0 ? readTotalsRow(raw[idx], MONTH_START, MONTH_COUNT) : null;
  say(idx >= 0, `${region}: dò được dòng tổng (dòng ${idx + 1})`);
  if (!fromFile) continue;
  const mine = agg.totalsByRegion[region];
  say(JSON.stringify(mine) === JSON.stringify(fromFile),
    `${region}: app cộng ${JSON.stringify(mine)} — file ghi ${JSON.stringify(fromFile)}`);
}

console.log('\n2. Tổng cột tuần phải bằng cột tháng gốc (quy tắc Bảng 1 của app)');
for (const region of ['MB', 'MN']) {
  say(agg.weekTotalByRegion[region] === agg.totalsByRegion[region][0],
    `${region}: tuần=${agg.weekTotalByRegion[region]} tháng gốc=${agg.totalsByRegion[region][0]}`);
}

console.log('\n3. Mã trùng trong cùng sheet phải được cộng, không lấy dòng sau');
console.log(`   phát hiện ${agg.duplicates.length} mã trùng: ` +
  agg.duplicates.map((d) => `${d.skuCode}(${d.region} x${d.count})`).join(', '));
const dupSku = agg.duplicates[0];
if (dupSku) {
  const raw = sheets[dupSku.region === 'MB' ? guessed.MB : guessed.MN];
  const lines = raw.slice(DATA_START).filter((r) => String(r?.[SKU_COL] ?? '').trim() === dupSku.skuCode);
  const wanted = lines.reduce((s, r) => s + (Number(r[MONTH_START]) || 0), 0);
  const got = agg.rows.find((r) => r.skuCode === dupSku.skuCode).months[0];
  const lastOnly = Number(lines[lines.length - 1][MONTH_START]) || 0;
  say(got === wanted, `${dupSku.skuCode}: cộng ${lines.length} dòng = ${wanted} (nếu lấy dòng sau sẽ chỉ ra ${lastOnly})`);
}

console.log('\n4. Gộp hai miền');
const both = agg.rows.filter((r) => Object.values(r.weeks[1] || {}).length > 1).length;
console.log(`   ${agg.rows.length} mã sau khi gộp`);
const combined = agg.totalsByRegion.MB.map((v, i) => v + agg.totalsByRegion.MN[i]);
console.log(`   tổng tháng gộp cả hai miền: ${JSON.stringify(combined)}`);
const mbSet = new Set(sheets[guessed.MB].slice(DATA_START).map((r) => String(r?.[SKU_COL] ?? '').trim()).filter(Boolean));
const mnSet = new Set(sheets[guessed.MN].slice(DATA_START).map((r) => String(r?.[SKU_COL] ?? '').trim()).filter(Boolean));
const overlap = [...mbSet].filter((s) => mnSet.has(s)).length;
say(agg.rows.length === new Set([...mbSet, ...mnSet]).size, `số mã gộp = hợp của hai miền (${mbSet.size} + ${mnSet.size}, chung ${overlap})`);
console.log(`   -> ${overlap} mã sẽ mất số của một miền nếu nhập làm hai lượt`);

console.log('\n5. Payload cuối cùng sẽ ghi lên Sheet (đúng cách modal dựng)');
const monthColumns = ['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01'];
const weekNumbers = [1, 2, 3, 4];
const regionCodes = ['MB', 'MN'];

const monthlyUpdates = [];
const weeklyUpdates = [];
agg.rows.forEach((r) => {
  monthColumns.forEach((col, i) => monthlyUpdates.push({ rowKey: r.skuCode, col, value: r.months[i] }));
  weekNumbers.forEach((w) => {
    regionCodes.forEach((region) => {
      weeklyUpdates.push({ rowKey: r.skuCode, col: { week: w, region }, value: (r.weeks[w] && r.weeks[w][region]) || 0 });
    });
  });
});

say(monthlyUpdates.length === agg.rows.length * 4,
  `số ô Bảng tháng = ${monthlyUpdates.length} (${agg.rows.length} mã x 4 tháng)`);
say(weeklyUpdates.length === agg.rows.length * 8,
  `số ô Bảng tuần  = ${weeklyUpdates.length} (${agg.rows.length} mã x 4 tuần x 2 miền)`);

const m0 = monthlyUpdates.filter((u) => u.col === monthColumns[0]).reduce((a, u) => a + u.value, 0);
say(m0 === combined[0],
  `tổng tháng gốc trong payload = ${m0.toLocaleString('vi-VN')} = MB ${agg.totalsByRegion.MB[0].toLocaleString('vi-VN')} + MN ${agg.totalsByRegion.MN[0].toLocaleString('vi-VN')}`);

const wAll = weeklyUpdates.reduce((a, u) => a + u.value, 0);
say(wAll === m0, `tổng Bảng tuần = tổng tháng gốc (${wAll.toLocaleString('vi-VN')}) — Bảng 1 sẽ báo khớp`);

// một mã có ở CẢ HAI miền phải mang TỔNG, không phải số của một miền
const shared = [...mbSet].find((x) => mnSet.has(x));
const sumIn = (sheet) => sheets[sheet].slice(DATA_START)
  .filter((r) => String(r?.[SKU_COL] ?? '').trim() === shared)
  .reduce((a, r) => a + (Number(r[MONTH_START]) || 0), 0);
const wantShared = sumIn(guessed.MB) + sumIn(guessed.MN);
const gotShared = agg.rows.find((r) => r.skuCode === shared).months[0];
say(gotShared === wantShared,
  `mã ${shared} có ở cả hai miền: payload ${gotShared} = MB+MN ${wantShared}`);

console.log(bad ? `\n*** ${bad} lỗi ***` : '\nĐọc đúng file 3T theo chính số liệu của file.');
process.exit(bad ? 1 : 0);
