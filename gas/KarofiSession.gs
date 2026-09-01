/**
 * KarofiSession.gs — chuyển token Karofi ID thành phiên đăng nhập của FC App.
 *
 * Đây là lớp keo duy nhất giữa danh tính dùng chung và FC App: nó dịch khối
 * quyền trong token về ĐÚNG hình dạng mà requireSession_() vẫn luôn trả về
 * ({userId, fullName, role, bu}), nên toàn bộ phần còn lại của backend
 * (assertRole_, scopedBU_, ghi updated_by...) không phải sửa một dòng nào.
 *
 * userId lấy từ claim.n — tức tên đăng nhập FC vốn đang dùng, KHÔNG phải mã
 * chuẩn của Karofi ID. Bắt buộc như vậy: các cột updated_by / submitted_by /
 * created_by trong Sheet đang lưu id cũ, đổi id là làm lệch lịch sử.
 *
 * Xem thêm gas/KarofiToken.gs (bản dùng chung, giống hệt ở cả 4 dự án).
 */

var FC_ROLES_ = ['central_admin', 'bu_editor', 'bu_approver', 'viewer'];

/**
 * @return {Object|null} phiên FC nếu token là token Karofi ID hợp lệ VÀ người
 *     này được cấp quyền vào FC; null trong mọi trường hợp khác (để nơi gọi
 *     rơi về cơ chế phiên cũ).
 */
function karofiSessionForFC_(token) {
  var payload = karofiParseToken_(token);
  if (!payload) return null;

  var claim = karofiAppClaim_(payload, 'FC');
  if (!claim || !claim.n) {
    // Token hợp lệ nhưng người này không có quyền vào FC. Đây là câu trả lời
    // thật, không phải "chưa đăng nhập" — nói rõ để họ không thử lại vô ích.
    throw new Error('FORBIDDEN: Tài khoản của bạn chưa được cấp quyền vào app Sale Forecast.');
  }

  var role = String(claim.r || '').toLowerCase();
  if (FC_ROLES_.indexOf(role) < 0) role = 'viewer'; // vai lạ thì hạ về chỉ xem

  return {
    userId: String(claim.n),
    fullName: String(payload.nm || claim.n),
    role: role,
    bu: String(claim.bu || ''),
    _kid: true                      // phiên đến từ Karofi ID (dùng ở changeMyPin_)
  };
}
