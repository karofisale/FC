/**
 * Khởi tạo và quản trị — chạy tay trong editor, không mở qua HTTP
 * Một phần của backend FC App — clasp push gộp mọi file .gs vào cùng
 * một phạm vi toàn cục, nên các file gọi chéo hàm của nhau bình thường.
 */

// ---------------------------------------------------------------------
// KHỞI TẠO & QUẢN TRỊ (chạy tay trong editor, không mở qua HTTP)
// ---------------------------------------------------------------------

/**
 * Chạy 1 lần sau khi dán file: tạo đủ sheet, header và dữ liệu danh mục.
 * Không tạo PIN — PIN đặt riêng bằng adminSetPin() hoặc bulkSetInitialPins().
 *
 * An toàn khi chạy lại nhiều lần: BusinessUnits/Regions/ProductGroups luôn
 * được đồng bộ lại theo danh mục chuẩn bên dưới, NHƯNG sheet Users chỉ
 * được gieo dữ liệu mẫu ở LẦN ĐẦU (khi còn trống) — nếu bạn đã tự đổi id,
 * vai trò hay đơn vị của người dùng trực tiếp trên Sheet, chạy lại hàm
 * này sẽ KHÔNG ghi đè những thay đổi đó.
 */
function setupDatabase() {
  getOrCreatePepper_();

  Object.keys(SCHEMA).forEach(function (name) {
    var sheet = getOrCreateSheet_(name);
    var headers = SCHEMA[name];
    var current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
    if (current.join('|') !== headers.join('|')) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#0284c7').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });

  upsertRows_(SHEETS.BUSINESS_UNITS, ['code'], [
    { code: 'GT2', name: 'Kênh GT2 (General Trade 2)', is_active: 1, sap_channel: 'GT2' },
    // 2026-09: bỏ phần sale Brand ra khỏi Xuất khẩu thì phần còn lại chính là
    // hàng OEM xuất khẩu — đổi tên cho đúng bản chất. Mã GIỮ NGUYÊN 'XK' vì
    // mọi chu kỳ, kế hoạch và danh mục đã tham chiếu mã này.
    { code: 'XK', name: 'Export OEM (xuất khẩu, không gồm Brand)', is_active: 1, sap_channel: 'XK' },
    { code: 'OEM', name: 'Domestic OEM (OEM trong nước)', is_active: 1, sap_channel: 'OEM' },

    // Bốn thị trường Brand xuất khẩu, mỗi đơn vị lập kế hoạch và duyệt riêng.
    // sap_channel = XK nên số của chúng vào file upload của Xuất khẩu (KH_XK,
    // nhà máy 0400) và vào cột XK của B0.SUM, không rơi vào GT2.
    { code: 'KRF-Phil', name: 'KRF Philippines', is_active: 1, sap_channel: 'XK' },
    { code: 'KRF-India', name: 'KRF India', is_active: 1, sap_channel: 'XK' },
    { code: 'KRF-US', name: 'KRF US', is_active: 1, sap_channel: 'XK' },
    { code: 'KRF-Indo', name: 'KRF Indonesia', is_active: 1, sap_channel: 'XK' },
    // 2026-09: tách 'Online' thành hai đơn vị riêng, mỗi bên có bảng SOP
    // tháng/tuần và người lập/người duyệt riêng. Dòng 'Online' GIỮ LẠI nhưng
    // tắt: các chu kỳ đã lập trước đây vẫn tham chiếu mã này, xoá dòng là mất
    // tên hiển thị của lịch sử. is_active = 0 chỉ ẩn khỏi các ô chọn.
    { code: '3T', name: 'Kênh 3T', is_active: 1, sap_channel: 'GT2' },
    { code: 'NSKX', name: 'Nước Sạch Khí Xanh', is_active: 1, sap_channel: 'GT2' },
    { code: 'Online', name: 'Kênh Online (cũ — đã tách thành 3T và NSKX)', is_active: 0, sap_channel: 'GT2' },
    // 2026-09: chưa dùng đến — tắt khỏi các ô xổ xuống. GIỮ DÒNG như 'Online':
    // is_active = 0 chỉ ẩn khỏi chọn lựa, xoá dòng là mất tên hiển thị của
    // bất kỳ dữ liệu cũ nào tham chiếu mã đó. Bật lại chỉ việc đổi về 1.
    { code: 'MT', name: 'Kênh Modern Trade', is_active: 0, sap_channel: 'GT2' },
    { code: 'MLT', name: 'Kênh MLT', is_active: 0, sap_channel: 'GT2' },
    { code: 'Retail', name: 'Kênh Bán lẻ', is_active: 0, sap_channel: 'GT2' },
    { code: 'GT1', name: 'Kênh GT1', is_active: 0, sap_channel: 'GT2' }
  ]);

  upsertRows_(SHEETS.REGIONS, ['code'], [
    { code: 'MB', name: 'Miền Bắc', is_active: 1 },
    { code: 'MN', name: 'Miền Nam', is_active: 1 }
  ]);

  upsertRows_(SHEETS.PRODUCT_GROUPS, ['code'], [
    { code: 'NHOM_1', name: 'Máy TCM sx' },
    { code: 'NHOM_2', name: 'Máy nhập khẩu' },
    { code: 'NHOM_3', name: 'Mockup' },
    { code: 'NHOM_4', name: 'Lõi' },
    { code: 'NHOM_5', name: 'Màng' },
    { code: 'KHAC', name: 'Linh kiện / Khác' }
  ]);

  var usersSheet = getOrCreateSheet_(SHEETS.USERS);
  if (usersSheet.getLastRow() <= 1) {
    upsertRows_(SHEETS.USERS, ['id'], [
      { id: 'admin', full_name: 'Admin Hệ Thống', email: 'admin@karofi.com', role: 'central_admin', business_unit_code: '', is_active: 1, failed_attempts: 0 },
      { id: 'gt2', full_name: 'Editor GT2', email: 'editor.gt2@karofi.com', role: 'bu_editor', business_unit_code: 'GT2', is_active: 1, failed_attempts: 0 },
      { id: 'gt2admin', full_name: 'Approver GT2', email: 'approver.gt2@karofi.com', role: 'bu_approver', business_unit_code: 'GT2', is_active: 1, failed_attempts: 0 },
      { id: 'export', full_name: 'Editor Xuất khẩu', email: 'editor.xk@karofi.com', role: 'bu_editor', business_unit_code: 'XK', is_active: 1, failed_attempts: 0 },
      { id: 'exportadmin', full_name: 'Approver Xuất khẩu', email: 'approver.xk@karofi.com', role: 'bu_approver', business_unit_code: 'XK', is_active: 1, failed_attempts: 0 },
      { id: 'oem', full_name: 'Editor OEM', email: 'editor.oem@karofi.com', role: 'bu_editor', business_unit_code: 'OEM', is_active: 1, failed_attempts: 0 },
      { id: 'oemadmin', full_name: 'Approver OEM', email: 'approver.oem@karofi.com', role: 'bu_approver', business_unit_code: 'OEM', is_active: 1, failed_attempts: 0 },
      { id: 'viewer', full_name: 'Người xem Báo cáo', email: 'viewer@karofi.com', role: 'viewer', business_unit_code: '', is_active: 1, failed_attempts: 0 }
    ]);
  } else {
    Logger.log('Sheet Users đã có dữ liệu — bỏ qua gieo tài khoản mẫu để không ghi đè tuỳ chỉnh hiện tại.');
  }

  Logger.log('Đã khởi tạo xong. Bước tiếp theo: adminSetPin("gt2", "246810") cho từng tài khoản.');
  return 'OK';
}

/**
 * Báo cáo hiện trạng đơn vị kinh doanh — CHỈ ĐỌC, chạy bao nhiêu lần cũng được.
 *
 * Dùng trước/sau khi tách BU. Câu hỏi quan trọng nhất nó trả lời: có bao nhiêu
 * SKU đang gắn cứng default_channel = 'Online'. getProducts_ lọc theo
 * `!default_channel || default_channel === bu`, nên SKU gắn 'Online' sẽ KHÔNG
 * xuất hiện trong bảng SOP của 3T hay NSKX — bảng mở ra sẽ thiếu hàng mà không
 * báo lỗi gì. SKU để trống default_channel thì đơn vị nào cũng thấy.
 */
function adminReportBUs() {
  var out = [];

  out.push('=== ĐƠN VỊ KINH DOANH ===');
  readObjects_(SHEETS.BUSINESS_UNITS).forEach(function (b) {
    out.push('  ' + (String(b.is_active) === '1' ? '[bật] ' : '[tắt] ')
      + b.code + '  —  ' + b.name);
  });

  out.push('');
  out.push('=== CHU KỲ ĐÃ LẬP, THEO ĐƠN VỊ ===');
  var cycles = readObjects_(SHEETS.CYCLES);
  var byBu = {};
  cycles.forEach(function (c) {
    var k = String(c.business_unit_code || '(trống)');
    byBu[k] = (byBu[k] || 0) + 1;
  });
  if (!cycles.length) out.push('  (chưa có chu kỳ nào)');
  Object.keys(byBu).sort().forEach(function (k) {
    out.push('  ' + k + ': ' + byBu[k] + ' chu kỳ');
  });

  out.push('');
  out.push('=== SKU ĐANG DÙNG, THEO default_channel ===');
  var products = activeOnly_(readObjects_(SHEETS.PRODUCTS));
  var byCh = {};
  products.forEach(function (p) {
    var k = String(p.default_channel || '').trim() || '(trống — mọi đơn vị đều thấy)';
    byCh[k] = (byCh[k] || 0) + 1;
  });
  Object.keys(byCh).sort().forEach(function (k) {
    out.push('  ' + k + ': ' + byCh[k] + ' SKU');
  });
  out.push('  Tổng SKU đang dùng: ' + products.length);

  out.push('');
  out.push('=== NGƯỜI DÙNG THEO ĐƠN VỊ ===');
  var users = readObjects_(SHEETS.USERS);
  users.forEach(function (u) {
    out.push('  ' + String(u.id) + '  vai=' + String(u.role)
      + '  đơn vị=' + (String(u.business_unit_code || '') || '(mọi đơn vị)')
      + (String(u.is_active) === '1' ? '' : '  [đã tắt]'));
  });

  Logger.log(out.join(String.fromCharCode(10)));
  return out.join(String.fromCharCode(10));
}

/**
 * Chuyển SKU từ đơn vị này sang đơn vị khác (cột default_channel).
 * Mặc định CHẠY THỬ — in ra sẽ đổi bao nhiêu dòng mà không ghi gì.
 * Ghi thật thì truyền tham số thứ ba là true:
 *   adminMoveProductChannel('Online', '3T', true)
 *
 * Muốn SKU hiện ở MỌI đơn vị thì chuyển sang chuỗi rỗng:
 *   adminMoveProductChannel('Online', '', true)
 */
function adminMoveProductChannel(fromChannel, toChannel, apply) {
  var from = String(fromChannel == null ? '' : fromChannel).trim();
  var to = String(toChannel == null ? '' : toChannel).trim();
  if (!from) throw new Error('Cần nêu rõ đơn vị nguồn (fromChannel).');

  var table = readTable_(SHEETS.PRODUCTS);
  var col = table.idx.default_channel;
  if (col === undefined) throw new Error('Sheet Products không có cột default_channel.');

  var hits = [];
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][col] || '').trim() === from) hits.push(i);
  }

  if (!apply) {
    Logger.log('CHẠY THỬ — sẽ đổi ' + hits.length + ' SKU từ "' + from + '" sang "'
      + (to || '(trống)') + '". Chưa ghi gì.');
    Logger.log('Ghi thật: adminMoveProductChannel("' + from + '", "' + to + '", true)');
    return hits.length;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    for (var j = 0; j < hits.length; j++) {
      writeRowPatch_(SHEETS.PRODUCTS, table, hits[j], { default_channel: to });
    }
  } finally {
    lock.releaseLock();
  }
  Logger.log('Đã đổi ' + hits.length + ' SKU từ "' + from + '" sang "' + (to || '(trống)') + '".');
  return hits.length;
}

