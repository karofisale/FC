/**
 * PriceSync.gs — đồng bộ avg_price của danh mục FC từ số bán thật của OEM và
 * Xuất khẩu.
 *
 * VÌ SAO CẦN: avg_price không phải trường trang trí. getB0Summary_ tính
 * `total_revenue += qty × avg_price` (Queries.gs), nên giá cũ hoặc bằng 0 là
 * doanh thu dự báo sai — mà sai kiểu im lặng, không có gì báo.
 *
 * Mọi hàm ghi mặc định CHẠY THỬ, phải truyền true mới ghi thật:
 *
 *   adminReportPrices()      xem trước, không đổi gì
 *   adminSyncPrices(true)    ghi thật vào cột avg_price
 *
 * ---------------------------------------------------------------------------
 * BỐN QUYẾT ĐỊNH ĐÃ CHỐT, GHI LẠI ĐỂ KHỎI PHẢI SUY LẠI
 *
 * 1. QUY VỀ VND, quy đổi LÚC ĐỒNG BỘ chứ không lúc đọc.
 *    Giá của Xuất khẩu là USD (app đó làm việc theo FOB và có tỷ giá riêng),
 *    giá của OEM là VND, còn FC chỉ có MỘT cột avg_price và không có cột đơn
 *    vị tiền. Để nguyên là USD nằm cạnh VND trong cùng một cột và mọi con số
 *    cộng ngang đơn vị kinh doanh trở thành vô nghĩa.
 *    Quy đổi lúc đồng bộ (chứ không lúc đọc) vì avg_price nuôi doanh thu DỰ
 *    BÁO — một bản kế hoạch không nên nhúc nhích vì tỷ giá sáng nay đổi.
 *
 * 2. TỶ GIÁ lấy đúng ô Exchange_Rate trong tab Dashboard của hub ExportSystem,
 *    tại thời điểm chạy. Tỷ giá đã dùng và thời điểm chạy được ghi vào Script
 *    Property (xem PROP_RATE / PROP_AT) — không có nó thì không ai trả lời
 *    được "vì sao doanh thu XK là con số này", và số liệu không giải thích
 *    được là số liệu người ta mất niềm tin rất nhanh.
 *
 * 3. BÌNH QUÂN GIA QUYỀN theo sản lượng: tổng tiền / tổng lượng.
 *    KHÔNG dùng trung bình cộng đơn giá. Đây là chỗ khác biệt có hậu quả thật,
 *    và app OEM đang dùng cách kia (Products.gs: prices.reduce/length) nên số
 *    ở đây sẽ KHÁC số trên màn hình OEM — có chủ ý.
 *      Ví dụ: 1 đơn 1 cái giá 100k, 1 đơn 1.000 cái giá 50k.
 *        trung bình cộng  → 75k  → 1.001 cái = 75,1 triệu
 *        gia quyền        → 50k  → 1.001 cái = 50,1 triệu (đúng)
 *    Hai app trả lời hai câu hỏi khác nhau: OEM cần "đơn giá tôi hay chào"
 *    để nhập đơn; FC cần "doanh thu kỳ vọng trên mỗi đơn vị" để lập kế hoạch.
 *
 * 4. CHỈ LẤY 12 THÁNG GẦN NHẤT. Giá bình quân trên toàn bộ lịch sử nhiều năm
 *    không mô tả được kỳ kế hoạch sắp tới.
 * ---------------------------------------------------------------------------
 *
 * Giá Xuất khẩu lấy theo thứ tự ưu tiên: tab Details của Operations2026 (đơn ĐÃ
 * GIAO) trước, thiếu mã nào mới lấy PIDetails của hub (BÁO GIÁ PI, gồm cả đơn
 * chưa giao). Số đã giao chắc chắn hơn; nhưng một mã mới chỉ có báo giá mà chưa
 * giao lô nào thì thà lấy giá PI còn hơn để 0 rồi tính doanh thu bằng không.
 *
 * Mã dùng chung (có ở cả hai nguồn — 39 mã tính đến 09/2026, đều là linh
 * kiện): lấy giá của OEM, vì OEM có giá từ giao dịch nội địa thật. Nhưng vẫn
 * báo ra mã nào hai nguồn lệch quá NGUONG_LECH: hoặc dữ liệu sai, hoặc giá
 * thật sự khác theo kênh mà một cột duy nhất không diễn tả được.
 */

/** Số tháng lịch sử đưa vào bình quân. */
var PS_SO_THANG = 12;

