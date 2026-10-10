/**
 * Nhớ lựa chọn của người dùng giữa các lần mở app (chu kỳ, tháng, tab, bộ lọc).
 *
 * localStorage có thể ném lỗi hoặc không có: chế độ riêng tư của một số trình
 * duyệt, bị chặn cookie/site data, hoặc chạy ngoài trình duyệt (kiểm thử). Mọi
 * đọc/ghi đều bọc try/catch — mất ghi nhớ thì chỉ phải chọn lại, tuyệt đối không
 * được làm hỏng chức năng chính.
 *
 * `validate` cắt giá trị cũ không còn hợp lệ (đơn vị đã bị gỡ quyền, tab đã đổi tên...)
 * để khôi phục không bao giờ đưa app vào trạng thái lạ: sai thì dùng `fallback`.
 */
const PREFIX = 'karofi_fc_pref:';

export function loadPref(key, fallback, validate) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    const value = JSON.parse(raw);
    if (typeof validate === 'function' && !validate(value)) return fallback;
    return value;
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearPref(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // không xoá được thì thôi
  }
}