/**
 * Đặt / đổi PIN cho một tài khoản. Chạy trực tiếp trong editor:
 *   adminSetPin('gt2', '246810')
 * PIN không được lưu dạng thô ở bất kỳ đâu. Hash không phụ thuộc vào
 * userId (xem hashWithSalt_ ở Auth.gs), nên sau này đổi id trong Sheet
 * không làm hỏng PIN đã đặt.
 */
function adminSetPin(userId, pin) {
  validatePinFormat_(pin);
  var t = readTable_(SHEETS.USERS);
  var i = findRowIndex_(t, 'id', userId);
  if (i < 0) throw new Error('Không tìm thấy người dùng: ' + userId);
  writeRowPatch_(SHEETS.USERS, t, i, {
    pin_hash: makePinRecord_(pin),
    failed_attempts: 0,
    locked_until: ''
  });
  Logger.log('Đã đặt PIN cho ' + userId);
  return 'OK';
}

/**
 * Đặt PIN cho NHIỀU tài khoản trong một lần chạy — vì nút Run trên thanh
 * công cụ editor không cho nhập tham số, gọi adminSetPin() trực tiếp từ
 * đó sẽ báo lỗi thiếu đối số. Cách dùng:
 *   1. Sửa danh sách PIN bên dưới (giữ nguyên userId, đổi giá trị PIN).
 *   2. Chọn hàm "bulkSetInitialPins" ở dropdown cạnh nút Run, bấm Run.
 *   3. Sau khi chạy xong, xoá các giá trị PIN thật khỏi đây rồi Save lại
 *      (không lưu PIN dạng thô lâu dài trong mã nguồn).
 */
