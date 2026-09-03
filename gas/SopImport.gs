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

  // --- Đơn đã có: Ship Qty theo Shipdate ---
  var det = SpreadsheetApp.openById(IMP_OPS2026_ID).getSheetByName('Details');
  if (!det) throw new Error('Không thấy tab Details trong Operations2026.');
  if (det.getLastRow() > 1) {
    det.getRange(2, 1, det.getLastRow() - 1, 10).getValues().forEach(function (r) {
      var ma = impMa_(r[3]);                       // D = Code
      if (!ma) return;
      var k = impThangCua_(r[9]);                  // J = Shipdate
      if (viTri[k] === undefined) return;
      cong(ma, viTri[k], impSo_(r[6]));            // G = Ship Qty
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
    pd.getRange(2, 3, pd.getLastRow() - 1, 5).getValues().forEach(function (r) {
      var pi = impMa_(r[0]);                       // C = PI_Number
      var ma = impMa_(r[2]);                       // E = Item_code
      if (!ma) return;
      var ngay = ngayPi[pi];
      if (ngay === undefined || ngay === '') { thieuNgay++; return; }
      var k = impThangCua_(ngay);
      if (viTri[k] === undefined) return;
      cong(ma, viTri[k], impSo_(r[4]));            // G = Qty
    });
  }
  if (thieuNgay) {
    ghiChu.push(thieuNgay + ' dòng PI không tra được ngày Expected Load trong PITotal — bị bỏ qua.');
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

/**
 * Chạy tay trong editor để thử — KHÔNG ghi gì.
 * Sửa hai giá trị dưới đây rồi bấm Run.
 */
function run_thuNhapSop() {
  var DON_VI = 'XK';          // 'OEM' hoặc 'XK'
  var THANG_DAU_KY = '2026-09';

  var session = { userId: 'admin', fullName: 'Chạy tay', role: 'central_admin', bu: '' };
  var r = importSopFromSource_(session, {
    businessUnitCode: DON_VI,
    baseMonth: THANG_DAU_KY,
    dryRun: true
  });

  var out = [];
  out.push('=== THỬ NHẬP (không ghi gì) ===');
  out.push('Đơn vị ' + r.businessUnitCode + ' · kỳ ' + r.baseMonth + ' · ' + r.months.join(' · '));
  out.push('SKU nhập được: ' + r.skuCount + ' · dòng nguồn đã cộng: ' + r.sourceRows);
  out.push('Tổng theo tháng: ' + r.monthTotals.join(' · '));
  out.push('Tuần: chỉ ghi tuần ' + IMP_TUAN + ' miền ' + IMP_MIEN + ' = số tháng đầu kỳ');
  if (r.unknownSkus.length) {
    out.push('MÃ CHƯA CÓ TRONG DANH MỤC FC — số của chúng sẽ KHÔNG vào: ' + r.unknownSkus.length);
    out.push('  ' + r.unknownSkus.slice(0, 30).join(', ') + (r.unknownSkus.length > 30 ? ' …' : ''));
    out.push('  Chạy adminAddMissingSkus("' + r.baseMonth + '", true) rồi thử lại.');
  } else {
    out.push('Mọi mã đều có trong danh mục FC.');
  }
  if (r.nonStandardCodes.length) {
    out.push('Ô mã phi tiêu chuẩn bị bỏ qua: ' + r.nonStandardCodes.join(', '));
  }
  r.notes.forEach(function (n) { out.push('! ' + n); });

  Logger.log(out.join(String.fromCharCode(10)));
  return out.join(String.fromCharCode(10));
}
