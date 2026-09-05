/**
 * Run.gs — BẢNG ĐIỀU KHIỂN. Mọi thao tác chạy tay của FC nằm ở đây.
 *
 * VÌ SAO CÓ FILE NÀY: nút Run trong trình soạn thảo Apps Script **không truyền
 * được tham số**. Hàm nào cần tham số thì bấm Run sẽ báo lỗi, và mỗi lần dùng
 * lại phải đi tra xem gõ gì vào đâu. Nên mọi việc ở đây đều là hàm KHÔNG THAM
 * SỐ: mở file này, chọn tên hàm trong danh sách trên thanh công cụ, bấm Run.
 *
 * HAI KHUÔN, dùng đúng một cách:
 *
 *   Việc có ghi dữ liệu  ->  hai hàm riêng, KHÔNG phải một cờ true/false:
 *                            run_<việc>_xemTruoc()   chỉ đọc
 *                            run_<việc>_ghiThat()    ghi thật
 *      Tách đôi vì một cờ để quên ở trạng thái bật là ghi đè dữ liệu ngoài ý
 *      muốn — mà đó đúng là thứ không được phép xảy ra ở đây.
 *
 *   Việc cần giá trị     ->  hằng số VIẾT HOA ngay dòng đầu thân hàm, sửa rồi
 *                            bấm Run. Không phải đi tìm ở file khác.
 *
 * Quy ước đặt tên: mọi hàm bắt đầu bằng `run_` để chúng nằm liền nhau trong
 * danh sách chọn hàm của trình soạn thảo.
 *
 * THÊM VIỆC MỚI: viết hàm nghiệp vụ ở file của nó như bình thường, rồi thêm
 * MỘT vỏ bọc `run_*` không tham số vào đây. Đừng bắt người dùng gõ tham số.
 *
 * Kết quả in ra Nhật ký thực thi (Ctrl+Enter / View > Logs).
 */


/* ==================================================================
 * GIÁ BÁN TRUNG BÌNH — đồng bộ từ số bán thật của OEM và Xuất khẩu
 * Chi tiết cách tính: xem đầu file PriceSync.gs
 * ================================================================== */

/** Xem trước: tỷ giá đang dùng, mã nào đổi giá, mã nào hai nguồn lệch nhau. */
function run_giaBan_xemTruoc() {
  return adminReportPrices();
}

/** Ghi thật vào cột avg_price. Chạy run_giaBan_xemTruoc() trước. */
function run_giaBan_ghiThat() {
  return adminSyncPrices(true);
}


/* ==================================================================
 * DANH MỤC SKU — dọn trước mỗi đợt nhập SOP
 * ================================================================== */

/**
 * Xem trước: SKU nào dùng chung nhiều kênh, SKU nào FC chưa có.
 * Không đổi gì.
 */
function run_danhMuc_xemTruoc() {
  var THANG_BAT_DAU = '2026-09';   // <-- sửa nếu muốn phạm vi khác

  Logger.log(adminReportSharedSkus());
  Logger.log('');
  return adminAddMissingSkus(THANG_BAT_DAU, false);
}

/**
 * Ghi thật: thêm SKU FC còn thiếu, rồi để trống kênh cho SKU dùng chung.
 *
 * Thứ tự cố ý — thêm SKU TRƯỚC, để trống kênh SAU: mã vừa thêm cũng có thể
 * thuộc nhóm dùng chung, chạy ngược thứ tự là bỏ sót chúng.
 */
function run_danhMuc_ghiThat() {
  var THANG_BAT_DAU = '2026-09';   // <-- sửa nếu muốn phạm vi khác

  Logger.log('=== GHI THẬT — không phải chạy thử ===');
  Logger.log('Phạm vi thêm SKU: dữ liệu từ ' + THANG_BAT_DAU + ' trở đi');
  Logger.log('');

  Logger.log('--- Bước 1: thêm SKU FC chưa có ---');
  var them = adminAddMissingSkus(THANG_BAT_DAU, true);

  Logger.log('');
  Logger.log('--- Bước 2: để trống kênh cho SKU dùng chung ---');
  var xoa = adminClearChannelForShared(true);

  Logger.log('');
  Logger.log('=== XONG: thêm ' + them + ' SKU · để trống kênh ' + xoa + ' mã ===');
  Logger.log('Việc còn lại của người: điền nhóm sản phẩm và giá bình quân cho SKU mới.');
  return { themSku: them, xoaKenh: xoa };
}


/* ==================================================================
 * CHUYỂN SKU SANG ĐƠN VỊ KHÁC
 * ================================================================== */

/** Xem trước việc chuyển kênh. Sửa hai hằng số rồi bấm Run. */
function run_doiKenh_xemTruoc() {
  var TU_KENH = 'Online';   // <-- đơn vị nguồn
  var SANG_KENH = '3T';     // <-- đơn vị đích; để '' nghĩa là hiện ở MỌI đơn vị

  return adminMoveProductChannel(TU_KENH, SANG_KENH, false);
}

/** Ghi thật. Chạy run_doiKenh_xemTruoc() trước và sửa hằng số cho khớp. */
function run_doiKenh_ghiThat() {
  var TU_KENH = 'Online';
  var SANG_KENH = '3T';

  return adminMoveProductChannel(TU_KENH, SANG_KENH, true);
}


/* ==================================================================
 * TÀI KHOẢN
 * ================================================================== */

/**
 * Đặt / đổi PIN cho một người. PIN không được lưu dạng thô ở bất kỳ đâu.
 *
 * Sửa hai hằng số, bấm Run, RỒI XOÁ PIN khỏi file này và push lại — đừng để
 * một PIN thật nằm trong mã nguồn, vì kho FC là kho công khai.
 */