/** Lệch quá bao nhiêu giữa hai nguồn thì nêu tên ra để người ta nhìn. */
var PS_NGUONG_LECH = 0.20;

var PS_PROP_RATE = 'PRICE_SYNC_RATE';
var PS_PROP_AT = 'PRICE_SYNC_AT';

/** 'yyyy-MM' của mốc N tháng trước, dùng để cắt lịch sử. */
function psTuThang_(soThang) {
  var d = new Date();
  d.setMonth(d.getMonth() - soThang);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
}

/** Số an toàn: ô có thể là số, chuỗi, hoặc rỗng. */
function psSo_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var n = parseFloat(String(v == null ? '' : v).replace(/[^\d.-]/g, ''));
  return isFinite(n) ? n : 0;
}

/**
 * Tỷ giá USD→VND từ tab Dashboard của hub (các dòng Index/Value).
 * Ném lỗi thay vì trả 0: quy đổi bằng 0 sẽ đặt giá XK về 0 hàng loạt mà
 * không có gì báo — đúng kiểu hỏng im lặng cần tránh nhất ở đây.
 */
function psTyGia_() {
  var sh = SpreadsheetApp.openById(PREP_HUB_ID).getSheetByName('Dashboard');
  if (!sh) throw new Error('Hub ExportSystem không có tab Dashboard.');
  var v = sh.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x).trim(); });
  var iI = h.indexOf('Index'), iV = h.indexOf('Value');
  if (iI < 0 || iV < 0) throw new Error('Tab Dashboard thiếu cột Index/Value.');
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][iI]).trim() === 'Exchange_Rate') {
      var r = psSo_(v[i][iV]);
      if (r > 0) return r;
    }
  }
  throw new Error('Không đọc được Exchange_Rate trong tab Dashboard của hub.');
}

/**
 * Giá bình quân gia quyền theo SKU từ tab Data của OEM, đơn vị VND.
 * Cột theo đúng oemAppLoadTransactions_ (SalesData.gs bên OEM):
 *   [8] mã · [11] hoặc [10] số lượng · [17] doanh thu · [40] tháng 'Tmm-yyyy'
 */
function psGiaOEM_(tuThang) {
  var sh = SpreadsheetApp.openById(PREP_OEM_SHEET_ID).getSheetByName('Data');
  if (!sh) throw new Error('File OEM không có tab Data.');
  var rows = sh.getDataRange().getValues();
  var gom = {};
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    var ma = sopMa_(r[8]);
    if (!ma || !prepChuan_(ma)) continue;

    // 'T08-2026' -> '2026-08'. Dòng không đọc được tháng thì bỏ qua chứ không
    // tính vào: thà thiếu một dòng còn hơn kéo giá của 5 năm trước vào.
    var m = /^T(\d{1,2})-(\d{4})$/.exec(String(r[40] || '').trim());
    if (!m) continue;
    var thang = m[2] + '-' + ('0' + m[1]).slice(-2);
    if (thang < tuThang) continue;

    var sl = psSo_(r[11]) || psSo_(r[10]);
    var tien = psSo_(r[17]);
    if (sl <= 0 || tien <= 0) continue;

    if (!gom[ma]) gom[ma] = { sl: 0, tien: 0 };
    gom[ma].sl += sl;
    gom[ma].tien += tien;
  }
  var out = {};
  Object.keys(gom).forEach(function (ma) {
    out[ma] = Math.round(gom[ma].tien / gom[ma].sl);
  });
  return out;
}

/**
 * Gom tổng tiền / tổng lượng theo mã từ MỘT tab bất kỳ, đọc theo TÊN CỘT.
 *
 * Dùng chung cho cả hai nguồn của Xuất khẩu vì phép tính giống hệt nhau — chỉ
 * khác tên cột và tab. Đọc theo tên chứ không theo vị trí vì hai tab này do
 * người dùng duy trì và thứ tự cột đã đổi trong quá khứ.
 *
 * @return {Object} { ma: {sl, tien} } — CHƯA chia, để nơi gọi tự quyết.
 */
