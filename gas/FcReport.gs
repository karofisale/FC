/**
 * Dữ liệu cho form báo cáo FC 10 tab (file "XK_OEM_GT2_Online_Sales FC").
 *
 * Thay cho hai lượt xuất rời B0.SUM và B1.SUM trước đây: một lượt gọi trả
 * đủ số cho cả mười tab, vì chín trong mười tab đọc cùng một tập dữ liệu —
 * gọi hai lần là hai lần đọc MonthlyForecastLines và WeeklyRegionSplits, và
 * nếu ai đó chốt bản mới xen giữa hai lượt thì hai tab trong cùng một file
 * lại lấy số của hai bản khác nhau.
 *
 * Lấy theo BẢN CHỐT (is_final) chứ không phải bản đã duyệt: đây là báo cáo
 * để đối chiếu trong lúc đang lập kế hoạch, khi chưa có gì được duyệt cả —
 * cùng quy tắc với getB0SumExport_ cũ mà nó thay thế.
 */

/**
 * Mã đơn vị → CỘT trong form báo cáo.
 *
 * Đây KHÔNG phải sap_channel. 3T và NSKX lên SAP ở nhà máy 0200 chung với
 * GT2, nhưng trong báo cáo chúng là kênh Online (tab B0.8/B1.8). Dùng lẫn
 * hai bản đồ này thì sản lượng của 3T/NSKX chảy vào cột GT2: form vẫn đủ
 * cột, đủ dòng, tổng công ty vẫn khớp — chỉ có hai kênh sai số.
 *
 * Đơn vị chưa khai report_channel thì rơi về sap_channel để dữ liệu chưa
 * kịp thêm cột vẫn ra file. Nhưng rơi về như vậy là ĐÚNG CÁI BẪY trên, nên
 * getFcReportExport_ trả danh sách đơn vị chưa khai để màn hình nói ra.
 */
function reportChannelByBU_() {
  var out = { map: {}, undeclared: [] };
  readObjects_(SHEETS.BUSINESS_UNITS).forEach(function (b) {
    var code = String(b.code || '').trim();
    if (!code) return;
    var khai = String(b.report_channel || '').trim();
    if (!khai) {
      out.undeclared.push(code);
      khai = String(b.sap_channel || '').trim().toUpperCase()
        || (code === 'XK' ? 'XK' : (code === 'OEM' ? 'OEM' : 'GT2'));
    }
    out.map[code] = khai;
  });
  return out;
}

/** Bốn tháng của chu kỳ, tính từ tháng gốc. */
function bonThangTu_(month0) {
  var parts = month0.split('-').map(Number);
  var months = [];
  for (var i = 0; i < 4; i++) {
    var d = new Date(Date.UTC(parts[0], parts[1] - 1 + i, 1));
    months.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-01');
  }
  return months;
}

