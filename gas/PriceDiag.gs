/**
 * PriceDiag.gs — vì sao màn hình báo "N mã chưa có giá" trong khi bảng tính
 * nhìn thì có giá.
 *
 * CHỈ ĐỌC. Chạy từ Run.gs (run_baoCao_thieuGia).
 *
 * Màn Kế hoạch tháng tính `Number(p.avg_price) || 0`, nên một ô sẽ bị coi là
 * KHÔNG CÓ GIÁ trong ba trường hợp, mà nhìn bằng mắt trên Sheet thì cả ba đều
 * giống nhau:
 *
 *   1. Ô trống thật, hoặc bằng 0.
 *   2. Ô là CHUỖI chứ không phải số. Bảng tính FC đang đặt ngôn ngữ Tiếng Việt,
 *      nên một giá trị dán vào dưới dạng text kiểu "1.234.567" vẫn hiện ra
 *      đúng như một con số — nhưng Number("1.234.567") là NaN, và `|| 0` biến
 *      nó thành 0. Đây là loại hỏng không nhìn thấy được.
 *   3. Mã không thuộc kênh đang xem nhưng vẫn lọt vào danh sách vì
 *      default_channel để trống (linh kiện dùng chung) — nhóm này thường bị bỏ
 *      qua khi người ta chỉ soi "nhóm sản phẩm của kênh mình".
 *
 * Báo cáo này tách rõ ba nhóm đó, kèm giá trị thô và KIỂU dữ liệu của ô.
 */

/** In mang dong ra Nhat ky va tra ve cung chuoi do. */
function psInLog_(dong) {
  var s = dong.join(String.fromCharCode(10));
  Logger.log(s);
  return s;
}

/**
 * Đếm nhanh mã thiếu giá cho TỪNG đơn vị — để biết con số trên màn hình đến từ
 * đâu trước khi soi chi tiết.
 *
 * Cần vì màn hình không phải lúc nào cũng đang mở đúng đơn vị người ta nghĩ:
 * `currentBU` mặc định là đơn vị của người dùng, và người KHÔNG thuộc đơn vị
 * nào (central_admin) thì rơi vào ĐƠN VỊ ĐẦU TIÊN trong danh sách. Soi nhầm
 * đơn vị là đi tìm một lỗi không tồn tại.
 */
function adminReportMissingPriceByBU() {
  var bus = readObjects_(SHEETS.BUSINESS_UNITS)
    .filter(function (b) { return String(b.is_active) !== '0'; })
    .map(function (b) { return String(b.code).trim(); })
    .filter(Boolean);

  var out = [];
  out.push('=== MÃ THIẾU GIÁ THEO TỪNG ĐƠN VỊ ===');
  out.push('Đơn vị nào có con số khớp với màn hình thì soi tiếp đơn vị đó bằng');
  out.push('run_baoCao_thieuGia() (sửa DON_VI ở đầu hàm).');
  out.push('');
  out.push('  ĐƠN VỊ      NHÌN THẤY   THIẾU GIÁ');

  bus.forEach(function (bu) {
    var d = psDemThieuGia_(bu);
    out.push('  ' + (bu + '            ').slice(0, 12) + String(d.nhinThay).padStart(6) +
             '      ' + String(d.thieu).padStart(6));
  });
  var tat = psDemThieuGia_('');
  out.push('  ' + '(toàn bộ)   ' + String(tat.nhinThay).padStart(6) + '      ' + String(tat.thieu).padStart(6));

  // XUONG_DONG thay cho ky tu thoat: chuoi thoat hay bi hong khi file nay
  // di qua cac buoc sinh ma, va mot ky tu xuong dong that nam trong chuoi
  // JS la loi cu phap — clasp chan push, nhung mat mot vong.
  return psInLog_(out);
}

/** Đếm thuần, dùng cho bảng tổng hợp ở trên. */
function psDemThieuGia_(bu) {
  var table = readTable_(SHEETS.PRODUCTS);
  var iSku = table.idx.sku_code, iGia = table.idx.avg_price;
  var iCh = table.idx.default_channel, iAct = table.idx.is_active;
  var nhinThay = 0, thieu = 0;
  for (var i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    if (!String(r[iSku] == null ? '' : r[iSku]).trim()) continue;
    var act = String(r[iAct]).trim();
    if (act === '0' || act.toLowerCase() === 'false') continue;
    var kenh = String(r[iCh] == null ? '' : r[iCh]).trim();
    if (bu && kenh && kenh !== String(bu)) continue;
    nhinThay++;
    var o = r[iGia], so = Number(o);
    if (!(o !== '' && o !== null && o !== undefined && isFinite(so) && so > 0)) thieu++;
  }
  return { nhinThay: nhinThay, thieu: thieu };
}

