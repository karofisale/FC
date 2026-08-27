/**
 * Action gộp cho từng màn hình.
 *
 * Lý do tồn tại của file này: Apps Script xử lý TUẦN TỰ các request của
 * cùng một chủ sở hữu script. Client dùng Promise.all tưởng là gọi song
 * song, thực tế các request xếp hàng — đo thực tế cho thấy 6 request
 * đồng thời khiến request cuối mất 16 giây, kể cả action 'ping' không
 * chạm Sheet cũng mất 9 giây vì phải chờ. Cộng thêm mỗi request lại đọc
 * lại toàn bộ danh mục 1.141 SKU (productMap_), một màn hình gọi 5–6
 * request sẽ mất hàng chục giây, và Google hết hạn user_content_key giữa
 * chừng rồi trả 404 cho trình duyệt.
 *
 * Mỗi hàm dưới đây trả về TOÀN BỘ dữ liệu một màn hình cần trong đúng
 * một lần chạy, đọc mỗi sheet đúng một lần và dùng chung productMap.
 */

/** Chọn version phù hợp: ưu tiên id yêu cầu, rồi bản is_final, rồi bản cuối. */
function pickVersion_(versions, preferVersionId) {
  if (!versions.length) return null;
  if (preferVersionId) {
    for (var i = 0; i < versions.length; i++) {
      if (String(versions[i].id) === String(preferVersionId)) return versions[i];
    }
  }
  for (var j = 0; j < versions.length; j++) {
    if (String(versions[j].is_final) === '1' || versions[j].is_final === true) return versions[j];
  }
  return versions[versions.length - 1];
}

function cyclesForBU_(session, bu) {
  return getCycles_(session, bu, null);
}

function pickCycle_(cycles, preferCycleId) {
  if (!cycles.length) return null;
  if (preferCycleId) {
    for (var i = 0; i < cycles.length; i++) {
      if (String(cycles[i].id) === String(preferCycleId)) return cycles[i];
    }
  }
  return cycles[0];
}

/**
 * Màn Bảng 0 — thay cho chuỗi getCycles + getGroups + getProducts +
 * getVersions + getMonthlyLines (5 request) bằng 1 request.
 */
function getMonthlyWorkspace_(session, p) {
  var bu = p.bu || session.bu;
  var cycles = cyclesForBU_(session, bu);
  var cycle = pickCycle_(cycles, p.cycleId);
  var versions = cycle ? getVersions_(cycle.id) : [];
  var version = pickVersion_(versions, p.versionId);

  var products = getProducts_(bu, null, null);
  var lines = [];

  if (version) {
    var productIndex = {};
    products.forEach(function (pr) { productIndex[pr.sku_code] = pr; });

    readObjects_(SHEETS.MONTHLY_LINES).forEach(function (l) {
      if (String(l.version_id) !== String(version.id)) return;
      lines.push({
        sku_code: l.sku_code,
        forecast_month: normalizeMonth_(l.forecast_month),
        quantity: Number(l.quantity) || 0,
        note: l.note || ''
      });
    });
  }

  return {
    businessUnitCode: bu,
    cycles: cycles,
    cycle: cycle,
    versions: versions,
    version: version,
    productGroups: readObjects_(SHEETS.PRODUCT_GROUPS),
    products: products,
    lines: lines
  };
}

/**
 * Màn Bảng 1 — thay cho getCycles + getProducts + getRegions +
 * getVersions + getMonthlyLines + getWeeklySplits + validateWeekly
 * (7 request) bằng 1 request. Phần kiểm tra khớp số được tính ngay tại
 * đây từ dữ liệu vừa đọc, không đọc lại sheet lần nữa.
 */
