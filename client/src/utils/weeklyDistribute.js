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

/** Miền nhận khi dồn vào một tuần: miền được chọn nếu có trong danh sách, ngược lại MB, ngược lại miền đầu tiên. */
export function mienDonHopLe(mienDon, mien) {
  const m = String(mienDon === undefined || mienDon === null ? '' : mienDon).trim();
  if (m && mien.indexOf(m) >= 0) return m;
  return mien.indexOf('MB') >= 0 ? 'MB' : mien[0];
}

/**
 * Các bản cập nhật ({rowKey, col, value}) để phân bổ số tháng của MỘT SKU ra mọi ô tuần × miền.
 *  - tuanDon bỏ trống: RẢI ĐỀU ra mọi ô (cách cũ, giữ nguyên);
 *  - tuanDon = số tuần: DỒN TOÀN BỘ sản lượng tháng vào MỘT ô = tuần đó × một miền (mienDon; bỏ trống / không có trong danh sách thì
 *    lấy MB, không có MB thì miền đầu tiên) — KHÔNG tự chia cho các miền; mọi ô khác về 0. Giống rải đều ở chỗ ghi đủ MỌI ô,
 *    nên tổng tuần/miền luôn khớp số tháng.
 */
export function capNhatRaiDeu(sku, tongThang, tuan, mien, tuanDon, mienDon) {
  const cot = tuan.flatMap((week) => mien.map((region) => ({ week, region })));
  if (!cot.length) return [];
  const don = tuanDonHopLe(tuanDon, tuan);
  if (don !== undefined) {
    const mienDich = mienDonHopLe(mienDon, mien);
    const tong = Number(tongThang) || 0;
    return cot.map((c) => ({ rowKey: sku, col: c, value: c.week === don && c.region === mienDich ? tong : 0 }));
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
 *  - tuanDon (+ mienDon): nếu có thì dồn cả số tháng vào ô tuần × miền đó thay vì rải đều (xem capNhatRaiDeu);
 *  - tatCa: true = áp cho MỌI dòng có số tháng 1 > 0 (kể cả dòng đang khớp), không chỉ dòng lệch;
 *  - dong: số SKU sẽ được rải (lệch và có số tháng 1 > 0);
 *  - boQua: SKU lệch nhưng số tháng 1 = 0 — không rải (rải ra chỉ là xoá hết số tuần/miền; việc đó để người dùng tự làm);
 *  - oGhiDe: số ô đang có số khác 0 sẽ đổi giá trị;
 *  - updates: dạng onCellsChange.
 */
export function tinhRaiDeuTatCa({ danhSach, monthlyMap, weeklyMap, tuan, mien, tuanDon, mienDon, tatCa }) {
  const updates = [];
  let dong = 0;
  let boQua = 0;
  let oGhiDe = 0;
  danhSach.forEach((p) => {
    const sku = p.sku_code;
    const lech = laDongLech(sku, monthlyMap, weeklyMap, tuan, mien);
    if (!tatCa && !lech) return;   // tatCa: phân bổ lại cả dòng đang KHỚP (sửa bản thảo phân bổ sai cách, tổng vẫn khớp)
    const tong = monthlyMap[sku] || 0;
    if (!(tong > 0)) { if (lech) boQua += 1; return; }   // số tháng 0: không rải; chỉ ĐẾM dòng lệch để báo (dòng 0 khớp 0 không đáng báo)
    dong += 1;
    capNhatRaiDeu(sku, tong, tuan, mien, tuanDon, mienDon).forEach((u) => {
      const cu = weeklyMap[`${sku}_${u.col.week}_${u.col.region}`] || 0;
      if (cu !== 0 && cu !== u.value) oGhiDe += 1;
      updates.push(u);
    });
  });
  return { dong, boQua, oGhiDe, updates };
}

/**
 * Hoàn tác (25/10/2026): từ một đợt cập nhật ô ({rowKey, col, value}) và bảng hiện tại, lập "bước" ghi lại số CŨ của từng ô bị đổi.
 * Trả null nếu đợt đó không đổi ô nào (không đáng thành một bước hoàn tác).
 */
export function lapBuocHoanTac(updates, weeklyMap) {
  const cu = new Map();
  updates.forEach(({ rowKey, col, value }) => {
    const key = `${rowKey}_${col.week}_${col.region}`;
    if (cu.has(key)) return;   // cùng một ô xuất hiện hai lần: giữ số cũ NHẤT
    cu.set(key, weeklyMap[key] || 0);
  });
  const buoc = [...cu.entries()].map(([key, so]) => ({ key, cu: so }));
  const doi = updates.some(({ rowKey, col, value }) => (weeklyMap[`${rowKey}_${col.week}_${col.region}`] || 0) !== (Number(value) || 0));
  return doi ? buoc : null;
}

/** Áp một bước hoàn tác lên bảng: trả { weeklyMap, dirty } mới; ô trở về đúng số đã lưu thì hết "chưa lưu". */
export function apHoanTac(buoc, weeklyMap, dirtyKeys, daLuuMap) {
  const next = { ...weeklyMap };
  const dirty = new Set(dirtyKeys);
  buoc.forEach(({ key, cu }) => {
    next[key] = cu;
    if (cu === (daLuuMap[key] || 0)) dirty.delete(key); else dirty.add(key);
  });
  return { weeklyMap: next, dirty };
}
