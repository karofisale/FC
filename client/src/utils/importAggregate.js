import { parsePastedNumber } from './useGridEditing.js';

/**
 * Gộp dữ liệu nhập khi file tách theo miền.
 *
 * Đối chiếu với file thật của 3T (kỳ tháng 9): hai sheet "MIỀN BẮC T9" và
 * "MIỀN NAM T9", cột A..L = STT, Mã LK, Tên hàng, ĐVT, 4 cột tháng, 4 cột
 * tuần của tháng gốc. Xem tools/verify-import-3t.mjs.
 *
 * Ba chỗ phải CỘNG chứ không được ghi đè, cả ba đều có thật trong file đó:
 *
 * 1. Hai miền — Bảng 0 không có chiều miền nên sản lượng tháng là MB + MN.
 *    74 mã có mặt ở cả hai sheet; nhập hai lượt thì lượt sau đè lượt trước.
 *
 * 2. Dòng trùng mã trong CÙNG một sheet — sheet MIỀN NAM T9 có 6 mã nằm ở
 *    hai dòng khác nhau, là hai dòng đặt hàng riêng (khác STT, đôi khi khác
 *    cả tên gọi) chứ không phải nhập nhầm. Dòng tổng của file cộng cả hai,
 *    nên phải cộng theo.
 *
 * 3. Cột tuần — mỗi sheet chỉ chứa tuần của MIỀN CỦA NÓ, khác với bố cục
 *    một bảng (nơi các cột tuần xen kẽ theo miền). Vì vậy tuần ở đây lấy
 *    liên tiếp từ cột bắt đầu, còn miền lấy theo sheet.
 *
 * Trả về kèm tổng theo miền để màn hình đối chiếu với dòng tổng của file
 * trước khi ghi — file 3T có sẵn dòng đó và nó khớp tuyệt đối.
 */

/**
 * @param {object} p
 * @param {Array}  p.blocks        [{ region, rows }] — rows là mảng dòng thô đã cắt đúng vùng dữ liệu
 * @param {number} p.skuColIdx
 * @param {number} [p.nameColIdx]  -1 nếu không lấy tên
 * @param {number} p.monthStartCol cột tháng đầu tiên; các tháng sau liền kề bên phải
 * @param {number} p.monthCount
 * @param {number} [p.weekStartCol] cột tuần 1; các tuần sau liền kề. Bỏ qua nếu không nhập tuần
 * @param {number} [p.weekCount]
 */
export function aggregateRegionBlocks({
  blocks, skuColIdx, nameColIdx = -1,
  monthStartCol, monthCount,
  weekStartCol, weekCount = 0
}) {
  const bySku = new Map();
  const totalsByRegion = {};
  const weekTotalByRegion = {};
  const duplicates = [];
  const readWeeks = weekStartCol !== undefined && weekStartCol !== null && weekCount > 0;

  blocks.forEach(({ region, rows }) => {
    totalsByRegion[region] = new Array(monthCount).fill(0);
    weekTotalByRegion[region] = 0;
    const seen = new Map();

    rows.forEach((row) => {
      if (!row) return;
      const sku = String(row[skuColIdx] ?? '').trim();
      if (!sku) return;

      seen.set(sku, (seen.get(sku) || 0) + 1);

      if (!bySku.has(sku)) {
        bySku.set(sku, {
          skuCode: sku,
          name: nameColIdx >= 0 ? String(row[nameColIdx] ?? '').trim() : '',
          months: new Array(monthCount).fill(0),
          weeks: {}
        });
      }
      const entry = bySku.get(sku);
      if (!entry.name && nameColIdx >= 0) entry.name = String(row[nameColIdx] ?? '').trim();

      for (let i = 0; i < monthCount; i++) {
        const qty = parsePastedNumber(row[monthStartCol + i]);
        entry.months[i] += qty;
        totalsByRegion[region][i] += qty;
      }

      if (readWeeks) {
        for (let w = 0; w < weekCount; w++) {
          const qty = parsePastedNumber(row[weekStartCol + w]);
          if (!entry.weeks[w + 1]) entry.weeks[w + 1] = {};
          entry.weeks[w + 1][region] = (entry.weeks[w + 1][region] || 0) + qty;
          weekTotalByRegion[region] += qty;
        }
      }
    });

    seen.forEach((count, sku) => {
      if (count > 1) duplicates.push({ skuCode: sku, region, count });
    });
  });

  return {
    rows: Array.from(bySku.values()),
    totalsByRegion,
    weekTotalByRegion,
    duplicates
  };
}

/**
 * Tổng của các cột tháng trên một dòng bất kỳ — dùng để đọc dòng tổng có
 * sẵn trong file (3T để ở dòng 2) rồi so với số app vừa cộng được.
 */
export function readTotalsRow(row, monthStartCol, monthCount) {
  if (!row) return null;
  const out = [];
  for (let i = 0; i < monthCount; i++) {
    const v = row[monthStartCol + i];
    if (typeof v !== 'number') return null;   // không phải dòng tổng
    out.push(v);
  }
  return out;
}

/**
 * Dò dòng tổng: dòng nằm TRÊN vùng dữ liệu, không có mã SKU, nhưng có đủ
 * số ở các cột tháng. Trả về chỉ số dòng (0-based) hoặc -1.
 */
export function findTotalsRow(rawRows, dataStartIdx, skuColIdx, monthStartCol, monthCount) {
  for (let r = dataStartIdx - 1; r >= 0; r--) {
    const row = rawRows[r];
    if (!row) continue;
    if (String(row[skuColIdx] ?? '').trim()) continue;
    if (readTotalsRow(row, monthStartCol, monthCount)) return r;
  }
  return -1;
}

/**
 * Đoán sheet của từng miền theo tên, có tính cả tháng gốc của chu kỳ.
 *
 * File 3T giữ nhiều kỳ trong cùng một workbook (T5..T9), nên chỉ khớp
 * "MIỀN BẮC" là chưa đủ — phải kèm đúng tháng, nếu không sẽ lấy nhầm kỳ cũ.
 * Chỉ ĐỀ XUẤT, người dùng vẫn nhìn thấy và sửa được.
 */
export function guessRegionSheets(sheetNames, regionCodes, baseMonth) {
  const monthNo = baseMonth ? Number(String(baseMonth).split('-')[1]) : null;
  const patterns = {
    MB: [/mi[eề]n\s*b[aắ]c/i, /\bmb\b/i, /north/i],
    MN: [/mi[eề]n\s*nam/i, /\bmn\b/i, /south/i]
  };

  const out = {};
  regionCodes.forEach((code) => {
    const tests = patterns[code] || [new RegExp(`\\b${code}\\b`, 'i')];
    const matches = sheetNames.filter((n) => tests.some((re) => re.test(n)));
    if (!matches.length) return;
    // Ưu tiên sheet có đúng tháng gốc; "T9" phải không dính vào T19/T90
    const withMonth = monthNo
      ? matches.filter((n) => new RegExp(`t\\s*0?${monthNo}(?!\\d)`, 'i').test(n))
      : [];
    out[code] = (withMonth.length === 1 ? withMonth[0] : null) || (matches.length === 1 ? matches[0] : null);
  });
  return out;
}
