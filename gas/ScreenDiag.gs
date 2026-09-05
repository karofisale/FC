/**
 * ScreenDiag.gs — dựng lại ĐÚNG phép tính của màn Kế hoạch tháng ở phía server.
 *
 * CHỈ ĐỌC. Chạy từ Run.gs (run_baoCao_manKeHoach).
 *
 * VÌ SAO CẦN: màn hình báo "125 mã chưa có giá" và doanh thu ~0,3 tỷ/tháng,
 * trong khi soi bảng Products cho đúng đơn vị đó thì chỉ có 1 mã thiếu giá và
 * sản lượng cho thấy doanh thu phải quanh 10 tỷ. Hai con số không thể cùng
 * đúng, nên phải chạy lại cùng một phép tính trên cùng một dữ liệu ở nơi nhìn
 * được vào trong.
 *
 * Màn hình làm đúng ba việc, và báo cáo này lặp lại y hệt:
 *   1. products  = getProducts_(bu)                 (lọc theo kênh)
 *   2. lines     = getMonthlyLines_(version.id)     (một version duy nhất)
 *   3. doanh thu = Σ  qty(sku, tháng) × avg_price(sku)
 *
 * Khác biệt duy nhất: ở đây in ra những mã ĐANG KÉO CON SỐ XUỐNG — mã có sản
 * lượng lớn mà giá bằng 0 — thay vì chỉ đếm.
 */

