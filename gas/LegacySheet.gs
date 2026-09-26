/**
 * Truy cập Google Sheet CŨ — CHỈ còn dùng cho việc KHÔNG thuộc dữ liệu
 * nghiệp vụ đã chuyển sang Postgres (schema `fc`, xem SheetDb.gs):
 *
 *   - Nhịp tim (NhipTim.gs: ghiNhipTim_/docNhipTim_) — cơ chế báo cáo
 *     "job X chạy lúc mấy giờ" DÙNG CHUNG cho cả hệ sinh thái Karofi, đọc/ghi
 *     vào 1 tab cố định của CHÍNH Spreadsheet này. Đây là quyết định CHƯA
 *     CHỐT khi chuyển CSDL — xem Ke-hoach-Buoc2-FC-OEM-Export-Supabase.md
 *     mục 6 việc 3: có giữ Sheet sống song song hay chuyển nốt NhipTim sang
 *     nơi khác, cần hỏi người phụ trách trước khi bỏ hẳn file này.
 *   - setupDatabase() (Admin.gs) — công cụ khởi tạo Sheet CŨ, chạy tay 1 lần
 *     lúc mới dựng app. Không còn là đường khởi tạo THẬT (đã có
 *     schema-fc.sql cho Postgres) nhưng để nguyên, không xoá, phòng khi cần
 *     đối chiếu ngược lại Sheet trong giai đoạn chạy song song.
 *
 * KHÔNG dùng lại 2 hàm này cho bất kỳ bảng nghiệp vụ nào (Products, Users,
 * ForecastCycles...) — những bảng đó đã sống ở Postgres, đọc/ghi qua
 * SheetDb.gs. Sheet giờ không còn là nguồn sự thật của chúng nữa.
 */

var __ssCache_ = null;

function getSpreadsheet_() {
  if (!__ssCache_) {
    __ssCache_ = SpreadsheetApp.openById(SPREADSHEET_ID);
    diagMark_('openById (lần đầu)');
  }
  return __ssCache_;
}

function getOrCreateSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (SCHEMA[name]) {
      sheet.appendRow(SCHEMA[name]);
      sheet.getRange(1, 1, 1, SCHEMA[name].length)
        .setFontWeight('bold').setBackground('#0284c7').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}
