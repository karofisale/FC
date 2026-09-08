/**
 * PortalStats.gs — số liệu tổng quan cho cổng VHKD.
 *
 * VÌ SAO NẰM Ở ĐÂY chứ không ở dự án Karofi ID: định nghĩa "dự báo của kênh
 * X trong chu kỳ tháng này" nằm trong app này — nó phụ thuộc chu kỳ nào đang
 * mở, version nào là bản chốt (is_final), giá bình quân nào đang gắn với SKU.
 * Tính lại những thứ đó ở cổng là tạo bản sao thứ hai của cùng một quy tắc, và
 * hai bản sao sẽ trôi lệch — đúng thứ giá đã trả cho lớp phiên và PinHash.
 *
 * VÌ SAO ĐÚNG PHÂN QUYỀN: hàm này KHÔNG có luật quyền riêng. Nó gọi
 * scopedBU_() và getApprovals_() — cùng hai hàm mà mọi màn hình khác của FC
 * đi qua. central_admin/viewer thấy mọi kênh; người của một đơn vị chỉ thấy
 * đơn vị mình, kể cả khi họ tự gọi thẳng endpoint này bằng token của họ.
 *
 * Doanh thu ở đây là VND và là số DỰ BÁO: sản lượng × avg_price của danh mục
 * (xem PriceSync.gs). Nó không phải doanh thu ghi nhận, và sẽ khác số của app
 * OEM/Xuất khẩu — cố ý, xem chú thích đầu PriceSync.gs.
 */

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

/** Danh sách tháng dự báo của chu kỳ: baseMonth + horizon tháng liên tiếp. */
function tqDayThang_(baseMonth, horizon) {
  var m = String(baseMonth || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return [];
  var nam = Number(m[1]), thang = Number(m[2]);
  var out = [];
  for (var i = 0; i < horizon; i++) {
    out.push(nam + '-' + ('0' + thang).slice(-2) + '-01');
    thang++;
    if (thang > 12) { thang = 1; nam++; }
  }
  return out;
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
 * Số tổng quan của FC cho cổng VHKD.
 *
 * Trả về ma trận kênh × tháng (sản lượng + doanh thu), dòng tổng, và danh sách
 * kế hoạch đang chờ duyệt. `channels` chỉ chứa kênh CÓ SỐ — kênh chưa nhập gì
 * thì không tạo thành một dòng số 0, vì một dòng số 0 đọc như "kênh này dự báo
 * bằng không" chứ không phải "kênh này chưa nhập".
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
    pending: []
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

  var horizon = 0;
  cycles.forEach(function (c) {
    if (normalizeMonth_(c.base_month) !== baseMonth) return;
    horizon = Math.max(horizon, Number(c.horizon_months) || 0);
  });
  if (!horizon) horizon = 4;
  out.months = tqDayThang_(baseMonth, horizon);

  var tenKenh = {};
  readObjects_(SHEETS.BUSINESS_UNITS).forEach(function (b) {
    tenKenh[String(b.code)] = String(b.name || b.code);
  });

  // getB0Summary_ đã gộp theo kênh × nhóm hàng × tháng và chỉ lấy version
  // is_final — gộp thêm một bậc (bỏ nhóm hàng) là đủ cho cổng.
  var theoKenh = {};
  var tong = { qty: [], rev: [] };
  for (var i = 0; i < out.months.length; i++) { tong.qty.push(0); tong.rev.push(0); }

  getB0Summary_(baseMonth, bu).forEach(function (r) {
    var cot = out.months.indexOf(normalizeMonth_(r.forecast_month));
    if (cot < 0) return;                       // tháng ngoài horizon: bỏ, không dồn vào cột cuối
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
    theoKenh[code].qty[cot] += q;
    theoKenh[code].rev[cot] += v;
    tong.qty[cot] += q;
    tong.rev[cot] += v;
  });

  out.channels = Object.keys(theoKenh).sort().map(function (k) { return theoKenh[k]; });
  out.total = out.channels.length ? tong : null;
  return out;
}
