/**
 * NhipTim — nhịp tim của những việc chạy tự động.
 *
 * VÌ SAO CÓ FILE NÀY: mấy đường đã tự động (đồng bộ giá, nhập SOP, đổ doanh
 * thu SAP, sync BOM) không ai canh. Chạy thiếu một tháng thì mọi màn hình vẫn
 * hiện số bình thường — chỉ là số cũ. Đó là lỗi im lặng, và trong số liệu kế
 * hoạch thì một tháng sau mới lộ. File này không tự động hoá thêm thứ gì; nó
 * làm cho những thứ đã tự động biết kêu khi chết.
 *
 * Mỗi việc ghi MỘT dòng vào tab "JobHeartbeat" của chính file dữ liệu mà nó
 * ghi vào. Đặt ở đó chứ không gom về một file riêng vì hai lý do: app nào sở
 * hữu dữ liệu thì sở hữu luôn độ tươi của dữ liệu đó, và cổng VHKD lấy được
 * nhịp tim kèm trong lượt gọi số liệu sẵn có — không thêm một lượt gọi mạng
 * nào, không thêm một quyền truy cập file nào. Bản tổng hợp cả ba app nằm ở
 * run_baoCao_nhipTim() của Karofi ID, dự án duy nhất đã mở được cả ba file.
 *
 * AI SỞ HỮU CỘT NÀO:
 *   job · mo_ta · lan_cuoi · so_dong · trang_thai · ghi_chu   -> MÃ ghi
 *   han_gio                                                   -> NGƯỜI đặt
 *
 * `han_gio` là số giờ được phép trôi qua trước khi coi là ôi. Mã chỉ điền giá
 * trị gợi ý lúc TẠO DÒNG lần đầu rồi không bao giờ đụng lại — đổi nhịp mong
 * muốn thì sửa thẳng ô đó trên Sheet, không phải sửa mã rồi deploy. Để trống
 * nghĩa là "không đặt kỳ vọng": vẫn hiện tuổi, nhưng không bao giờ báo ôi.
 *
 * TAB TỰ TẠO — ngoại lệ có chủ ý so với quy ước "tab tạo tay" của Orders /
 * Products / SOP_Plan. Ba tab đó chứa dữ liệu nghiệp vụ có bố cục do người
 * thiết kế, nên tự tạo là đoán thay người. Tab này thì do chính mã ở đây sở
 * hữu hoàn toàn. Bắt tạo tay nghĩa là cơ chế im lặng không làm gì cho tới khi
 * có người nhớ ra — đúng thứ nó sinh ra để chống.
 *
 * HAI LUẬT KHÔNG ĐƯỢC PHÁ:
 *
 *   1. KHÔNG BAO GIỜ ném lỗi ra ngoài. Đây là cái đo, không phải cái được đo.
 *      Một lỗi ghi nhịp tim mà làm hỏng chính công việc nó đang đo thì thà
 *      đừng có nó. Mọi hàm ở đây nuốt lỗi và trả về giá trị vô hại.
 *   2. KHÔNG BAO GIỜ gọi LockService ở đây. Phần lớn nơi gọi đang chạy BÊN
 *      TRONG một khoá rồi, mà LockService không phân biệt tầng: hàm tự lấy
 *      khoá sẽ nhả luôn khoá của hàm ngoài. Đúng cái bẫy mà
 *      updateClientCodeUnlocked_ bên Export được sinh ra để tránh. Ghi trùng
 *      một dòng nhịp tim là chuyện vô hại; nhả mất khoá của việc đang ghi dữ
 *      liệu thật thì không.
 *
 * BẢN SAO: file này giống hệt TỪNG BYTE ở NĂM dự án — FC App (`.gs`), OEM App
 * (`.gs`), Export Ops Hub (`.js`), dự án nhận dữ liệu SAP `Scripts/up-dt-oem`
 * (`.gs`, gắn vào chính file Sheet OEM), và Karofi ID (`.js`, chỉ dùng phía
 * ĐỌC cho bản tổng hợp `run_baoCao_nhipTim`). Sửa một bản phải chép sang bốn
 * bản kia; `test/nhip-tim.test.js` của Karofi ID so cả năm file và sẽ đỏ nếu
 * chúng trôi lệch.
 *
 * Nhận `ss` qua tham số chứ không tự đi lấy Spreadsheet, vì năm dự án có năm
 * cách mở file khác nhau (`getSpreadsheet_`, `oemAppSS_`, `openSS_(HUB_ID)`,
 * `getActiveSpreadsheet`, `openById` theo IMPORT_SOURCES) — đó là thứ duy nhất
 * giữ được năm bản giống nhau.
 */

