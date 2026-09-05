/**
 * SINH TỰ ĐỘNG — ĐỪNG SỬA FILE NÀY.
 *
 * Bản gốc: Karofi-ID/web/karofi-apps.js + karofi-session-core.js
 * Sinh lại: node tools/dong-bo-lop-phien.mjs --ghi  (trong dự án Karofi-ID)
 *
 * Sửa ở đây thì lần đồng bộ sau sẽ ghi đè, và bài test của Karofi ID sẽ đỏ
 * trước đó. Phần riêng của từng app nằm ở karofiSession.js cạnh file này.
 */

export const KAROFI_APPS = [
  {
    key: 'FC',
    ten: 'Sale Forecast',
    nhan: 'Forecast',
    href: '/FC/',
    mo_ta: 'Lập và chốt kế hoạch sản lượng theo kỳ cho từng đơn vị kinh doanh.'
  },
  {
    key: 'OEM',
    ten: 'OEM Portal',
    nhan: 'OEM',
    href: '/OEM/',
    mo_ta: 'Đơn hàng, doanh thu và công nợ kênh OEM.'
  },
  {
    key: 'EXPORT',
    ten: 'Export Hub',
    nhan: 'Xuất khẩu',
    href: '/export/pi-app.html',
    mo_ta: 'Lập PI, sinh chứng từ và theo dõi lô hàng xuất khẩu.'
  }
];

/**
 * Khoá localStorage của phiên RIÊNG từng app, còn lại từ thời chưa có cổng chung.
 *
 * Cổng phải biết những khoá này vì xoá mỗi 'karofi.session' là CHƯA đăng xuất:
 * cả ba client đều có đường lùi đọc phiên riêng, và cả ba backend còn chấp nhận
 * token cũ trong CacheService thêm 6 giờ. Trên máy dùng chung, người sau mở
 * /OEM/ là vào thẳng phiên người trước, không qua màn hình nào.
 *
 * CỐ Ý không có exportops_theme và exportops_showLineImg: đó là tuỳ chọn hiển
 * thị của máy, không phải danh tính.
 */
export const KAROFI_APP_SESSION_KEYS = [
  'karofi_fc_session',           // FC     — client/src/services/auth.js
  'oem_session_v1',              // OEM    — src/services/api.js
  'exportops_session',           // Export — gas/App.html
  'exportops_remembered_user',   // Export — tên gợi sẵn ở form đăng nhập riêng
  'exportops_cache_products'     // Export — bản chụp danh mục sản phẩm (TTL 2h)
];

/**
 * Cache dữ liệu kinh doanh của OEM (~590KB lịch sử giao dịch) nằm ở IndexedDB
 * chứ không phải localStorage — xem OEM App/src/services/dataCache.js. Cổng
 * phải xoá riêng nó khi đăng xuất.
 */
export const KAROFI_OEM_CACHE_DB = 'oem_app_cache';

// Bộ sinh nối hai file này lại làm một nên sẽ gỡ dòng import; giữ nó ở đây để
// bản gốc tự nó hợp lệ và soi được bằng lint.

const SHARED_KEY = 'karofi.session';

export function readSharedSession() {
  try {
    const raw = localStorage.getItem(SHARED_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.token) return null;
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(SHARED_KEY);
      return null;
    }
    return s;
  } catch {
    return null;                       // localStorage bị chặn hoặc JSON hỏng
  }
}

export function clearSharedSession() {
  try {
    localStorage.removeItem(SHARED_KEY);
  } catch {
    // localStorage bị chặn — không có gì phải xoá
  }
}

/** Giải mã payload token. Không kiểm chữ ký (xem ghi chú đầu file). */
export function decodeToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    // TextDecoder để tên có dấu tiếng Việt không bị hỏng.
    const text = (typeof TextDecoder !== 'undefined')
      ? new TextDecoder('utf-8').decode(bytes)
      : decodeURIComponent(escape(raw));
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Khối quyền của một app trong phiên dùng chung, kèm token và payload.
 *
 * Ba app đều bắt đầu bằng đúng ba bước này trước khi dựng phiên riêng của
 * mình, nên gom vào đây; phần khác nhau chỉ là ánh xạ claim sang hình dạng
 * phiên của app đó.
 *
 * @param {string} appKey 'FC' | 'OEM' | 'EXPORT'
 * @return {{token: string, claim: Object, payload: Object, expiresAt: string|null}|null}
 *     null nếu chưa đăng nhập chung, hoặc người này không có quyền vào app đó.
 */
