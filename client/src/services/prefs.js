/**
 * Nhớ lựa chọn của người dùng giữa các lần mở app (chu kỳ, tháng, tab, bộ lọc) và các tuỳ chọn ở màn Cài đặt (khoá `st.*`).
 *
 * localStorage có thể ném lỗi hoặc không có: chế độ riêng tư của một số trình
 * duyệt, bị chặn cookie/site data, hoặc chạy ngoài trình duyệt (kiểm thử). Mọi
 * đọc/ghi đều bọc try/catch — mất ghi nhớ thì chỉ phải chọn lại, tuyệt đối không
 * được làm hỏng chức năng chính.
 *
 * `validate` cắt giá trị cũ không còn hợp lệ (đơn vị đã bị gỡ quyền, tab đã đổi tên...)
 * để khôi phục không bao giờ đưa app vào trạng thái lạ: sai thì dùng `fallback`.
 *
 * THEO TỪNG NGƯỜI DÙNG (14/10/2026). Trước đó khoá chỉ theo TRÌNH DUYỆT: hai người dùng chung một máy
 * thấy chung `bu`, `tab`, `cycle:<đơn vị>`... Nay khi đã biết người dùng (setPrefsUser, gọi từ auth.js
 * ngay khi có phiên) mọi khoá nằm dưới `karofi_fc_pref:@<id>:<khoá>`. Chưa biết người dùng (màn đăng nhập)
 * thì giữ cách cũ `karofi_fc_pref:<khoá>` — để hành vi không đổi với mã cũ và bài kiểm thử cũ.
 *
 * MIGRATE MỘT LẦN: lần đầu một người dùng được gắn, mọi khoá cũ chưa có tiền tố `@` (và khoá thô
 * `karofi_fc_sidebar_collapsed` của menu) được chép sang khoá của người đó RỒI XOÁ khỏi chỗ cũ. Xoá là
 * điều giữ cho "một lần": người thứ hai trên cùng máy bắt đầu sạch thay vì thừa hưởng lựa chọn của người
 * thứ nhất. (Người đầu tiên đăng nhập sau bản này thừa hưởng — chấp nhận được, đó gần như chắc là
 * người đã tạo ra các giá trị đó.)
 *
 * Bản sao trên máy chủ (services/prefsSync.js) nằm cạnh file này: nó nghe `onPrefWrite` để biết khoá nào vừa
 * đổi, và ghi giá trị từ máy chủ về bằng `savePref(key, value, { silent: true })` để không dội lại.
 */
export const PREFIX = 'karofi_fc_pref:';
export const META_PREFIX = 'karofi_fc_prefsync:';
const KHOA_MENU_CU = 'karofi_fc_sidebar_collapsed';

let userId = '';
let storageOverride = null;
let version = 0;
const writeListeners = new Set();
const versionListeners = new Set();

/** Chỉ cho kiểm thử: thay nơi lưu (null = dùng window.localStorage). */
export function __setStorageForTest(store) {
  storageOverride = store;
}

/** Chỉ cho kiểm thử: quên người dùng hiện tại và bộ nghe. */
export function __resetPrefsForTest() {
  userId = '';
  storageOverride = null;
  version = 0;
  writeListeners.clear();
  versionListeners.clear();
}

function store() {
  return storageOverride || window.localStorage;
}

const prefixOf = (id) => (id ? PREFIX + '@' + encodeURIComponent(id) + ':' : PREFIX);

function fullKey(key) {
  return prefixOf(userId) + key;
}

export function getPrefsUser() {
  return userId;
}

/**
 * Gắn người dùng hiện tại. Gọi lại với cùng id thì không làm gì. id rỗng thì GIỮ người cũ
 * (hết phiên giữa chừng: người dùng vẫn là người đó, đừng rơi về khoá chung của trình duyệt).
 */
export function setPrefsUser(id) {
  const next = String(id ?? '').trim();
  if (!next || next === userId) return;
  userId = next;
  migrateLegacy(next);
  bumpPrefsVersion();
}

