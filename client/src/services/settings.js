/**
 * CÀI ĐẶT CÁ NHÂN (14/10/2026) — phần thuần của màn Cài đặt: định nghĩa, kiểm hợp lệ, mặc định, áp dụng.
 *
 * Lưu bằng cùng hệ nhớ lựa chọn (services/prefs.js, khoá `st.*`) nên được máy chủ đồng bộ theo tài khoản
 * (services/prefsSync.js) y như các khoá nhớ cũ. Không React, không window — kiểm thử được bằng node.
 *
 * "KHÔNG CÓ CÀI ĐẶT = HÀNH VI CŨ". Khoá `st.*` chỉ tồn tại khi người dùng CHỦ ĐỘNG chọn; vắng mặt nghĩa là
 * app chạy đúng như trước (nhớ lựa chọn lần cuối). `readSettings()` trả `null` cho các ô "tự động", và giá trị
 * hiệu lực cho các ô luôn có giá trị (mật độ, thời gian toast). Giá trị sai (máy chủ trả bậy, năm đã quá cũ, đơn vị
 * đã bị gỡ quyền, màn hình vai trò không còn thấy...) bị coi như chưa đặt — không bao giờ đưa app vào trạng thái lạ.
 *
 * MẶC ĐỊNH TƯỜNG MINH vs "NHỚ LỰA CHỌN LẦN CUỐI" cùng tồn tại như sau (chốt 14/10/2026):
 *  - Với các ô có khoá nhớ cũ (BU, trang đầu, năm / tiền / kiểu Kế hoạch năm, biểu đồ Tổng quan, ẩn dòng 0, menu thu gọn),
 *    cài đặt tường minh được GHI ĐÈ vào khoá nhớ ở lần mở app đầu tiên của mỗi phiên trình duyệt (seedRemembered) — và
 *    ngay lúc người dùng bấm ở màn Cài đặt. Sau đó mọi lựa chọn trong phiên vẫn được nhớ y như cũ (tải lại trang trong
 *    cùng tab KHÔNG ghi đè lại). Mở app ở tab/cửa sổ mới thì mặc định tường minh thắng lại.
 *  - Nhờ ghi đè vào khoá nhớ nên các màn hình không phải sửa gì: chúng vẫn chỉ đọc khoá nhớ.
 */
import { loadPref, savePref, clearPref, listPrefKeys } from './prefs.js';

export const ST = {
  density: 'st.density',
  sidebarCollapsed: 'st.sidebarCollapsed',
  landing: 'st.landing',
  bu: 'st.bu',
  annualYear: 'st.annualYear',
  annualTien: 'st.annualTien',
  annualKieu: 'st.annualKieu',
  dashCharts: 'st.dashCharts',
  onlyNonZero: 'st.onlyNonZero',
  toastSec: 'st.toastSec'
};
export const ST_KEYS = Object.values(ST);
export const laKhoaCaiDat = (k) => typeof k === 'string' && k.startsWith('st.');

export const MAT_DO = { thoang: 'Thoáng', gon: 'Gọn' };
export const THOI_GIAN_TOAST = [3, 4, 6, 10];
export const TOAST_MAC_DINH_GIAY = 4;
export const MAT_DO_MAC_DINH = 'thoang';

const laBool = (v) => typeof v === 'boolean';

/** Khoá nhớ cũ mà mỗi cài đặt tường minh được ghi đè vào (xem đầu file). */
export const KHOA_NHO = {
  [ST.sidebarCollapsed]: ['sidebarCollapsed'],
  [ST.annualYear]: ['annualYear'],
  [ST.annualTien]: ['annualTien'],
  [ST.annualKieu]: ['annualKieu'],
  [ST.dashCharts]: ['dashCharts'],
  [ST.onlyNonZero]: ['monthlyOnlyNonZero', 'weeklyOnlyNonZero']
};

