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

/**
 * Vì sao MỘT mã cụ thể không lọt vào danh mục mà màn hình nhìn thấy.
 *
 * CHỈ ĐỌC. Chạy từ Run.gs (run_baoCao_soiMa).
 *
 * VÌ SAO CẦN: adminDiagMonthlyScreen báo có mã "không nằm trong danh mục màn
 * hình nhìn thấy", nhưng mở bảng tính ra thì mã đó có thật và is_active = 1.
 * Hai điều đó cùng đúng được, vì getProducts_ còn lọc thêm theo kênh — và còn
 * vài kiểu lệch nữa mà nhìn bằng mắt trên Sheet thì không thấy:
 *
 *   - default_channel trỏ sang đơn vị khác (mã vẫn hiện ở đơn vị của nó).
 *   - sku_code có khoảng trắng thừa, hoặc ký tự trông giống nhưng khác mã
 *     (khoảng trắng không ngắt, dấu gạch nối lạ).
 *   - sku_code lưu dạng SỐ ở bảng này nhưng dạng CHUỖI ở bảng kia, hoặc
 *     ngược lại — hai bên trông y hệt nhau trên màn hình.
 *   - có HAI dòng cùng mã, dòng đầu bị tắt.
 *
 * Hàm này in ra giá trị THÔ và KIỂU của từng ô liên quan, cộng với kết quả
 * đúng-sai của từng bộ lọc mà getProducts_ áp lên dòng đó. Bộ lọc nào trả về
 * false chính là câu trả lời.
 */
