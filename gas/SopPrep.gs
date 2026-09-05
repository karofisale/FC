/**
 * SopPrep.gs — dọn danh mục trước khi bật chức năng nhập SOP.
 * Mọi hàm ghi đều mặc định CHẠY THỬ; phải truyền true mới ghi thật.
 *
 *   adminReportSharedSkus()             xem trước, không đổi gì
 *   adminClearChannelForShared(true)    để trống kênh cho SKU dùng chung
 *   adminAddMissingSkus('2026-09', true) thêm SKU thiếu, chỉ trong phạm vi kỳ
 *
 * Vì sao phải làm trước: getProducts_ chỉ trả SKU có default_channel trùng đơn
 * vị HOẶC để trống, còn saveMonthlyLines_ ghi được mọi SKU vì nó không kiểm
 * kênh. Nhập trước khi dọn sẽ ra tình trạng tệ nhất: số vào đủ nhưng màn hình
 * thiếu hàng, không có lỗi nào báo.
 */

var PREP_OEM_SHEET_ID = '1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk';
var PREP_OPS2026_ID   = '1fDUB6oqyMisV4NxId4JyGhmizgucit8zOdI38fBRZHA';
var PREP_HUB_ID       = '16kDRbTffeSFSxwAZPCCpXGODUByEquCchnkqs1kyFrc';

/** Mã hàng LUÔN ép chuỗi: getValues() trả mã toàn chữ số (1001050029) dạng
 *  number, so number với chuỗi thì không mã nào khớp và báo cáo sẽ nói dối. */
function sopMa_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

/**
 * Mã hàng chuẩn của Karofi là chuỗi TOÀN CHỮ SỐ (1001050029, 2005010286).
 * Ô mã trong nguồn thỉnh thoảng bị ghi chú lọt vào: "NewRO1", "Spare1",
 * "Mã mới". Những ô đó KHÔNG được thêm vào danh mục — nhưng cũng không được
 * bỏ qua im lặng, vì mỗi ô là số lượng thật sẽ rơi mất khi nhập.
 */
function prepChuan_(ma) {
  return /^\d{6,}$/.test(String(ma || '').trim());
}

