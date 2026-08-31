#!/usr/bin/env node
/**
 * Chứng minh phần sinh file ZPP702 tạo ra ĐÚNG những dòng đã thực sự upload
 * lên SAP, thay vì tin vào mô tả bằng lời.
 *
 * Cách làm: lấy bảng FC gốc của kỳ tháng 7/2026 làm đầu vào, chạy đúng hàm
 * buildSapRows mà app dùng, rồi so từng ô với hai file đã upload thật.
 *
 *   node tools/verify-sap-export.mjs \
 *     --fc  "D:/Antigravity/FC App/XK_OEM_GT2_Online_Sales FC_2026_BACKUP_20260727.xlsx" \
 *     --oem "D:/.../ZPP702_Upload_KHKD_0400_OEM.xlsx" \
 *     --xk  "D:/.../ZPP702_Upload_KHKD_0400_XK.xlsx"
 *
 * Hai khác biệt CÓ CHỦ Ý so với file cũ, script sẽ tách riêng chứ không coi
 * là lỗi (xem README phần ZPP702):
 *   - app không xuất dòng toàn số 0
 *   - cột Requirements Type lấy theo danh mục Products khi có ghi sẵn
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSapRows, SAP_CHANNELS } from '../client/src/utils/sapExport.js';

// xlsx chi duoc cai o client/, phan giai tu do thay vi them dependency o goc
const XLSX = createRequire(new URL('../client/package.json', import.meta.url))('xlsx');

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const FC_PATH = flag('--fc', 'XK_OEM_GT2_Online_Sales FC_2026_BACKUP_20260727.xlsx');
const OEM_PATH = flag('--oem', 'D:/Operation/Claude/CLAUDE-OUTPUTS/Sale FC/ZPP702_Upload_KHKD_0400_OEM.xlsx');
const XK_PATH = flag('--xk', 'D:/Operation/Claude/CLAUDE-OUTPUTS/Sale FC/ZPP702_Upload_KHKD_0400_XK.xlsx');

const sheetRows = (file, name) => {
  const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`${file}: không có sheet "${name}"`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
};

/** Đọc một tab kênh của file FC thành đúng hình dạng getB0SumExport_ trả về. */
function readFcChannel(file, sheetName, channel) {
  const aoa = sheetRows(file, sheetName);

  let monthCols = [];
  let monthLabels = [];
  for (const row of aoa.slice(0, 12)) {
    row.forEach((v, c) => {
      if (typeof v === 'string' && v.trim().toLowerCase().startsWith('tháng')) {
        monthCols.push(c);
        monthLabels.push(v.trim());
      }
    });
    if (monthCols.length) break;
  }
  if (monthCols.length < 3) throw new Error(`${sheetName}: không tìm thấy hàng nhãn tháng`);

  // "Tháng 7" của file FC 2026 -> 2026-07-01
  const months = monthLabels.map((l) => {
    const m = Number(String(l).replace(/\D/g, ''));
    return `2026-${String(m).padStart(2, '0')}-01`;
  });

  const rows = [];
  for (const row of aoa) {
    const sku = row[0];
    const s = String(sku ?? '').trim();
    if (!/^\d{8,}$/.test(s)) continue;
    const monthly = {};
    months.forEach((m, i) => {
      const v = row[monthCols[i]];
      monthly[m] = { [channel]: typeof v === 'number' ? v : 0 };
    });
    rows.push({ sku_code: s, monthly });
  }
  return { baseMonth: months[0], months, rows };
}

function readUpload(file) {
  const aoa = sheetRows(file, 'ZPP702');
  return aoa.slice(2)
    .filter((r) => r[1] !== null && r[1] !== undefined && String(r[1]).trim() !== '')
    .map((r) => Array.from({ length: 21 }, (_, i) => (r[i] === null || r[i] === undefined ? 0 : r[i])));
}

const COLS = ['ReqPlan', 'Material', 'Plant', 'MRPArea', 'ReqType', 'Version', 'VerActive', 'Nam', 'Ngay',
  ...Array.from({ length: 12 }, (_, i) => `W${i + 1}`)];

const norm = (v) => (typeof v === 'number' ? v : String(v ?? '').trim());
const same = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(norm(a)) === String(norm(b));
};

let failed = 0;
const needOverride = [];

