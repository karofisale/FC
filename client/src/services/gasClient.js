/**
 * Transport duy nhất tới backend Google Apps Script.
 *
 * Nguyên tắc:
 *  - Không có fallback. Lỗi là lỗi, ném ra để giao diện hiển thị thật.
 *  - Mọi request đi bằng POST để token không lọt vào URL / lịch sử duyệt.
 *  - GAS trả lỗi bằng { error } kèm HTTP 200, nên phải kiểm tra field này.
 *  - Tự thử lại khi gặp lỗi TẦNG VẬN CHUYỂN (xem RETRY bên dưới) — không
 *    bao giờ thử lại khi đã nhận được JSON hợp lệ, kể cả JSON đó là lỗi
 *    nghiệp vụ (PIN sai, hết quyền...).
 */

// URL Web App. Sau mỗi lần "Triển khai bản mới" trong Apps Script, dán URL
// mới vào đây (hoặc đặt biến môi trường VITE_GAS_URL khi build).
export const GAS_WEB_APP_URL =
  import.meta.env?.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbyyzw_uTdteqLobl6TB1DvcBxqE4BiorHFksXLx4Zc5jItQJD943vjXSynAecurccmS/exec';

/**
 * Apps Script Web App "ngủ" khi không có request nào một lúc, hoặc reset
 * hoàn toàn ngay sau mỗi lần deploy bản mới. Lần gọi đầu tiên sau đó phải
 * khởi động lại container — đo thực tế lần cold-start mất tới 30-42 giây
 * TRƯỚC KHI hạ tầng phía trước của Google bỏ cuộc và trả về trang lỗi
 * HTML (thường kèm status 404) thay vì JSON thật.
 *
 * Vì vậy retry KHÔNG được chờ trọn từng lần gọi thất bại — bản đầu tiên
 * mắc lỗi này: chờ hết ~40s mỗi lần, 3 lần thử tệ nhất cộng dồn hơn 2
 * phút, y hệt như treo máy. ATTEMPT_TIMEOUT_MS chủ động huỷ một lượt gọi
 * nếu quá lâu để THẤT BẠI NHANH rồi thử lại ngay, thay vì chờ Google tự
 * bỏ cuộc. Ngưỡng chọn cao hơn hẳn thời gian gọi thực tế khi đã "ấm"
 * (đo được 1-5 giây kể cả có đọc Sheet), nên không cắt ngang một lượt
 * gọi hợp lệ đang chạy chậm.
 */
const ATTEMPT_TIMEOUT_MS = 12000;
const RETRY_DELAYS_MS = [1500, 3000];

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

/** Danh sách hàm được gọi mỗi khi bắt đầu một lượt thử lại (để hiện "đang thử lại..."). */
const retryHandlers = new Set();

export function onRetry(handler) {
  retryHandlers.add(handler);
  return () => retryHandlers.delete(handler);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Một lần gọi thô, không thử lại. Trả về { transportError } khi lỗi tầng vận chuyển. */
async function callOnce(action, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      // text/plain để trình duyệt không gửi preflight — GAS không trả lời OPTIONS
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (err) {
    return { transportError: err?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    return { transportError: 'status', status: res.status };
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { transportError: 'invalid-json' };
  }

  return { data };
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

  let lastFailure = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      retryHandlers.forEach((h) => h({ action, attempt }));
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    const result = await callOnce(action, payload);

    if (!result.transportError) {
      return handleData_(result.data);
    }

    lastFailure = result;
  }

  // Hết số lần thử — báo lỗi đúng với nguyên nhân tầng vận chuyển cuối cùng
  if (lastFailure.transportError === 'network') {
    throw new ApiError('Không kết nối được tới máy chủ. Kiểm tra kết nối mạng rồi thử lại.');
  }
  if (lastFailure.transportError === 'timeout' || lastFailure.transportError === 'status') {
    throw new ApiError(
      `Máy chủ phản hồi quá chậm (có thể đang khởi động lại sau thời gian nghỉ). ` +
      `Đã thử lại ${RETRY_DELAYS_MS.length} lần trong khoảng ${Math.round((ATTEMPT_TIMEOUT_MS * (RETRY_DELAYS_MS.length + 1) + RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)) / 1000)}s. Vui lòng tải lại trang.`
    );
  }
  throw new ApiError('Máy chủ trả về dữ liệu không hợp lệ. Kiểm tra lại URL và quyền truy cập của Web App.');
}

function handleData_(data) {
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
