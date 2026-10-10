/**
 * Cờ "có thay đổi chưa lưu" dùng chung toàn app, để chặn việc đổi tab
 * (Sidebar) hoặc đổi đơn vị (Header) làm mất trắng dữ liệu đang nhập dở
 * mà không hỏi lại — đây là điều hướng bằng React state, trình duyệt
 * không biết nên window.beforeunload không bắt được, phải tự chặn ở
 * App.jsx/Header.jsx trước khi cho đổi.
 *
 * Mỗi trang có lưới nhập (MonthlyForecast, WeeklyForecast, Actuals) gọi
 * setDirty(true/false) theo state dirtyKeys của chính nó khi mount/đổi.
 */
let dirty = false;
let reason = '';

export function setDirty(isDirty, message = 'Bạn có thay đổi chưa lưu. Rời khỏi trang sẽ mất dữ liệu này.') {
  dirty = isDirty;
  reason = message;
}

export function isDirty() {
  return dirty;
}

/**
 * Hỏi xác nhận nếu đang dirty; trả về true nếu được phép điều hướng tiếp.
 *
 * @param {string} [hanhDong] việc sắp làm, vd 'Đổi chu kỳ' — dùng khi việc đó
 *   không phải rời trang mà là nạp lại lưới NGAY TRÊN trang (đổi chu kỳ / bản
 *   cập nhật / tháng / năm). Mất ô chưa lưu y hệt rời trang, nên phải hỏi
 *   giống hệt; chỉ câu chữ khác cho đúng việc người dùng vừa bấm.
 */
export function confirmNavigateAway(hanhDong) {
  if (!dirty) return true;
  const cauHoi = hanhDong
    ? hanhDong + ' sẽ BỎ các thay đổi chưa lưu này. Vẫn tiếp tục?'
    : 'Bạn có chắc muốn rời khỏi trang này?';
  return window.confirm(reason + '\n\n' + cauHoi);
}
