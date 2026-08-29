/**
 * Tiện ích dùng chung
 * Một phần của backend FC App — clasp push gộp mọi file .gs vào cùng
 * một phạm vi toàn cục, nên các file gọi chéo hàm của nhau bình thường.
 */

// ---------------------------------------------------------------------
// TIỆN ÍCH
// ---------------------------------------------------------------------

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function runExclusive_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('Hệ thống đang bận ghi dữ liệu, vui lòng thử lại sau vài giây.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Mọi mốc tháng quy về dạng YYYY-MM-01 để so sánh không bị lệch. */
function normalizeMonth_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM') + '-01';
  }
  var s = String(value).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-01';
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM') + '-01';
  }
  return s;
}

/**
 * Mã SKU quy về dạng chuẩn trước khi dùng làm khoá.
 *
 * Ba bảng số liệu (MonthlyForecastLines, WeeklyRegionSplits,
 * ActualSalesResults) đều tham chiếu sản phẩm bằng chính chuỗi sku_code,
 * không qua ID riêng. Nên "KAQ-P95 " và "KAQ-P95" sẽ thành HAI dòng độc lập,
 * hiển thị y hệt nhau trên lưới nhưng cộng vào tổng hai lần — kiểu sai dữ
 * liệu rất khó nhận ra về sau. Chỉ cắt khoảng trắng hai đầu, KHÔNG đổi hoa
 * thường: danh mục hiện có thể đang dùng chữ thường ở đâu đó, đổi hoa sẽ
 * khiến số mới không khớp với các dòng đã lưu.
 */
function normalizeSku_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function isoDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function newVersionId_(bu, week) {
  return 'v-' + String(bu).toLowerCase() + '-w' + week + '-' + Date.now();
}

function publicUser_(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    business_unit_code: user.business_unit_code || ''
  };
}

function logAuth_(userId, event, detail) {
  try {
    appendObjects_(SHEETS.AUDIT, [{
      at: new Date().toISOString(),
      user_id: userId || '',
      event: event,
      detail: detail || ''
    }]);
  } catch (e) {
    // Không để lỗi ghi log chặn đăng nhập
  }
}


// ---------------------------------------------------------------------
// ĐO THỜI GIAN THỰC THI (chỉ bật khi client gửi debug:true trong payload)
// ---------------------------------------------------------------------

var __diagMarks_ = [];
var __diagStart_ = 0;

function diagReset_() {
  __diagMarks_ = [];
  __diagStart_ = Date.now();
}

/** Ghi một mốc thời gian kể từ lúc diagReset_(), để thấy bước nào chậm. */
function diagMark_(label) {
  __diagMarks_.push({ label: label, atMs: Date.now() - __diagStart_ });
}

function diagResult_() {
  return { totalMs: Date.now() - __diagStart_, marks: __diagMarks_ };
}