/** Cửa sổ năm hợp lệ của Kế hoạch năm: năm hiện tại tới +2 (cùng luật AnnualPlan.laNamHopLe). */
export const laNamKeHoach = (v, namHienTai) => Number.isInteger(v) && v >= namHienTai && v <= namHienTai + 2;

/**
 * Kiểm MỘT cài đặt. ctx: { namHienTai, landingIds (mảng mã màn vai trò này được thấy), buCodes (đơn vị người này được chọn) }.
 * Thiếu phần ctx cần cho kiểm (landingIds / buCodes / namHienTai) thì chỉ kiểm kiểu, không kiểm tập giá trị.
 */
export function kiemCaiDat(key, v, ctx = {}) {
  switch (key) {
    case ST.density: return v === 'thoang' || v === 'gon';
    case ST.sidebarCollapsed: return laBool(v);
    case ST.landing: return typeof v === 'string' && /^[a-z]{2,20}$/.test(v) && (!Array.isArray(ctx.landingIds) || ctx.landingIds.includes(v));
    case ST.bu: return typeof v === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(v) && (!Array.isArray(ctx.buCodes) || ctx.buCodes.includes(v));
    case ST.annualYear: return Number.isInteger(v) && (ctx.namHienTai === undefined ? v >= 2000 && v <= 2100 : laNamKeHoach(v, ctx.namHienTai));
    case ST.annualTien: return v === 'VND' || v === 'USD';
    case ST.annualKieu: return v === 'khach' || v === 'sku';
    case ST.dashCharts: return laBool(v);
    case ST.onlyNonZero: return laBool(v);
    case ST.toastSec: return THOI_GIAN_TOAST.includes(v);
    default: return false;
  }
}

/**
 * Đọc toàn bộ cài đặt của người dùng hiện tại. `load` thay được để kiểm thử (mặc định loadPref).
 * Ô "tự động" không có giá trị hợp lệ -> null; mật độ & toast luôn có giá trị hiệu lực.
 */
export function readSettings(ctx = {}, load = loadPref) {
  const doc = (key) => load(key, undefined, (v) => kiemCaiDat(key, v, ctx));
  const orNull = (v) => (v === undefined ? null : v);
  return {
    density: doc(ST.density) ?? MAT_DO_MAC_DINH,
    toastSec: doc(ST.toastSec) ?? TOAST_MAC_DINH_GIAY,
    sidebarCollapsed: orNull(doc(ST.sidebarCollapsed)),
    landing: orNull(doc(ST.landing)),
    bu: orNull(doc(ST.bu)),
    annualYear: orNull(doc(ST.annualYear)),
    annualTien: orNull(doc(ST.annualTien)),
    annualKieu: orNull(doc(ST.annualKieu)),
    dashCharts: orNull(doc(ST.dashCharts)),
    onlyNonZero: orNull(doc(ST.onlyNonZero))
  };
}

/** Những khoá st.* ĐANG có giá trị tường minh hợp lệ — danh sách mà "Khôi phục mặc định" sẽ xoá. */
export function khoaTuongMinh(ctx = {}, load = loadPref) {
  return ST_KEYS.filter((k) => load(k, undefined, (v) => kiemCaiDat(k, v, ctx)) !== undefined);
}

/** Mọi khoá st.* còn nằm ở máy (kể cả giá trị sai) — để khôi phục dọn sạch cả rác. */
export function khoaCaiDatConLai(list = listPrefKeys) {
  return list().filter(laKhoaCaiDat);
}

/**
 * Ghi đè cài đặt tường minh vào khoá nhớ cũ (xem đầu file). `only`: chỉ các khoá st.* này (khi người dùng vừa đổi một ô).
 * Trả danh sách khoá nhớ đã ghi.
 */