/**
 * @param {string} bu Mã đơn vị, ví dụ 'OEM'. Bỏ trống thì soi toàn bộ danh mục.
 */
function adminReportMissingPrice(bu) {
  var table = readTable_(SHEETS.PRODUCTS);
  var iSku = table.idx.sku_code;
  var iGia = table.idx.avg_price;
  var iTen = table.idx.name;
  var iCh = table.idx.default_channel;
  var iAct = table.idx.is_active;

  var trong = [], laChuoi = [], kenhTrong = [];
  var tongXet = 0;

  for (var i = 0; i < table.rows.length; i++) {
    var r = table.rows[i];
    var ma = String(r[iSku] == null ? '' : r[iSku]).trim();
    if (!ma) continue;

    // is_active: giống activeOnly_ mà getProducts_ dùng.
    var act = String(r[iAct]).trim();
    if (act === '0' || act.toLowerCase() === 'false') continue;

    var kenh = String(r[iCh] == null ? '' : r[iCh]).trim();
    // Cùng bộ lọc với getProducts_: khớp kênh HOẶC kênh để trống.
    if (bu && kenh && kenh !== String(bu)) continue;
    tongXet++;

    var o = r[iGia];
    var so = Number(o);
    if (o !== '' && o !== null && o !== undefined && isFinite(so) && so > 0) continue;

    var mo = '  ' + ma + '  [' + (kenh || 'kênh trống') + ']  ' +
             String(r[iTen] || '').slice(0, 38) +
             '   ô=' + JSON.stringify(o) + ' (' + typeof o + ')';

    if (typeof o === 'string' && o.trim() !== '') laChuoi.push(mo);
    else if (!kenh) kenhTrong.push(mo);
    else trong.push(mo);
  }

  var out = [];
  out.push('=== MÃ KHÔNG CÓ GIÁ, THEO CÁCH MÀN HÌNH ĐÁNH GIÁ ===');
  out.push('Đơn vị: ' + (bu || '(toàn bộ danh mục)'));
  out.push('Số mã màn hình này nhìn thấy: ' + tongXet);
  out.push('Không có giá: ' + (trong.length + laChuoi.length + kenhTrong.length));
  out.push('');

  if (laChuoi.length) {
    out.push('A. Ô LÀ CHUỖI, KHÔNG PHẢI SỐ — ' + laChuoi.length + ' mã');
    out.push('   Nhìn trên Sheet thì giống hệt một con số, nhưng Number() ra NaN');
    out.push('   nên màn hình tính bằng 0. Đây là nhóm cần sửa trước.');
    out.push('   Cách sửa: chọn cột avg_price > Định dạng > Số, rồi nhập lại các ô này;');
    out.push('   hoặc chạy run_giaBan_ghiThat() để ghi đè bằng số thật.');
    laChuoi.slice(0, 60).forEach(function (x) { out.push(x); });
    if (laChuoi.length > 60) out.push('   ... và ' + (laChuoi.length - 60) + ' mã nữa');
    out.push('');
  }

  if (kenhTrong.length) {
    out.push('B. KÊNH ĐỂ TRỐNG (linh kiện dùng chung) — ' + kenhTrong.length + ' mã');
    out.push('   Những mã này hiện trên MỌI đơn vị, nên hay bị bỏ sót khi chỉ soi');
    out.push('   nhóm sản phẩm của kênh mình.');
    kenhTrong.slice(0, 60).forEach(function (x) { out.push(x); });
    if (kenhTrong.length > 60) out.push('   ... và ' + (kenhTrong.length - 60) + ' mã nữa');
    out.push('');
  }

  if (trong.length) {
    out.push('C. TRỐNG HOẶC BẰNG 0, đúng kênh — ' + trong.length + ' mã');
    trong.slice(0, 60).forEach(function (x) { out.push(x); });
    if (trong.length > 60) out.push('   ... và ' + (trong.length - 60) + ' mã nữa');
    out.push('');
  }

  if (!laChuoi.length && !kenhTrong.length && !trong.length) {
    out.push('Không mã nào thiếu giá. Nếu màn hình vẫn báo thiếu thì con số đó');
    out.push('đến từ một đơn vị khác — chạy lại với đúng mã đơn vị đang mở.');
  }

  Logger.log(out.join('\n'));
  return out.join('\n');
}

