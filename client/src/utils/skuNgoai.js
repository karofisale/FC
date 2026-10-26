/**
 * SKU ngoài danh mục của đơn vị nhưng CÓ số dự báo tháng (26/10/2026, user chốt: hiện thành dòng riêng VÀ tính vào tổng).
 *
 * getProducts_ lọc danh mục theo kênh mặc định, còn getMonthlyLines_ trả MỌI dòng của bản — nên mã của kênh khác mà có dòng trong chu kỳ
 * này từng biến mất khỏi bảng (không tìm thấy khi tìm mã) dù cảnh báo vẫn thấy số. Giờ các mã đó được dựng thêm thành dòng có nhãn.
 * Danh sách được CHỐT lúc tải dữ liệu (không tính lại theo từng phím gõ): gõ 0 vào ô cuối cùng của một dòng không làm dòng biến mất
 * dưới con trỏ — cùng lý do với bộ lọc "chỉ hiện SKU có số lượng".
 */

/** Mã (đã trim) có ít nhất một tháng khác 0 trong forecastMap (khoá `${mã}_${tháng}`) mà không thuộc danh mục `products`. Sắp theo mã. */
export function maNgoaiDanhMucThang(products, forecastMap) {
  const co = new Set(products.map((p) => String(p.sku_code).trim()));
  const ra = new Set();
  Object.keys(forecastMap).forEach((khoa) => {
    if (!(forecastMap[khoa] || 0)) return;
    const ma = khoa.slice(0, khoa.lastIndexOf('_')).trim();
    if (ma && !co.has(ma)) ra.add(ma);
  });
  return [...ra].sort((a, b) => a.localeCompare(b));
}

/**
 * Dòng để vẽ cho các mã ngoài danh mục: lấy đủ thông tin (tên, nhóm, giá, kênh) từ danh mục MỌI kênh nếu đã tra được,
 * chưa tra được / không có trong danh mục thì chỉ có mã. Luôn gắn _ngoai để bảng vẽ nhãn.
 */
export function dongNgoaiDanhMuc(maList, thongTin) {
  return maList.map((ma) => {
    const sp = (thongTin && thongTin[ma]) || {};
    return { ...sp, sku_code: ma, name: sp.name || ma, product_group_code: sp.product_group_code || '', _ngoai: true };
  });
}
