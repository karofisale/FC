/**
 * PortalStats.gs — số liệu tổng quan cho cổng VHKD.
 *
 * VÌ SAO NẰM Ở ĐÂY chứ không ở dự án Karofi ID: định nghĩa "dự báo của kênh
 * X trong chu kỳ tháng này" nằm trong app này — nó phụ thuộc chu kỳ nào đang
 * mở, version nào là bản chốt (is_final), giá bình quân nào đang gắn với SKU,
 * và nhóm hàng nào được coi là máy. Tính lại ở cổng là tạo bản sao thứ hai của
 * cùng một quy tắc, và hai bản sao sẽ trôi lệch — đúng thứ giá đã trả cho lớp
 * phiên và PinHash.
 *
 * VÌ SAO ĐÚNG PHÂN QUYỀN: hàm này KHÔNG có luật quyền riêng. Nó gọi
 * scopedBU_() và getApprovals_() — cùng hai hàm mà mọi màn hình khác của FC
 * đi qua. central_admin/viewer thấy mọi kênh; người của một đơn vị chỉ thấy
 * đơn vị mình, kể cả khi họ tự gọi thẳng endpoint này bằng token của họ.
 *
 * HAI CON SỐ CỦA MỘT Ô KHÔNG CÙNG PHẠM VI, và đó là cố ý:
 *   - "số máy" chỉ đếm nhóm máy (NHOM_MAY trong Config.gs) — lõi, màng, linh
 *     kiện không phải máy, cộng chúng vào thì con số không còn nghĩa gì.
 *   - "doanh thu" cộng TOÀN BỘ dòng dự báo, kể cả lõi và linh kiện — bỏ chúng
 *     đi thì doanh thu hụt so với chính con số mà màn Kế hoạch tháng đang hiện.
 * Cổng nói rõ điều này ở dòng chú thích dưới bảng.
 *
 * Doanh thu ở đây là VND và là số DỰ BÁO: sản lượng × avg_price của danh mục
 * (xem PriceSync.gs). Nó không phải doanh thu ghi nhận, và sẽ khác số của app
 * OEM/Xuất khẩu — cố ý, xem chú thích đầu PriceSync.gs.
 */

/**
 * Số cột tháng gửi cho cổng: tháng hiện tại và tháng liền sau.
 *
 * Chu kỳ có horizon 4 tháng, nhưng thẻ tổng quan nằm cùng một cột với thẻ app
 * nên chỉ vừa hai cột số. Hai tháng gần nhất là hai tháng người ta thật sự
 * đang chốt hàng; hai tháng còn lại đọc ở màn Kế hoạch tháng.
 */
var TQ_SO_THANG_ = 2;

/** Chu kỳ mặc định: tháng hiện tại; không có thì tháng gần nhất đang có chu kỳ. */
function tqThangChuKy_(cycles) {
  var nay = normalizeMonth_(new Date());
  var coThangNay = false;
  var moiNhat = '';
  cycles.forEach(function (c) {
    var m = normalizeMonth_(c.base_month);
    if (!m) return;
    if (m === nay) coThangNay = true;
    if (m > moiNhat) moiNhat = m;
  });
  if (coThangNay) return { month: nay, laThangNay: true };
  return { month: moiNhat, laThangNay: false };
}