export function claimFor(appKey) {
  const s = readSharedSession();
  if (!s) return null;
  const payload = decodeToken(s.token);
  const claim = payload && payload.ap && payload.ap[appKey];
  if (!claim || !claim.n) return null;
  return {
    token: s.token,
    claim,
    payload,
    expiresAt: s.expiresAt || (payload.exp ? new Date(payload.exp * 1000).toISOString() : null)
  };
}

const BOUNCE_KEY = 'karofi.bounced';
const PORTAL_HOST = 'karofisale.github.io';

/**
 * Chưa đăng nhập thì đưa thẳng về cổng VHKD thay vì hiện form riêng của app,
 * nhớ trang đang mở để đăng nhập xong quay lại đúng chỗ.
 * Trả về true khi đã bắt đầu chuyển trang — người gọi đừng dựng giao diện nữa.
 *
 * Hai lối thoát, cả hai đều cần vì cổng chung là điểm chết duy nhất: Karofi ID
 * hỏng là cả ba app cùng khoá.
 *   ?direct=1   người dùng cố ý xin form đăng nhập riêng của app. Link này nằm
 *               ở cổng và chỉ hiện cho người vừa bị đá về, nên không ai vô
 *               tình đi đường vòng.
 *   cờ bounced  lượt trước đã đá về cổng mà vẫn quay lại tay không (bấm nút
 *               back, hoặc cổng không cấp được phiên) -> hiện form riêng thay
 *               vì đá tiếp. Không có cờ này thì hai trang đá qua đá lại.
 */
export function bounceToPortal() {
  // Chỉ đá về cổng khi đang ở đúng origin của cổng. Phiên dùng chung nằm trong
  // localStorage của origin đó, nên ở nơi khác — máy chủ phát triển localhost,
  // hay bản chạy thẳng từ URL /exec của Apps Script — đăng nhập một lần vốn
  // không hoạt động, mà '/VHKD/' lại là một đường dẫn không tồn tại.
  if (location.hostname !== PORTAL_HOST) return false;

  if (/[?&]direct=1(&|$)/.test(location.search)) return false;

  try {
    if (sessionStorage.getItem(BOUNCE_KEY) === '1') {
      sessionStorage.removeItem(BOUNCE_KEY);
      return false;
    }
    sessionStorage.setItem(BOUNCE_KEY, '1');
  } catch {
    // sessionStorage bị chặn: mất cờ chống lặp, nhưng ?direct=1 vẫn là lối ra
  }

  const next = encodeURIComponent(location.pathname + location.search);
  // replace chứ không phải href: trang này chưa hiện gì, để lại trong lịch sử
  // thì bấm back từ cổng sẽ rơi vào đúng nó rồi bị đá về cổng lần nữa.
  location.replace('/VHKD/?next=' + next);
  return true;
}

/**
 * Vào được rồi thì xoá cờ. Không xoá thì lần sau hết hạn phiên ngay trong tab
 * này, app sẽ hiện form riêng thay vì đá về cổng như thiết kế.
 */
export function clearBounceFlag() {
  try {
    sessionStorage.removeItem(BOUNCE_KEY);
  } catch {
    // không có gì phải xoá
  }
}

/**
 * Các app khác mà người này ĐƯỢC VÀO — để dựng đường chuyển app ngay trong app.
 *
 * Vì sao cần: đã đăng nhập chung rồi mà muốn từ app này sang app khác vẫn phải
 * về cổng, tìm thẻ, bấm. Mà token đã ghi sẵn người này được vào app nào (khối
 * `ap`), nên thông tin để dựng đường tắt vốn đã có trong trình duyệt.
 *
 * Trả về mảng RỖNG khi đang dùng phiên riêng của app (đăng nhập qua ?direct=1):
 * lúc đó không có token dùng chung nên KHÔNG BIẾT người này có quyền vào đâu, và
 * đoán bừa là dẫn người ta tới một app rồi bị đá về cổng. Không có gì để hiện
 * thì chỉ còn link "Portal" như trước.
 */
export function appKhacDungDuoc(appHienTai) {
  const s = readSharedSession();
  if (!s) return [];
  const payload = decodeToken(s.token);
  const ap = payload && payload.ap;
  if (!ap) return [];
  return KAROFI_APPS.filter((a) => a.key !== appHienTai && ap[a.key]);
}
