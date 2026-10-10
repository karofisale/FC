/**
 * TOAST XẾP HÀNG ĐỢI (Rà soát 4 app, Đợt 2 mục 2).
 *
 * - Nhiều thông báo cùng lúc xếp chồng, KHÔNG thông báo sau xoá thông báo trước. Hiện tối đa
 *   MAX_VISIBLE cái; dư thì chờ trong hàng đợi và lên khi có chỗ.
 * - Thông báo thường tự tắt sau ~4 giây (đếm từ lúc nó THẬT SỰ hiện, không phải lúc xếp hàng).
 * - Thông báo lỗi KHÔNG tự tắt — phải có người đọc và bấm ×.
 * - Cùng nội dung + cùng loại đang có thì gộp lại (đếm "×n") thay vì chất thêm.
 *
 * File thuần (không React); <ToastHost> đăng ký nghe. Bộ đếm giờ thay được (configureToast)
 * để kiểm thử không phải chờ thật.
 */
export const MAX_VISIBLE = 4;
export const AUTO_DISMISS_MS = 4000;

let cfg = {
  setTimeout: (...a) => globalThis.setTimeout(...a),
  clearTimeout: (...a) => globalThis.clearTimeout(...a),
  maxVisible: MAX_VISIBLE,
  autoMs: AUTO_DISMISS_MS
};
let items = [];
let nextId = 1;
const timers = new Map();
const listeners = new Set();
let snapshot = { visible: [], waiting: 0 };

export function configureToast(opts = {}) {
  cfg = { ...cfg, ...opts };
}

/** Đặt lại toàn bộ (kiểm thử). */
export function resetToasts() {
  timers.forEach((h) => cfg.clearTimeout(h));
  timers.clear();
  items = [];
  nextId = 1;
  publish();
}

function publish() {
  // Lên giờ tắt cho các toast vừa lọt vào vùng hiện.
  const visible = items.slice(0, cfg.maxVisible);
  visible.forEach((t) => {
    if (t.duration > 0 && !timers.has(t.id)) {
      timers.set(t.id, cfg.setTimeout(() => dismissToast(t.id), t.duration));
    }
  });
  snapshot = { visible, waiting: Math.max(0, items.length - visible.length) };
  listeners.forEach((fn) => fn());
}

/**
 * @param {string} message
 * @param {{type?: 'success'|'error'|'warning'|'info', duration?: number}} opts
 *        duration: ms; 0 = không tự tắt. Mặc định: lỗi 0, còn lại 4000.
 * @returns {number} id
 */
export function showToast(message, opts = {}) {
  const text = String(message ?? '').trim();
  if (!text) return 0;
  const type = opts.type || 'info';
  const duration = opts.duration !== undefined ? opts.duration : (type === 'error' ? 0 : cfg.autoMs);

  const trung = items.find((t) => t.text === text && t.type === type);
  if (trung) {
    trung.count += 1;
    // Gộp thì cho sống thêm một chu kỳ mới, kẻo toast vừa bị bắn lại biến mất giữa chừng.
    if (timers.has(trung.id) && trung.duration > 0) {
      cfg.clearTimeout(timers.get(trung.id));
      timers.set(trung.id, cfg.setTimeout(() => dismissToast(trung.id), trung.duration));
    }
    items = items.slice();
    publish();
    return trung.id;
  }

  const t = { id: nextId++, text, type, duration, count: 1 };
  items = [...items, t];
  publish();
  return t.id;
}

export const toast = {
  success: (m, o) => showToast(m, { ...o, type: 'success' }),
  error: (m, o) => showToast(m, { ...o, type: 'error' }),
  warning: (m, o) => showToast(m, { ...o, type: 'warning' }),
  info: (m, o) => showToast(m, { ...o, type: 'info' })
};

export function dismissToast(id) {
  if (timers.has(id)) { cfg.clearTimeout(timers.get(id)); timers.delete(id); }
  const n = items.length;
  items = items.filter((t) => t.id !== id);
  if (items.length !== n) publish();
}

/**
 * Cầu nối cho các màn đã có sẵn kiểu setMessage({ type: 'success'|'error', text }):
 * đẩy thành toast. Gọi với null / không có text thì bỏ qua (không có gì để dọn: toast tự quản).
 */
export function thongBao(m) {
  if (!m || !m.text) return 0;
  const type = m.type === 'error' ? 'error' : m.type === 'warning' ? 'warning' : m.type === 'info' ? 'info' : 'success';
  return showToast(m.text, { type });
}

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getToastSnapshot() {
  return snapshot;
}