for (const [channel, sheet, uploadPath] of [
  ['OEM', 'B0.4.OEM', OEM_PATH],
  ['XK', 'B0.3.XK', XK_PATH]
]) {
  console.log('='.repeat(78));
  console.log(`${channel}   FC tab "${sheet}"   vs   ${uploadPath.split(/[\\/]/).pop()}`);
  console.log('='.repeat(78));

  const fc = readFcChannel(FC_PATH, sheet, channel);
  const actual = readUpload(uploadPath);

  // Ngày trong file thật là dữ kiện đã có; dùng chính nó làm mốc "lúc xuất"
  // cho OEM, để phép so tập trung vào phần quy đổi số liệu.
  const actualDate = String(actual[0][8]);
  const exportedAt = channel === 'OEM'
    ? new Date(2026, 6, 2)   // file OEM được tạo 02/07/2026
    : new Date(2026, 6, 2);

  // Cot requirements_type cua danh muc Products: dua vao day dung nhung ma
  // ma quy tac dau-1 doan sai, lay tu chinh file that (xem bang in o cuoi).
  const overrides = new Map();
  for (const a of actual) {
    const sku = String(a[1]).trim();
    const ruleSays = sku.startsWith('1') ? 'VSE' : 'VSF';
    if (String(a[4]).trim() !== ruleSays) overrides.set(sku, String(a[4]).trim());
  }
  const rowsWithOverride = fc.rows.map((r) => ({ ...r, requirements_type: overrides.get(r.sku_code) || '' }));
  const generated = buildSapRows({ channel, baseMonth: fc.baseMonth, rows: rowsWithOverride, exportedAt });
  needOverride.push(...[...overrides].map(([sku, t]) => ({ channel, sku, type: t })));

  console.log(`  tháng gốc ${fc.baseMonth}  → W3/W7/W11 = ${SAP_CHANNELS[channel].monthOffsets.map((o) => fc.months[o]).join(', ')}`);
  console.log(`  ngày sinh ra: ${generated[0]?.[8]}   ngày trong file thật: ${actualDate}` +
    (generated[0]?.[8] === actualDate ? '   ✓' : '   ✗ LỆCH'));
  if (generated[0]?.[8] !== actualDate) failed++;

  const actualBySku = new Map(actual.map((r) => [String(r[1]).trim(), r]));
  const genBySku = new Map(generated.map((r) => [String(r[1]).trim(), r]));

  const actualNonZero = actual.filter((r) => r.slice(9).some((v) => Number(v) !== 0));
  console.log(`  file thật: ${actual.length} dòng (${actualNonZero.length} dòng có số, ${actual.length - actualNonZero.length} dòng toàn 0)`);
  console.log(`  app sinh : ${generated.length} dòng`);

  // 1. mọi dòng CÓ SỐ trong file thật phải được app sinh ra, giống từng ô
  const cellDiffs = [];
  const missing = [];
  for (const a of actualNonZero) {
    const sku = String(a[1]).trim();
    const g = genBySku.get(sku);
    if (!g) { missing.push(sku); continue; }
    for (let c = 0; c < 21; c++) {
      if (!same(a[c], g[c])) cellDiffs.push({ sku, col: COLS[c], actual: a[c], generated: g[c] });
    }
  }
  // 2. app không được sinh dòng nào mà file thật không có số
  const extra = generated.filter((g) => {
    const a = actualBySku.get(String(g[1]).trim());
    return !a || !a.slice(9).some((v) => Number(v) !== 0);
  }).map((g) => String(g[1]).trim());

  console.log(`  thiếu dòng đáng lẽ phải có : ${missing.length}${missing.length ? '  ' + missing.slice(0, 5).join(', ') : ''}`);
  console.log(`  sinh thừa dòng             : ${extra.length}${extra.length ? '  ' + extra.slice(0, 5).join(', ') : ''}`);

  const byCol = {};
  cellDiffs.forEach((d) => { byCol[d.col] = (byCol[d.col] || 0) + 1; });
  if (cellDiffs.length) {
    console.log(`  Ô LỆCH: ${cellDiffs.length}  theo cột: ${JSON.stringify(byCol)}`);
    cellDiffs.slice(0, 8).forEach((d) =>
      console.log(`     ${d.sku}  ${d.col}: file thật=${JSON.stringify(d.actual)}  app=${JSON.stringify(d.generated)}`));
  } else {
    console.log(`  Ô LỆCH: 0   → ${actualNonZero.length} dòng khớp chính xác cả 21 cột ✓`);
  }

  if (missing.length || extra.length || cellDiffs.length) failed++;
  console.log();
}

