/**
 * KarofiToken.js — token đăng nhập dùng chung cho cả hệ Karofi.
 *
 * FILE NÀY LÀ BẢN DÙNG CHUNG. Nội dung phải GIỐNG HỆT NHAU ở 4 dự án
 * Apps Script:
 *   - Karofi-ID   (dự án phát hành token — chỉ nơi này gọi karofiMakeToken_)
 *   - FC App      gas/KarofiToken.gs
 *   - OEM App     gas/KarofiToken.gs
 *   - ExportOps   gas/KarofiToken.js
 * Sửa ở đây rồi copy sang 3 nơi kia. Đừng sửa riêng lẻ từng bản.
 *
 * Vì sao token tự chứa + có ký, thay vì gọi về Karofi ID để hỏi mỗi request:
 * Apps Script xử lý TUẦN TỰ các request của cùng một chủ sở hữu script.
 * Đo thực tế ở FC App: 6 request đồng thời làm request cuối mất 16 giây.
 * Đo thực tế ở OEM App: ~50% lệnh gọi web app trả về HTML thay vì JSON.
 * Thêm một hop xác thực vào mỗi request là nhân đôi cả hai vấn đề đó.
 * Ở đây mỗi backend tự kiểm chữ ký: không gọi mạng, không đọc Sheet.
 *
 * Định dạng token:  v1.<payload base64url>.<HMAC-SHA256 base64url>
 * Chữ ký tính trên CHÍNH chuỗi base64 đã encode (thuần ASCII) nên không
 * phụ thuộc bảng mã — quan trọng vì tên người dùng có dấu tiếng Việt.
 *
 * Payload (khoá viết tắt để token gọn):
 *   sub  mã người dùng chuẩn trong bảng Karofi ID
 *   nm   họ tên đầy đủ
 *   em   email công ty (có thể rỗng)
 *   iat  thời điểm phát hành (giây epoch)
 *   exp  thời điểm hết hạn (giây epoch)
 *   ap   quyền theo từng app: { FC: {...}, OEM: {...}, EXPORT: {...} }
 *
 * Mỗi khối trong `ap` mang theo ĐỊNH DANH RIÊNG mà app đó vốn đang dùng
 * (`n`), không phải mã chuẩn. Đây là điểm bắt buộc, không phải tuỳ chọn:
 * Export gắn mỗi dòng PI với PIC = tên đăng nhập, OEM khoá mọi thứ theo
 * tên, FC ghi updated_by theo id. Nếu token không mang đúng tên cũ của
 * từng app thì dữ liệu đã có sẽ không còn khớp với người tạo ra nó.
 */

var KAROFI_TOKEN_VERSION = 'v1';
var KAROFI_SECRET_PROP = 'KAROFI_ID_SECRET';

/** Cho phép lệch đồng hồ giữa các máy chủ Google (giây). */
var KAROFI_CLOCK_SKEW_SEC = 120;

/**
 * Khoá ký, đọc từ Script Properties của CHÍNH dự án đang chạy.
 * Không bao giờ hardcode trong code, không bao giờ gửi ra front-end.
 */
function karofiSecret_() {
  var s = PropertiesService.getScriptProperties().getProperty(KAROFI_SECRET_PROP);
  if (!s) {
    throw new Error(
      'Thiếu ' + KAROFI_SECRET_PROP + ' trong Script Properties của dự án này. ' +
      'Xem README của Karofi-ID, mục "Cài SECRET".'
    );
  }
  return s;
}

function karofiSign_(encodedPayload) {
  var raw = Utilities.computeHmacSha256Signature(encodedPayload, karofiSecret_());
  return Utilities.base64EncodeWebSafe(raw);
}

/** So sánh chuỗi không phụ thuộc vị trí ký tự lệch đầu tiên. */
function karofiSafeEquals_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return diff === 0;
}

/**
 * Phát hành token. CHỈ dự án Karofi-ID được gọi hàm này.
 * @param {Object} payload phải có sub; iat/exp do hàm này tự điền nếu thiếu.
 * @param {number} ttlSeconds thời gian sống.
 */
function karofiMakeToken_(payload, ttlSeconds) {
  var now = Math.floor(Date.now() / 1000);
  var body = {
    sub: String(payload.sub || ''),
    nm: String(payload.nm || ''),
    em: String(payload.em || ''),
    iat: now,
    exp: now + (Number(ttlSeconds) || 12 * 3600),
    ap: payload.ap || {}
  };
  if (!body.sub) throw new Error('karofiMakeToken_: thiếu sub.');
  var enc = Utilities.base64EncodeWebSafe(JSON.stringify(body));
  return KAROFI_TOKEN_VERSION + '.' + enc + '.' + karofiSign_(enc);
}

/**
 * Kiểm token. KHÔNG BAO GIỜ ném lỗi — trả null khi token không phải của
 * Karofi ID, sai chữ ký, hoặc đã hết hạn. Nhờ vậy nơi gọi có thể rơi về
 * cơ chế phiên cũ của từng app (chấp nhận kép) mà không phải bắt lỗi.
 *
 * @return {Object|null} payload đã kiểm, hoặc null.
 */
function karofiParseToken_(token) {
  if (!token) return null;
  var parts = String(token).split('.');
  if (parts.length !== 3) return null;             // token cũ dạng uuid → null
  if (parts[0] !== KAROFI_TOKEN_VERSION) return null;

  var enc = parts[1];
  var sig = parts[2];

  var expected;
  try {
    expected = karofiSign_(enc);
  } catch (e) {
    // Thiếu SECRET: coi như không xác thực được, để nơi gọi dùng đường cũ.
    return null;
  }
  if (!karofiSafeEquals_(sig, expected)) return null;

  var payload;
  try {
    var bytes = Utilities.base64DecodeWebSafe(enc);
    payload = JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8'));
  } catch (e) {
    return null;
  }
  if (!payload || !payload.sub) return null;

  var now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp + KAROFI_CLOCK_SKEW_SEC < now) return null;
  if (payload.iat && payload.iat - KAROFI_CLOCK_SKEW_SEC > now) return null;

  return payload;
}

/**
 * Lấy khối quyền của một app trong token.
 * @param {Object} payload kết quả karofiParseToken_
 * @param {string} appKey 'FC' | 'OEM' | 'EXPORT'
 * @return {Object|null} null nếu người này không được cấp quyền vào app đó.
 */
function karofiAppClaim_(payload, appKey) {
  if (!payload || !payload.ap) return null;
  var c = payload.ap[appKey];
  if (!c) return null;
  return c;
}