function prepThangCua_(v) {
  if (!v && v !== 0) return '';
  var d = (Object.prototype.toString.call(v) === '[object Date]') ? v : new Date(v);
  if (!d || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

function prepThangHienTai_() {
  var n = new Date();
  return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2);
}

/**
 * Quét hai nguồn.
 * @param {string} tuThang 'yyyy-MM' — chỉ lấy dữ liệu từ tháng này trở đi.
 *     Bỏ trống thì lấy tất cả (dùng cho việc xét SKU dùng chung, vốn là bản
 *     chất của sản phẩm chứ không phụ thuộc kỳ nào).
 */
function prepQuetNguon_(tuThang) {
  var oem = {}, xk = {}, ten = {}, phiChuan = {};
  var loc = tuThang ? String(tuThang) : '';

  function nhan(bucket, ma, t, thang) {
    ma = sopMa_(ma);
    if (!ma) return;
    if (loc && thang && thang < loc) return;
    if (!prepChuan_(ma)) { phiChuan[ma] = (phiChuan[ma] || 0) + 1; return; }
    bucket[ma] = true;
    t = String(t == null ? '' : t).trim();
    if (t && !ten[ma]) ten[ma] = t;
  }

  // --- OEM ---
  var oemSS = SpreadsheetApp.openById(PREP_OEM_SHEET_ID);
  var plan = oemSS.getSheetByName('SOP_Plan');
  if (plan && plan.getLastRow() > 1) {
    plan.getRange(2, 1, plan.getLastRow() - 1, 8).getValues().forEach(function (r) {
      if (String(r[7]).trim() !== 'Đã duyệt') return;
      var ky = (Object.prototype.toString.call(r[0]) === '[object Date]')
        ? prepThangCua_(r[0]) : String(r[0]).trim();
      nhan(oem, r[2], '', ky);
    });
  }
  var sop = oemSS.getSheetByName('SOP');
  if (sop && sop.getLastRow() > 1) {
    // Tab SOP luôn là kỳ mới nhất nên không lọc theo tháng; chỉ lấy TÊN.
    sop.getRange(2, 1, sop.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var ma = sopMa_(r[0]);
      if (!ma || !prepChuan_(ma)) return;
      oem[ma] = true;
      var t = String(r[1] || '').trim();
      if (t && !ten[ma]) ten[ma] = t;
    });
  }

  // --- Xuất khẩu: Details theo Shipdate ---
  var det = SpreadsheetApp.openById(PREP_OPS2026_ID).getSheetByName('Details');
  if (det && det.getLastRow() > 1) {
    det.getRange(2, 1, det.getLastRow() - 1, 10).getValues().forEach(function (r) {
      nhan(xk, r[3], r[4], prepThangCua_(r[9]));   // D=Code E=Product J=Shipdate
    });
  }

  // --- Xuất khẩu: PIDetails nối PITotal theo Expected Load ---
  var hub = SpreadsheetApp.openById(PREP_HUB_ID);
  var pt = hub.getSheetByName('PITotal');
  var ngayPi = {};
  if (pt && pt.getLastRow() > 1) {
    pt.getRange(2, 3, pt.getLastRow() - 1, 6).getValues().forEach(function (r) {
      var pi = sopMa_(r[0]);
      if (pi) ngayPi[pi] = r[5];                    // C=PI_Number H=Expected Load
    });
  }
  var pd = hub.getSheetByName('PIDetails');
  if (pd && pd.getLastRow() > 1) {
    pd.getRange(2, 3, pd.getLastRow() - 1, 5).getValues().forEach(function (r) {
      var pi = sopMa_(r[0]);                        // C=PI_Number
      nhan(xk, r[2], r[3], prepThangCua_(ngayPi[pi])); // E=Item_code F=Product_description
    });
  }

  return { oem: oem, xk: xk, ten: ten, phiChuan: phiChuan };
}

