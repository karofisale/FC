/**
 * Quản lý phiên đăng nhập bằng PIN.
 *
 * Token do server cấp sau khi kiểm PIN; client chỉ giữ token và thông tin
 * hiển thị của người dùng. PIN không bao giờ được lưu lại ở trình duyệt.
 */
import { callGAS, ApiError } from './gasClient';
import { sharedSessionForFC, clearSharedSession } from './karofiSession';

const STORAGE_KEY = 'karofi_fc_session';

/**
 * Phiên dùng chung của cổng VHKD được ưu tiên hơn phiên riêng của FC.
 *
 * Lý do chọn thứ tự này: luồng chính là "đăng nhập ở cổng rồi mở app", nên
 * phiên vừa tạo ở cổng phải thắng phiên FC cũ còn sót trong localStorage.
 * Đổi lại, nếu hai người khác nhau dùng chung một trình duyệt và một người
 * đăng nhập trực tiếp ở FC, thì phiên cổng (nếu còn hạn) vẫn được dùng —
 * chấp nhận được vì mỗi người dùng máy riêng, và đăng xuất xoá cả hai.
 */
let session = sharedSessionForFC() || readStoredSession();

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persist(next) {
  session = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Trình duyệt chặn localStorage: phiên vẫn chạy trong bộ nhớ tới khi đóng tab
  }
}

export function getSession() {
  return session;
}

export function getToken() {
  return session?.token || null;
}

export function getCurrentUser() {
  return session?.user || null;
}

export async function login(userId, pin) {
  const trimmed = String(userId || '').trim();
  if (!trimmed) throw new ApiError('Nhập mã người dùng hoặc email.');
  if (!pin) throw new ApiError('Nhập mã PIN.');

  const res = await callGAS('login', { userId: trimmed, pin: String(pin) });
  if (!res?.token) throw new ApiError('Đăng nhập không thành công.');

  persist({ token: res.token, user: res.user, expiresAt: res.expiresAt });
  return res.user;
}

export async function logout() {
  const token = getToken();
  persist(null);
  clearSharedSession();   // đăng xuất một lần = ra khỏi cả ba app
  if (token) {
    try {
      await callGAS('logout', { token });
    } catch {
      // Phiên đã bị xoá phía client rồi, lỗi mạng lúc này không quan trọng
    }
  }
}

/** Xoá phiên tại chỗ, dùng khi server báo token hết hạn. */
export function clearSession() {
  if (session) persist(null);
  clearSharedSession();   // token dùng chung cũng đã hết hạn/không còn giá trị
}

export function hasRole(...roles) {
  const role = session?.user?.role;
  return !!role && roles.includes(role);
}

export function canEdit() {
  return hasRole('bu_editor', 'central_admin');
}

export function canApprove() {
  return hasRole('bu_approver', 'central_admin');
}

/** Đơn vị người dùng được phép thao tác; admin thì không giới hạn. */
export function allowedBUs(allBUs = []) {
  const user = getCurrentUser();
  if (!user) return [];
  if (user.role === 'central_admin' || user.role === 'viewer') return allBUs;
  return allBUs.filter((b) => b.code === user.business_unit_code);
}

export const ROLE_LABELS = {
  central_admin: 'Quản trị hệ thống',
  bu_editor: 'Lập kế hoạch',
  bu_approver: 'Thẩm định / Phê duyệt',
  viewer: 'Chỉ xem'
};
