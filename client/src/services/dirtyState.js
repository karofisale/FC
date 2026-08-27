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

/** Hỏi xác nhận nếu đang dirty; trả về true nếu được phép điều hướng tiếp. */
export function confirmNavigateAway() {
  if (!dirty) return true;
  return window.confirm(reason + '\n\nBạn có chắc muốn rời khỏi trang này?');
}