function getWeeklyWorkspace_(session, p) {
  var bu = p.bu || session.bu;
  var cycles = cyclesForBU_(session, bu);
  var cycle = pickCycle_(cycles, p.cycleId);
  var versions = cycle ? getVersions_(cycle.id) : [];
  var version = pickVersion_(versions, p.versionId);

  var products = getProducts_(bu, null, null);
  var baseMonth = cycle ? normalizeMonth_(cycle.base_month) : '';

  var monthQty = {};
  var splits = [];

  if (version) {
    readObjects_(SHEETS.MONTHLY_LINES).forEach(function (l) {
      if (String(l.version_id) !== String(version.id)) return;
      if (normalizeMonth_(l.forecast_month) !== baseMonth) return;
      monthQty[l.sku_code] = (monthQty[l.sku_code] || 0) + (Number(l.quantity) || 0);
    });

    readObjects_(SHEETS.WEEKLY_SPLITS).forEach(function (w) {
      if (String(w.version_id) !== String(version.id)) return;
      splits.push({
        sku_code: w.sku_code,
        week_number: Number(w.week_number) || 0,
        region_code: w.region_code,
        quantity: Number(w.quantity) || 0
      });
    });
  }

  var weekQty = {};
  splits.forEach(function (w) {
    weekQty[w.sku_code] = (weekQty[w.sku_code] || 0) + w.quantity;
  });

  var productNames = {};
  products.forEach(function (pr) { productNames[pr.sku_code] = pr.name; });

  var skus = {};
  Object.keys(monthQty).forEach(function (s) { skus[s] = 1; });
  Object.keys(weekQty).forEach(function (s) { skus[s] = 1; });

  var mismatches = [];
  Object.keys(skus).forEach(function (sku) {
    var m = monthQty[sku] || 0;
    var w = weekQty[sku] || 0;
    if (Math.abs(m - w) < 0.0001) return;
    if (m === 0 && w === 0) return;
    mismatches.push({
      sku_code: sku,
      product_name: productNames[sku] || sku,
      month_qty: m,
      week_sum: w,
      variance: w - m
    });
  });
  mismatches.sort(function (a, b) { return Math.abs(b.variance) - Math.abs(a.variance); });

  return {
    businessUnitCode: bu,
    cycles: cycles,
    cycle: cycle,
    versions: versions,
    version: version,
    baseMonth: baseMonth,
    regions: activeOnly_(readObjects_(SHEETS.REGIONS)),
    products: products,
    monthlyQuantities: monthQty,
    splits: splits,
    validation: {
      isValid: mismatches.length === 0,
      mismatchesCount: mismatches.length,
      baseMonth: baseMonth,
      mismatches: mismatches.slice(0, 200)
    }
  };
}

/** Màn Tổng quan — gộp getCycles + getProducts + getB0Summary. */
function getDashboardWorkspace_(session, p) {
  var bu = p.bu || session.bu;
  var cycles = cyclesForBU_(session, bu);
  var cycle = pickCycle_(cycles, p.cycleId);
  var products = getProducts_(bu, null, null);

  var summary = [];
  if (cycle) {
    var productIndex = {};
    products.forEach(function (pr) { productIndex[pr.sku_code] = pr; });

    var finalVersions = {};
    readObjects_(SHEETS.VERSIONS).forEach(function (v) {
      if (String(v.cycle_id) !== String(cycle.id)) return;
      if (String(v.is_final) !== '1' && v.is_final !== true) return;
      finalVersions[v.id] = true;
    });

    var map = {};
    readObjects_(SHEETS.MONTHLY_LINES).forEach(function (l) {
      if (!finalVersions[l.version_id]) return;
      var pr = productIndex[l.sku_code] || {};
      var groupCode = pr.product_group_code || 'KHAC';
      var month = normalizeMonth_(l.forecast_month);
      var key = groupCode + '|' + month;
      if (!map[key]) {
        map[key] = {
          business_unit_code: cycle.business_unit_code,
          business_unit_name: cycle.business_unit_code,
          product_group_code: groupCode,
          product_group_name: pr.product_group_name || 'Chưa phân nhóm',
          forecast_month: month,
          total_quantity: 0,
          total_revenue: 0
        };
      }
      var qty = Number(l.quantity) || 0;
      map[key].total_quantity += qty;
      map[key].total_revenue += qty * (Number(pr.avg_price) || 0);
    });
    summary = Object.keys(map).map(function (k) { return map[k]; });
  }

  return {
    businessUnitCode: bu,
    cycles: cycles,
    cycle: cycle,
    productCount: products.length,
    b0Summary: summary
  };
}

