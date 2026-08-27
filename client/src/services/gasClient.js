/**
 * Transport duy nhất tới backend Google Apps Script.
 *
 * Nguyên tắc:
 *  - Không có fallback. Lỗi là lỗi, ném ra để giao diện hiển thị thật.
 *  - Mọi request đi bằng POST để token không lọt vào URL / lịch sử duyệt.
 *  - GAS trả lỗi bằng { error } kèm HTTP 200, nên phải kiểm tra field này.
 */

// URL Web App. Sau mỗi lần "Triển khai bản mới" trong Apps Script, dán URL
// mới vào đây (hoặc đặt biến môi trường VITE_GAS_URL khi build).
export const GAS_WEB_APP_URL =
  import.meta.env?.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbyyzw_uTdteqLobl6TB1DvcBxqE4BiorHFksXLx4Zc5jItQJD943vjXSynAecurccmS/exec';

export class ApiError extends Error {
  constructor(message, { unauthorized = false, forbidden = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.unauthorized = unauthorized;
    this.forbidden = forbidden;
  }
}

/** Danh sách hàm được gọi khi server báo phiên hết hạn. */
const unauthorizedHandlers = new Set();

export function onUnauthorized(handler) {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

/**
 * Gọi một action trên backend.
 * @param {string} action
 * @param {object} payload - tham số của action (đã gồm token nếu cần)
 */
export async function callGAS(action, payload = {}) {
  if (!GAS_WEB_APP_URL) {
    throw new ApiError('Chưa cấu hình URL Google Apps Script Web App.');
  }

  let res;
  try {
    res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      // text/plain để trình duyệt không gửi preflight — GAS không trả lời OPTIONS
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow'
    });
  } catch {
    throw new ApiError('Không kết nối được tới máy chủ. Kiểm tra kết nối mạng rồi thử lại.');
  }

  if (!res.ok) {
    throw new ApiError(`Máy chủ trả về lỗi ${res.status}. Có thể bản triển khai Apps Script đã thay đổi.`);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Thường gặp khi URL trỏ vào bản triển khai không còn tồn tại hoặc
    // chưa cấp quyền truy cập, khi đó Google trả về trang HTML đăng nhập.
    throw new ApiError('Máy chủ trả về dữ liệu không hợp lệ. Kiểm tra lại URL và quyền truy cập của Web App.');
  }

  if (data && data.error) {
    const message = String(data.error);
    if (message.startsWith('UNAUTHORIZED')) {
      const err = new ApiError(message.replace(/^UNAUTHORIZED:\s*/, ''), { unauthorized: true });
      unauthorizedHandlers.forEach((h) => h(err));
      throw err;
    }
    if (message.startsWith('FORBIDDEN')) {
      throw new ApiError(message.replace(/^FORBIDDEN:\s*/, ''), { forbidden: true });
    }
    throw new ApiError(message);
  }

  return data;
}
