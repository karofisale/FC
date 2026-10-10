/**
 * LÕI SẮP XẾP BẢNG (thuần, không React) — Rà soát 4 app, Đợt 2 mục 3.
 *
 * Quy tắc:
 *  - Kiểu cột: 'number' | 'text' | 'date'. Ô rỗng / không đọc được LUÔN xuống cuối, cả khi giảm dần.
 *  - Bấm một cột: tăng -> giảm -> bỏ sắp xếp (về thứ tự gốc).
 *  - Sắp xếp là một BẢN XEM: không bao giờ sửa mảng gốc, không động tới dữ liệu đang nhập.
 *  - Bảng có ô nhập: thứ tự được CHỐT lúc bấm (orderFrom) rồi dùng lại (applyOrder) cho tới lần bấm
 *    kế tiếp — sửa số trong ô KHÔNG làm dòng nhảy chỗ dưới con trỏ. Dòng mới (chưa có trong thứ
 *    tự đã chốt) nằm cuối theo thứ tự gốc.
 */
const collator = typeof Intl !== 'undefined' ? new Intl.Collator('vi', { sensitivity: 'base', numeric: true }) : null;

/** Chuyển giá trị ô thành khoá so sánh; null = rỗng (xuống cuối). */
export function sortKey(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'number') {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const s = String(value).trim();
    // Chuỗi số thường ('12.5') đọc thẳng; chuỗi kiểu vi-VN ('1.234,5') mới bỏ dấu chấm nghìn.
    const n = Number.isFinite(Number(s)) ? Number(s) : Number(s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'date') {
    const t = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return String(value).trim() === '' ? null : String(value);
}

function so(a, b, type) {
  if (type === 'text') return collator ? collator.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0);
  return a - b;
}

/**
 * @param {Array} rows
 * @param {{key: string, dir: 'asc'|'desc'}|null} spec
 * @param {Record<string, {type: string, get: (row) => any}>} columns
 * @returns {Array} mảng MỚI (ổn định: bằng nhau giữ thứ tự gốc); spec rỗng trả mảng sao chép thứ tự gốc
 */
export function sortRows(rows, spec, columns) {
  const out = rows.slice();
  const col = spec && columns && columns[spec.key];
  if (!col) return out;
  const dir = spec.dir === 'desc' ? -1 : 1;
  const keyed = out.map((row, i) => ({ row, i, k: sortKey(col.get(row), col.type) }));
  keyed.sort((x, y) => {
    if (x.k === null && y.k === null) return x.i - y.i;
    if (x.k === null) return 1;      // rỗng luôn cuối, bất kể chiều
    if (y.k === null) return -1;
    const c = so(x.k, y.k, col.type) * dir;
    return c !== 0 ? c : x.i - y.i;
  });
  return keyed.map((e) => e.row);
}

/** tăng -> giảm -> bỏ. */
export function nextSpec(spec, key) {
  if (!spec || spec.key !== key) return { key, dir: 'asc' };
  if (spec.dir === 'asc') return { key, dir: 'desc' };
  return null;
}

/** Thứ tự đã chốt: Map(khoá dòng -> vị trí). */
export function orderFrom(rows, spec, columns, getKey) {
  if (!spec) return null;
  const sorted = sortRows(rows, spec, columns);
  const m = new Map();
  sorted.forEach((r, i) => m.set(String(getKey(r)), i));
  return m;
}

/** Dùng lại thứ tự đã chốt cho `rows` hiện tại (dòng mới xuống cuối, giữ thứ tự gốc). */
export function applyOrder(rows, order, getKey) {
  if (!order) return rows;
  const out = rows.map((row, i) => ({ row, i, p: order.has(String(getKey(row))) ? order.get(String(getKey(row))) : Infinity }));
  out.sort((a, b) => (a.p === b.p ? a.i - b.i : a.p - b.p));
  return out.map((e) => e.row);
}

/** Giá trị aria-sort cho một cột. */
export function ariaSort(spec, key) {
  if (!spec || spec.key !== key) return 'none';
  return spec.dir === 'asc' ? 'ascending' : 'descending';
}