/** Màn Sản lượng thực hiện — gộp getProducts + getRegions + getActuals + getFcVsActual. */
function getActualsWorkspace_(session, p) {
  var bu = p.bu || session.bu;
  var month = normalizeMonth_(p.month);
  if (!month) throw new Error('Thiếu tháng cần xem.');

  var products = getProducts_(bu, null, null);
  var productIndex = {};
  products.forEach(function (pr) { productIndex[pr.sku_code] = pr; });

  var actualBySku = {};
  var actuals = [];
  readObjects_(SHEETS.ACTUALS).forEach(function (a) {
    if (String(a.business_unit_code) !== String(bu)) return;
    if (normalizeMonth_(a.actual_month) !== month) return;
    var qty = Number(a.quantity) || 0;
    actuals.push({
      sku_code: a.sku_code,
      region_code: a.region_code,
      quantity: qty
    });
    actualBySku[a.sku_code] = (actualBySku[a.sku_code] || 0) + qty;
  });

  var cycles = cyclesForBU_(session, bu);
  var cycle = cycles.length ? cycles[0] : null;
  var fcBySku = {};

  if (cycle) {
    var finalVersionId = null;
    readObjects_(SHEETS.VERSIONS).forEach(function (v) {
      if (String(v.cycle_id) !== String(cycle.id)) return;
      if (String(v.is_final) === '1' || v.is_final === true) finalVersionId = v.id;
    });
    if (finalVersionId) {
      readObjects_(SHEETS.MONTHLY_LINES).forEach(function (l) {
        if (String(l.version_id) !== String(finalVersionId)) return;
        if (normalizeMonth_(l.forecast_month) !== month) return;
        fcBySku[l.sku_code] = (fcBySku[l.sku_code] || 0) + (Number(l.quantity) || 0);
      });
    }
  }

  var skus = {};
  Object.keys(fcBySku).forEach(function (s) { skus[s] = 1; });
  Object.keys(actualBySku).forEach(function (s) { skus[s] = 1; });

  var rows = Object.keys(skus).map(function (sku) {
    var pr = productIndex[sku] || {};
    var fc = fcBySku[sku] || 0;
    var actual = actualBySku[sku] || 0;
    return {
      sku_code: sku,
      product_name: pr.name || sku,
      product_group_code: pr.product_group_code || '',
      forecast_qty: fc,
      actual_qty: actual,
      variance_qty: actual - fc,
      variance_pct: fc > 0 ? Math.round(((actual - fc) / fc) * 1000) / 10 : null
    };
  }).filter(function (r) { return r.forecast_qty !== 0 || r.actual_qty !== 0; });

  rows.sort(function (a, b) { return Math.abs(b.variance_qty) - Math.abs(a.variance_qty); });

  var totalFc = rows.reduce(function (s, r) { return s + r.forecast_qty; }, 0);
  var totalActual = rows.reduce(function (s, r) { return s + r.actual_qty; }, 0);

  return {
    businessUnitCode: bu,
    month: month,
    regions: activeOnly_(readObjects_(SHEETS.REGIONS)),
    products: products,
    actuals: actuals,
    comparison: {
      cycleFound: !!cycle,
      totalForecast: totalFc,
      totalActual: totalActual,
      totalVariance: totalActual - totalFc,
      totalVariancePct: totalFc > 0 ? Math.round(((totalActual - totalFc) / totalFc) * 1000) / 10 : null,
      rows: rows
    }
  };
}

/** Màn Phê duyệt — gộp getApprovals + getVersionSummary của mục đầu tiên. */
function getApprovalsWorkspace_(session, p) {
  var list = getApprovals_(session, p.bu, p.status);
  var focusId = p.versionId;
  if (!focusId && list.length) focusId = list[0].version_id;

  var summary = null;
  if (focusId) {
    try {
      summary = getVersionSummary_(focusId);
    } catch (err) {
      summary = null;
    }
  }

  return { approvals: list, summary: summary };
}
