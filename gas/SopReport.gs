/**
 * SopReport.gs — khảo sát hai nguồn SOP trước khi viết chức năng nhập dữ liệu.
 * CHỈ ĐỌC, chạy lại bao nhiêu lần cũng được, không sửa gì ở đâu cả.
 *
 * Ba câu hỏi cần trả lời:
 *
 * 1. Mã hàng của hai nguồn có khớp danh mục FC không? Con số này quyết định
 *    có phải lập bảng ánh xạ thủ công hay không.
 *
 * 2. Tab SOP của Xuất khẩu giờ trải theo chiều nào (vừa rút còn 4 cột tháng),
 *    tiêu đề ở dòng mấy, và ô tháng ở DÒNG DỮ LIỆU là công thức sống hay giá
 *    trị tĩnh. Lần khảo sát trước tôi soi nhầm dòng 2 — đó là dòng tổng.
 *
 * 3. Tab SOP_Plan của OEM có dùng một mình được không. Lúc duyệt, Admin có thể
 *    sửa số (overrideRows trong oemAppApproveSop_), mà số sửa CHỈ ghi vào tab
 *    SOP chứ không ghi ngược về SOP_Plan. Hàm này cộng SOP_Plan của kỳ hiện
 *    tại rồi so từng SKU với tab SOP: khớp hết nghĩa là chưa ai dùng tính năng
 *    sửa nên SOP_Plan dùng được; lệch nghĩa là đọc SOP_Plan sẽ lấy vào đúng
 *    con số mà Admin đã bác.
 */

var SOPRPT_OEM_SHEET_ID = '1lSeQyfHmd-H0s7Qu7n9b8LAJ3Deap9hHFLEKf6F0Cnk';
var SOPRPT_OPS2026_ID   = '1fDUB6oqyMisV4NxId4JyGhmizgucit8zOdI38fBRZHA';

/** Mã hàng LUÔN ép chuỗi: getValues() trả mã toàn chữ số (1001050029) dạng
 *  number, so number với chuỗi thì không mã nào khớp và báo cáo sẽ nói dối. */
function sopMa_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