function adminDiagMonthlyScreen(bu, cycleId, versionId) {
  var out = [];
  var products = getProducts_(bu, null, null);

  // Chỉ mục giá theo mã. Ép chuỗi khoá vì getValues() trả mã toàn chữ số dạng
  // number, mà lines cũng vậy — so number với chuỗi thì không mã nào khớp.
  var giaTheoMa = {};
  var tenTheoMa = {};
  products.forEach(function (p) {
    var ma = String(p.sku_code == null ? '' : p.sku_code).trim();
    if (!ma) return;
    giaTheoMa[ma] = Number(p.avg_price) || 0;
    tenTheoMa[ma] = String(p.name || '');
  });

  // Cùng cách chọn chu kỳ / phiên bản với getMonthlyWorkspace_.
  var cycles = readObjects_(SHEETS.CYCLES).filter(function (c) {
    return !bu || String(c.business_unit_code) === String(bu);
  }).sort(function (a, b) {
    return String(b.base_month).localeCompare(String(a.base_month));
  });
  var cycle = null;
  for (var i = 0; i < cycles.length; i++) {
    if (!cycleId || String(cycles[i].id) === String(cycleId)) { cycle = cycles[i]; break; }
  }
  if (!cycle) {
    return psInLog_(['Không tìm thấy chu kỳ nào cho đơn vị ' + bu + '.']);
  }

  var versions = getVersions_(cycle.id);
  var version = pickVersion_(versions, versionId);
  if (!version) {
    return psInLog_(['Chu kỳ ' + cycle.id + ' chưa có phiên bản nào.']);
  }

  var lines = getMonthlyLines_(version.id);

  // Gom theo tháng, và theo mã để tìm thủ phạm.
  var theoThang = {};
  var thieuGia = {};      // ma -> tong san luong
  var coGia = {};         // ma -> tong san luong
  var slKhongCoTrongDanhMuc = 0;
  var maKhongCoTrongDanhMuc = {};

  lines.forEach(function (l) {
    var ma = String(l.sku_code == null ? '' : l.sku_code).trim();
    var thang = normalizeMonth_(l.forecast_month);
    var sl = Number(l.quantity) || 0;
    if (!ma || !sl) return;

    if (!theoThang[thang]) theoThang[thang] = { sl: 0, dt: 0, slThieuGia: 0 };
    theoThang[thang].sl += sl;

    if (!(ma in giaTheoMa)) {
      // Dòng dự báo có mã KHÔNG nằm trong danh mục mà màn hình nhìn thấy.
      // Màn hình duyệt theo products nên dòng này biến mất khỏi CẢ sản lượng
      // lẫn doanh thu — đúng lỗi mà SopPrep.gs cảnh báo.
      slKhongCoTrongDanhMuc += sl;
      maKhongCoTrongDanhMuc[ma] = (maKhongCoTrongDanhMuc[ma] || 0) + sl;
      return;
    }

    var gia = giaTheoMa[ma];
    if (gia > 0) {
      theoThang[thang].dt += sl * gia;
      coGia[ma] = (coGia[ma] || 0) + sl;
    } else {
      theoThang[thang].slThieuGia += sl;
      thieuGia[ma] = (thieuGia[ma] || 0) + sl;
    }
  });

  var thangs = Object.keys(theoThang).sort();
  var tongDt = 0, tongSl = 0, tongThieu = 0;
  thangs.forEach(function (t) {
    tongDt += theoThang[t].dt;
    tongSl += theoThang[t].sl;
    tongThieu += theoThang[t].slThieuGia;
  });

  out.push('=== DỰNG LẠI MÀN KẾ HOẠCH THÁNG ===');
  out.push('Đơn vị: ' + bu + ' · chu kỳ ' + cycle.id + ' (' + cycle.base_month + ')');
  out.push('Phiên bản: ' + version.id + ' · is_final=' + version.is_final);
  out.push('Danh mục màn hình nhìn thấy: ' + products.length + ' mã');
  out.push('Dòng dự báo của phiên bản này: ' + lines.length);
  out.push('');
  out.push('  THÁNG      SẢN LƯỢNG      DOANH THU (tỷ)   SL tính giá 0');
  thangs.forEach(function (t) {
    var d = theoThang[t];
    out.push('  ' + t + '  ' + String(Math.round(d.sl)).padStart(12) +
             '  ' + (d.dt / 1e9).toFixed(2).padStart(14) +
             '  ' + String(Math.round(d.slThieuGia)).padStart(12));
  });
  out.push('  ' + 'TỔNG     ' + String(Math.round(tongSl)).padStart(12) +
           '  ' + (tongDt / 1e9).toFixed(2).padStart(14) +
           '  ' + String(Math.round(tongThieu)).padStart(12));
  out.push('');
  out.push('Mã có giá: ' + Object.keys(coGia).length +
           ' · mã thiếu giá: ' + Object.keys(thieuGia).length +
           ' · mã KHÔNG có trong danh mục: ' + Object.keys(maKhongCoTrongDanhMuc).length);

  // Thủ phạm: mã sản lượng lớn nhất mà giá bằng 0.
  var xepThieu = Object.keys(thieuGia).sort(function (a, b) { return thieuGia[b] - thieuGia[a]; });
  if (xepThieu.length) {
    out.push('');
    out.push('MÃ THIẾU GIÁ, sắp theo sản lượng — đây là phần doanh thu bị mất:');
    out.push('  MÃ            SẢN LƯỢNG   TÊN');
    xepThieu.slice(0, 40).forEach(function (ma) {
      out.push('  ' + ma + '  ' + String(Math.round(thieuGia[ma])).padStart(10) +
               '   ' + (tenTheoMa[ma] || '').slice(0, 40));
    });
    if (xepThieu.length > 40) out.push('  ... và ' + (xepThieu.length - 40) + ' mã nữa');
  }

  var xepNgoai = Object.keys(maKhongCoTrongDanhMuc)
    .sort(function (a, b) { return maKhongCoTrongDanhMuc[b] - maKhongCoTrongDanhMuc[a]; });
  if (xepNgoai.length) {
    out.push('');
    out.push('MÃ CÓ DÒNG DỰ BÁO NHƯNG KHÔNG NẰM TRONG DANH MỤC MÀN HÌNH NHÌN THẤY');
    out.push('— ' + xepNgoai.length + ' mã, ' + Math.round(slKhongCoTrongDanhMuc) + ' chiếc.');
    out.push('Những dòng này biến mất khỏi CẢ sản lượng lẫn doanh thu trên màn hình,');
    out.push('không có gì báo. Thường do default_channel trỏ sang đơn vị khác, hoặc');
    out.push('mã chưa được thêm vào tab Products.');
    out.push('  MÃ            SẢN LƯỢNG');
    xepNgoai.slice(0, 40).forEach(function (ma) {
      out.push('  ' + ma + '  ' + String(Math.round(maKhongCoTrongDanhMuc[ma])).padStart(10));
    });
    if (xepNgoai.length > 40) out.push('  ... và ' + (xepNgoai.length - 40) + ' mã nữa');
  }

  return psInLog_(out);
}
