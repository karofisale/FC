/**
 * Định dạng tiền VNĐ cho người đọc (Rà soát 4 app, Đợt 3 — Tổng quan).
 *
 * Số đồng đầy đủ ("12.345.678.901 đ") khó đọc khi nằm làm dòng phụ của một cột. Ở những chỗ chỉ để
 * nắm quy mô thì rút gọn theo cách người Việt vẫn nói: 12,3 tỷ · 345 triệu. Số đầy đủ luôn đi kèm
 * ở tooltip (title) để ai cần đối chiếu vẫn thấy.
 *
 * Quy tắc làm tròn: tỷ lấy 1 số lẻ; triệu lấy 0 số lẻ từ 100 triệu trở lên, 1 số lẻ dưới đó;
 * dưới 1 triệu hiện nguyên số đồng. Làm tròn xong mà chạm mốc kế tiếp (999,96 triệu -> 1.000 triệu)
 * thì nhảy sang đơn vị lớn hơn để không hiện "1.000 triệu".
 */
const so = (n, le) => n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: le });

export function tienDayDu(v) {
  const n = Number(v);
  return (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('vi-VN') + ' đ';
}

export function tienRutGon(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0 đ';
  const dau = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return dau + so(Math.round(a / 1e8) / 10, 1) + ' tỷ đ';
  if (a >= 1e6) {
    const tr = a / 1e6;
    const lam = tr >= 100 ? Math.round(tr) : Math.round(tr * 10) / 10;
    if (lam >= 1000) return dau + so(Math.round(a / 1e8) / 10, 1) + ' tỷ đ';
    return dau + so(lam, tr >= 100 ? 0 : 1) + ' triệu đ';
  }
  return dau + so(Math.round(a), 0) + ' đ';
}
