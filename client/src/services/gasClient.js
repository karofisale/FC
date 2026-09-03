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
/**
 * Ngưỡng chờ TĂNG DẦN theo từng lần thử.
 *
 * Bản cũ đặt cứng 12 giây cho mọi lần thử, trong khi chính chú thích ở trên
 * ghi cold-start mất 30-42 giây. Hệ quả: tổng thời gian chờ vẫn ~40 giây
 * nhưng KHÔNG lần thử nào được phép chạy quá 12 giây, nên một lần khởi động
 * nguội luôn thất bại cả ba lượt rồi kết thúc bằng "Vui lòng tải lại trang"
 * — đúng vào lượt truy cập đầu buổi sáng hoặc ngay sau khi deploy.
 *
 * Lần đầu vẫn ngắn để thất bại nhanh khi thật sự có sự cố mạng; lần cuối đủ
 * dài để bắt được container vừa khởi động xong.
 */
const ATTEMPT_TIMEOUTS_MS = [12000, 25000, 45000];
const RETRY_DELAYS_MS = [1500, 3000];

/**
 * Action KHÔNG được tự thử lại khi lỗi tầng vận chuyển.
 *
 * Vòng thử lại không phân biệt được "request chưa tới server" với "request
 * đã chạy xong nhưng phản hồi về chậm". Với các action tạo mới, gửi lại lần
 * hai sẽ tạo chu kỳ/version/yêu cầu duyệt trùng, hoặc báo lỗi "đã tồn tại"
 * cho một lượt gọi thực ra đã thành công.
 *
 * saveMonthlyLines/saveWeeklySplits/saveActuals CỐ TÌNH không nằm trong danh
 * sách này: chúng là upsert theo khoá, gửi lại cùng payload cho ra đúng cùng
 * kết quả — mà đây lại là các action chạy thường xuyên nhất, cần được thử lại
 * khi mạng chập chờn.
 */
const NON_IDEMPOTENT_ACTIONS = new Set([
  'createCycle', 'createVersion', 'submitCycle', 'reopenCycle', 'decideApproval',
  'addProduct', 'addProducts', 'importProducts', 'changeMyPin', 'setUserPin',
  // Nhập SOP tạo ra một bản cập nhật mới. Gọi lại sau khi hết giờ chờ mà lần
  // trước thực ra đã chạy xong sẽ tạo bản THỨ HAI — đúng thứ danh sách này
  // sinh ra để chặn.
  'importSopFromSource'
]);

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
async function callOnce(action, payload, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

  const noRetry = NON_IDEMPOTENT_ACTIONS.has(action);
  const maxAttempt = noRetry ? 0 : RETRY_DELAYS_MS.length;
  let lastFailure = null;

  for (let attempt = 0; attempt <= maxAttempt; attempt++) {
    if (attempt > 0) {
      retryHandlers.forEach((h) => h({ action, attempt }));
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    // Action không thử lại thì cho hẳn ngưỡng chờ dài nhất ngay lần đầu —
    // chỉ có một cơ hội duy nhất nên phải đủ kiên nhẫn với cold start.
    const timeout = noRetry
      ? ATTEMPT_TIMEOUTS_MS[ATTEMPT_TIMEOUTS_MS.length - 1]
      : ATTEMPT_TIMEOUTS_MS[attempt];
    const result = await callOnce(action, payload, timeout);

    if (!result.transportError) {
      return handleData_(result.data);
    }

    lastFailure = result;
  }

  if (noRetry) {
    throw new ApiError(
      'Mất kết nối trong lúc gửi yêu cầu, và hệ thống KHÔNG tự gửi lại để tránh ' +
      'tạo dữ liệu trùng. Hãy tải lại trang để kiểm tra thao tác vừa rồi đã được ' +
      'ghi nhận hay chưa, rồi mới làm lại nếu cần.'
    );
  }

  // Hết số lần thử — báo lỗi đúng với nguyên nhân tầng vận chuyển cuối cùng
  if (lastFailure.transportError === 'network') {
    throw new ApiError('Không kết nối được tới máy chủ. Kiểm tra kết nối mạng rồi thử lại.');
  }
  if (lastFailure.transportError === 'timeout' || lastFailure.transportError === 'status') {
    throw new ApiError(
      `Máy chủ phản hồi quá chậm (có thể đang khởi động lại sau thời gian nghỉ). ` +
      `Đã thử lại ${RETRY_DELAYS_MS.length} lần trong khoảng ${Math.round((ATTEMPT_TIMEOUTS_MS.reduce((a, b) => a + b, 0) + RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)) / 1000)}s. Vui lòng tải lại trang.`
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