var NT_TAB_ = 'JobHeartbeat';
var NT_COLS_ = ['job', 'mo_ta', 'lan_cuoi', 'so_dong', 'trang_thai', 'ghi_chu', 'han_gio'];

/** Trạng thái hợp lệ của cột `trang_thai`. 'loi' là việc CHẠY XONG NHƯNG HỎNG
 *  — khác hẳn với ôi (không chạy). Hai thứ này phải báo khác nhau: một cái là
 *  lịch chết, một cái là dữ liệu vào sai. */
var NT_OK_ = 'ok';
var NT_LOI_ = 'loi';

/** Lấy tab nhịp tim, tự tạo nếu chưa có. Trả null nếu không tạo được. */
function ntTab_(ss) {
  try {
    var sh = ss.getSheetByName(NT_TAB_);
    if (sh) return sh;
    sh = ss.insertSheet(NT_TAB_);
    sh.getRange(1, 1, 1, NT_COLS_.length).setValues([NT_COLS_])
      .setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200);
    sh.setColumnWidth(2, 300);
    sh.setColumnWidth(6, 320);
    return sh;
  } catch (e) {
    return null;
  }
}

/**
 * Ghi một nhịp. Gọi ở chỗ công việc ĐÃ ghi xong dữ liệu thật, không phải ở
 * chỗ nó bắt đầu — nhịp tim phải kể lại việc đã xảy ra, không phải ý định.
 *
 * @param {Spreadsheet} ss   file chứa dữ liệu mà việc này vừa ghi vào
 * @param {string} job       khoá, ổn định qua các lần deploy (vd 'oem.doanh-thu')
 * @param {Object} tt
 *   - moTa       {string} một dòng người đọc hiểu, mã sở hữu
 *   - soDong     {number} bao nhiêu dòng đã ghi/đọc — 0 là số hợp lệ, có nghĩa
 *   - trangThai  {string} NT_OK_ (mặc định) hoặc NT_LOI_
 *   - ghiChu     {string} chi tiết ngắn; lỗi thì để thông điệp lỗi ở đây
 *   - hanGio     {number} gợi ý ban đầu, CHỈ dùng khi tạo dòng lần đầu
 * @return {boolean} đã ghi được hay chưa — nơi gọi không cần quan tâm
 */
function ghiNhipTim_(ss, job, tt) {
  try {
    job = String(job === null || job === undefined ? '' : job).trim();
    if (!job) return false;
    tt = tt || {};
    var sh = ntTab_(ss);
    if (!sh) return false;

    var lastRow = sh.getLastRow();
    var dong = -1;
    if (lastRow >= 2) {
      var khoa = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < khoa.length; i++) {
        if (String(khoa[i][0] === null || khoa[i][0] === undefined ? '' : khoa[i][0]).trim() === job) {
          dong = i + 2;
          break;
        }
      }
    }

    // Dòng đã có thì GIỮ NGUYÊN han_gio người dùng đã đặt. Ghi đè bằng giá trị
    // gợi ý trong mã là lặng lẽ huỷ quyết định của họ mỗi lần deploy.
    var moi = (dong < 0);
    var hanGio;
    if (moi) {
      dong = Math.max(lastRow + 1, 2);
      hanGio = (tt.hanGio === 0 || tt.hanGio) ? tt.hanGio : '';
    } else {
      hanGio = sh.getRange(dong, 7).getValue();
    }

    sh.getRange(dong, 1, 1, NT_COLS_.length).setValues([[
      job,
      String(tt.moTa === null || tt.moTa === undefined ? '' : tt.moTa),
      new Date(),
      (tt.soDong === 0 || tt.soDong) ? tt.soDong : '',
      String(tt.trangThai || NT_OK_),
      String(tt.ghiChu === null || tt.ghiChu === undefined ? '' : tt.ghiChu),
      hanGio
    ]]);
    return true;
  } catch (e) {
    // Nuốt lỗi có chủ ý — xem luật 1 ở đầu file. Vẫn ghi lại một dòng log để
    // không mất dấu hoàn toàn; tên việc và số dòng không phải bí mật.
    try { Logger.log('Không ghi được nhịp tim "' + job + '": ' + e.message); } catch (e2) {}
    return false;
  }
}

