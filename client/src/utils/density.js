/**
 * MẬT ĐỘ BẢNG (Cài đặt → Giao diện). "Gọn" = lớp `dens-gon` trên <html>: index.css thu hẹp đệm dọc của ô bảng.
 *
 * Các bảng dài (Forecast tháng, Chia tuần & miền, Sản lượng, Danh mục SKU) cuộn ảo với CHIỀU CAO DÒNG ƯỚC LƯỢNG cố định
 * (ROW_HEIGHT_PX 37 / 39) — nên khi dòng thấp đi thì ước lượng phải thấp đi cùng: useRowHeight() trả đúng chiều cao theo
 * mật độ hiện tại. Số GON_* là chiều cao dòng ĐO THẬT ở trang thử (app-harness) sau khi áp quy tắc trong index.css.
 */
export const LOP_GON = 'dens-gon';
/** Mỗi dòng bảng thấp đi bao nhiêu px ở chế độ Gọn (đo thật; xem index.css). */
export const GON_BOT_PX = 8;

export function applyDensity(density) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(LOP_GON, density === 'gon');
}

/** Chiều cao dòng ước lượng theo mật độ (thuần, kiểm thử được). */
export function rowHeightFor(base, density) {
  return density === 'gon' ? base - GON_BOT_PX : base;
}
