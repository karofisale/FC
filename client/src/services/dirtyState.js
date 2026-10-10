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
import { appConfirm } from './dialogService.js';

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
 * Hỏi xác nhận nếu đang dirty; trả về Promise<boolean> — true nếu được phép điều hướng tiếp.
 *
 * ĐỢT 2 (10/10/2026): hỏi bằng hộp thoại chung của app (services/dialogService.js), KHÔNG còn là
 * window.confirm của trình duyệt. Chữ ký giữ nguyên (cùng tên, cùng tham số `hanhDong`), nhưng vì hộp
 * thoại của app không chặn luồng như hộp của trình duyệt nên kết quả là Promise: nơi gọi viết
 *   if (!(await confirmNavigateAway('Đổi chu kỳ'))) return;
 * Không dirty thì Promise resolve true NGAY, không hỏi.
 *
 * @param {string} [hanhDong] việc sắp làm, vd 'Đổi chu kỳ' — dùng khi việc đó
 *   không phải rời trang mà là nạp lại lưới NGAY TRÊN trang (đổi chu kỳ / bản
 *   cập nhật / tháng / năm). Mất ô chưa lưu y hệt rời trang, nên phải hỏi
 *   giống hệt; chỉ câu chữ khác cho đúng việc người dùng vừa bấm.
 */
export async function confirmNavigateAway(hanhDong) {
  if (!dirty) return true;
  const cauHoi = hanhDong
    ? hanhDong + ' sẽ BỎ các thay đổi chưa lưu này. Vẫn tiếp tục?'
    : 'Bạn có chắc muốn rời khỏi trang này?';
  return appConfirm(reason + '\n\n' + cauHoi, {
    title: hanhDong ? hanhDong + '?' : 'Rời khỏi trang?',
    okLabel: hanhDong ? 'Bỏ thay đổi và tiếp tục' : 'Rời khỏi trang',
    cancelLabel: 'Ở lại',
    danger: true
  });
}

/**
 * Điều hướng RỜI HẲN trang (link sang Portal / app khác, đăng xuất về cổng): hỏi như trên rồi, nếu đồng ý,
 * gỡ cờ dirty trước khi đi — nếu không, beforeunload của trình duyệt sẽ hỏi LẦN THỨ HAI ngay sau khi
 * người dùng đã đồng ý ở hộp thoại của app.
 */
export async function confirmLeaveApp(hanhDong) {
  if (!(await confirmNavigateAway(hanhDong))) return false;
  setDirty(false);
  return true;
}