function bulkSetInitialPins() {
  var pins = {
    'admin':       '000000',   // Admin Hệ Thống — ĐỔI GIÁ TRỊ TRƯỚC KHI CHẠY
    'gt2':         '000000',   // Editor GT2
    'gt2admin':    '000000',   // Approver GT2
    'export':      '000000',   // Editor Xuất khẩu
    'exportadmin': '000000',   // Approver Xuất khẩu
    'oem':         '000000',   // Editor OEM
    'oemadmin':    '000000',   // Approver OEM
    'viewer':      '000000'    // Người xem báo cáo
  };

  Object.keys(pins).forEach(function (userId) {
    if (pins[userId] === '000000') {
      Logger.log('BỎ QUA ' + userId + ': chưa đổi PIN mặc định 000000 (bị chặn vì là dãy trùng).');
      return;
    }
    try {
      adminSetPin(userId, pins[userId]);
      Logger.log('OK   ' + userId);
    } catch (err) {
      Logger.log('LỖI  ' + userId + ': ' + err.message);
    }
  });

  return 'Xem kết quả từng dòng ở View > Logs (hoặc Ctrl+Enter).';
}

/** Mở khoá tài khoản bị khoá do nhập sai PIN nhiều lần. */
function adminUnlockUser(userId) {
  var t = readTable_(SHEETS.USERS);
  var i = findRowIndex_(t, 'id', userId);
  if (i < 0) throw new Error('Không tìm thấy người dùng: ' + userId);
  writeRowPatch_(SHEETS.USERS, t, i, { failed_attempts: 0, locked_until: '' });
  return 'OK';
}