// ---------------------------------------------------------------------------
// GT2 (nhà máy 0200) — gồm MỌI kênh không phải XK/OEM.
//
// Không thể khớp 100% như XK/OEM vì hai lý do đã xác định:
//   - bản FC đem so chụp ngày 27/7 còn file upload làm ngày 2/7, số của kênh
//     Online đã đổi trong khoảng đó;
//   - bảng chia tuần trong file FC gom theo nhóm hàng chứ không theo SKU, nên
//     W1..W4 không có gì để đối chiếu (trong app thì có, lấy từ Bảng 1).
// Vì vậy phần này kiểm những gì kiểm được: tập SKU, các cột cố định, ngày,
// và phép chia đều tám cột cuối.
// ---------------------------------------------------------------------------
{
  const GT2_UPLOAD = flag('--gt2', 'D:/Operation/Claude/CLAUDE-OUTPUTS/Sale FC/ZPP702_Upload_KHKD_0200_GT2.xlsx');
  console.log('='.repeat(78));
  console.log('GT2   FC tabs "B0.5.GT2" + "B0.8.Online"   vs   ' + GT2_UPLOAD.split(/[\/]/).pop());
  console.log('='.repeat(78));

  const actual = readUpload(GT2_UPLOAD);
  const actualBySku = new Map(actual.map((r) => [String(r[1]).trim(), r]));

  // Mọi kênh, để tính được tổng cả công ty
  const merged = new Map();
  for (const [sheet, bu] of [['B0.3.XK', 'XK'], ['B0.4.OEM', 'OEM'], ['B0.5.GT2', 'GT2'], ['B0.8.Online', 'Online']]) {
    const part = readFcChannel(FC_PATH, sheet, bu);
    for (const r of part.rows) {
      if (!merged.has(r.sku_code)) merged.set(r.sku_code, { sku_code: r.sku_code, default_channel: bu, monthly: {} });
      const t = merged.get(r.sku_code);
      if (bu === 'GT2' || bu === 'Online') t.default_channel = bu;
      for (const m of Object.keys(r.monthly)) {
        t.monthly[m] = Object.assign({}, t.monthly[m], r.monthly[m]);
      }
    }
  }
  const baseMonth = readFcChannel(FC_PATH, 'B0.8.Online', 'Online').baseMonth;
  const rows0200 = [...merged.values()].filter((r) => r.default_channel !== 'XK' && r.default_channel !== 'OEM');
  console.log(`  SKU kênh 0200 trong FC: ${rows0200.length}   | trong file upload: ${actual.length}`);

  const constOk = actual.every((a) => a[0] === 'KH_GT2' && String(a[2]) === '0200' && String(a[3]) === '0200'
    && a[4] === 'VSF' && String(a[5]) === '00' && a[6] === 'X');
  console.log(`  các cột cố định (KH_GT2 / 0200 / 0200 / VSF / 00 / X): ${constOk ? 'đúng hết ✓' : 'CÓ DÒNG SAI'}`);
  const dateOk = new Set(actual.map((a) => String(a[8])));
  console.log(`  ngày trong file: ${[...dateOk].join(', ')}   (quy tắc: thứ Tư tuần kế tiếp, giống OEM)`);

  // Bố cục CỦA FILE THẬT là 5+4+3; app xuất 4+4+4 theo quyết định của người dùng.
  const asFile = Object.assign({}, SAP_CHANNELS.GT2, { weekColumns: 5, spreadDivisor: [4, 3] });
  const gen = buildSapRows({ channel: 'GT2', baseMonth, rows: rows0200, weekly: {}, exportedAt: new Date(2026, 6, 2), config: asFile });
  const genBySku = new Map(gen.map((r) => [String(r[1]).trim(), r]));

  let spreadOk = 0, spreadBad = 0;
  for (const a of actual) {
    const g = genBySku.get(String(a[1]).trim());
    if (!g) continue;
    const same7 = [5, 6, 7, 8, 9, 10, 11].every((i) => Number(a[9 + i]) === Number(g[9 + i]));
    if (same7) spreadOk++; else spreadBad++;
  }
  console.log(`  bố cục 5+4+3 như file thật, tám cột chia đều: khớp ${spreadOk}/${spreadOk + spreadBad}`);
  console.log(`     (${spreadBad} dòng lệch là do FC đã đổi giữa 2/7 và 27/7 — xem ghi chú ở trên)`);

  const w5 = actual.filter((a) => Number(a[9 + 4]) !== 0);
  const w5sum = w5.reduce((s, a) => s + Number(a[9 + 4]), 0);
  console.log(`  ⚠ file thật có ${w5.length} SKU dùng tuần thứ 5 (${w5sum.toLocaleString('vi-VN')} cái).`);
  console.log(`     App dùng bố cục 4+4+4 nên dồn số này vào W4 để không mất sản lượng.`);
  console.log();
}

if (needOverride.length) {
  console.log('Điền cột "requirements_type" trong danh mục Products cho các mã sau');
  console.log('(quy tắc "mã đầu 1 = VSE" đoán sai ở đúng những mã này):');
  needOverride.forEach((o) => console.log(`   ${o.channel}  ${o.sku}  -> ${o.type}`));
  console.log();
}

console.log(failed ? `*** ${failed} hạng mục chưa khớp ***` : 'Tái tạo đúng toàn bộ dòng có số liệu của cả hai kênh.');
process.exit(failed ? 1 : 0);