/**
 * Đọc dữ liệu ĐÚNG THEO ĐƯỜNG CỦA /exec rồi báo kiểu dữ liệu thật.
 *
 * VÌ SAO CẦN: đây là điểm mù đã làm một lỗi nghiêm trọng ẩn qua ba vòng chẩn
 * đoán. Hàm chạy tay trong trình soạn thảo đọc bằng getDataRange().getValues()
 * và luôn thấy SỐ; còn /exec đi qua prefetchSheets_ dùng Sheets API, vốn có
 * lúc trả về CHUỖI đã định dạng theo locale. Hai đường, hai kết quả, trên cùng
 * một ô.
 *
 * Hàm này ép đọc theo đường thứ hai để so. Chạy nó mỗi khi một con số trên màn
 * hình không khớp với bảng tính.
 */
function adminReportReadPath() {
  resetTableCache_();
  prefetchForAction_('getMonthlyWorkspace');

  var out = [];
  out.push('=== KIỂU DỮ LIỆU KHI ĐỌC THEO ĐƯỜNG /exec ===');
  out.push('(prefetchSheets_ + Sheets API — KHÔNG phải getValues())');
  out.push('');

  var t = readTable_(SHEETS.PRODUCTS);
  var iGia = t.idx.avg_price, iSku = t.idx.sku_code;
  var soSo = 0, soChuoi = 0, mau = [];
  for (var i = 0; i < t.rows.length; i++) {
    var v = t.rows[i][iGia];
    if (typeof v === 'number') soSo++;
    else if (typeof v === 'string' && v.trim() !== '') {
      soChuoi++;
      if (mau.length < 5) mau.push('  ' + t.rows[i][iSku] + '  ' + JSON.stringify(v));
    }
  }

  out.push('Cột avg_price: ' + soSo + ' ô là SỐ · ' + soChuoi + ' ô là CHUỖI');
  if (soChuoi > 0) {
    out.push('');
    out.push('HỎNG. Chuỗi ở đây nghĩa là Sheets API đang trả FORMATTED_VALUE.');
    out.push('Number("1.234.567") ra NaN, và mọi `Number(x) || 0` biến nó thành 0.');
    out.push('Sửa: đặt valueRenderOption UNFORMATTED_VALUE trong prefetchSheets_.');
    out.push('Ví dụ:');
    mau.forEach(function (x) { out.push(x); });
  } else {
    out.push('ĐẠT — mọi giá trị về dạng số, đúng như đường getValues().');
  }

  var c = readTable_(SHEETS.CYCLES);
  var iBm = c.idx.base_month;
  if (c.rows.length && iBm != null) {
    var bm = c.rows[0][iBm];
    out.push('');
    out.push('base_month đọc được: ' + JSON.stringify(bm) + ' (' + typeof bm + ')' +
             ' -> normalizeMonth_ cho "' + normalizeMonth_(bm) + '"');
    out.push('Chuỗi kết quả phải có dạng yyyy-MM-01. Nếu ra số hoặc rỗng thì');
    out.push('normalizeMonth_ chưa đọc được dạng ngày mà đường này trả về.');
  }

  return psInLog_(out);
}


/**
 * Giữ cột sku_code ở định dạng VĂN BẢN trước khi ghi bất cứ thứ gì vào
 * Products.
 *
 * VÌ SAO CẦN: setValues ghi chuỗi "2013050022" vào một ô định dạng Tự động thì
 * Google Sheets tự đổi nó thành SỐ. writeRowPatch_ ghi lại CẢ DÒNG và
 * upsertRows_ ghi lại CẢ BẢNG, nên chỉ cần một lần sửa sản phẩm là kiểu dữ
 * liệu của mã đổi — và mã có số 0 đứng đầu ("0123") thì mất luôn số 0, không
 * khôi phục được từ chính bảng đó.
 *
 * Đặt định dạng '@' TRƯỚC khi ghi thì chuỗi ở lại là chuỗi.
 */
function giuCotMaDangChu_() {
  var t = readTable_(SHEETS.PRODUCTS);
  var cot = t.idx.sku_code;
  if (cot === undefined) return;
  var sheet = t.sheet || getOrCreateSheet_(SHEETS.PRODUCTS);
  var soDong = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, cot + 1, soDong, 1).setNumberFormat('@');
}

