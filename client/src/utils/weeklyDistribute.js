/**
 * Rải đều số tháng 1 ra các ô tuần × miền (Bảng 1) — logic tách ra khỏi WeeklyForecast.jsx để dùng cho cả
 * nút "rải đều" từng dòng LẪN nút "rải đều tất cả dòng lệch" mà không có hai cách tính (Đợt 3).
 *
 * Quy tắc cũ, GIỮ NGUYÊN: mỗi ô nhận floor(tổng / số ô); phần dư dồn hết vào ô CUỐI CÙNG.
 * Khoá ô weeklyMap: `${sku}_${tuần}_${miền}`.
 */
export function chiaDeu(tong, soO) {
  const t = Number(tong) || 0;
  if (!soO) return { moiO: 0, phanDu: 0 };
  const moiO = Math.floor(t / soO);
  return { moiO, phanDu: t - moiO * soO };
}

/** Tuần dồn hợp lệ (số nguyên nằm trong danh sách tuần của tháng), ngược lại undefined = rải đều. */
export function tuanDonHopLe(tuanDon, tuan) {
  if (tuanDon === undefined || tuanDon === null || tuanDon === '') return undefined;
  const n = Number(tuanDon);
  return Number.isInteger(n) && tuan.indexOf(n) >= 0 ? n : undefined;
}

/**
 * Các bản cập nhật ({rowKey, col, value}) để phân bổ số tháng của MỘT SKU ra mọi ô tuần × miền.
 *  - tuanDon bỏ trống: RẢI ĐỀU ra mọi ô (cách cũ, giữ nguyên);
 *  - tuanDon = số tuần: DỒN TOÀN BỘ sản lượng tháng vào tuần đó (chia đều cho các miền của tuần, phần dư vào miền cuối),
 *    các tuần còn lại về 0 — giống rải đều ở chỗ ghi đủ MỌI ô, nên tổng tuần/miền luôn khớp số tháng.
 */
export function capNhatRaiDeu(sku, tongThang, tuan, mien, tuanDon) {
  const cot = tuan.flatMap((week) => mien.map((region) => ({ week, region })));
  if (!cot.length) return [];
  const don = tuanDonHopLe(tuanDon, tuan);
  if (don !== undefined) {
    const { moiO, phanDu } = chiaDeu(tongThang, mien.length);
    return cot.map((c) => ({ rowKey: sku, col: c, value: c.week !== don ? 0 : (c.region === mien[mien.length - 1] ? moiO + phanDu : moiO) }));
  }
  const { moiO, phanDu } = chiaDeu(tongThang, cot.length);
  return cot.map((c, i) => ({ rowKey: sku, col: c, value: i === cot.length - 1 ? moiO + phanDu : moiO }));
}

export const tongTuanCua = (sku, weeklyMap, tuan, mien) =>
  tuan.reduce((s, w) => s + mien.reduce((s2, r) => s2 + (weeklyMap[`${sku}_${w}_${r}`] || 0), 0), 0);

/** Số tuần/miền của SKU khác số tháng 1 -> dòng "lệch" (cùng định nghĩa với cột Lệch trên bảng). */
export const laDongLech = (sku, monthlyMap, weeklyMap, tuan, mien) =>
  tongTuanCua(sku, weeklyMap, tuan, mien) !== (monthlyMap[sku] || 0);

/** Tập mã SKU đang lệch — dùng để chốt danh sách khi lọc "chỉ dòng lệch" (không nhảy dòng khi đang gõ). */
export function tapSkuLech(danhSach, monthlyMap, weeklyMap, tuan, mien) {
  const s = new Set();
  danhSach.forEach((p) => { if (laDongLech(p.sku_code, monthlyMap, weeklyMap, tuan, mien)) s.add(String(p.sku_code)); });
  return s;
}

/**
 * Tính trước "rải đều tất cả dòng lệch" để HIỆN CHO NGƯỜI DÙNG xem trước rồi mới ghi:
 *  - tuanDon: nếu có thì dồn cả số tháng vào tuần đó thay vì rải đều (xem capNhatRaiDeu);
 *  - dong: số SKU sẽ được rải (lệch và có số tháng 1 > 0);
 *  - boQua: SKU lệch nhưng số tháng 1 = 0 — không rải (rải ra chỉ là xoá hết số tuần/miền; việc đó để người dùng tự làm);
 *  - oGhiDe: số ô đang có số khác 0 sẽ đổi giá trị;
 *  - updates: dạng onCellsChange.
 */
export function tinhRaiDeuTatCa({ danhSach, monthlyMap, weeklyMap, tuan, mien, tuanDon }) {
  const updates = [];
  let dong = 0;
  let boQua = 0;
  let oGhiDe = 0;
  danhSach.forEach((p) => {
    const sku = p.sku_code;
    if (!laDongLech(sku, monthlyMap, weeklyMap, tuan, mien)) return;
    const tong = monthlyMap[sku] || 0;
    if (!(tong > 0)) { boQua += 1; return; }
    dong += 1;
    capNhatRaiDeu(sku, tong, tuan, mien, tuanDon).forEach((u) => {
      const cu = weeklyMap[`${sku}_${u.col.week}_${u.col.region}`] || 0;
      if (cu !== 0 && cu !== u.value) oGhiDe += 1;
      updates.push(u);
    });
  });
  return { dong, boQua, oGhiDe, updates };
}
