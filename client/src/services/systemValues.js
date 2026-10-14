/**
 * GIÁ TRỊ HỆ THỐNG (14/10/2026) — các cài đặt DÙNG CHUNG CẢ HỆ THỐNG mà master chỉnh ở màn "Cài đặt hệ thống"
 * (khác Cài đặt cá nhân: services/settings.js). Máy chủ (fc-api: getSystemValues, mọi vai trò đọc được) trả về giá trị
 * ĐANG CÓ HIỆU LỰC hôm nay, dạng `{ values: { 'fc.horizonMonths': 4 } }`.
 *
 * Ở đây chỉ giữ một kho nhỏ trong bộ nhớ + hook đọc (utils/useSystemValues.js). THẤT BẠI NHẸ NHÀNG: bảng chưa có ở production,
 * mất mạng, hết phiên, máy chủ trả bậy... -> im lặng dùng MẶC ĐỊNH TÍCH HỢP (4 tháng như trước). Không ném lỗi, không báo lỗi.
 *
 * Giá trị sai (không phải số / ngoài khoảng) bị bỏ qua và dùng mặc định, cùng tinh thần services/settings.js.
 *
 * File thuần (không React, không import api.js): transport được cắm từ App.jsx (setSystemValuesTransport) nên kiểm thử được bằng node.
 */

export const KHOA_HORIZON = 'fc.horizonMonths';
/** Số tháng của chu kỳ MỚI khi chưa có cài đặt — đúng hành vi trước đây (cứng 4 tháng). */
export const HORIZON_MAC_DINH = 4;

/** Mặc định + kiểm hợp lệ của từng khoá đã biết (client chỉ DÙNG những khoá này; khoá lạ trả về vẫn giữ nhưng không ai đọc). */
export const DINH_NGHIA = {
  [KHOA_HORIZON]: { macDinh: HORIZON_MAC_DINH, kiem: (v) => Number.isInteger(v) && v >= 1 && v <= 12 }
};

let transport = null;            // () => Promise<{ values }>
let values = {};                 // khoá -> giá trị đã kiểm
let version = 0;
let doi = 0;                     // thế hệ: đăng xuất / đặt lại thì kết quả của lượt nạp cũ bị bỏ
const listeners = new Set();

export function setSystemValuesTransport(fn) { transport = fn; }

export function getSystemValuesVersion() { return version; }
export function subscribeSystemValues(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function bao() {
  version += 1;
  listeners.forEach((fn) => { try { fn(); } catch { /* bỏ qua */ } });
}

/** Giá trị hiện có của một khoá; thiếu / không hợp lệ -> mặc định (hoặc `macDinh` truyền vào cho khoá chưa khai báo). */
export function getSystemValue(key, macDinh) {
  const dn = DINH_NGHIA[key];
  const fb = dn ? dn.macDinh : macDinh;
  const v = values[key];
  if (v === undefined) return fb;
  return !dn || dn.kiem(v) ? v : fb;
}

/** Số tháng của chu kỳ MỚI theo cài đặt hệ thống (mặc định 4). */
export function getHorizonMonths() {
  return getSystemValue(KHOA_HORIZON);
}

/** Chuẩn hoá phản hồi máy chủ -> { khoá: số } chỉ gồm giá trị số hữu hạn; sai hình dạng -> null. */
export function chuanHoaGiaTri(res) {
  const v = res && res.values;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
  return out;
}

/** Đặt thẳng (kiểm thử / sau khi master lưu). Trả true nếu có đổi. */
export function setSystemValues(obj) {
  const moi = obj && typeof obj === 'object' ? obj : {};
  const ngang = JSON.stringify(moi) === JSON.stringify(values);
  values = { ...moi };
  if (!ngang) bao();
  return !ngang;
}

/** Quên hết (đăng xuất / đổi người dùng / kiểm thử): về mặc định và bỏ kết quả của lượt nạp còn dang dở. */
export function resetSystemValues() {
  doi += 1;
  const co = Object.keys(values).length > 0;
  values = {};
  if (co) bao();
}

/**
 * Nạp getSystemValues MỘT lần. KHÔNG BAO GIỜ ném lỗi. Trả true nếu nạp được; false -> vẫn dùng mặc định (im lặng).
 */
export async function loadSystemValues() {
  if (!transport) return false;
  const luc = doi;
  try {
    const kq = chuanHoaGiaTri(await transport());
    if (kq === null || luc !== doi) return false;
    setSystemValues(kq);
    return true;
  } catch {
    return false;
  }
}