/** Vô hiệu hoá toàn bộ phiên đang mở (dùng khi nghi ngờ lộ token). */
function adminRevokeAllSessions() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var n = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('s_') === 0) { props.deleteProperty(k); n++; }
  });
  CacheService.getScriptCache().removeAll(Object.keys(all).filter(function (k) {
    return k.indexOf('s_') === 0;
  }));
  Logger.log('Đã huỷ ' + n + ' phiên đăng nhập.');
  return n;
}


/**
 * Tình trạng tất cả tài khoản: ai chưa có PIN, ai đang bị khoá, đơn vị nào
 * chưa có người lập hoặc chưa có người duyệt.
 *
 * KHÔNG in pin_hash — báo cáo này chỉ trả lời "có hay không", không đưa giá
 * trị băm ra ngoài.
 *
 * Ba lỗi im lặng mà báo cáo này bắt:
 *   - tài khoản đã tạo nhưng chưa cấp PIN: đăng nhập báo "chưa được cấp PIN"
 *     và người dùng thường hiểu nhầm thành sai PIN rồi nhập lại tới khoá máy;
 *   - business_unit_code gõ không khớp mã đơn vị nào (thừa khoảng trắng, sai
 *     hoa thường, thiếu dấu gạch): tài khoản đăng nhập được nhưng không thấy
 *     chu kỳ nào, trông hệt như "app hỏng";
 *   - đơn vị đang bật mà không có ai lập / không có ai duyệt: kế hoạch của
 *     họ sẽ không bao giờ được duyệt, mà file SAP thiếu hẳn một đơn vị thì
 *     nhìn vẫn bình thường.
 */