/**
 * Mã sản phẩm đang lưu dạng gì, và có dòng dữ liệu nào bị mồ côi vì lệch mã.
 *
 * CHỈ ĐỌC. Chạy từ Run.gs (run_baoCao_kieuMa).
 *
 * Hai câu hỏi hàm này trả lời:
 *   1. Bao nhiêu ô sku_code đang là số thay vì chữ. Số thì không sai ngay,
 *      nhưng là dấu hiệu bảng đã bị một lệnh ghi đổi kiểu.
 *   2. QUAN TRỌNG HƠN: có mã nào trong MonthlyForecastLines / WeeklyRegionSplits
 *      / Actuals mà KHÔNG khớp với mã nào trong Products không. Đây là cách
 *      duy nhất phát hiện mã bị mất số 0 đứng đầu: dòng dự báo còn giữ "0123"
 *      còn danh mục đã thành 123, và hai bên không còn nhận ra nhau.
 */
function adminReportSkuTypes() {
  var out = [];
  var t = readTable_(SHEETS.PRODUCTS);
  var iSku = t.idx.sku_code;

  var soSo = 0, soChuoi = 0, soKhac = 0;
  var maCo = {};
  var soDauKhong = [];
  for (var i = 0; i < t.rows.length; i++) {
    var v = t.rows[i][iSku];
    var ma = String(v === null || v === undefined ? '' : v).trim();
    if (!ma) continue;
    maCo[ma] = true;
    if (typeof v === 'number') soSo++;
    else if (typeof v === 'string') { soChuoi++; if (/^0\d/.test(ma)) soDauKhong.push(ma); }
    else soKhac++;
  }

  out.push('=== KIỂU DỮ LIỆU CỦA MÃ SẢN PHẨM ===');
  out.push('Ô là SỐ  : ' + soSo);
  out.push('Ô là CHỮ : ' + soChuoi);
  if (soKhac) out.push('Kiểu khác: ' + soKhac);
  out.push('');
  if (soSo) {
    out.push('Mã lưu dạng SỐ không sai ngay — client đã chuẩn hoá cả hai phía.');
    out.push('Nhưng mã có số 0 đứng đầu thì dạng số là MẤT số 0 đó vĩnh viễn.');
    out.push('Phần dưới cho biết có mã nào đã hỏng thật hay không.');
  } else {
    out.push('Toàn bộ mã đang ở dạng chữ — đúng như mong muốn.');
  }
  if (soDauKhong.length) {
    out.push('');
    out.push('Mã còn giữ số 0 đứng đầu (' + soDauKhong.length + '): ' + soDauKhong.slice(0, 20).join(', '));
    out.push('Những mã này PHẢI ở dạng chữ. Đừng ghi đè cột mã bằng tay.');
  }

  // Mã mồ côi: có ở bảng dữ liệu mà không có ở danh mục.
  var nguon = [
    { ten: 'MonthlyForecastLines', sheet: SHEETS.MONTHLY_LINES },
    { ten: 'WeeklyRegionSplits', sheet: SHEETS.WEEKLY_SPLITS },
    { ten: 'Actuals', sheet: SHEETS.ACTUALS }
  ];

  out.push('');
  out.push('=== MÃ CÓ TRONG DỮ LIỆU NHƯNG KHÔNG CÓ TRONG DANH MỤC ===');
  var tongMoCoi = 0;
  nguon.forEach(function (n) {
    var b;
    try { b = readTable_(n.sheet); } catch (e) { out.push(n.ten + ': không đọc được (' + e.message + ')'); return; }
    var c = b.idx.sku_code;
    if (c === undefined) { out.push(n.ten + ': không có cột sku_code'); return; }
    var moCoi = {};
    for (var j = 0; j < b.rows.length; j++) {
      var m = String(b.rows[j][c] === null || b.rows[j][c] === undefined ? '' : b.rows[j][c]).trim();
      if (!m || maCo[m]) continue;
      moCoi[m] = (moCoi[m] || 0) + 1;
    }
    var ds = Object.keys(moCoi);
    tongMoCoi += ds.length;
    out.push(n.ten + ': ' + ds.length + ' mã mồ côi' + (ds.length ? ' — ' + ds.slice(0, 25).join(', ') : ''));
  });

  out.push('');
  if (!tongMoCoi) {
    out.push('KHÔNG có mã mồ côi. Không mã nào bị mất khi đổi kiểu dữ liệu.');
  } else {
    out.push('CÓ mã mồ côi. Với mỗi mã ở trên, so với danh mục xem có mã nào GIỐNG HỆT');
    out.push('nhưng thiếu số 0 đứng đầu không — nếu có thì đó chính là mã đã bị đổi kiểu,');
    out.push('và cách sửa là gõ lại mã đúng vào ô đó sau khi đặt định dạng cột là Văn bản.');
  }

  return psInLog_(out);
}