function getFcReportExport_(session, baseMonth) {
  assertRole_(session, ['central_admin', 'viewer']);
  var month0 = normalizeMonth_(baseMonth);
  if (!month0) throw new Error('Thiếu tháng cần xuất.');

  var months = bonThangTu_(month0);
  var products = productMap_();
  var kenh = reportChannelByBU_();

  // --- chu kỳ của tháng này, và MỌI bản cập nhật của chúng -----------------
  //
  // Sáu cột "Số FC Tuần 0..Tuần 5" của tab B1 là sản lượng tháng gốc theo
  // TỪNG LẦN cập nhật, nên phải đọc cả những bản không phải bản chốt.
  var cycles = readObjects_(SHEETS.CYCLES).filter(function (c) {
    return normalizeMonth_(c.base_month) === month0;
  });
  var buByCycle = {};
  cycles.forEach(function (c) { buByCycle[c.id] = c.business_unit_code; });

  var buByVersionId = {};       // bản CHỐT — nguồn số của 8 tab kênh + 2 tab SUM
  var roundByVersionId = {};    // mọi bản — chỉ dùng cho sáu cột "Số FC Tuần k"
  var updateWeeks = {};
  var updatedAt = '';
  readObjects_(SHEETS.VERSIONS).forEach(function (v) {
    var bu = buByCycle[v.cycle_id];
    if (bu === undefined) return;
    var uw = Number(v.update_week) || 0;
    roundByVersionId[v.id] = { bu: bu, week: uw };
    updateWeeks[uw] = true;
    var ngay = String(v.update_date || v.submitted_at || '').slice(0, 10);
    if (ngay > updatedAt) updatedAt = ngay;
    if (String(v.is_final) === '1' || v.is_final === true) buByVersionId[v.id] = bu;
  });

  var moi = function (sku) {
    var p = products[sku] || {};
    return {
      sku_code: sku,
      name: p.name || sku,
      short_name: p.short_name || '',
      product_group_code: p.product_group_code || 'KHAC',
      product_group_name: p.product_group_name || '',
      technology: p.technology || '',
      default_channel: p.default_channel || '',
      avg_price: Number(p.avg_price) || 0,
      monthly: {},
      weekly: {},
      byUpdateWeek: {}
    };
  };
  var rowsMap = {};
  var lay = function (sku) {
    if (!rowsMap[sku]) rowsMap[sku] = moi(sku);
    return rowsMap[sku];
  };

  // --- bốn tháng, theo bản chốt -------------------------------------------
  readObjectsWhere_(SHEETS.MONTHLY_LINES, 'version_id', function (v) {
    return roundByVersionId[v] !== undefined;
  }).forEach(function (l) {
    var m = normalizeMonth_(l.forecast_month);
    var qty = Number(l.quantity) || 0;
    var vong = roundByVersionId[l.version_id];

    // Sáu cột "Số FC Tuần k" chỉ lấy THÁNG GỐC, nhưng lấy của mọi bản.
    if (m === month0) {
      var r0 = lay(l.sku_code);
      if (!r0.byUpdateWeek[vong.week]) r0.byUpdateWeek[vong.week] = {};
      r0.byUpdateWeek[vong.week][vong.bu] = (r0.byUpdateWeek[vong.week][vong.bu] || 0) + qty;
    }

    if (buByVersionId[l.version_id] === undefined) return;
    if (months.indexOf(m) < 0) return;
    var r = lay(l.sku_code);
    if (!r.monthly[m]) r.monthly[m] = {};
    r.monthly[m][vong.bu] = (r.monthly[m][vong.bu] || 0) + qty;
  });

  // --- chia tuần × miền của tháng gốc, theo bản chốt ------------------------
  var weekNumbers = {};
  readObjectsWhere_(SHEETS.WEEKLY_SPLITS, 'version_id', function (v) {
    return buByVersionId[v] !== undefined;
  }).forEach(function (w) {
    var tuan = Number(w.week_number) || 0;
    if (!tuan) return;
    var mien = String(w.region_code || '').trim();
    if (!mien) return;
    weekNumbers[tuan] = true;
    var r = lay(w.sku_code);
    if (!r.weekly[tuan]) r.weekly[tuan] = {};
    if (!r.weekly[tuan][mien]) r.weekly[tuan][mien] = {};
    var bu = buByVersionId[w.version_id];
    r.weekly[tuan][mien][bu] = (r.weekly[tuan][mien][bu] || 0) + (Number(w.quantity) || 0);
  });

  var businessUnits = {};
  cycles.forEach(function (c) { businessUnits[c.business_unit_code] = true; });
  var buList = Object.keys(businessUnits).sort();

  return {
    baseMonth: month0,
    months: months,
    updatedAt: updatedAt,
    // Tuần CÓ SỐ THẬT. Màn hình hợp với số tuần tính theo lịch: một tháng
    // có 5 tuần mà bảng chia chỉ ghi tới tuần 4 thì cột tuần 5 vẫn phải có
    // (để trống), còn số ghi ở tuần 6 của một tháng 5 tuần thì vẫn phải hiện.
    weekNumbers: Object.keys(weekNumbers).map(Number).sort(function (a, b) { return a - b; }),
    updateWeeks: Object.keys(updateWeeks).map(Number).sort(function (a, b) { return a - b; }),
    regions: regionsFor_('weekly').map(function (r) { return { code: r.code, name: r.name }; }),
    productGroups: readObjects_(SHEETS.PRODUCT_GROUPS).map(function (g) {
      return { code: g.code, name: g.name || g.code };
    }),
    businessUnits: buList,
    reportChannels: kenh.map,
    // Đơn vị chưa khai report_channel — số của nó đang rơi về sap_channel.
    // Chỉ báo những đơn vị CÓ chu kỳ tháng này; các đơn vị đang tắt không
    // ảnh hưởng gì đến file nên không cần làm người xuất phân tâm.
    undeclaredReportChannel: kenh.undeclared.filter(function (b) {
      return businessUnits[b] === true;
    }).sort(),
    rows: Object.keys(rowsMap).map(function (k) { return rowsMap[k]; })
  };
}
