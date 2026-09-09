/**
 * SopImport.gs — nhập kế hoạch SOP từ app OEM và app Xuất khẩu vào FC.
 *
 * Nguyên tắc: FC ĐỌC THẲNG NGUỒN GỐC, không đọc các tab công thức trung gian.
 *
 *   OEM  →  SOP_Plan, lọc Trạng thái = "Đã duyệt", theo cột Kỳ
 *   XK   →  Details (Ship Qty theo Shipdate)
 *         + PIDetails nối PITotal (Qty theo Expected Load)
 *
 * Vì sao không đọc tab SOP của Xuất khẩu, dù nó có sẵn: tab đó là một khối
 * công thức chạy theo hai ô chọn kỳ nhập tay, và khi đối chiếu từng mã đã phát
 * hiện ba lỗi thật — đếm hai lần (UNIQUE theo cặp mã+TÊN nên một mã hai cách
 * viết tên ra hai dòng), bỏ sót hàng (QUERY trả mã ra số còn Details lưu mã
 * dạng chữ nên SUMIFS không khớp), và vắt năm (DATE($B$1, D$3, 1) giữ nguyên
 * năm trong khi tháng quay vòng về 1). Cộng lại bằng code vừa bền hơn vừa đúng
 * hơn. Xem gas/SopDryRun.gs để chạy lại phép đối chiếu đó bất cứ lúc nào.
 *
 * Kết quả nhập là một BẢN CẬP NHẬT MỚI ở trạng thái chưa gửi. Máy điền số,
 * người lập kế hoạch xem lại rồi bấm gửi duyệt bằng nút sẵn có — chuỗi trách
 * nhiệm giữ nguyên.
 */

var IMP_OEM_SHEET_ID = '1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk';
var IMP_OPS2026_ID   = '1fDUB6oqyMisV4NxId4JyGhmizgucit8zOdI38fBRZHA';
var IMP_HUB_ID       = '16kDRbTffeSFSxwAZPCCpXGODUByEquCchnkqs1kyFrc';

/** Tuần và miền quy ước cho tháng đầu kỳ — giống nhau ở cả OEM và Xuất khẩu. */
// Giá trị của cột Channel (tab Clients, hub ExportSystem) cho hàng thuộc đơn vị
// XK. Mọi giá trị khác đều là Brand và bị loại — giữ chiều này chứ không
// liệt kê bốn mã KRF-*, để thị trường thứ năm thêm vào không lặng lẽ chạy
// vào số của Export OEM.
var IMP_KENH_XK = 'Export OEM';

var IMP_TUAN = 3;
var IMP_MIEN = 'MB';

function impThang_(ym, delta) {
  var p = String(ym).split('-');
  var t = (parseInt(p[0], 10) * 12 + (parseInt(p[1], 10) - 1)) + delta;
  return Math.floor(t / 12) + '-' + ('0' + ((t % 12) + 1)).slice(-2);
}

