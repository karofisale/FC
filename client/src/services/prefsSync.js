/**
 * ĐỒNG BỘ LỰA CHỌN CÁ NHÂN VỚI MÁY CHỦ (14/10/2026).
 *
 * Máy chủ (fc-api: getMyPrefs / setMyPrefs) giữ một bản sao theo TÀI KHOẢN để lựa chọn đi theo người dùng sang máy
 * khác; localStorage (services/prefs.js) vẫn là bộ nhớ đệm nhanh và là nơi mọi màn hình đọc.
 *
 *  - Đăng nhập / mở app: startPrefsSync() tải getMyPrefs MỘT lần rồi gộp vào máy — MÁY CHỦ THẮNG, trừ những khoá mà máy này
 *    đang có thay đổi chưa gửi được (danh sách "chờ gửi" lưu bền theo người dùng) thì giá trị ở máy thắng và được gửi lên.
 *  - LẦN ĐẦU (mỗi trình duyệt × người dùng): khoá nào máy có mà máy chủ chưa có thì tải lên một lần. Sau đó, khoá `st.*`
 *    vắng trên máy chủ nghĩa là đã bị khôi phục ở máy khác -> xoá ở đây (nếu cứ tải lên thì "Khôi phục mặc định" sẽ bị
 *    máy cũ phục hồi lại). Khoá nhớ thường (tab, bu...) vắng trên máy chủ thì để nguyên ở máy.
 *  - Ghi xuôi: mỗi lần savePref/clearPref đổi giá trị -> đánh dấu chờ gửi -> sau ~600ms gửi gộp, chỉ các khoá đã đổi
 *    (null = xoá). Tối đa 40 khoá / lượt (giới hạn máy chủ).
 *  - THẤT BẠI NHẸ NHÀNG: máy chủ chưa có bảng, mất mạng, hết hạn phiên... -> giữ giá trị ở máy, không báo lỗi chặn người
 *    dùng, thử lại sau (lùi dần, tối đa vài lần; có thay đổi mới thì thử lại từ đầu). Trạng thái hiện ở màn Cài đặt.
 *
 * File này không import api.js / auth.js: transport được cắm từ App.jsx (setPrefsTransport) nên kiểm thử bằng node
 * được với transport giả và bộ đếm giờ giả.
 */
import { loadPref, savePref, clearPref, listPrefKeys, onPrefWrite, loadMeta, saveMeta, getPrefsUser, setPrefsUser, bumpPrefsVersion } from './prefs.js';
import { laKhoaCaiDat } from './settings.js';

export const DEBOUNCE_MS = 600;
export const MAX_KEYS_PER_CALL = 40;
export const MAX_KEYS_PER_USER = 80;
export const MAX_VALUE_CHARS = 1000;
const KHOA_HOP_LE = /^[a-z][A-Za-z0-9_.:-]{0,47}$/;
const LUI_TOI_DA = 4;                 // số lượt thử lại tự động sau thất bại (có thay đổi mới thì đếm lại)
const LUI_BASE_MS = 20000;

/** Khoá nào được đồng bộ: các khoá nhớ đã biết + st.* + cycle:/dashCycle: theo đơn vị. Khoá lạ không đi (giữ trần 80 khoá/người). */
const KHOA_NHO_BIET = new Set([
  'tab', 'bu', 'annualYear', 'annualTien', 'annualKieu', 'actualsMonth', 'exportsMonth', 'monthlyGroup', 'monthlyOnlyNonZero',
  'weeklyOnlyNonZero', 'productsGroup', 'productsBU', 'dashCharts', 'sidebarCollapsed'
]);
export function laKhoaDongBo(key) {
  if (typeof key !== 'string' || !KHOA_HOP_LE.test(key)) return false;
  return KHOA_NHO_BIET.has(key) || laKhoaCaiDat(key) || /^(cycle|dashCycle):/.test(key);
}

