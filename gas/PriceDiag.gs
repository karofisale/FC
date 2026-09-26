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
    .filter(function (b) { return laDangBat_(b.is_active); })
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
  var nhinThay = 0, thieu = 0;
  readObjects_(SHEETS.PRODUCTS).forEach(function (p) {
    if (!String(p.sku_code || '').trim()) return;
    var act = String(p.is_active);
    if (act === '0' || act.toLowerCase() === 'false') return;
    var kenh = String(p.default_channel || '').trim();
    if (bu && kenh && kenh !== String(bu)) return;
    nhinThay++;
    var so = Number(p.avg_price);
    if (!(isFinite(so) && so > 0)) thieu++;
  });
  return { nhinThay: nhinThay, thieu: thieu };
}

/**
 * @param {string} bu Mã đơn vị, ví dụ 'OEM'. Bỏ trống thì soi toàn bộ danh mục.
 */
function adminReportMissingPrice(bu) {
  var trong = [], kenhTrong = [];
  var tongXet = 0;

  // Nhóm "ô là chuỗi, không phải số" của bản Sheets đã BỎ — avg_price là cột
  // `numeric` thật trong Postgres, PostgREST luôn trả JSON number, không còn
  // đường nào một giá trị nhìn giống số nhưng đọc ra là chuỗi định dạng theo
  // locale (đúng loại lỗi cả file chẩn đoán này từng tồn tại để tìm).
  readObjects_(SHEETS.PRODUCTS).forEach(function (p) {
    var ma = String(p.sku_code || '').trim();
    if (!ma) return;

    var act = String(p.is_active);
    if (act === '0' || act.toLowerCase() === 'false') return;

    var kenh = String(p.default_channel || '').trim();
    if (bu && kenh && kenh !== String(bu)) return;
    tongXet++;

    var so = Number(p.avg_price);
    if (isFinite(so) && so > 0) return;

    var mo = '  ' + ma + '  [' + (kenh || 'kênh trống') + ']  ' + String(p.name || '').slice(0, 38);
    if (!kenh) kenhTrong.push(mo);
    else trong.push(mo);
  });

  var out = [];
  out.push('=== MÃ KHÔNG CÓ GIÁ, THEO CÁCH MÀN HÌNH ĐÁNH GIÁ ===');
  out.push('Đơn vị: ' + (bu || '(toàn bộ danh mục)'));
  out.push('Số mã màn hình này nhìn thấy: ' + tongXet);
  out.push('Không có giá: ' + (trong.length + kenhTrong.length));
  out.push('');

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

  if (!kenhTrong.length && !trong.length) {
    out.push('Không mã nào thiếu giá. Nếu màn hình vẫn báo thiếu thì con số đó');
    out.push('đến từ một đơn vị khác — chạy lại với đúng mã đơn vị đang mở.');
  }

  Logger.log(out.join('\n'));
  return out.join('\n');
}

/**
 * KHÔNG CÒN ÁP DỤNG sau khi chuyển sang Postgres (schema-fc.sql).
 *
 * Hàm này từng so 2 đường đọc dữ liệu (getValues() trong editor luôn thấy SỐ,
 * còn /exec qua prefetchSheets_+Sheets API có lúc trả FORMATTED_VALUE — cùng
 * một ô, hai kiểu dữ liệu khác nhau). Postgres không có khái niệm "định dạng
 * hiển thị theo locale của ô" — PostgREST luôn trả đúng kiểu cột đã khai
 * (avg_price là `numeric`, luôn ra JSON number), nên KHÔNG CÒN đường nào hai
 * lượt đọc cùng một dữ liệu cho ra hai kiểu khác nhau. Giữ hàm rỗng lại đây
 * (thay vì xoá hẳn) để ai gọi nhầm còn thấy giải thích, không phải
 * ReferenceError khó hiểu.
 */
function adminReportReadPath() {
  return psInLog_([
    '=== KHÔNG CÒN ÁP DỤNG ===',
    'Lỗi FORMATTED_VALUE mà hàm này từng dò chỉ tồn tại ở Google Sheets API.',
    'Từ khi Products chuyển sang Postgres (cột avg_price kiểu numeric), PostgREST',
    'luôn trả đúng kiểu số thật — không còn 2 đường đọc cho 2 kết quả khác nhau.'
  ]);
}

/**
 * KHÔNG CÒN ÁP DỤNG sau khi chuyển sang Postgres.
 *
 * Hàm này từng ép định dạng ô sku_code thành Văn bản TRƯỚC khi ghi, vì Google
 * Sheets tự đổi chuỗi toàn số ("2013050022") thành number và làm mất số 0
 * đứng đầu. Cột Postgres là `text` thật — ghi gì đọc lại đúng nấy, không có
 * kiểu "định dạng ô" nào để tự ý đổi. Giữ hàm rỗng (không xoá) phòng khi còn
 * chỗ gọi nào sót lại.
 */
function giuCotMaDangChu_() {}

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
/**
 * Hai phần của báo cáo gốc (Sheets):
 *   1. "Số 0 đứng đầu bị mất vì ô tự đổi thành number" — KHÔNG CÒN ÁP DỤNG.
 *      Cột Postgres `text` không có kiểu ô tự động đổi; sku_code luôn giữ
 *      nguyên chuỗi đã ghi.
 *   2. "Mã mồ côi" (có ở MonthlyForecastLines/WeeklyRegionSplits/Actuals mà
 *      không có ở Products) — KHÔNG CÒN XẢY RA ĐƯỢC, không phải chỉ "hiếm
 *      gặp": schema-fc.sql khai `sku_code references fc.products(sku_code)`
 *      trên cả 3 bảng, nên Postgres TỪ CHỐI NGAY LÚC GHI nếu mã chưa có trong
 *      danh mục — không còn cách nào tạo ra dữ liệu mồ côi để mà báo cáo.
 * Giữ hàm lại, trả thẳng lý do thay vì dò một thứ không thể xảy ra.
 */
function adminReportSkuTypes() {
  return psInLog_([
    '=== KHÔNG CÒN ÁP DỤNG ===',
    'Cả hai lỗi báo cáo này từng dò (mã mất số 0 đứng đầu do Sheets tự đổi kiểu ô,',
    'và "mã mồ côi" ở bảng dữ liệu không khớp danh mục Products) đều không thể',
    'xảy ra được nữa sau khi chuyển sang Postgres: cột sku_code là `text` thật',
    '(không tự đổi kiểu), và khoá ngoại `references fc.products(sku_code)` trên',
    'MonthlyForecastLines/WeeklyRegionSplits/ActualSalesResults chặn ngay lúc ghi',
    'nếu mã chưa có trong danh mục — không đợi tới lúc dò ra mới biết.'
  ]);
}