function adminReportAccounts() {
  var users = readObjects_(SHEETS.USERS);
  var bus = readObjects_(SHEETS.BUSINESS_UNITS);

  var buTen = {}, buBat = {};
  bus.forEach(function (b) {
    var c = String(b.code || '').trim();
    if (!c) return;
    buTen[c] = String(b.name || '');
    buBat[c] = String(b.is_active) === '1' || b.is_active === true;
  });

  var bay = Date.now();
  var canPin = [], sapKhoa = [], donViLa = [], tatCa = [];
  var coNguoi = {};   // mã đơn vị → { bu_editor: n, bu_approver: n }

  users.forEach(function (u) {
    var id = String(u.id || '').trim();
    if (!id) return;
    // KHÔNG trim: assertBU_ so chuỗi THÔ (String(session.bu) !== String(buCode)),
    // nên một dấu cách thừa trong ô này làm người dùng đăng nhập được nhưng
    // không thao tác được trên đơn vị của chính mình. Trim ở đây là giấu đi
    // đúng cái lỗi cần tìm.
    var bu = String(u.business_unit_code === null || u.business_unit_code === undefined ? '' : u.business_unit_code);
    var bat = String(u.is_active) === '1' || u.is_active === true;
    var coPin = !!String(u.pin_hash || '').trim();
    var khoaToi = u.locked_until ? new Date(u.locked_until).getTime() : 0;
    var dangKhoa = khoaToi && khoaToi > bay;

    tatCa.push({
      id: id, ten: String(u.full_name || ''), vaiTro: String(u.role || ''),
      bu: bu, bat: bat, coPin: coPin, dangKhoa: !!dangKhoa,
      saiLan: Number(u.failed_attempts) || 0,
      lanCuoi: u.last_login ? String(u.last_login).slice(0, 10) : ''
    });

    if (bat && !coPin) canPin.push(id + '  (' + (u.full_name || '') + ' — ' + (u.role || '') + (bu ? ' / ' + bu : '') + ')');
    if (dangKhoa) sapKhoa.push(id + '  (mở từ ' + String(u.locked_until).slice(0, 16) + ')');
    if (bu && buTen[bu] === undefined) {
      var goi = buTen[bu.trim()] !== undefined
        ? ' (thừa khoảng trắng — đúng ra là "' + bu.trim() + '")'
        : '';
      donViLa.push(id + '  → business_unit_code = "' + bu + '"' + goi);
    }
    if (bat && bu && (u.role === 'bu_editor' || u.role === 'bu_approver')) {
      if (!coNguoi[bu]) coNguoi[bu] = { bu_editor: 0, bu_approver: 0 };
      coNguoi[bu][u.role]++;
    }
  });

  var out = [];
  out.push('=== TÌNH TRẠNG TÀI KHOẢN ===');
  out.push('');
  out.push('TỔNG: ' + tatCa.length + ' tài khoản ('
    + tatCa.filter(function (u) { return u.bat; }).length + ' đang bật)');
  out.push('');

  out.push('--- CẦN ĐẶT PIN (đang bật nhưng chưa có PIN) ---');
  if (!canPin.length) out.push('  (không có — mọi tài khoản đang bật đều đã có PIN)');
  else {
    canPin.forEach(function (x) { out.push('  ' + x); });
    out.push('  → Đặt bằng bulkSetInitialPins() (sửa danh sách trong hàm trước khi chạy,');
    out.push('    xoá PIN thật khỏi mã nguồn ngay sau khi chạy xong).');
  }
  out.push('');

  out.push('--- ĐANG BỊ KHOÁ ---');
  if (!sapKhoa.length) out.push('  (không có)');
  else {
    sapKhoa.forEach(function (x) { out.push('  ' + x); });
    out.push('  → Mở ngay bằng run_moKhoaTaiKhoan().');
  }
  out.push('');

  out.push('--- ĐƠN VỊ GÕ KHÔNG KHỚP DANH MỤC ---');
  if (!donViLa.length) out.push('  (không có)');
  else {
    donViLa.forEach(function (x) { out.push('  ' + x); });
    out.push('  → Tài khoản này đăng nhập được nhưng không thấy chu kỳ nào.');
    out.push('    Mã phải trùng TỪNG KÝ TỰ với cột code của BusinessUnits.');
  }
  out.push('');

  out.push('--- ĐƠN VỊ ĐANG BẬT: AI LẬP, AI DUYỆT ---');
  Object.keys(buTen).sort().forEach(function (c) {
    if (!buBat[c]) return;
    var n = coNguoi[c] || { bu_editor: 0, bu_approver: 0 };
    var thieu = [];
    if (!n.bu_editor) thieu.push('CHƯA CÓ NGƯỜI LẬP');
    if (!n.bu_approver) thieu.push('CHƯA CÓ NGƯỜI DUYỆT');
    out.push('  ' + (thieu.length ? '⚠ ' : '  ') + c
      + '  — lập: ' + n.bu_editor + ', duyệt: ' + n.bu_approver
      + (thieu.length ? '   ← ' + thieu.join(' + ') : ''));
  });
  out.push('  (đơn vị thiếu người duyệt thì kế hoạch không bao giờ được duyệt,');
  out.push('   và file SAP sẽ thiếu hẳn đơn vị đó mà nhìn vẫn bình thường.)');
  out.push('');

  out.push('--- TOÀN BỘ TÀI KHOẢN ---');
  out.push('  id | họ tên | vai trò | đơn vị | bật | PIN | đăng nhập cuối');
  tatCa.sort(function (a, b) { return a.id < b.id ? -1 : 1; }).forEach(function (u) {
    out.push('  ' + [
      u.id, u.ten, u.vaiTro, u.bu || '—',
      u.bat ? 'bật' : 'TẮT',
      u.coPin ? 'có' : 'CHƯA',
      u.lanCuoi || 'chưa bao giờ'
    ].join(' | ') + (u.dangKhoa ? '   [ĐANG KHOÁ]' : '')
      + (u.saiLan ? '   [sai ' + u.saiLan + ' lần]' : ''));
  });

  out.push('');
  out.push('=== HẾT ===');
  Logger.log(out.join('\n'));
  return {
    canDatPin: canPin.length,
    dangKhoa: sapKhoa.length,
    donViSai: donViLa.length,
    tongTaiKhoan: tatCa.length
  };
}