/** Số giờ kể từ lần chạy cuối. -1 nghĩa là chưa từng chạy / không đọc được. */
function ntTuoiGio_(lanCuoi, bayGio) {
  if (lanCuoi === null || lanCuoi === undefined || lanCuoi === '') return -1;
  var t;
  if (Object.prototype.toString.call(lanCuoi) === '[object Date]') {
    t = lanCuoi.getTime();
  } else {
    t = new Date(lanCuoi).getTime();
  }
  if (!t && t !== 0) return -1;
  if (isNaN(t)) return -1;
  var gio = (bayGio.getTime() - t) / 3600000;
  // Đồng hồ lệch vài phút giữa máy chạy job và máy đọc là chuyện thường; âm
  // một chút vẫn là "vừa chạy xong", không phải lỗi.
  return gio < 0 ? 0 : gio;
}

/**
 * 'chua-chay' | 'oi' | 'ok' | 'khong-han'.
 *
 * Hàm thuần, không đụng Sheet — đây là chỗ dễ sai nhất và là chỗ bộ test nhắm
 * vào. Tách 'khong-han' khỏi 'ok' để cổng phân biệt được "đúng nhịp" với
 * "chưa ai đặt nhịp cho việc này".
 */
function ntTinhTrang_(tuoiGio, hanGio) {
  var han = Number(hanGio);
  if (tuoiGio < 0) return 'chua-chay';
  if (!isFinite(han) || han <= 0) return 'khong-han';
  return tuoiGio > han ? 'oi' : 'ok';
}

/**
 * Đọc toàn bộ nhịp tim của một file, kèm tuổi và tình trạng đã tính sẵn.
 *
 * KHÔNG lọc theo vai người xem, có chủ ý: dòng ở đây chỉ có tên việc, mốc thời
 * gian và số lượng dòng — không có tên khách, không có tiền, không có mã nào.
 * Ai vào được cổng cũng nên biết số họ đang đọc cũ bao lâu.
 */
function docNhipTim_(ss) {
  try {
    var sh = ss.getSheetByName(NT_TAB_);
    if (!sh) return [];
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return [];
    var vals = sh.getRange(2, 1, lastRow - 1, NT_COLS_.length).getValues();
    var bayGio = new Date();
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      var job = String(r[0] === null || r[0] === undefined ? '' : r[0]).trim();
      if (!job) continue;
      var tuoi = ntTuoiGio_(r[2], bayGio);
      out.push({
        job: job,
        moTa: String(r[1] === null || r[1] === undefined ? '' : r[1]),
        // Chuỗi ISO chứ không phải Date: giá trị này đi qua JSON tới trình
        // duyệt, mà JSON.stringify của một Date đã là ISO — trả sẵn để không
        // có chỗ nào phải đoán kiểu.
        lanCuoi: (Object.prototype.toString.call(r[2]) === '[object Date]') ? r[2].toISOString() : '',
        soDong: (r[3] === '' || r[3] === null || r[3] === undefined) ? null : Number(r[3]),
        trangThai: String(r[4] === null || r[4] === undefined ? '' : r[4]).trim(),
        ghiChu: String(r[5] === null || r[5] === undefined ? '' : r[5]),
        hanGio: (r[6] === '' || r[6] === null || r[6] === undefined) ? null : Number(r[6]),
        tuoiGio: tuoi < 0 ? null : Math.round(tuoi * 10) / 10,
        tinhTrang: ntTinhTrang_(tuoi, r[6])
      });
    }
    return out;
  } catch (e) {
    // Cổng mất khối "số liệu tính đến..." thì khó chịu; cổng trả lỗi vì cái
    // khối đó thì tệ hơn nhiều. Trả mảng rỗng.
    return [];
  }
}