function run_datPin() {
  var MA_NGUOI_DUNG = '';   // <-- ví dụ 'gt2'
  var PIN_MOI = '';         // <-- ít nhất 6 ký tự, không phải dãy trùng/liên tiếp

  if (!MA_NGUOI_DUNG || !PIN_MOI) {
    throw new Error('Sửa MA_NGUOI_DUNG và PIN_MOI ở đầu hàm run_datPin() rồi bấm Run lại.');
  }
  return adminSetPin(MA_NGUOI_DUNG, PIN_MOI);
}

/** Mở khoá tài khoản bị khoá do nhập sai PIN nhiều lần. */
function run_moKhoaTaiKhoan() {
  var MA_NGUOI_DUNG = '';   // <-- ví dụ 'gt2'

  if (!MA_NGUOI_DUNG) {
    throw new Error('Sửa MA_NGUOI_DUNG ở đầu hàm run_moKhoaTaiKhoan() rồi bấm Run lại.');
  }
  return adminUnlockUser(MA_NGUOI_DUNG);
}


/* ==================================================================
 * BÁO CÁO — chỉ đọc, chạy bao nhiêu lần cũng được
 * ================================================================== */

/** Mã người dùng nào đang thật sự giữ dữ liệu trong FC. */
function run_baoCao_maNguoiDung() {
  return adminReportUserIds();
}

/**
 * Vì sao màn hình báo "N mã chưa có giá" trong khi bảng tính nhìn thì có giá.
 *
 * Tách ba nhóm: ô là CHUỖI chứ không phải số (nhìn giống hệt một con số nhưng
 * màn hình tính bằng 0), mã có kênh để trống (hiện ở mọi đơn vị nên hay bị bỏ
 * sót khi soi), và ô trống/bằng 0 thật.
 */
function run_baoCao_thieuGia() {
  var DON_VI = 'OEM';   // <-- đổi sang đơn vị đang mở trên màn hình

  return adminReportMissingPrice(DON_VI);
}

/**
 * Đếm mã thiếu giá cho TỪNG đơn vị, một bảng.
 *
 * Chạy cái này TRƯỚC run_baoCao_thieuGia(): màn hình không phải lúc nào cũng
 * đang mở đúng đơn vị mình nghĩ — người không thuộc đơn vị nào thì rơi vào đơn
 * vị đầu tiên trong danh sách. Tìm đơn vị có con số khớp với màn hình rồi mới
 * soi chi tiết đơn vị đó.
 */
function run_baoCao_thieuGia_moiDonVi() {
  return adminReportMissingPriceByBU();
}

/**
 * Dựng lại ĐÚNG phép tính của màn Kế hoạch tháng, ở phía server.
 *
 * Dùng khi con số trên màn hình không khớp với bảng tính. Nó in sản lượng và
 * doanh thu từng tháng, rồi liệt kê những mã đang kéo doanh thu xuống: mã có
 * sản lượng lớn mà giá bằng 0, và mã có dòng dự báo nhưng KHÔNG nằm trong danh
 * mục màn hình nhìn thấy (nhóm này biến mất khỏi cả sản lượng lẫn doanh thu mà
 * không có gì báo).
 *
 * Để trống CHU_KY / PHIEN_BAN thì lấy chu kỳ mới nhất và phiên bản mà màn hình
 * cũng sẽ chọn.
 */
/**
 * Kiểm dữ liệu đọc theo ĐƯỜNG CỦA /exec có đúng kiểu không.
 *
 * Chạy mỗi khi một con số trên màn hình không khớp với bảng tính. Hàm chạy tay
 * đọc bằng getValues() và luôn thấy số; /exec đi qua Sheets API và từng trả về
 * chuỗi đã định dạng theo locale — điểm mù đã làm một lỗi nghiêm trọng ẩn qua
 * ba vòng chẩn đoán.
 */
function run_baoCao_docQuaApi() {
  return adminReportReadPath();
}

/**
 * Dựng lại ĐÚNG phép tính của màn Kế hoạch tháng, ở phía server.
 *
 * (chú thích đầy đủ ở khối dưới)
 */
function run_baoCao_manKeHoach() {
  var DON_VI = 'OEM';     // <-- đơn vị đang mở trên màn hình
  var CHU_KY = '';        // <-- để trống = chu kỳ mới nhất
  var PHIEN_BAN = '';     // <-- để trống = phiên bản màn hình đang chọn

  return adminDiagMonthlyScreen(DON_VI, CHU_KY, PHIEN_BAN);
}

/**
 * Vì sao MỘT mã cụ thể không hiện trên màn hình, dù bảng tính rõ ràng có nó.
 *
 * Chạy khi adminDiagMonthlyScreen báo "mã không nằm trong danh mục màn hình
 * nhìn thấy" mà mở Sheet ra thì mã đó có thật. In giá trị thô + kiểu dữ liệu
 * của từng ô, chạy lại từng bộ lọc của getProducts_, và cho biết dòng dự báo
 * của mã đó thuộc chu kỳ của đơn vị nào.
 */
function run_baoCao_soiMa() {
  var MA = '2013050022';   // <-- mã cần soi
  var DON_VI = 'OEM';      // <-- đơn vị đang mở trên màn hình

  return adminInspectSku(MA, DON_VI);
}

/**
 * Mã sản phẩm đang lưu dạng chữ hay dạng số, và có mã nào bị mồ côi không.
 *
 * Chạy sau bất kỳ lần sửa danh mục hàng loạt nào. Mã dạng số không sai ngay
 * (client đã chuẩn hoá hai phía), nhưng mã có số 0 đứng đầu mà thành số là
 * mất số 0 đó — phần "mã mồ côi" ở cuối báo cáo cho biết có mất thật hay không.
 */
function run_baoCao_kieuMa() {
  return adminReportSkuTypes();
}