/** Xem trước, không đổi gì. tuThang chỉ ảnh hưởng phần "SKU thiếu". */
function adminReportSharedSkus(tuThang) {
  if (!tuThang) tuThang = prepThangHienTai_();
  var out = [];

  var table = readTable_(SHEETS.PRODUCTS);
  var iSku = table.idx.sku_code, iCh = table.idx.default_channel;
  var kenhCua = {}, coTrongFC = {};
  for (var i = 0; i < table.rows.length; i++) {
    var ma = sopMa_(table.rows[i][iSku]);
    if (!ma) continue;
    coTrongFC[ma] = true;
    kenhCua[ma] = String(table.rows[i][iCh] || '').trim();
  }

  // --- SKU dùng chung: xét toàn bộ lịch sử, vì đó là bản chất sản phẩm ---
  var het = prepQuetNguon_('');
  var dungChung = [];
  Object.keys(het.oem).forEach(function (ma) { if (het.xk[ma]) dungChung.push(ma); });

  out.push('=== SKU DÙNG CHUNG (có ở cả hai nguồn, xét toàn bộ lịch sử) ===');
  out.push('  OEM ' + Object.keys(het.oem).length + ' mã · XK ' + Object.keys(het.xk).length
    + ' mã · dùng chung ' + dungChung.length + ' mã');
  var theoKenh = {}, canXoa = 0;
  dungChung.forEach(function (ma) {
    var ch = coTrongFC[ma] ? (kenhCua[ma] || '(đã trống)') : '(chưa có trong FC)';
    theoKenh[ch] = (theoKenh[ch] || 0) + 1;
    if (coTrongFC[ma] && kenhCua[ma]) canXoa++;
  });
  Object.keys(theoKenh).sort().forEach(function (k) { out.push('   ' + k + ': ' + theoKenh[k]); });
  out.push('  → adminClearChannelForShared(true) sẽ để trống kênh cho ' + canXoa + ' mã');
  out.push('');

  // --- SKU thiếu: CHỈ trong phạm vi từ tuThang trở đi ---
  var trongKy = prepQuetNguon_(tuThang);
  var thieu = [];
  Object.keys(trongKy.oem).concat(Object.keys(trongKy.xk)).forEach(function (ma) {
    if (!coTrongFC[ma] && thieu.indexOf(ma) < 0) thieu.push(ma);
  });

  out.push('=== SKU FC CHƯA CÓ, trong dữ liệu từ ' + tuThang + ' trở đi ===');
  out.push('  nguồn trong phạm vi: OEM ' + Object.keys(trongKy.oem).length
    + ' mã · XK ' + Object.keys(trongKy.xk).length + ' mã');
  out.push('  → cần thêm ' + thieu.length + ' mã');
  thieu.slice(0, 40).forEach(function (ma) {
    out.push('   ' + ma + '  ' + (trongKy.ten[ma] || '(không tìm được tên)'));
  });
  if (thieu.length > 40) out.push('   … và ' + (thieu.length - 40) + ' mã nữa');
  out.push('');

  // --- Mã phi tiêu chuẩn: KHÔNG thêm, nhưng phải nói ra ---
  var pc = Object.keys(trongKy.phiChuan);
  out.push('=== Ô MÃ PHI TIÊU CHUẨN trong phạm vi (KHÔNG thêm vào danh mục) ===');
  if (!pc.length) {
    out.push('  không có');
  } else {
    out.push('  ' + pc.length + ' giá trị — số lượng của những dòng này sẽ KHÔNG được nhập:');
    pc.slice(0, 30).forEach(function (x) { out.push('   "' + x + '"  ×' + trongKy.phiChuan[x] + ' dòng'); });
    if (pc.length > 30) out.push('   … và ' + (pc.length - 30) + ' giá trị nữa');
    out.push('  Sửa ô mã ở nguồn thành mã thật thì số của chúng mới vào được FC.');
  }

  Logger.log(out.join(String.fromCharCode(10)));
  return out.join(String.fromCharCode(10));
}

/**
 * Để trống default_channel cho SKU có ở CẢ hai nguồn.
 * Xét toàn bộ lịch sử — dùng chung là bản chất sản phẩm, không theo kỳ.
 * Mặc định chạy thử.
 */
function adminClearChannelForShared(apply) {
  var ng = prepQuetNguon_('');
  var table = readTable_(SHEETS.PRODUCTS);
  var iSku = table.idx.sku_code, iCh = table.idx.default_channel;
  if (iSku === undefined || iCh === undefined) {
    throw new Error('Sheet Products thiếu cột sku_code hoặc default_channel.');
  }

  var canSua = [];
  for (var i = 0; i < table.rows.length; i++) {
    var ma = sopMa_(table.rows[i][iSku]);
    if (!ma) continue;
    var ch = String(table.rows[i][iCh] || '').trim();
    if (!ch) continue;
    if (ng.oem[ma] && ng.xk[ma]) canSua.push({ row: i, ma: ma, ch: ch });
  }

  if (!apply) {
    Logger.log('CHẠY THỬ — sẽ để trống kênh cho ' + canSua.length + ' mã dùng chung:');
    canSua.slice(0, 45).forEach(function (x) { Logger.log('  ' + x.ma + '  ' + x.ch + ' → (trống)'); });
    if (canSua.length > 45) Logger.log('  … và ' + (canSua.length - 45) + ' mã nữa');
    Logger.log('Ghi thật: adminClearChannelForShared(true)');
    return canSua.length;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    canSua.forEach(function (x) {
      writeRowPatch_(SHEETS.PRODUCTS, table, x.row, { default_channel: '' });
    });
  } finally {
    lock.releaseLock();
  }
  Logger.log('Đã để trống kênh cho ' + canSua.length + ' mã. Từ giờ mọi đơn vị đều thấy chúng.');
  return canSua.length;
}