let transport = null;                 // { get(): Promise<{prefs}>, set(changes): Promise }
let timers = {
  setTimeout: (...a) => globalThis.setTimeout(...a),
  clearTimeout: (...a) => globalThis.clearTimeout(...a)
};

const st = {
  user: '',
  active: false,                      // đã startPrefsSync cho người dùng này
  pending: new Map(),                 // khoá -> số thứ tự thay đổi (để biết khoá có bị sửa lại trong lúc đang gửi không)
  seq: 0,
  timer: null,
  sending: false,
  failures: 0,
  status: 'idle',                     // idle | ok | offline
  lastError: ''
};
const statusListeners = new Set();
let wired = false;

export function setPrefsTransport(t) { transport = t; }
export function configurePrefsSync(opts = {}) { timers = { ...timers, ...opts }; }

/** Đặt lại toàn bộ trạng thái trong bộ nhớ (kiểm thử, đổi người dùng). */
export function resetPrefsSync() {
  if (st.timer) timers.clearTimeout(st.timer);
  Object.assign(st, { user: '', active: false, pending: new Map(), seq: 0, timer: null, sending: false, failures: 0, status: 'idle', lastError: '' });
}

export function getSyncStatus() {
  return { status: st.status, pending: st.pending.size, lastError: st.lastError };
}
export function subscribeSyncStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
function baoTrangThai() {
  statusListeners.forEach((fn) => { try { fn(); } catch { /* bỏ qua */ } });
}
function setStatus(status, lastError = '') {
  const doi = st.status !== status;
  st.status = status;
  st.lastError = lastError;
  baoTrangThai();               // cả khi chỉ số khoá chờ gửi đổi — màn Cài đặt hiện "đang đồng bộ" theo đó
  if (doi) bumpPrefsVersion();
}

function persistPending() {
  saveMeta('pending', [...st.pending.keys()]);
}

function danhDau(key) {
  if (!laKhoaDongBo(key)) return;
  st.seq += 1;
  st.pending.set(key, st.seq);
  st.failures = 0;
  persistPending();
  baoTrangThai();
  hen(DEBOUNCE_MS);
}

function hen(ms) {
  if (!st.active) return;
  if (st.timer) timers.clearTimeout(st.timer);
  st.timer = timers.setTimeout(() => { st.timer = null; flush(); }, ms);
}

function layGiaTri(key) {
  const v = loadPref(key, undefined);
  return v === undefined || v === null ? null : v;
}

/**
 * Gửi các khoá đang chờ (≤ 40 / lượt, lặp tới khi hết). Không bao giờ ném lỗi. Trả true nếu đã hết hàng chờ.
 */
export async function flush() {
  if (!transport || !st.active || st.sending) return st.pending.size === 0;
  st.sending = true;
  try {
    while (st.pending.size > 0) {
      const lo = [...st.pending.entries()].slice(0, MAX_KEYS_PER_CALL);
      const changes = {};
      const guiDuoc = [];
      for (const [key, seq] of lo) {
        const v = layGiaTri(key);
        if (v !== null && JSON.stringify(v).length > MAX_VALUE_CHARS) {   // máy chủ sẽ từ chối cả lượt: bỏ riêng khoá này
          st.pending.delete(key);
          continue;
        }
        changes[key] = v;
        guiDuoc.push([key, seq]);
      }
      if (guiDuoc.length === 0) continue;
      try {
        await transport.set(changes);
      } catch (err) {
        st.failures += 1;
        persistPending();
        setStatus('offline', String(err?.message || err || ''));
        if (st.failures <= LUI_TOI_DA) hen(Math.min(LUI_BASE_MS * st.failures, 120000));
        return false;
      }
      // Chỉ bỏ khoá nếu trong lúc gửi nó không bị sửa lại.
      for (const [key, seq] of guiDuoc) if (st.pending.get(key) === seq) st.pending.delete(key);
      st.failures = 0;
    }
    persistPending();
    setStatus('ok');
    return true;
  } finally {
    st.sending = false;
  }
}