function psGomTheoMa_(sheet, ten, tuThang) {
  var v = sheet.getDataRange().getValues();
  if (v.length < 2) return {};
  var h = v[0].map(function (x) { return String(x).trim(); });
  function cot(ds) {
    for (var i = 0; i < ds.length; i++) {
      var j = h.indexOf(ds[i]);
      if (j >= 0) return j;
    }
    return -1;
  }
  var iMa = cot(ten.ma), iSl = cot(ten.sl), iTien = cot(ten.tien);
  var iNgay = ten.ngay ? cot(ten.ngay) : -1;
  if (iMa < 0 || iSl < 0 || iTien < 0) {
    throw new Error('Tab ' + sheet.getName() + ' thiếu cột ' +
                    ten.ma[0] + '/' + ten.sl[0] + '/' + ten.tien[0] + '.');
  }

  var gom = {};
  for (var r = 1; r < v.length; r++) {
    var row = v[r];
    var ma = sopMa_(row[iMa]);
    if (!ma || !prepChuan_(ma)) continue;

    if (iNgay >= 0) {
      var d = row[iNgay];
      // Ngày ở đây là Date thật (Export ghi bằng new Date(...)). Ô trống hoặc
      // text không đọc được thì bỏ dòng — thà thiếu một dòng còn hơn kéo giá
      // của mấy năm trước vào bình quân.
      if (Object.prototype.toString.call(d) !== '[object Date]' || isNaN(d.getTime())) continue;
      if (Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM') < tuThang) continue;
    }

    var sl = psSo_(row[iSl]);
    var tien = psSo_(row[iTien]);
    if (sl <= 0 || tien <= 0) continue;

    if (!gom[ma]) gom[ma] = { sl: 0, tien: 0 };
    gom[ma].sl += sl;
    gom[ma].tien += tien;
  }
  return gom;
}

/** Chia tổng tiền cho tổng lượng. */
function psBinhQuan_(gom) {
  var out = {};
  Object.keys(gom).forEach(function (ma) { out[ma] = gom[ma].tien / gom[ma].sl; });
  return out;
}

/**
 * Giá USD của Xuất khẩu, hai nguồn theo thứ tự ưu tiên:
 *
 *   1. Details (Operations2026) — đơn ĐÃ GIAO. Số chắc chắn nhất.
 *   2. PIDetails (hub)          — BÁO GIÁ PI, gồm cả đơn chưa giao.
 *
 * Details thắng ở mọi mã nó có. PI chỉ lấp chỗ trống: một mã mới chỉ có báo
 * giá mà chưa giao lô nào trong cửa sổ thì thà lấy giá PI còn hơn để 0 rồi
 * tính doanh thu bằng không.
 *
 * @return {Object} { ma: {gia, nguon} } — nguon là 'daGiao' hoặc 'baoGia'.
 */
function psGiaXK_(tuThang) {
  var det = SpreadsheetApp.openById(PREP_OPS2026_ID).getSheetByName('Details');
  if (!det) throw new Error('File Operations2026 không có tab Details.');
  var daGiao = psBinhQuan_(psGomTheoMa_(det, {
    ma: ['Code'], sl: ['Ship Qty'], tien: ['Value'], ngay: ['Shipdate']
  }, tuThang));

  var baoGia = {};
  var pid = SpreadsheetApp.openById(PREP_HUB_ID).getSheetByName('PIDetails');
  if (pid) {
    baoGia = psBinhQuan_(psGomTheoMa_(pid, {
      ma: ['Item_code'], sl: ['Qty'], tien: ['Amount'], ngay: ['PI_Date']
    }, tuThang));
  }

  var out = {};
  Object.keys(baoGia).forEach(function (ma) { out[ma] = { gia: baoGia[ma], nguon: 'baoGia' }; });
  Object.keys(daGiao).forEach(function (ma) { out[ma] = { gia: daGiao[ma], nguon: 'daGiao' }; });
  return out;
}

/** Xem trước, không đổi gì. */
function adminReportPrices() {
  return psChay_(false);
}

/** Ghi thật. Phải truyền đúng true. */
function adminSyncPrices(apply) {
  return psChay_(apply === true);
}

function psChay_(ghiThat) {
  var tuThang = psTuThang_(PS_SO_THANG);
  var tyGia = psTyGia_();
  var oem = psGiaOEM_(tuThang);
  var xk = psGiaXK_(tuThang);   // { ma: {gia, nguon} }

  var table = readTable_(SHEETS.PRODUCTS);
  var iSku = table.idx.sku_code;
  var iGia = table.idx.avg_price;
  var iTen = table.idx.name;
  if (iSku == null || iGia == null) {
    throw new Error('Tab Products thiếu cột sku_code hoặc avg_price.');
  }

  var out = [];
  var doi = [];
  var lech = [];
  var khongNguon = 0;
  var giuNguyen = 0;

  for (var i = 0; i < table.rows.length; i++) {
    var ma = sopMa_(table.rows[i][iSku]);
    if (!ma) continue;

    var gOem = oem[ma];
    var gXk = xk[ma] ? Math.round(xk[ma].gia * tyGia) : undefined;

    // Mã dùng chung -> lấy OEM (giá từ giao dịch nội địa thật), nhưng nêu tên
    // nếu hai nguồn lệch nhiều.
    var moi;
    if (gOem !== undefined && gXk !== undefined) {
      moi = gOem;
      var mau = Math.max(gOem, gXk);
      if (mau > 0 && Math.abs(gOem - gXk) / mau > PS_NGUONG_LECH) {
        lech.push('  ' + ma + '  OEM ' + gOem.toLocaleString('en-US') +
                  ' vs XK ' + gXk.toLocaleString('en-US') +
                  '  (' + String(table.rows[i][iTen] || '').slice(0, 40) + ')');
      }
    } else if (gOem !== undefined) {
      moi = gOem;
    } else if (gXk !== undefined) {
      moi = gXk;
    } else {
      // Không có số bán trong cửa sổ -> KHÔNG đụng vào. Có thể là giá nhập tay
      // ở màn Thêm sản phẩm, xoá đi là làm mất việc của người khác.
      khongNguon++;
      continue;
    }

    var cu = psSo_(table.rows[i][iGia]);
    if (cu === moi) { giuNguyen++; continue; }
    doi.push({ rowIndex: i, ma: ma, cu: cu, moi: moi,
               ten: String(table.rows[i][iTen] || '').slice(0, 40) });
  }

  out.push('=== ĐỒNG BỘ GIÁ BÁN TRUNG BÌNH ===');
  out.push(ghiThat ? 'CHẾ ĐỘ: GHI THẬT' : 'CHẾ ĐỘ: chạy thử — không đổi gì');
  out.push('Cửa sổ: từ ' + tuThang + ' (' + PS_SO_THANG + ' tháng)');
  out.push('Tỷ giá USD→VND: ' + tyGia.toLocaleString('en-US') + '  (Exchange_Rate, hub ExportSystem)');
  var soDaGiao = 0, soBaoGia = 0;
  Object.keys(xk).forEach(function (m) { xk[m].nguon === 'daGiao' ? soDaGiao++ : soBaoGia++; });
  out.push('Nguồn: OEM ' + Object.keys(oem).length + ' mã · XK ' + Object.keys(xk).length +
           ' mã (' + soDaGiao + ' từ đơn đã giao, ' + soBaoGia + ' chỉ có báo giá PI)');
  out.push('');
  out.push('Đổi giá: ' + doi.length + ' mã · giữ nguyên: ' + giuNguyen +
           ' · không có số bán trong cửa sổ (bỏ qua): ' + khongNguon);

  if (doi.length) {
    out.push('');
    out.push('  MÃ           CŨ →  MỚI');
    doi.slice(0, 40).forEach(function (d) {
      out.push('  ' + d.ma + '  ' + d.cu.toLocaleString('en-US') +
               ' → ' + d.moi.toLocaleString('en-US') + '  ' + d.ten);
    });
    if (doi.length > 40) out.push('  ... và ' + (doi.length - 40) + ' mã nữa');
  }

  if (lech.length) {
    out.push('');
    out.push('LỆCH > ' + Math.round(PS_NGUONG_LECH * 100) + '% giữa hai nguồn — ' +
             lech.length + ' mã (đã lấy giá OEM):');
    lech.forEach(function (x) { out.push(x); });
    out.push('Hoặc dữ liệu sai, hoặc giá thật sự khác theo kênh — mà một cột');
    out.push('avg_price duy nhất không diễn tả được. Xem qua trước khi tin số.');
  }

  if (!ghiThat) {
    out.push('');
    out.push('Chạy adminSyncPrices(true) để ghi thật.');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }

  doi.forEach(function (d) {
    writeRowPatch_(SHEETS.PRODUCTS, table, d.rowIndex, { avg_price: d.moi });
  });

  // Ghi lại tỷ giá đã dùng và thời điểm — để con số giải thích được về sau.
  // Dùng thẳng PropertiesService: FC không có hàm bọc setProp_ như Karofi ID.
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PS_PROP_RATE, String(tyGia));
  props.setProperty(PS_PROP_AT, new Date().toISOString());

  out.push('');
  out.push('ĐÃ GHI ' + doi.length + ' mã. Tỷ giá và thời điểm lưu ở Script Property ' +
           PS_PROP_RATE + ' / ' + PS_PROP_AT + '.');
  Logger.log(out.join('\n'));
  return out.join('\n');
}