function adminInspectSku(maCanSoi, bu) {
  var can = String(maCanSoi == null ? '' : maCanSoi).trim();
  var out = [];
  out.push('=== SOI MÃ ' + can + ' (đơn vị đang xem: ' + (bu || '(toàn bộ)') + ') ===');
  out.push('');

  var t = readTable_(SHEETS.PRODUCTS);
  var iSku = t.idx.sku_code;

  // Tìm theo mã ĐÃ CHUẨN HOÁ, không so bằng ===, vì chính chỗ so bằng là thứ
  // đang nghi ngờ. Bắt cả dòng trùng.
  var thay = [];
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][iSku] == null ? '' : t.rows[i][iSku]).trim() === can) thay.push(i);
  }

  if (!thay.length) {
    out.push('KHÔNG có dòng nào trong tab Products có mã này (sau khi cắt khoảng trắng).');
    out.push('Nếu bảng tính nhìn thấy mã đó thì ô đang chứa ký tự lạ. Kiểm bằng cách');
    out.push('gõ =LEN(ô) trong Sheet: số ký tự phải đúng bằng ' + can.length + '.');
    return psInLog_(out);
  }

  if (thay.length > 1) {
    out.push('CẢNH BÁO: có ' + thay.length + ' dòng cùng mã này. getProducts_ giữ cả');
    out.push('hai, nhưng productMap_ chỉ giữ dòng CUỐI — nên màn hình có thể đang');
    out.push('đọc dòng khác với dòng bạn đang sửa.');
    out.push('');
  }

  thay.forEach(function (idx) {
    var r = t.rows[idx];
    var o = rowToObject_(t.headers, r);
    out.push('--- Dòng ' + (idx + 2) + ' trong tab Products ---');
    ['sku_code', 'name', 'default_channel', 'is_active', 'avg_price', 'product_group_code'].forEach(function (cot) {
      if (t.idx[cot] === undefined) { out.push('  ' + cot + ': (bảng không có cột này)'); return; }
      var v = r[t.idx[cot]];
      out.push('  ' + (cot + '                    ').slice(0, 20)
        + JSON.stringify(v) + '  (' + typeof v + ')');
    });

    // Chạy lại ĐÚNG hai bộ lọc của getProducts_, từng cái một.
    var act = activeOnly_([o]).length === 1;
    var kenh = String(o.default_channel == null ? '' : o.default_channel).trim();
    var hopKenh = !bu || !kenh || kenh === String(bu);

    out.push('');
    out.push('  Bộ lọc activeOnly_          : ' + (act ? 'ĐẠT' : 'TRƯỢT  <-- nguyên nhân'));
    out.push('  Bộ lọc theo kênh (' + (bu || '-') + ')' + '      : '
      + (hopKenh ? 'ĐẠT' : 'TRƯỢT  <-- nguyên nhân: kênh "' + kenh + '" khác "' + bu + '"'));
    out.push('  => màn hình ' + (act && hopKenh ? 'CÓ' : 'KHÔNG') + ' nhìn thấy mã này');
    out.push('');
  });

  // Đối chiếu với chính hàm mà màn hình gọi, phòng khi hai bộ lọc trên vẫn
  // chưa phải toàn bộ câu chuyện.
  var quaHam = getProducts_(bu, null, null).filter(function (p) {
    return String(p.sku_code == null ? '' : p.sku_code).trim() === can;
  });
  out.push('getProducts_(' + JSON.stringify(bu) + ') trả về ' + quaHam.length + ' dòng cho mã này.');
  if (quaHam.length && thay.length) {
    out.push('=> Mã CÓ trong danh mục màn hình nhìn thấy. Nếu báo cáo màn Kế hoạch');
    out.push('   vẫn xếp nó vào nhóm "không có trong danh mục" thì lệch nằm ở phía');
    out.push('   DÒNG DỰ BÁO: chạy phần dưới để so kiểu dữ liệu hai bên.');
  }

  // So kiểu dữ liệu của mã ở hai bảng. Đây là chỗ đã cắn một lần: getValues()
  // trả mã toàn chữ số về dạng number ở bảng này mà dạng string ở bảng kia,
  // và phép so không chuẩn hoá thì không khớp dòng nào.
  out.push('');
  out.push('--- Mã này xuất hiện thế nào trong MonthlyForecastLines ---');
  var ml = readTable_(SHEETS.MONTHLY_LINES);
  var iMlSku = ml.idx.sku_code;
  var kieu = {}, soDong = 0, viDu = null;
  for (var j = 0; j < ml.rows.length; j++) {
    var v = ml.rows[j][iMlSku];
    if (String(v == null ? '' : v).trim() !== can) continue;
    soDong++;
    kieu[typeof v] = (kieu[typeof v] || 0) + 1;
    if (!viDu) viDu = v;
  }
  out.push('  số dòng dự báo: ' + soDong);
  out.push('  kiểu dữ liệu  : ' + JSON.stringify(kieu));
  if (viDu !== null) out.push('  giá trị mẫu   : ' + JSON.stringify(viDu));
  var kieuSp = typeof t.rows[thay[0]][iSku];
  out.push('  kiểu ở Products: ' + kieuSp);

  // Dòng dự báo của mã này thuộc chu kỳ của ĐƠN VỊ NÀO. Đây mới là câu hỏi
  // quyết định: mã kênh XK mà có dòng nằm trong chu kỳ OEM thì hoặc dòng đó
  // đặt nhầm chỗ, hoặc kênh của mã đặt sai — hai cách sửa ngược nhau.
  if (soDong) {
    var iMlVer = ml.idx.version_id;
    var theoDonVi = {};
    var vs = {}, cs = {};
    readObjects_(SHEETS.VERSIONS).forEach(function (v) { vs[String(v.id)] = v; });
    readObjects_(SHEETS.CYCLES).forEach(function (c) { cs[String(c.id)] = c; });
    for (var k = 0; k < ml.rows.length; k++) {
      if (String(ml.rows[k][iMlSku] == null ? '' : ml.rows[k][iMlSku]).trim() !== can) continue;
      var ver = vs[String(ml.rows[k][iMlVer])];
      var cyc = ver ? cs[String(ver.cycle_id)] : null;
      var nhan = cyc ? (String(cyc.business_unit_code) + ' · ' + normalizeMonth_(cyc.base_month))
                     : '(không tra được chu kỳ)';
      theoDonVi[nhan] = (theoDonVi[nhan] || 0) + 1;
    }
    out.push('');
    out.push('  Dòng dự báo nằm ở chu kỳ của đơn vị nào:');
    Object.keys(theoDonVi).sort().forEach(function (nhan) {
      out.push('    ' + nhan + ' : ' + theoDonVi[nhan] + ' dòng');
    });
    out.push('  Nếu đơn vị ở đây KHÁC kênh của mã trong Products thì đó là chỗ lệch:');
    out.push('  hoặc dòng dự báo đặt nhầm chu kỳ, hoặc default_channel đặt sai.');
  }
  if (soDong && Object.keys(kieu).length && Object.keys(kieu).indexOf(kieuSp) < 0) {
    out.push('  LỆCH KIỂU: Products lưu ' + kieuSp + ', dòng dự báo lưu ' + Object.keys(kieu).join('/')
      + '. Mọi phép so không bọc String().trim() sẽ trượt.');
  }

  return psInLog_(out);
}