// Bộ nghe MỘT hàm cố định: đăng ký lại bao nhiêu lần cũng chỉ là một (Set), nên đổi người dùng / đặt lại không nhân đôi.
function nghe({ key, silent, user }) {
  if (silent || !st.active || user !== st.user) return;
  danhDau(key);
}

function noiDayNghe() {
  onPrefWrite(nghe);
  // Đóng tab / ẩn trang: gửi nốt những gì đang chờ (không đảm bảo, nhưng danh sách chờ lưu bền nên lần sau gửi tiếp).
  if (wired) return;
  wired = true;
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
  } catch { /* không có document */ }
}

const giongNhau = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Tải getMyPrefs, gộp, tải lên lần đầu, rồi gửi phần đang chờ. KHÔNG BAO GIỜ ném lỗi và không chặn: App chỉ chờ nó tối đa vài giây.
 * @returns {Promise<{ok:boolean, doi:string[]}>} doi = các khoá ở máy vừa bị máy chủ đổi
 */
export async function startPrefsSync(userId) {
  const doi = [];
  try {
    if (!transport) return { ok: false, doi };
    const id = String(userId ?? '').trim();
    if (!id) return { ok: false, doi };
    if (st.user !== id) resetPrefsSync();
    setPrefsUser(id);
    if (getPrefsUser() !== id) return { ok: false, doi };
    st.user = id;
    noiDayNghe();
    // Danh sách chờ gửi còn lại từ lần trước (đóng tab giữa chừng, máy chủ chưa có bảng...)
    for (const k of loadMeta('pending', [])) if (laKhoaDongBo(k) && !st.pending.has(k)) { st.seq += 1; st.pending.set(k, st.seq); }
    st.active = true;

    const res = await transport.get();
    const server = res && res.prefs && typeof res.prefs === 'object' && !Array.isArray(res.prefs) ? res.prefs : null;
    if (!server) throw new Error('Máy chủ trả dữ liệu cài đặt không hợp lệ.');

    // 1. Máy chủ thắng (trừ khoá đang chờ gửi)
    for (const [key, value] of Object.entries(server)) {
      if (!laKhoaDongBo(key) || st.pending.has(key)) continue;
      if (value === null || value === undefined) continue;
      if (!giongNhau(loadPref(key, undefined), value)) { savePref(key, value, { silent: true }); doi.push(key); }
    }

    // 2. Khoá của máy mà máy chủ chưa có
    const daLen = loadMeta('first', false) === true;
    for (const key of listPrefKeys()) {
      if (!laKhoaDongBo(key) || key in server || st.pending.has(key)) continue;
      if (!daLen) {
        st.seq += 1; st.pending.set(key, st.seq);                    // lần đầu: tải lên
      } else if (laKhoaCaiDat(key)) {
        clearPref(key, { silent: true }); doi.push(key);             // đã khôi phục ở máy khác
      }
    }
    // Trần 80 khoá/người ở máy chủ: không để lượt tải lần đầu vượt trần (khoá lạ đã bị lọc ở laKhoaDongBo).
    persistPending();
    if (doi.length) bumpPrefsVersion();

    const hetHang = await flush();
    if (hetHang && !daLen) saveMeta('first', true);
    if (!hetHang) return { ok: false, doi };
    return { ok: true, doi };
  } catch (err) {
    st.failures += 1;
    setStatus('offline', String(err?.message || err || ''));
    // Vẫn hẹn gửi lại phần đang chờ; lần tải đầu thất bại thì lần mở sau làm lại từ đầu.
    if (st.pending.size > 0 && st.failures <= LUI_TOI_DA) hen(Math.min(LUI_BASE_MS * st.failures, 120000));
    return { ok: false, doi };
  }
}

/** Dừng hẹn giờ (đăng xuất). Danh sách chờ đã lưu bền nên không mất. */
export function stopPrefsSync() {
  if (st.timer) timers.clearTimeout(st.timer);
  st.timer = null;
  st.active = false;
}