function impThangCua_(v) {
  if (!v && v !== 0) return '';
  var d = (Object.prototype.toString.call(v) === '[object Date]') ? v : new Date(v);
  if (!d || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

/** Mã chuẩn Karofi là chuỗi toàn chữ số. "NewRO1"/"Mã mới" là ghi chú lọt vào. */
function impChuan_(ma) {
  return /^\d{6,}$/.test(String(ma || '').trim());
}

function impMa_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

/** Số lượng, chịu được ô số bị định dạng ngày (đã gặp ở cột Qty của Hub!SOP2). */
function impSo_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var epoch = new Date(1899, 11, 30);
    return Math.round((v.getTime() - epoch.getTime()) / 86400000);
  }
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

/** 1234567 → "1.234.567" — GAS không chắc có locale vi-VN, tự ghép cho chắc. */
function impSoDep_(n) {
  var s = String(Math.round(Number(n) || 0));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Tên khách để đối chiếu — gõ hoa/thường và khoảng trắng thừa không tính. */
function impKhoaKhach_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Tên khách → kênh khai ở ExportSystem!Clients (cột Channel).
 *
 * Đây là chỗ duy nhất biết khách nào là Brand. Không dùng hậu tố PIC (app
 * Export đang dùng RESTRICTED_PICS_ = ['brand']) vì PIC là NGƯỜI: đổi người
 * phụ trách là dấu hiệu đi theo, trong khi khách vẫn thuộc thị trường đó. Cột
 * Channel còn nói được Brand của THỊ TRƯỌNG NÀO, hai thứ hậu tố không làm được.
 */
function impKenhKhach_() {
  var sh = SpreadsheetApp.openById(IMP_HUB_ID).getSheetByName('Clients');
  if (!sh) throw new Error('Không thấy tab Clients trong hub ExportSystem.');
  var nCot = sh.getLastColumn();
  var nDong = sh.getLastRow();
  if (nDong < 2 || !nCot) return {};

  var v = sh.getRange(1, 1, nDong, nCot).getValues();
  var tieuDe = v[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  var cTen = tieuDe.indexOf('client_name');
  var cKenh = tieuDe.indexOf('channel');
  if (cTen < 0 || cKenh < 0) {
    throw new Error('Tab Clients phải có cả hai cột "Client_Name" và "Channel" '
      + '— đang thấy: ' + v[0].join(', ') + '. Không có hai cột này thì không '
      + 'phân biệt được hàng Brand, và số của bốn đơn vị KRF-* sẽ bị cộng nhầm '
      + 'vào Export OEM.');
  }

  var out = {};
  for (var i = 1; i < v.length; i++) {
    var ten = impKhoaKhach_(v[i][cTen]);
    if (ten) out[ten] = String(v[i][cKenh] || '').trim();
  }
  return out;
}

// ---------------------------------------------------------------------
// GOM SỐ TỪ NGUỒN
// ---------------------------------------------------------------------

/**
 * @return {{theoMa:Object, phiChuan:Object, soDong:number, ghiChu:string[]}}
 *     theoMa[ma] = [sl tháng 1..4]
 */
function impGomOEM_(thang) {
  var theoMa = {}, phiChuan = {}, soDong = 0, ghiChu = [];
  var sh = SpreadsheetApp.openById(IMP_OEM_SHEET_ID).getSheetByName('SOP_Plan');
  if (!sh) throw new Error('Không thấy tab SOP_Plan trong Sheet OEM.');
  if (sh.getLastRow() < 2) return { theoMa: theoMa, phiChuan: phiChuan, soDong: 0, ghiChu: ghiChu };

  var ky = thang[0];
  var coKyKhac = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().forEach(function (r) {
    // Cột Kỳ có thể bị Sheets hiểu thành Date — đã gặp thật trong production,
    // xem chú thích đầu gas/Sop.gs của app OEM.
    var kyRow = (Object.prototype.toString.call(r[0]) === '[object Date]')
      ? impThangCua_(r[0]) : String(r[0]).trim();
    if (kyRow !== ky) { if (kyRow) coKyKhac[kyRow] = true; return; }
    if (String(r[7]).trim() !== 'Đã duyệt') return;

    var ma = impMa_(r[2]);
    if (!ma) return;
    if (!impChuan_(ma)) { phiChuan[ma] = (phiChuan[ma] || 0) + 1; return; }
    if (!theoMa[ma]) theoMa[ma] = [0, 0, 0, 0];
    for (var j = 0; j < 4; j++) theoMa[ma][j] += impSo_(r[3 + j]);
    soDong++;
  });

  if (!soDong) {
    ghiChu.push('Không có dòng "Đã duyệt" nào cho kỳ ' + ky
      + (Object.keys(coKyKhac).length ? '. Các kỳ đang có: ' + Object.keys(coKyKhac).sort().join(', ') : ''));
  }
  return { theoMa: theoMa, phiChuan: phiChuan, soDong: soDong, ghiChu: ghiChu };
}

function impGomXK_(thang) {
  var theoMa = {}, phiChuan = {}, soDong = 0, ghiChu = [];
  var viTri = {};
  thang.forEach(function (t, i) { viTri[t] = i; });

  function cong(ma, idx, q) {
    if (!q) return;
    if (!impChuan_(ma)) { phiChuan[ma] = (phiChuan[ma] || 0) + 1; return; }
    if (!theoMa[ma]) theoMa[ma] = [0, 0, 0, 0];
    theoMa[ma][idx] += q;
    soDong++;
  }

  // --- Lọc khách Brand ---------------------------------------------------
  // Đơn vị XK là Export OEM, không gồm Brand. Bốn thị trường KRF-* lập kế
  // hoạch tay riêng nên việc ở đây chỉ là TRỪA họ ra, không chia số cho ai.
  var kenhKhach = impKenhKhach_();
  var daBo = {};       // kênh Brand → { dong, sl, khach:{} }
  var khachLa = {};    // khách có đơn nhưng không có trong tab Clients → sản lượng

  /**
   * Khách này có thuộc Export OEM không.
   *
   * Khách KHÔNG có trong tab Clients thì VẪN tính vào Export OEM, và báo tên
   * ra. Bỏ họ đi là mất sản lượng đã có đơn mà không dấu hiệu gì — kiểu hỏng
   * chỉ lộ ra khi sản xuất giao thiếu. Chưa khai khác với khai là Brand.
   */
  function giuKhach(ten, sl) {
    var khoa = impKhoaKhach_(ten);
    var kenh = khoa ? kenhKhach[khoa] : undefined;
    if (kenh === undefined) {
      var nhan = String(ten || '').trim() || '(không có tên khách)';
      khachLa[nhan] = (khachLa[nhan] || 0) + (sl || 0);
      return true;
    }
    if (kenh === IMP_KENH_XK) return true;

    var k = kenh || '(để trống)';
    if (!daBo[k]) daBo[k] = { dong: 0, sl: 0, khach: {} };
    daBo[k].dong++;
    daBo[k].sl += (sl || 0);
    daBo[k].khach[String(ten || '').trim()] = true;
    return false;
  }

  // --- Đơn đã có: Ship Qty theo Shipdate ---
  var det = SpreadsheetApp.openById(IMP_OPS2026_ID).getSheetByName('Details');
  if (!det) throw new Error('Không thấy tab Details trong Operations2026.');
  if (det.getLastRow() > 1) {
    det.getRange(2, 1, det.getLastRow() - 1, 10).getValues().forEach(function (r) {
      var ma = impMa_(r[3]);                       // D = Code
      if (!ma) return;
      var k = impThangCua_(r[9]);                  // J = Shipdate
      if (viTri[k] === undefined) return;
      var sl = impSo_(r[6]);                       // G = Ship Qty
      if (!giuKhach(r[2], sl)) return;             // C = Client
      cong(ma, viTri[k], sl);
    });
  }

  // --- PI chưa giao: Qty theo Expected Load, nối qua PI_Number ---
  var hub = SpreadsheetApp.openById(IMP_HUB_ID);
  var pt = hub.getSheetByName('PITotal');
  var pd = hub.getSheetByName('PIDetails');
  if (!pt || !pd) throw new Error('Không thấy tab PITotal hoặc PIDetails trong hub ExportSystem.');

  var ngayPi = {};
  if (pt.getLastRow() > 1) {
    pt.getRange(2, 3, pt.getLastRow() - 1, 6).getValues().forEach(function (r) {
      var pi = impMa_(r[0]);                       // C = PI_Number
      if (pi) ngayPi[pi] = r[5];                   // H = Expected Load
    });
  }
  var thieuNgay = 0;
  if (pd.getLastRow() > 1) {
    // Đọc từ cột B để có tên khách — trước đây bắt đầu từ C nên không cách
    // nào biết dòng PI thuộc khách nào.
    pd.getRange(2, 2, pd.getLastRow() - 1, 6).getValues().forEach(function (r) {
      var pi = impMa_(r[1]);                       // C = PI_Number
      var ma = impMa_(r[3]);                       // E = Item_code
      if (!ma) return;
      var ngay = ngayPi[pi];
      if (ngay === undefined || ngay === '') { thieuNgay++; return; }
      var k = impThangCua_(ngay);
      if (viTri[k] === undefined) return;
      var sl = impSo_(r[5]);                       // G = Qty
      if (!giuKhach(r[0], sl)) return;             // B = Client
      cong(ma, viTri[k], sl);
    });
  }
  if (thieuNgay) {
    ghiChu.push(thieuNgay + ' dòng PI không tra được ngày Expected Load trong PITotal — bị bỏ qua.');
  }

  var cacKenh = Object.keys(daBo).sort();
  if (cacKenh.length) {
    ghiChu.push('Đã loại hàng Brand khỏi Export OEM — ' + cacKenh.map(function (k) {
      var d = daBo[k];
      return k + ': ' + impSoDep_(d.sl) + ' cái / ' + d.dong + ' dòng ('
        + Object.keys(d.khach).sort().join(', ') + ')';
    }).join('; ') + '. Các đơn vị này lập kế hoạch riêng.');
  }

  var laDs = Object.keys(khachLa).sort(function (a, b) { return khachLa[b] - khachLa[a]; });
  if (laDs.length) {
    ghiChu.push(laDs.length + ' khách có đơn trong kỳ nhưng KHÔNG có trong tab Clients '
      + 'nên không biết thuộc đơn vị nào — vẫn tính vào Export OEM: '
      + laDs.slice(0, 15).map(function (t) { return t + ' (' + impSoDep_(khachLa[t]) + ')'; }).join(', ')
      + (laDs.length > 15 ? ' … và ' + (laDs.length - 15) + ' khách nữa' : '')
      + '. Nếu có khách Brand trong danh sách này, khai kênh cho họ ở tab Clients rồi nhập lại.');
  }

  return { theoMa: theoMa, phiChuan: phiChuan, soDong: soDong, ghiChu: ghiChu };
}

// ---------------------------------------------------------------------
// NHẬP
// ---------------------------------------------------------------------

/**
 * @param {Object} p { businessUnitCode, baseMonth, dryRun }
 * @return {Object} tóm tắt để hiện lên màn hình
 */
function importSopFromSource_(session, p) {
  assertRole_(session, ['bu_editor', 'central_admin']);

  var bu = String(p.businessUnitCode || session.bu || '').trim();
  if (!bu) throw new Error('Thiếu đơn vị kinh doanh.');
  assertBU_(session, bu);
  if (bu !== 'OEM' && bu !== 'XK') {
    throw new Error('Hiện chỉ nhập được cho đơn vị OEM và XK. Đơn vị "' + bu + '" chưa có nguồn dữ liệu.');
  }

  var baseMonth = normalizeMonth_(p.baseMonth);
  if (!baseMonth) throw new Error('Thiếu tháng đầu kỳ.');
  var ky = baseMonth.slice(0, 7);
  var thang = [0, 1, 2, 3].map(function (i) { return impThang_(ky, i); });

  // Gom số
  var gom = (bu === 'OEM') ? impGomOEM_(thang) : impGomXK_(thang);

  // Đối chiếu danh mục. Mã lạ KHÔNG bị bỏ qua im lặng — trả về để hiện lên
  // màn hình, vì số của chúng rơi mất mà không có dấu hiệu gì là kiểu hỏng
  // chỉ lộ ra khi sản xuất giao thiếu.
  var coTrongFC = {};
  readObjects_(SHEETS.PRODUCTS).forEach(function (pr) {
    var ma = impMa_(pr.sku_code);
    if (ma) coTrongFC[ma] = true;
  });

  var lines = [], splits = [], maLa = [], tongThang = [0, 0, 0, 0], soSku = 0;
  Object.keys(gom.theoMa).sort().forEach(function (ma) {
    var sl = gom.theoMa[ma];
    if (!sl[0] && !sl[1] && !sl[2] && !sl[3]) return;
    if (!coTrongFC[ma]) { maLa.push(ma); return; }
    soSku++;
    for (var j = 0; j < 4; j++) {
      tongThang[j] += sl[j];
      if (sl[j] > 0) lines.push({ skuCode: ma, forecastMonth: thang[j] + '-01', quantity: sl[j] });
    }
    // Quy ước chia tuần: cả tháng đầu kỳ dồn vào tuần 3 miền Bắc. Các tuần và
    // miền còn lại là 0 nên không ghi dòng nào — FC coi 0 là "không dùng đến"
    // và tự xoá, ghi số 0 chỉ làm bảng phình to.
    if (sl[0] > 0) {
      splits.push({ skuCode: ma, weekNumber: IMP_TUAN, regionCode: IMP_MIEN, quantity: sl[0] });
    }
  });

  var tomTat = {
    businessUnitCode: bu,
    baseMonth: ky,
    months: thang,
    skuCount: soSku,
    monthTotals: tongThang,
    unknownSkus: maLa,
    nonStandardCodes: Object.keys(gom.phiChuan),
    sourceRows: gom.soDong,
    notes: gom.ghiChu.slice()
  };

  if (!lines.length) {
    tomTat.notes.push('Không có số nào để nhập cho kỳ này.');
    tomTat.dryRun = true;
    return tomTat;
  }

  if (p.dryRun) {
    tomTat.dryRun = true;
    return tomTat;
  }

  // --- Chu kỳ: dùng lại nếu đã có, không thì tạo mới ---
  var cycle = readObjects_(SHEETS.CYCLES).filter(function (c) {
    return String(c.business_unit_code) === bu && normalizeMonth_(c.base_month) === baseMonth;
  })[0];

  var versionId;
  if (!cycle) {
    var tao = createCycle_(session, { businessUnitCode: bu, baseMonth: baseMonth, horizonMonths: 4 });
    cycle = tao.cycle;
    versionId = tao.initialVersionId;   // createCycle_ trả {cycle, initialVersionId}
    tomTat.createdCycle = true;
  } else {
    // Chu kỳ đã có: thêm BẢN MỚI, không sửa bản cũ. copyFromPrevious = false
    // vì đây là thay bằng số từ nguồn chứ không phải điều chỉnh bản trước.
    var daCo = getVersions_(cycle.id).map(function (v) { return Number(v.update_week); });
    var tuan = 0;
    while (daCo.indexOf(tuan) >= 0) tuan++;
    // Chu kỳ đã duyệt mà nhập lại thì createVersion_ đưa nó về 'draft' — bản
    // đã duyệt vẫn còn nguyên làm bằng chứng, nhưng trạng thái đổi. Nói ra
    // trong tóm tắt để người bấm không bất ngờ.
    if (cycle.status === 'approved' || cycle.status === 'submitted') {
      tomTat.notes.push('Chu kỳ đang ở trạng thái "' + cycle.status
        + '" — thêm bản mới sẽ đưa chu kỳ về soạn thảo và phải gửi duyệt lại.');
    }
    var vNew = createVersion_(session, {
      cycleId: cycle.id,
      updateWeek: tuan,
      copyFromPrevious: false
    });
    versionId = vNew.version.id;        // createVersion_ trả {version, copiedRows}
    tomTat.createdCycle = false;
  }
  tomTat.cycleId = cycle.id;
  tomTat.versionId = versionId;

  saveMonthlyLines_(session, versionId, lines);
  saveWeeklySplits_(session, versionId, splits);

  logAuth_(session.userId, 'sop_imported',
    bu + ' ' + ky + ' · ' + soSku + ' SKU · bản ' + versionId);

  tomTat.dryRun = false;
  return tomTat;
}


// ---------------------------------------------------------------------
// SOI BỐ CỤC NGUỒN (chạy tay)
// ---------------------------------------------------------------------

/** 0 → A, 25 → Z, 26 → AA. */
function impTenCot_(i) {
  var s = '';
  i += 1;
  while (i > 0) {
    var d = (i - 1) % 26;
    s = String.fromCharCode(65 + d) + s;
    i = Math.floor((i - d) / 26);
  }
  return s;
}

function impGonGang_(v) {
  if (v === '' || v === null || v === undefined) return '∅';
  if (Object.prototype.toString.call(v) === '[object Date]') return 'NGÀY ' + v.toISOString().slice(0, 10);
  var s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > 28 ? s.slice(0, 28) + '…' : s;
}

function impSoiTab_(sheet, nhan, soDongMau) {
  if (!sheet) { Logger.log('  ' + nhan + ': KHÔNG CÓ TAB NÀY'); return null; }
  var nCot = sheet.getLastColumn();
  var nDong = sheet.getLastRow();
  Logger.log('');
  Logger.log('--- ' + nhan + ' — ' + (nDong - 1) + ' dòng dữ liệu × ' + nCot + ' cột ---');
  if (!nCot || nDong < 1) return null;

  var v = sheet.getRange(1, 1, Math.min(nDong, 1 + (soDongMau || 2)), nCot).getValues();
  var tieuDe = v[0];
  tieuDe.forEach(function (h, i) {
    var mau = [];
    for (var r = 1; r < v.length; r++) mau.push(impGonGang_(v[r][i]));
    Logger.log('  ' + impTenCot_(i) + ' | ' + impGonGang_(h) + '   → ' + mau.join('  /  '));
  });
  return { headers: tieuDe, nCot: nCot, nDong: nDong };
}

/**
 * In bố cục bốn tab mà luồng nhập XK đọc, để viết bộ lọc đơn vị theo
 * ĐÚNG tên cột và giá trị thật đang có, không theo mô tả.
 *
 * Riêng tab Clients còn đếm phân bố giá trị của TỪNG cột cuối — cột đánh dấu
 * khách thuộc đơn vị nào nằm ở đó, và phân bố cho biết còn khách nào chưa
 * được gán. Khách chưa gán là sản lượng sẽ rơi sai đơn vị mà không ai thấy.
 */
function adminInspectExportSource() {
  Logger.log('=== BỐ CỤC NGUỒN NHẬP XK ===');

  var ops = SpreadsheetApp.openById(IMP_OPS2026_ID);
  Logger.log('');
  Logger.log('[Operations2026] ' + ops.getName() + '  — các tab: ' +
    ops.getSheets().map(function (s) { return s.getName(); }).join(', '));
  impSoiTab_(ops.getSheetByName('Details'), 'Operations2026!Details', 2);

  var hub = SpreadsheetApp.openById(IMP_HUB_ID);
  Logger.log('');
  Logger.log('[ExportSystem] ' + hub.getName() + '  — các tab: ' +
    hub.getSheets().map(function (s) { return s.getName(); }).join(', '));
  impSoiTab_(hub.getSheetByName('PITotal'), 'ExportSystem!PITotal', 2);
  impSoiTab_(hub.getSheetByName('PIDetails'), 'ExportSystem!PIDetails', 2);

  var cl = hub.getSheetByName('Clients');
  var info = impSoiTab_(cl, 'ExportSystem!Clients', 3);

  // Phân bố giá trị của bốn cột cuối: cột đánh dấu đơn vị nằm trong số đó.
  if (cl && info && info.nDong > 1) {
    var tu = Math.max(1, info.nCot - 3);
    var data = cl.getRange(2, tu, info.nDong - 1, info.nCot - tu + 1).getValues();
    Logger.log('');
    Logger.log('--- Phân bố giá trị bốn cột cuối của Clients ---');
    for (var c = 0; c < data[0].length; c++) {
      var dem = {};
      data.forEach(function (r) {
        var k = String(r[c] === '' || r[c] === null ? '(trống)' : r[c]).trim();
        dem[k] = (dem[k] || 0) + 1;
      });
      var ds = Object.keys(dem).sort(function (a, b) { return dem[b] - dem[a]; });
      Logger.log('  cột ' + impTenCot_(tu - 1 + c) + ' (' + impGonGang_(info.headers[tu - 1 + c]) + '): ' +
        ds.slice(0, 12).map(function (k) { return k + '=' + dem[k]; }).join('  |  ') +
        (ds.length > 12 ? '  … ' + (ds.length - 12) + ' giá trị khác' : ''));
    }
  }

  Logger.log('');
  Logger.log('=== HẾT ===');
  return 'Xem Nhật ký thực thi.';
}