function migrateLegacy(id) {
  try {
    const s = store();
    const legacy = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX) && !k.startsWith(PREFIX + '@')) legacy.push(k);
    }
    const dich = prefixOf(id);
    for (const k of legacy) {
      const ten = k.slice(PREFIX.length);
      if (s.getItem(dich + ten) === null) s.setItem(dich + ten, s.getItem(k));
      s.removeItem(k);
    }
    // Menu thu gọn: trước đây khoá thô '1' / '0' ngoài hệ nhớ lựa chọn.
    const raw = s.getItem(KHOA_MENU_CU);
    if (raw !== null) {
      if (s.getItem(dich + 'sidebarCollapsed') === null) s.setItem(dich + 'sidebarCollapsed', JSON.stringify(raw === '1'));
      s.removeItem(KHOA_MENU_CU);
    }
  } catch {
    // không có / không đọc được localStorage: không có gì để chuyển
  }
}

export function loadPref(key, fallback, validate) {
  try {
    const raw = store().getItem(fullKey(key));
    if (raw === null || raw === undefined) return fallback;
    const value = JSON.parse(raw);
    if (typeof validate === 'function' && !validate(value)) return fallback;
    return value;
  } catch {
    return fallback;
  }
}

function emitWrite(key, silent) {
  writeListeners.forEach((fn) => {
    try { fn({ key, user: userId, silent: !!silent }); } catch { /* bộ nghe hỏng không được làm hỏng việc ghi */ }
  });
}

/** opts.silent: ghi từ máy chủ về — không báo cho bộ đồng bộ (tránh dội lại). Giá trị không đổi thì cũng không báo. */
export function savePref(key, value, opts = {}) {
  try {
    const moi = JSON.stringify(value);
    const k = fullKey(key);
    const cu = store().getItem(k);
    store().setItem(k, moi);
    if (cu !== moi) emitWrite(key, opts.silent);
    return true;
  } catch {
    return false;
  }
}

export function clearPref(key, opts = {}) {
  try {
    const k = fullKey(key);
    const cu = store().getItem(k);
    store().removeItem(k);
    if (cu !== null && cu !== undefined) emitWrite(key, opts.silent);
  } catch {
    // không xoá được thì thôi
  }
}

/** Mọi khoá đang có của người dùng hiện tại (không kèm tiền tố). Rỗng khi không liệt kê được. */
export function listPrefKeys() {
  try {
    const s = store();
    const dau = prefixOf(userId);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k || !k.startsWith(dau)) continue;
      const ten = k.slice(dau.length);
      // Chưa biết người dùng: đừng nuốt khoá của người khác (@...)
      if (!userId && k.startsWith(PREFIX + '@')) continue;
      out.push(ten);
    }
    return out;
  } catch {
    return [];
  }
}

/** Nghe mọi lần ghi/xoá (trừ ghi im lặng sẽ có cờ silent). Trả hàm gỡ. */
export function onPrefWrite(fn) {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

// ----- phiên bản: để React vẽ lại khi giá trị đổi từ NGOÀI luồng của màn đang mở (đồng bộ máy chủ, áp mặc định) -----
export function getPrefsVersion() {
  return version;
}
export function bumpPrefsVersion() {
  version += 1;
  versionListeners.forEach((fn) => { try { fn(); } catch { /* bỏ qua */ } });
}
export function subscribePrefsVersion(fn) {
  versionListeners.add(fn);
  return () => versionListeners.delete(fn);
}

// ----- siêu dữ liệu của bộ đồng bộ (danh sách khoá chưa gửi, cờ đã tải lên lần đầu) — theo người dùng, ngoài không gian khoá nhớ -----
const metaKey = (name) => META_PREFIX + (userId ? '@' + encodeURIComponent(userId) + ':' : '') + name;

export function loadMeta(name, fallback) {
  try {
    const raw = store().getItem(metaKey(name));
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveMeta(name, value) {
  try {
    store().setItem(metaKey(name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
