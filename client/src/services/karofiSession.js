/**
 * karofiSession.js — phần RIÊNG của FC trong lớp phiên dùng chung.
 *
 * Lõi (đọc localStorage, giải mã token, đá về cổng, danh sách app) nằm ở
 * `karofiSessionCore.js` cạnh file này — bản SINH TỰ ĐỘNG từ
 * Karofi-ID/web/, dùng chung từng byte với OEM và Export. Đừng sửa file đó.
 *
 * Ở lại đây đúng một việc: chuyển khối quyền trong token sang hình dạng phiên
 * mà FC vẫn dùng. Ba app có ba hình dạng khác nhau thật — FC cần
 * `{id, full_name, email, role, business_unit_code}` với `expiresAt` là chuỗi
 * ISO, OEM cần `{name, role, saleId}` với `expiresAt` là số — nên phần này
 * không gom được, và cũng không nên gom.
 *
 * Re-export lại những gì phần còn lại của FC đang gọi, để các chỗ
 * `import ... from './karofiSession'` không phải đổi.
 */

import { claimFor } from './karofiSessionCore';

export {
  readSharedSession,
  clearSharedSession,
  decodeToken,
  bounceToPortal,
  clearBounceFlag,
  appKhacDungDuoc
} from './karofiSessionCore';

/**
 * Phiên FC dựng từ phiên dùng chung, hoặc null nếu chưa đăng nhập chung /
 * người này không được cấp quyền vào FC.
 *
 * Hình dạng trả về khớp đúng phiên FC thường dùng ({token, user, expiresAt})
 * nên phần còn lại của app không phân biệt được nó đến từ đâu.
 */
export function sharedSessionForFC() {
  const c = claimFor('FC');
  if (!c) return null;

  return {
    token: c.token,
    expiresAt: c.expiresAt,
    user: {
      id: c.claim.n,
      full_name: c.payload.nm || c.claim.n,
      email: c.payload.em || '',
      role: c.claim.r || 'viewer',
      business_unit_code: c.claim.bu || ''
    },
    fromPortal: true
  };
}
