/**
 * SopDryRun.gs — chạy thử phép cộng SOP Xuất khẩu bằng code rồi so với tab SOP
 * đang chạy trên Sheet. CHỈ ĐỌC, không ghi gì.
 *
 * Mục đích: chứng minh (hoặc bác bỏ) rằng FC tự cộng được từ nguồn gốc, để bỏ
 * hẳn chuỗi tab công thức SOP2 (Hub) → SOP2 (Ops2026) → SOP (Ops2026), cùng ô
 * chọn kỳ và hai dòng tổng.
 *
 * ĐỌC THẲNG NGUỒN GỐC, không qua SOP2:
 *   Details (Ops2026): D = Code, G = Ship Qty, J = Shipdate
 *   PIDetails (Hub):   C = PI_Number, E = Item_code, G = Qty
 *   PITotal (Hub):     C = PI_Number, H = Expected Load
 * Đây đúng là những gì SOP2 làm, chỉ khác là làm bằng code:
 *   SOP2!A1 = QUERY(PIDetails!C:G, "select C,E,F,G")
 *   SOP2!H2 = ARRAYFORMULA(VLOOKUP(A2:A, PITotal!C:H, 6, 0))
 *
 * Đọc thẳng còn tránh được một lỗi dữ liệu thật: cột Qty của SOP2 đang được
 * ĐỊNH DẠNG NGÀY, nên getValues() trả về Date chứ không phải số (300 thành
 * "Thu Oct 25 1900"). Công thức SUMIFS không việc gì vì nó dùng giá trị nền,
 * nhưng code đọc thì vỡ. dryQty_() bên dưới vẫn xử lý trường hợp đó phòng khi
 * gặp lại ở cột khác.
 *
 *   adminDryRunXkSop('2026-09')   so với kỳ đang hiện trên Sheet
 *   adminDryRunXkSop('2026-10')   phơi bày lỗi vắt năm của công thức Sheet
 */

var DRYRUN_HUB_ID = '16kDRbTffeSFSxwAZPCCpXGODUByEquCchnkqs1kyFrc';

