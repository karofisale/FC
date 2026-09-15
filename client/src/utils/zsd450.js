/**
 * Đọc báo cáo ZSD450 (doanh thu SAP) thành sản lượng thực hiện theo mã hàng.
 *
 * Bố cục lấy từ file thật trong CLAUDE-OUTPUTS\Update Tuan (07, 08, 09/2026),
 * không dựng từ mô tả. Ba cái bẫy có trong file thật:
 *
 *   1. DÒNG 2 LÀ SỐ THỨ TỰ CỘT (1, 2, 3, …) chứ không phải dữ liệu. Dòng đó
 *      có "Mã khách" = 6 và "Số lượng xuất bán" = 12 — toàn số hợp lệ, nên
 *      nếu chỉ kiểm "ô có phải số không" thì nó lọt vào và cộng thêm 12 cái
 *      cho một mã hàng không tồn tại.
 *   2. Mã khách và mã vật tư về dưới dạng SỐ (1016243, không phải "1016243").
 *      So thẳng với chuỗi mã đơn vị khai trong danh mục thì không khớp dòng
 *      nào, và kết quả là "nhập 0 dòng" chứ không phải một lỗi.
 *   3. Một mã hàng có NHIỀU DÒNG trong tháng (mỗi hoá đơn một dòng) — phải
 *      cộng lại theo mã.
 */

/** Tên cột trong file ZSD450. Đổi tên cột ở SAP thì sửa đúng ở đây. */
export const ZSD450_COLUMNS = {
  soldTo: 'Mã khách',
  soldToName: 'Tên khách',
  sku: 'Mã vật tư',
  skuName: 'Tên vật tư',
  quantity: 'Số lượng xuất bán',
  month: 'Tháng_Năm',
  distChannel: 'Kênh bán hàng (Distribution channel)'
};

/** "1016243" và 1016243 phải là một. Mã có số 0 đứng đầu vẫn giữ nguyên. */
export function normalizeCode(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** "T09-2026" → "2026-09-01". Trả '' nếu không đọc được. */
export function parseZsdMonth(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^T?(\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, '0')}-01`;
  return '';
}

/**
 * Dòng đánh số cột: ô thứ i đúng bằng i+1. Kiểm nguyên dòng chứ không chỉ
 * vài ô đầu — một dòng dữ liệu thật hiếm khi trùng được quá ba ô liên tiếp.
 */
function isNumberingRow(row) {
  let khop = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === null || row[i] === '') continue;
    if (Number(row[i]) !== i + 1) return false;
    khop++;
  }
  return khop >= 5;
}

/**
 * @param {Array<Array>} aoa  sheet đọc với { header: 1, raw: true }
 * @param {object} p
 * @param {string} p.soldTo   mã khách của đơn vị cần lấy; để trống = lấy tất cả
 * @param {string} [p.month]  'YYYY-MM-01'; để trống = lấy mọi tháng có trong file
 * @returns {{
 *   bySku: Object<string, number>, skuNames: Object<string, string>,
 *   rowsRead: number, rowsMatched: number,
 *   soldToSeen: Array<{code: string, name: string, rows: number}>,
 *   monthsSeen: Array<string>, missingColumns: Array<string>
 * }}
 */
export function parseZsd450(aoa, { soldTo = '', month = '' } = {}) {
  const wantSoldTo = normalizeCode(soldTo);
  const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((v) => v !== null && v !== ''));
  if (!rows.length) {
    return {
      bySku: {}, skuNames: {}, rowsRead: 0, rowsMatched: 0,
      soldToSeen: [], monthsSeen: [], missingColumns: Object.values(ZSD450_COLUMNS)
    };
  }

  const header = rows[0].map((h) => String(h ?? '').trim());
  const at = {};
  const missingColumns = [];
  Object.entries(ZSD450_COLUMNS).forEach(([key, label]) => {
    const i = header.indexOf(label);
    if (i < 0) missingColumns.push(label);
    at[key] = i;
  });
  // Thiếu một trong bốn cột này thì không đọc được gì có nghĩa — dừng và nói rõ
  // thiếu cột nào, thay vì trả về một bảng rỗng trông như "tháng đó không bán".
  if (['soldTo', 'sku', 'quantity', 'month'].some((k) => at[k] < 0)) {
    return {
      bySku: {}, skuNames: {}, rowsRead: 0, rowsMatched: 0,
      soldToSeen: [], monthsSeen: [], missingColumns
    };
  }

  const bySku = {};
  const skuNames = {};
  const soldToCount = {};
  const soldToName = {};
  const months = {};
  let rowsRead = 0;
  let rowsMatched = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (isNumberingRow(r)) continue;

    const sku = normalizeCode(r[at.sku]);
    if (!sku) continue;
    rowsRead++;

    const kh = normalizeCode(r[at.soldTo]);
    if (kh) {
      soldToCount[kh] = (soldToCount[kh] || 0) + 1;
      if (at.soldToName >= 0 && !soldToName[kh]) soldToName[kh] = String(r[at.soldToName] ?? '').trim();
    }
    const m = parseZsdMonth(r[at.month]);
    if (m) months[m] = true;

    if (wantSoldTo && kh !== wantSoldTo) continue;
    if (month && m !== month) continue;

    // Hoá đơn trả lại về số âm — cộng vào chứ không bỏ, để ra sản lượng thuần.
    const qty = Number(r[at.quantity]);
    if (!Number.isFinite(qty)) continue;

    bySku[sku] = (bySku[sku] || 0) + qty;
    if (at.skuName >= 0 && !skuNames[sku]) skuNames[sku] = String(r[at.skuName] ?? '').trim();
    rowsMatched++;
  }

  return {
    bySku,
    skuNames,
    rowsRead,
    rowsMatched,
    soldToSeen: Object.keys(soldToCount)
      .map((c) => ({ code: c, name: soldToName[c] || '', rows: soldToCount[c] }))
      .sort((a, b) => b.rows - a.rows),
    monthsSeen: Object.keys(months).sort(),
    missingColumns
  };
}