/**
 * Thêm SKU có trong nguồn mà FC chưa có — CHỈ những mã xuất hiện trong dữ liệu
 * từ tháng `tuThang` trở đi. Quét cả lịch sử sẽ lôi về hàng trăm mã đã ngừng
 * dùng, làm phình danh mục bằng hàng chết.
 *
 *   adminAddMissingSkus()                 thử, từ tháng hiện tại
 *   adminAddMissingSkus('2026-09')        thử, từ 2026-09
 *   adminAddMissingSkus('2026-09', true)  ghi thật
 *
 * Nhóm sản phẩm và giá bình quân CỐ Ý để trống: không nguồn nào nói chắc hai
 * giá trị đó, đoán bừa thì lệch báo cáo doanh thu mà không ai truy được gốc.
 */
function adminAddMissingSkus(tuThang, apply) {
  // Chống gọi nhầm adminAddMissingSkus(true) — nếu không, một cú gõ tắt sẽ
  // ghi thật vào danh mục mà người gọi tưởng đang chạy thử.
  if (typeof tuThang === 'boolean') { apply = tuThang; tuThang = ''; }
  if (!tuThang) tuThang = prepThangHienTai_();

  var ng = prepQuetNguon_(tuThang);
  var coTrongFC = {};
  readObjects_(SHEETS.PRODUCTS).forEach(function (p) {
    var ma = sopMa_(p.sku_code);
    if (ma) coTrongFC[ma] = true;
  });

  var them = [], daCo = {};
  Object.keys(ng.oem).concat(Object.keys(ng.xk)).forEach(function (ma) {
    if (coTrongFC[ma] || daCo[ma]) return;
    daCo[ma] = true;
    them.push({
      sku_code: ma,
      name: ng.ten[ma] || ('SKU ' + ma),
      short_name: '',
      product_group_code: '',
      product_group_name: '',
      technology: '',
      default_channel: (ng.oem[ma] && ng.xk[ma]) ? '' : (ng.oem[ma] ? 'OEM' : 'XK'),
      avg_price: 0,
      is_active: 1
    });
  });

  var pc = Object.keys(ng.phiChuan);

  if (!apply) {
    Logger.log('CHẠY THỬ — phạm vi: dữ liệu từ ' + tuThang + ' trở đi');
    Logger.log('Sẽ thêm ' + them.length + ' SKU:');
    them.slice(0, 60).forEach(function (x) {
      Logger.log('  ' + x.sku_code + '  kênh=' + (x.default_channel || '(trống)') + '  ' + x.name);
    });
    if (them.length > 60) Logger.log('  … và ' + (them.length - 60) + ' mã nữa');
    if (pc.length) {
      Logger.log('BỎ QUA ' + pc.length + ' ô mã phi tiêu chuẩn: ' + pc.slice(0, 15).join(', ')
        + (pc.length > 15 ? ' …' : ''));
      Logger.log('  Số lượng của những dòng đó sẽ KHÔNG vào FC. Sửa ô mã ở nguồn nếu cần.');
    }
    Logger.log('Nhóm sản phẩm và giá bình quân để trống — điền tay sau.');
    Logger.log('Ghi thật: adminAddMissingSkus("' + tuThang + '", true)');
    return them.length;
  }

  if (!them.length) {
    Logger.log('Không có SKU nào thiếu trong phạm vi từ ' + tuThang + '.');
    return 0;
  }
  appendObjects_(SHEETS.PRODUCTS, them);
  Logger.log('Đã thêm ' + them.length + ' SKU (phạm vi từ ' + tuThang + ').');
  Logger.log('NHỚ điền nhóm sản phẩm và giá bình quân cho những mã này.');
  if (pc.length) Logger.log('Vẫn còn ' + pc.length + ' ô mã phi tiêu chuẩn ở nguồn, chưa xử lý.');
  return them.length;
}

/* run_donDanhMuc() đã chuyển sang Run.gs thành run_danhMuc_ghiThat().
 * Mọi thao tác chạy tay của FC nằm ở Run.gs — một chỗ, không tham số, để không
 * phải đi tìm xem hàm nào cần gõ gì. */
