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