/** Danh sách tháng dự báo: baseMonth + n tháng liên tiếp. */
function tqDayThang_(baseMonth, soThang) {
  var m = String(baseMonth || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return [];
  var nam = Number(m[1]), thang = Number(m[2]);
  var out = [];
  for (var i = 0; i < soThang; i++) {
    out.push(nam + '-' + ('0' + thang).slice(-2) + '-01');
    thang++;
    if (thang > 12) { thang = 1; nam++; }
  }
  return out;
}

/** Nhóm hàng này có được đếm là máy không. */
function tqLaNhomMay_(groupCode) {
  return NHOM_MAY.indexOf(String(groupCode || '').trim()) >= 0;
}

/**
 * Tên gọi của một kế hoạch đang chờ duyệt.
 *
 * Phải nói được ba điều để người duyệt biết đây là bản nào: kênh, chu kỳ, và
 * lần cập nhật trong chu kỳ đó. Chỉ ghi tên kênh thì hai bản gửi cách nhau
 * một tuần trông y hệt nhau.
 */
function tqTenKeHoach_(a) {
  var phan = [];
  if (a.business_unit_code) phan.push(String(a.business_unit_code));
  var bm = normalizeMonth_(a.base_month);
  if (bm) phan.push('T' + bm.substring(5, 7) + '/' + bm.substring(0, 4));
  var tuan = a.iso_week_label || (a.update_week ? 'tuần ' + a.update_week : '');
  if (tuan) phan.push(String(tuan));
  return phan.join(' · ');
}

/**
 * Đếm số mã mà hai cách phân loại máy KHÔNG khớp nhau.
 *
 * Cách chính là nhóm hàng (NHOM_MAY). Người dùng lại hay nghĩ theo tiền tố mã
 * ("mã bắt đầu bằng 1 là máy"). Khi hai cách này lệch nhau, "số máy" trên cổng
 * sẽ khác con số người dùng tự nhẩm — mà lệch im lặng thì họ báo là lỗi tính
 * toán chứ không ai nghĩ tới việc gán nhóm còn thiếu.
 *
 * Chỉ xét mã đang bật; mã đã tắt không vào dự báo nào.
 */
function tqDemLechPhanLoai_() {
  var coDauSoMaKhongNhomMay = 0;   // mã bắt đầu bằng 1 nhưng nhóm không phải máy
  var nhomMayMaKhongDauSo = 0;     // nhóm là máy nhưng mã không bắt đầu bằng 1
  // activeOnly_ là hàm lọc is_active DUY NHẤT của dự án (SheetDb.gs). Tự viết
  // lại phép so ở đây là thêm bản sao thứ hai của cùng một quy ước — và bản
  // đó sẽ không biết rằng ô trống được coi là ĐANG BẬT.
  activeOnly_(readObjects_(SHEETS.PRODUCTS)).forEach(function (p) {
    var dauSo = normalizeSku_(p.sku_code).charAt(0) === '1';
    var nhomMay = tqLaNhomMay_(p.product_group_code);
    if (dauSo && !nhomMay) coDauSoMaKhongNhomMay++;
    else if (!dauSo && nhomMay) nhomMayMaKhongDauSo++;
  });
  return {
    coDauSoMaKhongNhomMay: coDauSoMaKhongNhomMay,
    nhomMayMaKhongDauSo: nhomMayMaKhongDauSo
  };
}

/**
 * Số tổng quan của FC cho cổng VHKD.
 *
 * Trả về ma trận kênh × 2 tháng (số máy + doanh thu), dòng tổng, và danh sách
 * kế hoạch đang chờ duyệt. `channels` chỉ chứa kênh CÓ SỐ — kênh chưa nhập gì
 * thì không tạo thành một dòng số 0, vì một dòng số 0 đọc như "kênh này dự báo
 * bằng không" chứ không phải "kênh này chưa nhập".
 *
 * Sắp theo doanh thu tháng hiện tại, cao xuống thấp: thẻ chỉ cao vài dòng nên
 * kênh đáng chú ý phải nằm trên, không phải kênh có mã chữ cái đứng đầu.
 */
function getPortalStats_(session) {
  // Ép phạm vi bằng đúng hàm mà mọi màn hình khác dùng: null = được xem tất cả.
  var bu = scopedBU_(session, null);

  var cycles = getCycles_(session, bu, null);
  var chon = tqThangChuKy_(cycles);
  var baseMonth = chon.month;

  var out = {
    baseMonth: baseMonth,
    laThangNay: chon.laThangNay,
    phamVi: bu || '',
    months: [],
    channels: [],
    total: null,
    pending: [],
    lechPhanLoai: null,
    // Độ tươi của những việc chạy tự động đổ số vào file này. Đi kèm ngay đây
    // chứ không thành một endpoint riêng: cổng đã gọi hàm này rồi, thêm một
    // lượt gọi nữa là thêm một thứ có thể hỏng riêng — mà nếu nó hỏng thì cái
    // hỏng lại đúng là thứ cảnh báo. Xem NhipTim.gs.
    nhipTim: docNhipTim_(getSpreadsheet_())
  };

  // Kế hoạch chờ duyệt KHÔNG phụ thuộc chu kỳ đang xem: một bản gửi tháng
  // trước mà chưa ai duyệt vẫn là việc đang treo, và đó chính là thứ cần nhắc.
  getApprovals_(session, null, 'pending').forEach(function (a) {
    out.pending.push({
      ten: tqTenKeHoach_(a),
      bu: String(a.business_unit_code || ''),
      nguoiGui: String(a.requested_by_name || a.requested_by || ''),
      luc: String(a.requested_at || '')
    });
  });

  if (!baseMonth) return out;

  out.months = tqDayThang_(baseMonth, TQ_SO_THANG_);
  out.lechPhanLoai = tqDemLechPhanLoai_();

  var tenKenh = {};
  readObjects_(SHEETS.BUSINESS_UNITS).forEach(function (b) {
    tenKenh[String(b.code)] = String(b.name || b.code);
  });

  // getB0Summary_ đã gộp theo kênh × NHÓM HÀNG × tháng và chỉ lấy version
  // is_final. Vẫn cần bậc nhóm hàng ở đây: "số máy" lọc theo nhóm, còn doanh
  // thu thì cộng hết — nên không gộp bỏ nhóm trước khi tách hai con số.
  var theoKenh = {};
  var tong = { qty: [], rev: [] };
  for (var i = 0; i < out.months.length; i++) { tong.qty.push(0); tong.rev.push(0); }

  getB0Summary_(baseMonth, bu).forEach(function (r) {
    var cot = out.months.indexOf(normalizeMonth_(r.forecast_month));
    if (cot < 0) return;                       // ngoài 2 tháng đang hiện: bỏ
    var code = String(r.business_unit_code || '');
    if (!theoKenh[code]) {
      theoKenh[code] = { code: code, ten: tenKenh[code] || code, qty: [], rev: [] };
      for (var j = 0; j < out.months.length; j++) {
        theoKenh[code].qty.push(0);
        theoKenh[code].rev.push(0);
      }
    }
    var q = Number(r.total_quantity) || 0;
    var v = Number(r.total_revenue) || 0;
    if (tqLaNhomMay_(r.product_group_code)) {
      theoKenh[code].qty[cot] += q;
      tong.qty[cot] += q;
    }
    theoKenh[code].rev[cot] += v;
    tong.rev[cot] += v;
  });

  out.channels = Object.keys(theoKenh).map(function (k) { return theoKenh[k]; })
    .sort(function (a, b) {
      var d = (b.rev[0] || 0) - (a.rev[0] || 0);
      // Doanh thu bằng nhau (thường là cùng bằng 0) thì xếp theo mã cho ổn
      // định — thứ tự nhảy mỗi lần tải là thứ khiến người đọc tưởng số đổi.
      return d !== 0 ? d : String(a.code).localeCompare(String(b.code));
    });
  out.total = out.channels.length ? tong : null;
  return out;
}