function sopSo_(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function sopCut_(v, n) {
  var t = String(v);
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function adminReportSopMatch() {
  var out = [];

  // ---------------- 1. Đối chiếu mã hàng ----------------
  var prods = activeOnly_(readObjects_(SHEETS.PRODUCTS));
  var fcAll = {}, fcOEM = {}, fcXK = {};
  prods.forEach(function (p) {
    var k = sopMa_(p.sku_code);
    if (!k) return;
    fcAll[k] = true;
    var ch = String(p.default_channel || '').trim();
    if (ch === 'OEM') fcOEM[k] = true;
    if (ch === 'XK') fcXK[k] = true;
  });

  out.push('=== 1. ĐỐI CHIẾU MÃ HÀNG ===');
  out.push('Danh mục FC: ' + Object.keys(fcAll).length + ' mã · OEM ' + Object.keys(fcOEM).length
    + ' · XK ' + Object.keys(fcXK).length);
  out.push('');

  function doiChieu(nhan, values, fcKenh, tenKenh) {
    var set = {}, n = 0;
    values.forEach(function (v) {
      var k = sopMa_(v);
      if (k && !set[k]) { set[k] = true; n++; }
    });
    var khop = 0, khopKenh = 0, thieu = [];
    Object.keys(set).forEach(function (k) {
      if (fcAll[k]) { khop++; if (fcKenh[k]) khopKenh++; }
      else if (thieu.length < 20) thieu.push(k);
    });
    out.push(nhan + ': ' + n + ' mã khác nhau');
    out.push('   khớp danh mục FC: ' + khop + '/' + n
      + ' (' + Math.round(khop * 1000 / (n || 1)) / 10 + '%) · đúng kênh ' + tenKenh + ': ' + khopKenh);
    out.push('   KHÔNG khớp: ' + (n - khop) + (thieu.length ? ' — ' + thieu.join(', ') : ''));
    out.push('');
  }

  var sop = null, plan = null;
  try {
    var oemSS = SpreadsheetApp.openById(SOPRPT_OEM_SHEET_ID);
    sop = oemSS.getSheetByName('SOP');
    plan = oemSS.getSheetByName('SOP_Plan');
    if (sop && sop.getLastRow() > 1) {
      doiChieu('OEM · SOP', sop.getRange(2, 1, sop.getLastRow() - 1, 1).getValues()
        .map(function (r) { return r[0]; }), fcOEM, 'OEM');
    }
    if (plan && plan.getLastRow() > 1) {
      doiChieu('OEM · SOP_Plan', plan.getRange(2, 3, plan.getLastRow() - 1, 1).getValues()
        .map(function (r) { return r[0]; }), fcOEM, 'OEM');
    }
  } catch (e) {
    out.push('OEM: LỖI — ' + e.message);
  }

  // ---------------- 2. Tab SOP của Xuất khẩu ----------------
  out.push('=== 2. TAB SOP CỦA XUẤT KHẨU (cấu trúc mới) ===');
  try {
    var xk = SpreadsheetApp.openById(SOPRPT_OPS2026_ID).getSheetByName('SOP');
    var lr = xk.getLastRow(), lc = xk.getLastColumn();
    out.push('  ' + lr + ' dòng x ' + lc + ' cột');

    // Tìm dòng tiêu đề: dòng đầu tiên trong 8 dòng đầu có ô A là "Code"
    var head = xk.getRange(1, 1, Math.min(8, lr), lc).getValues();
    var hRow = -1;
    for (var i = 0; i < head.length; i++) {
      if (String(head[i][0]).trim().toLowerCase() === 'code') { hRow = i + 1; break; }
    }
    out.push('  Dòng tiêu đề: ' + (hRow > 0 ? 'dòng ' + hRow : 'KHÔNG THẤY ô A nào là "Code"'));
    for (var r0 = 0; r0 < head.length && r0 < 4; r0++) {
      out.push('  dòng ' + (r0 + 1) + ' | ' + head[r0].map(function (v) { return sopCut_(v, 20); }).join(' | '));
    }

    if (hRow > 0 && lr > hRow) {
      var dRow = hRow + 1;
      out.push('  dữ liệu từ dòng ' + dRow);

      var f = xk.getRange(dRow, 1, 1, lc).getFormulas()[0];
      var cot = [];
      f.forEach(function (x, k) { if (x) cot.push(k + 1); });
      out.push('  CÔNG THỨC ở dòng dữ liệu: ' + (cot.length ? 'cột ' + cot.join(', ') : 'KHÔNG — toàn giá trị tĩnh'));
      for (var c = 0; c < f.length; c++) {
        if (f[c]) { out.push('    cột ' + (c + 1) + ' = ' + sopCut_(f[c], 260)); break; }
      }

      var fh = xk.getRange(hRow, 1, 1, lc).getFormulas()[0];
      for (var c2 = 0; c2 < fh.length; c2++) {
        if (fh[c2]) { out.push('    công thức Ở TIÊU ĐỀ cột ' + (c2 + 1) + ' = ' + sopCut_(fh[c2], 200)); break; }
      }

      var data = xk.getRange(dRow, 1, lr - dRow + 1, lc).getValues();
      var theoF = {}, coSo = 0;
      data.forEach(function (row) {
        if (!sopMa_(row[0])) return;
        var kenh = String(row[5] || '').trim() || '(trống)';
        theoF[kenh] = (theoF[kenh] || 0) + 1;
        var s = 0;
        for (var m = 0; m < lc; m++) s += sopSo_(row[m]);
        if (s > 0) coSo++;
      });
      out.push('  Cột F theo giá trị: '
        + Object.keys(theoF).sort().map(function (k) { return k + '=' + theoF[k]; }).join(' · '));
      out.push('  Dòng có ít nhất một số > 0: ' + coSo);
    }
  } catch (e) {
    out.push('  LỖI — ' + e.message);
  }
  out.push('');

  // ---------------- 3. SOP_Plan có dùng một mình được không ----------------
  out.push('=== 3. SOP_PLAN CÓ KHỚP TAB SOP KHÔNG ===');
  try {
    if (!sop || !plan) throw new Error('thiếu tab SOP hoặc SOP_Plan');

    var sopHead = sop.getRange(1, 1, 1, 7).getValues()[0].map(String);
    var m = /T(\d{2})-(\d{4})/.exec(sopHead[3] || '');
    if (!m) throw new Error('không bóc được kỳ từ tiêu đề "' + sopHead[3] + '"');
    var ky = m[2] + '-' + m[1];
    out.push('  Kỳ trên tab SOP: ' + ky + '   (tiêu đề: ' + sopHead.slice(3).join(' | ') + ')');

    var tuSop = {};
    if (sop.getLastRow() > 1) {
      sop.getRange(2, 1, sop.getLastRow() - 1, 7).getValues().forEach(function (r) {
        var k = sopMa_(r[0]);
        if (k) tuSop[k] = [sopSo_(r[3]), sopSo_(r[4]), sopSo_(r[5]), sopSo_(r[6])];
      });
    }

    var tuPlan = {}, soDongDuyet = 0, cacKy = {};
    if (plan.getLastRow() > 1) {
      plan.getRange(2, 1, plan.getLastRow() - 1, 8).getValues().forEach(function (r) {
        // Cột Kỳ có thể bị Sheets hiểu thành Date — đã gặp thật, xem chú thích
        // đầu file gas/Sop.gs của OEM. Chuẩn hoá về yyyy-MM trước khi so.
        var kyRow;
        if (Object.prototype.toString.call(r[0]) === '[object Date]') {
          kyRow = r[0].getFullYear() + '-' + ('0' + (r[0].getMonth() + 1)).slice(-2);
        } else {
          kyRow = String(r[0]).trim();
        }
        cacKy[kyRow] = (cacKy[kyRow] || 0) + 1;
        if (kyRow !== ky) return;
        if (String(r[7]).trim() !== 'Đã duyệt') return;
        soDongDuyet++;
        var k = sopMa_(r[2]);
        if (!k) return;
        if (!tuPlan[k]) tuPlan[k] = [0, 0, 0, 0];
        for (var j = 0; j < 4; j++) tuPlan[k][j] += sopSo_(r[3 + j]);
      });
    }

    out.push('  Các kỳ trong SOP_Plan: '
      + Object.keys(cacKy).sort().map(function (k) { return k + '(' + cacKy[k] + ')'; }).join(' · '));
    out.push('  Dòng "Đã duyệt" của kỳ ' + ky + ': ' + soDongDuyet);
    out.push('  SKU trên tab SOP: ' + Object.keys(tuSop).length
      + ' · SKU cộng từ SOP_Plan: ' + Object.keys(tuPlan).length);

    var lech = [], khop = 0;
    Object.keys(tuSop).forEach(function (k) {
      var a = tuSop[k], b = tuPlan[k];
      if (!b) { if (lech.length < 12) lech.push(k + ': SOP có, SOP_Plan KHÔNG có'); return; }
      if (a.join(',') === b.join(',')) { khop++; return; }
      if (lech.length < 12) lech.push(k + ': SOP=[' + a.join(',') + '] · Plan=[' + b.join(',') + ']');
    });
    Object.keys(tuPlan).forEach(function (k) {
      if (!tuSop[k] && lech.length < 12) {
        lech.push(k + ': SOP_Plan có, SOP không (có thể do cả 4 tháng đều 0)');
      }
    });

    out.push('  KHỚP HOÀN TOÀN: ' + khop + '/' + Object.keys(tuSop).length + ' SKU');
    if (lech.length) {
      out.push('  LỆCH — tính năng sửa-lúc-duyệt CÓ được dùng, đọc SOP_Plan một mình sẽ sai:');
      lech.forEach(function (x) { out.push('    ' + x); });
    } else {
      out.push('  Không lệch dòng nào → SOP_Plan dùng một mình được, đúng như đã chốt.');
    }
  } catch (e) {
    out.push('  LỖI — ' + e.message);
  }
  out.push('');

  // ---------------- 4. Tab trung gian SOP2 ----------------
  out.push('=== 4. TAB SOP2 (trung gian IMPORTRANGE từ PIDetails) ===');
  try {
    var s2 = SpreadsheetApp.openById(SOPRPT_OPS2026_ID).getSheetByName('SOP2');
    if (!s2) {
      out.push('  không có tab SOP2');
    } else {
      out.push('  ' + s2.getLastRow() + ' dòng x ' + s2.getLastColumn() + ' cột');
      var n2 = Math.min(3, s2.getLastRow());
      s2.getRange(1, 1, n2, Math.min(s2.getLastColumn(), 12)).getValues().forEach(function (r, i) {
        out.push('  dòng ' + (i + 1) + ' | ' + r.map(function (v) { return sopCut_(v, 18); }).join(' | '));
      });
      var f2 = s2.getRange(1, 1).getFormula();
      if (f2) out.push('  công thức A1 = ' + sopCut_(f2, 220));
    }
  } catch (e) {
    out.push('  LỖI — ' + e.message);
  }

  Logger.log(out.join(String.fromCharCode(10)));
  return out.join(String.fromCharCode(10));
}

/**
 * Phần còn thiếu sau lần chạy đầu — CHỈ ĐỌC.
 *
 *  a) Đối chiếu mã hàng của nguồn Xuất khẩu (lần trước tôi quên gọi).
 *  b) TOÀN BỘ công thức ở dòng dữ liệu của tab SOP, nhất là các cột tháng:
 *     cộng "Order Qty" hay "Ship Qty" — quyết định con số nghĩa là gì.
 *  c) Công thức A3 đầy đủ (lần trước bị cắt ở 260 ký tự).
 *  d) Những mã có trong kế hoạch OEM nhưng trong FC lại gắn kênh khác —
 *     đây là nhóm sẽ ghi được vào FC nhưng KHÔNG hiện trên màn hình OEM.
 */
function adminReportSopDetail() {
  var out = [];
  var prods = activeOnly_(readObjects_(SHEETS.PRODUCTS));
  var kenhCua = {};
  prods.forEach(function (p) {
    var k = sopMa_(p.sku_code);
    if (k) kenhCua[k] = String(p.default_channel || '').trim() || '(trống)';
  });

  out.push('=== A. MÃ HÀNG CỦA NGUỒN XUẤT KHẨU ===');
  try {
    var xk = SpreadsheetApp.openById(SOPRPT_OPS2026_ID).getSheetByName('SOP');
    var lr = xk.getLastRow(), lc = xk.getLastColumn();
    var codes = xk.getRange(4, 1, lr - 3, 1).getValues();
    var set = {}, n = 0;
    codes.forEach(function (r) { var k = sopMa_(r[0]); if (k && !set[k]) { set[k] = true; n++; } });
    var khop = 0, xkKenh = 0, thieu = [];
    Object.keys(set).forEach(function (k) {
      if (kenhCua[k]) { khop++; if (kenhCua[k] === 'XK') xkKenh++; }
      else if (thieu.length < 20) thieu.push(k);
    });
    out.push('  ' + n + ' mã khác nhau · khớp danh mục FC: ' + khop + '/' + n
      + ' (' + Math.round(khop * 1000 / (n || 1)) / 10 + '%) · gắn kênh XK: ' + xkKenh);
    out.push('  KHÔNG khớp: ' + (n - khop) + (thieu.length ? ' — ' + thieu.join(', ') : ''));

    out.push('');
    out.push('=== B. CÔNG THỨC TAB SOP CỦA XUẤT KHẨU ===');
    out.push('  A3 (danh sách mã, đầy đủ):');
    out.push('    ' + xk.getRange(3, 1).getFormula());
    var fh = xk.getRange(3, 1, 1, lc).getFormulas()[0];
    for (var c = 1; c < fh.length; c++) {
      if (fh[c]) out.push('  tiêu đề cột ' + (c + 1) + ' = ' + fh[c]);
    }
    var f4 = xk.getRange(4, 1, 1, lc).getFormulas()[0];
    out.push('  dòng dữ liệu:');
    for (var d = 0; d < f4.length; d++) {
      if (f4[d]) out.push('    cột ' + (d + 1) + ' = ' + sopCut_(f4[d], 400));
    }

    out.push('');
    out.push('=== C. SỐ LIỆU THẬT TRONG 4 CỘT THÁNG ===');
    var thang = xk.getRange(3, 4, 1, 4).getValues()[0];
    var data = xk.getRange(4, 1, lr - 3, lc).getValues();
    var coSo = 0, tong = [0, 0, 0, 0], soMa = 0;
    data.forEach(function (r) {
      if (!sopMa_(r[0])) return;
      soMa++;
      var s = 0;
      for (var j = 0; j < 4; j++) { var v = sopSo_(r[3 + j]); tong[j] += v; s += v; }
      if (s > 0) coSo++;
    });
    out.push('  ' + soMa + ' dòng có mã · ' + coSo + ' dòng có số lượng > 0');
    out.push('  Tổng theo tháng ' + thang.join('/') + ': ' + tong.join(' · '));
    out.push('  (dòng 2 của Sheet ghi tổng máy: so hai con số này để biết dòng tổng lọc thêm gì)');
  } catch (e) {
    out.push('  LỖI — ' + e.message);
  }

  out.push('');
  out.push('=== D. MÃ TRONG KẾ HOẠCH OEM NHƯNG FC GẮN KÊNH KHÁC ===');
  out.push('  (ghi vào FC được, nhưng KHÔNG hiện trên màn hình đơn vị OEM)');
  try {
    var plan = SpreadsheetApp.openById(SOPRPT_OEM_SHEET_ID).getSheetByName('SOP_Plan');
    var rows = plan.getRange(2, 1, plan.getLastRow() - 1, 8).getValues();
    var seen = {}, theoKenh = {}, vd = [];
    rows.forEach(function (r) {
      if (String(r[7]).trim() !== 'Đã duyệt') return;
      var k = sopMa_(r[2]);
      if (!k || seen[k]) return;
      seen[k] = true;
      var ch = kenhCua[k] || '(không có trong danh mục FC)';
      if (ch === 'OEM') return;
      theoKenh[ch] = (theoKenh[ch] || 0) + 1;
      if (vd.length < 25) vd.push(k + ' → ' + ch);
    });
    var tongLech = Object.keys(theoKenh).reduce(function (a, k) { return a + theoKenh[k]; }, 0);
    out.push('  ' + tongLech + ' mã, phân theo kênh đang gắn: '
      + Object.keys(theoKenh).sort().map(function (k) { return k + '=' + theoKenh[k]; }).join(' · '));
    vd.forEach(function (x) { out.push('    ' + x); });
  } catch (e) {
    out.push('  LỖI — ' + e.message);
  }

  Logger.log(out.join(String.fromCharCode(10)));
  return out.join(String.fromCharCode(10));
}