export function seedRemembered(settings, only = null, save = savePref) {
  const map = {
    [ST.sidebarCollapsed]: settings.sidebarCollapsed,
    [ST.annualYear]: settings.annualYear,
    [ST.annualTien]: settings.annualTien,
    [ST.annualKieu]: settings.annualKieu,
    [ST.dashCharts]: settings.dashCharts,
    [ST.onlyNonZero]: settings.onlyNonZero
  };
  const ghi = [];
  for (const [stKey, value] of Object.entries(map)) {
    if (only && !only.includes(stKey)) continue;
    if (value === null || value === undefined) continue;
    for (const k of KHOA_NHO[stKey]) { save(k, value); ghi.push(k); }
  }
  return ghi;
}

/**
 * Quyết định tab + đơn vị lúc MỞ APP. Thuần — App gọi một lần sau khi tải xong danh mục.
 *   moDau        true khi đây là lần mở đầu tiên của phiên trình duyệt này (mặc định tường minh chỉ áp ở đây)
 *   coHash       địa chỉ có #tab hợp lệ -> #hash luôn thắng (link chia sẻ, tải lại trang)
 *   tabDaNho     tab hiện tại của App (đã tính #hash / tab nhớ lần cuối)
 *   buHienTai    đơn vị hiện tại của App (đã tính đơn vị nhớ), có thể rỗng / không còn quyền
 *   buCodes      các đơn vị người này được chọn; buCuaToi: đơn vị riêng của tài khoản
 * Trả { tab, bu }.
 */
export function quyetDinhKhoiDong({ moDau, coHash, tabDaNho, landing, bu, buHienTai, buCodes, buCuaToi }) {
  let tab = tabDaNho;
  if (moDau && !coHash && landing) tab = landing;

  let buKq = buHienTai && buCodes.includes(buHienTai) ? buHienTai : (buCuaToi || buCodes[0] || '');
  // Chỉ vai trò thấy nhiều đơn vị mới có st.bu (người khác bị cố định đơn vị) — nhưng kiểm lại theo danh sách thật.
  if (moDau && bu && buCodes.includes(bu) && buCodes.length > 1) buKq = bu;
  return { tab, bu: buKq };
}

const KHOA_PHIEN = 'karofi_fc_phien_mo:';

/**
 * Lần đầu tiên trong phiên trình duyệt (sessionStorage, theo người dùng) trả true, các lần sau false. Không dùng được
 * sessionStorage thì trả false: nếu coi mỗi lần là "lần đầu" thì mặc định tường minh sẽ ghi đè lựa chọn đang làm giữa
 * phiên, còn false chỉ là về hành vi cũ (nhớ lần cuối). `kho` thay được để kiểm thử.
 */
export function lanMoDauCuaPhien(userId, kho) {
  try {
    const s = kho || window.sessionStorage;
    const k = KHOA_PHIEN + encodeURIComponent(String(userId || ''));
    if (s.getItem(k) === '1') return false;
    s.setItem(k, '1');
    return true;
  } catch {
    return false;
  }
}

/** Khôi phục mặc định: xoá mọi st.* (mà máy chủ cũng nhận null qua bộ đồng bộ). Trả số khoá đã xoá. */
export function khoiPhucMacDinh(list = listPrefKeys, clear = clearPref) {
  const ks = khoaCaiDatConLai(list);
  ks.forEach((k) => clear(k));
  return ks.length;
}

/**
 * Chờ một Promise tối đa `ms` mili giây; quá hạn thì trả null (Promise gốc vẫn chạy tiếp, không bị huỷ). Không bao giờ ném lỗi.
 * `h` thay được bộ đếm giờ để kiểm thử.
 */
export function choToiDa(promise, ms, h = { setTimeout: (...a) => globalThis.setTimeout(...a), clearTimeout: (...a) => globalThis.clearTimeout(...a) }) {
  let id;
  const het = new Promise((resolve) => { id = h.setTimeout(() => resolve(null), ms); });
  return Promise.race([Promise.resolve(promise).catch(() => null), het]).finally(() => h.clearTimeout(id));
}
