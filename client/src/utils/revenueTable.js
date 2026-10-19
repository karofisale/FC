/**
 * Mô hình bảng DOANH THU THỰC HIỆN THEO THÁNG (19/10/2026, Đợt 12) — thuần, không đụng React / mạng, có test.
 *
 * Nguồn: fc.actual_revenue (cào ZSD450, cột "Doanh thu thuần VND" = sau chiết khấu / giảm giá, TRƯỚC thuế; trả hàng là số âm).
 * Phân biệt hai trường hợp mà người đọc dễ nhầm:
 *   - tháng CÓ dòng nhưng doanh thu 0 (vd chỉ có hàng tặng) → coSo = true, hiện "0 đ";
 *   - tháng KHÔNG có dòng nào (chưa cào / SAP không có dữ liệu) → coSo = false, hiện "—" và KHÔNG tính vào so sánh.
 */

const so = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const thangKey = (nam, thang) => `${nam}-${String(thang).padStart(2, '0')}-01`;

/** Phần trăm đổi so với kỳ trước; null nếu thiếu số một trong hai bên hoặc kỳ trước = 0 (không chia cho 0). */
export function phanTramDoi(hienTai, kyTruoc) {
  if (hienTai === null || hienTai === undefined || kyTruoc === null || kyTruoc === undefined) return null;
  const t = so(kyTruoc);
  if (t === 0) return null;
  return ((so(hienTai) - t) / Math.abs(t)) * 100;
}

/**
 * @param {Array<{month: string, netRevenueVnd: number, quantity: number, skus: number}>} months  từ api.getActualRevenue (có thể nhiều đơn vị → gộp theo tháng)
 * @param {number} nam  năm cần xem
 * @returns {{ rows, tong, tongNamTruoc, soThangCo, soThangNamTruocCo, maxDoanhThu }}
 */
export function dungBangDoanhThuNam(months, nam) {
  const theoThang = new Map();
  (months || []).forEach((m) => {
    const k = String(m.month || '').slice(0, 7) + '-01';
    const cur = theoThang.get(k) || { doanhThu: 0, soLuong: 0, soMa: 0 };
    cur.doanhThu += so(m.netRevenueVnd); cur.soLuong += so(m.quantity); cur.soMa += so(m.skus);
    theoThang.set(k, cur);
  });
  const lay = (n, t) => theoThang.get(thangKey(n, t)) || null;

  const rows = [];
  let tong = 0, tongNamTruoc = 0, soThangCo = 0, soThangNamTruocCo = 0, maxDoanhThu = 0;
  for (let t = 1; t <= 12; t++) {
    const cur = lay(nam, t), truoc = lay(nam - 1, t), thangTruoc = t > 1 ? lay(nam, t - 1) : lay(nam - 1, 12);
    if (cur) { tong += cur.doanhThu; soThangCo++; maxDoanhThu = Math.max(maxDoanhThu, Math.abs(cur.doanhThu)); }
    if (truoc) { tongNamTruoc += truoc.doanhThu; soThangNamTruocCo++; }
    rows.push({
      thang: t, key: thangKey(nam, t), coSo: !!cur,
      doanhThu: cur ? cur.doanhThu : null, soLuong: cur ? cur.soLuong : null, soMa: cur ? cur.soMa : null,
      namTruoc: truoc ? truoc.doanhThu : null,
      momPct: cur && thangTruoc ? phanTramDoi(cur.doanhThu, thangTruoc.doanhThu) : null,
      yoyPct: cur && truoc ? phanTramDoi(cur.doanhThu, truoc.doanhThu) : null
    });
  }
  rows.forEach((r) => { r.tyTrong = r.coSo && tong > 0 ? (r.doanhThu / tong) * 100 : null; });
  return { rows, tong, tongNamTruoc, soThangCo, soThangNamTruocCo, maxDoanhThu };
}

/** Chi tiết một tháng theo mã vật tư: thêm đơn giá thực tế = doanh thu thuần ÷ số lượng (0 nếu số lượng 0), xếp doanh thu giảm dần. */
export function chiTietThang(rows) {
  const tong = (rows || []).reduce((s, r) => s + so(r.netRevenueVnd), 0);
  return (rows || []).map((r) => ({
    skuCode: String(r.skuCode || ''), skuName: String(r.skuName || ''),
    soLuong: so(r.quantity), doanhThu: so(r.netRevenueVnd), soDong: so(r.invoiceLines),
    donGia: so(r.quantity) !== 0 ? so(r.netRevenueVnd) / so(r.quantity) : 0,
    tyTrong: tong !== 0 ? (so(r.netRevenueVnd) / tong) * 100 : null
  })).sort((a, b) => b.doanhThu - a.doanhThu || a.skuCode.localeCompare(b.skuCode));
}