/** Mốc tháng 'yyyy-MM' của một ô ngày, chấp nhận cả Date lẫn chuỗi. */
function dryMonthKey_(v) {
  if (!v && v !== 0) return '';
  var d = (Object.prototype.toString.call(v) === '[object Date]') ? v : new Date(v);
  if (!d || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

/**
 * Số lượng, chịu được ô bị định dạng ngày. Ô số mà mang định dạng ngày thì
 * getValues() trả Date; đổi ngược về số sê-ri của Sheets (mốc 1899-12-30).
 */
function dryQty_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var epoch = new Date(1899, 11, 30);
    return Math.round((v.getTime() - epoch.getTime()) / 86400000);
  }
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function dryAddMonths_(ym, delta) {
  var p = String(ym).split('-');
  var total = (parseInt(p[0], 10) * 12 + (parseInt(p[1], 10) - 1)) + delta;
  var y = Math.floor(total / 12), m = (total % 12) + 1;
  return y + '-' + ('0' + m).slice(-2);
}

function adminDryRunXkSop(baseMonth) {
  if (!baseMonth) baseMonth = '2026-09';
  var out = [];
  var thang = [0, 1, 2, 3].map(function (i) { return dryAddMonths_(baseMonth, i); });
  var viTri = {};
  thang.forEach(function (t, i) { viTri[t] = i; });

  out.push('=== CHẠY THỬ CỘNG SOP XUẤT KHẨU BẰNG CODE ===');
  out.push('Kỳ ' + baseMonth + '  →  ' + thang.join(' · '));
  out.push('Đọc thẳng Details + PIDetails + PITotal, KHÔNG qua SOP2.');
  out.push('');

  var theoMa = {};   // ma -> [4 tháng]
  var tuDetails = [0, 0, 0, 0], tuPi = [0, 0, 0, 0];
  var canhBao = [];

  function cong(ma, idx, qty) {
    if (!theoMa[ma]) theoMa[ma] = [0, 0, 0, 0];
    theoMa[ma][idx] += qty;
  }

  // ---------- Details ----------
  try {
    var det = SpreadsheetApp.openById(SOPRPT_OPS2026_ID).getSheetByName('Details');
    var dv = det.getRange(2, 1, det.getLastRow() - 1, 10).getValues();
    var nDet = 0, ngayHong = 0;
    dv.forEach(function (r) {
      var ma = sopMa_(r[3]);
      if (!ma) return;
      var k = dryMonthKey_(r[9]);
      if (!k) { ngayHong++; return; }
      if (viTri[k] === undefined) return;
      var q = dryQty_(r[6]);
      if (!q) return;
      tuDetails[viTri[k]] += q;
      cong(ma, viTri[k], q);
      nDet++;
    });
    out.push('Details: ' + (det.getLastRow() - 1) + ' dòng · ' + nDet + ' dòng rơi vào kỳ'
      + (ngayHong ? ' · ' + ngayHong + ' dòng không đọc được Shipdate' : ''));
  } catch (e) { out.push('LỖI Details — ' + e.message); }

  // ---------- PIDetails nối PITotal ----------
  try {
    var hub = SpreadsheetApp.openById(DRYRUN_HUB_ID);

    var pt = hub.getSheetByName('PITotal');
    var ptv = pt.getRange(2, 3, pt.getLastRow() - 1, 6).getValues(); // C..H
    var ngayCuaPi = {};
    ptv.forEach(function (r) {
      var pi = sopMa_(r[0]);            // C = PI_Number
      if (pi) ngayCuaPi[pi] = r[5];     // H = Expected Load
    });
    out.push('PITotal: ' + Object.keys(ngayCuaPi).length + ' số PI có ngày Expected Load');

    var pd = hub.getSheetByName('PIDetails');
    var pdv = pd.getRange(2, 3, pd.getLastRow() - 1, 5).getValues(); // C..G
    var nPi = 0, thieuNgay = 0;
    pdv.forEach(function (r) {
      var pi = sopMa_(r[0]);            // C = PI_Number
      var ma = sopMa_(r[2]);            // E = Item_code
      if (!ma) return;
      var ngay = ngayCuaPi[pi];
      if (ngay === undefined || ngay === '') { thieuNgay++; return; }
      var k = dryMonthKey_(ngay);
      if (!k || viTri[k] === undefined) return;
      var q = dryQty_(r[4]);            // G = Qty
      if (!q) return;
      tuPi[viTri[k]] += q;
      cong(ma, viTri[k], q);
      nPi++;
    });
    out.push('PIDetails: ' + (pd.getLastRow() - 1) + ' dòng · ' + nPi + ' dòng rơi vào kỳ'
      + (thieuNgay ? ' · ' + thieuNgay + ' dòng có PI không tra được Expected Load' : ''));
  } catch (e) { out.push('LỖI Hub — ' + e.message); }

  out.push('');
  out.push('--- TỔNG THEO THÁNG ---');
  out.push('  tháng      code tính  =  Details  +  PI');
  var tongCode = [];
  thang.forEach(function (t, i) {
    var s = tuDetails[i] + tuPi[i];
    tongCode.push(s);
    out.push('  ' + t + '   ' + s + '  =  ' + tuDetails[i] + '  +  ' + tuPi[i]);
  });

  // ---------- So với tab SOP ----------
  out.push('');
  out.push('--- SO VỚI TAB SOP TRÊN SHEET ---');
  try {
    var xk = SpreadsheetApp.openById(SOPRPT_OPS2026_ID).getSheetByName('SOP');
    var nam = xk.getRange(1, 2).getValue();
    var thangSheet = xk.getRange(3, 4, 1, 4).getValues()[0];
    out.push('  Sheet đang để năm ' + nam + ', tháng ' + thangSheet.join('/'));

    var rows = xk.getRange(4, 1, xk.getLastRow() - 3, 7).getValues();
    var tuSheet = {}, tongSheet = [0, 0, 0, 0];
    rows.forEach(function (r) {
      var ma = sopMa_(r[0]);
      if (!ma) return;
      var v = [dryQty_(r[3]), dryQty_(r[4]), dryQty_(r[5]), dryQty_(r[6])];
      // Tab SOP có thể liệt kê một mã nhiều lần (UNIQUE theo cặp mã+tên, nên
      // cùng mã mà tên khác nhau sẽ ra hai dòng) — cộng dồn để so cho công bằng.
      if (!tuSheet[ma]) tuSheet[ma] = [0, 0, 0, 0];
      for (var j = 0; j < 4; j++) { tuSheet[ma][j] += v[j]; tongSheet[j] += v[j]; }
    });

    out.push('  Tổng Sheet: ' + tongSheet.join(' · '));
    out.push('  Tổng code:  ' + tongCode.join(' · '));
    out.push('  Số mã — Sheet: ' + Object.keys(tuSheet).length + ' · code: ' + Object.keys(theoMa).length);

    if (tongSheet.join(',') === tongCode.join(',')) {
      out.push('  >>> KHỚP TUYỆT ĐỐI. FC tự cộng được, bỏ chuỗi tab công thức đi không mất gì.');
    } else {
      out.push('  >>> LỆCH — chi tiết bên dưới.');
      var dsLech = [];
      var moiMa = {};
      Object.keys(tuSheet).forEach(function (k) { moiMa[k] = true; });
      Object.keys(theoMa).forEach(function (k) { moiMa[k] = true; });
      Object.keys(moiMa).forEach(function (k) {
        var a = tuSheet[k] || [0, 0, 0, 0];
        var b = theoMa[k] || [0, 0, 0, 0];
        var d = 0;
        for (var j = 0; j < 4; j++) d += Math.abs(a[j] - b[j]);
        if (d > 0) dsLech.push({ ma: k, d: d, a: a, b: b, chiSheet: !theoMa[k], chiCode: !tuSheet[k] });
      });
      dsLech.sort(function (x, y) { return y.d - x.d; });
      out.push('  ' + dsLech.length + ' mã lệch. 15 mã lệch nhiều nhất:');
      dsLech.slice(0, 15).forEach(function (x) {
        out.push('    ' + x.ma + (x.chiSheet ? '  [chỉ có trên Sheet]' : (x.chiCode ? '  [chỉ có ở code]' : ''))
          + '  Sheet=[' + x.a.join(',') + ']  code=[' + x.b.join(',') + ']');
      });
      var chiSheet = dsLech.filter(function (x) { return x.chiSheet; }).length;
      var chiCode = dsLech.filter(function (x) { return x.chiCode; }).length;
      out.push('  Trong đó: ' + chiSheet + ' mã chỉ Sheet có · ' + chiCode + ' mã chỉ code có');
    }
  } catch (e) {
    out.push('  LỖI đọc tab SOP — ' + e.message);
  }

  if (canhBao.length) {
    out.push('');
    canhBao.forEach(function (x) { out.push('  ! ' + x); });
  }

  Logger.log(out.join(String.fromCharCode(10)));
  return out.join(String.fromCharCode(10));
}
