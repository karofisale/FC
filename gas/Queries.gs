/**
 * Truy vấn đọc: danh mục, chu kỳ, kế hoạch, báo cáo
 * Một phần của backend FC App — clasp push gộp mọi file .gs vào cùng
 * một phạm vi toàn cục, nên các file gọi chéo hàm của nhau bình thường.
 */

// ---------------------------------------------------------------------
// ĐỌC DỮ LIỆU
// ---------------------------------------------------------------------

function getBootstrap_(session) {
  return {
    user: {
      id: session.userId,
      full_name: session.fullName,
      role: session.role,
      business_unit_code: session.bu
    },
    businessUnits: activeOnly_(readObjects_(SHEETS.BUSINESS_UNITS)),
    regions: activeOnly_(readObjects_(SHEETS.REGIONS)),
    productGroups: readObjects_(SHEETS.PRODUCT_GROUPS)
  };
}

function getProducts_(bu, group, search) {
  var list = activeOnly_(readObjects_(SHEETS.PRODUCTS));

  if (bu) {
    list = list.filter(function (p) {
      return !p.default_channel || String(p.default_channel) === String(bu);
    });
  }
  if (group) {
    list = list.filter(function (p) { return String(p.product_group_code) === String(group); });
  }
  if (search) {
    var s = String(search).toLowerCase();
    list = list.filter(function (p) {
      return String(p.sku_code).toLowerCase().indexOf(s) >= 0
        || String(p.name).toLowerCase().indexOf(s) >= 0
        || String(p.short_name || '').toLowerCase().indexOf(s) >= 0;
    });
  }
  return list;
}

function getCycles_(session, bu, status) {
  var list = readObjects_(SHEETS.CYCLES);

  // Viewer và admin xem được tất cả; người của đơn vị chỉ xem đơn vị mình
  if (session.role !== 'central_admin' && session.role !== 'viewer' && session.bu) {
    list = list.filter(function (c) { return String(c.business_unit_code) === String(session.bu); });
  }
  if (bu) list = list.filter(function (c) { return String(c.business_unit_code) === String(bu); });
  if (status) list = list.filter(function (c) { return String(c.status) === String(status); });

  return list.sort(function (a, b) {
    return String(b.base_month).localeCompare(String(a.base_month));
  });
}

function getVersions_(cycleId) {
  if (!cycleId) throw new Error('Thiếu cycleId.');
  return readObjects_(SHEETS.VERSIONS)
    .filter(function (v) { return String(v.cycle_id) === String(cycleId); })
    .sort(function (a, b) { return Number(a.update_week) - Number(b.update_week); });
}

function getMonthlyLines_(versionId) {
  if (!versionId) throw new Error('Thiếu versionId.');
  var products = productMap_();
  return readObjects_(SHEETS.MONTHLY_LINES)
    .filter(function (l) { return String(l.version_id) === String(versionId); })
    .map(function (l) {
      var p = products[l.sku_code] || {};
      l.quantity = Number(l.quantity) || 0;
      l.product_name = p.name || l.sku_code;
      l.short_name = p.short_name || '';
      l.product_group_code = p.product_group_code || '';
      l.product_group_name = p.product_group_name || '';
      l.avg_price = Number(p.avg_price) || 0;
      return l;
    });
}

function getWeeklySplits_(versionId) {
  if (!versionId) throw new Error('Thiếu versionId.');
  var products = productMap_();
  return readObjects_(SHEETS.WEEKLY_SPLITS)
    .filter(function (w) { return String(w.version_id) === String(versionId); })
    .map(function (w) {
      var p = products[w.sku_code] || {};
      w.quantity = Number(w.quantity) || 0;
      w.week_number = Number(w.week_number) || 0;
      w.product_name = p.name || w.sku_code;
      w.product_group_code = p.product_group_code || '';
      return w;
    });
}

/** SUM(tuần × miền) phải bằng FC tháng đầu chu kỳ. */
function validateWeekly_(versionId) {
  if (!versionId) throw new Error('Thiếu versionId.');

  var version = findOne_(SHEETS.VERSIONS, 'id', versionId);
  if (!version) throw new Error('Không tìm thấy version: ' + versionId);
  var cycle = findOne_(SHEETS.CYCLES, 'id', version.cycle_id);
  if (!cycle) throw new Error('Không tìm thấy chu kỳ của version này.');

  var baseMonth = normalizeMonth_(cycle.base_month);
  var products = productMap_();

  var monthQty = {};
  readObjects_(SHEETS.MONTHLY_LINES).forEach(function (l) {
    if (String(l.version_id) !== String(versionId)) return;
    if (normalizeMonth_(l.forecast_month) !== baseMonth) return;
    monthQty[l.sku_code] = (monthQty[l.sku_code] || 0) + (Number(l.quantity) || 0);
  });

  var weekQty = {};
  readObjects_(SHEETS.WEEKLY_SPLITS).forEach(function (w) {
    if (String(w.version_id) !== String(versionId)) return;
    weekQty[w.sku_code] = (weekQty[w.sku_code] || 0) + (Number(w.quantity) || 0);
  });

  // Xét cả SKU chỉ có ở một bên để không bỏ sót dòng mồ côi
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
      product_name: (products[sku] || {}).name || sku,
      month_qty: m,
      week_sum: w,
      variance: w - m
    });
  });

  mismatches.sort(function (a, b) { return Math.abs(b.variance) - Math.abs(a.variance); });

  return {
    isValid: mismatches.length === 0,
    mismatchesCount: mismatches.length,
    baseMonth: baseMonth,
    mismatches: mismatches.slice(0, 200)
  };
}

function getB0Summary_(baseMonth, bu) {
  var month = normalizeMonth_(baseMonth);
  var products = productMap_();
  var cycles = {};
  readObjects_(SHEETS.CYCLES).forEach(function (c) { cycles[c.id] = c; });

  var finalVersions = {};
  readObjects_(SHEETS.VERSIONS).forEach(function (v) {
    if (String(v.is_final) !== '1' && v.is_final !== true) return;
    var c = cycles[v.cycle_id];
    if (!c) return;
    if (month && normalizeMonth_(c.base_month) !== month) return;
    if (bu && String(c.business_unit_code) !== String(bu)) return;
    finalVersions[v.id] = c;
  });

  var map = {};
  readObjects_(SHEETS.MONTHLY_LINES).forEach(function (l) {
    var cycle = finalVersions[l.version_id];
    if (!cycle) return;
    var p = products[l.sku_code] || {};
    var key = cycle.business_unit_code + '|' + (p.product_group_code || 'KHAC') + '|' + normalizeMonth_(l.forecast_month);
    if (!map[key]) {
      map[key] = {
        business_unit_code: cycle.business_unit_code,
        business_unit_name: cycle.business_unit_code,
        product_group_code: p.product_group_code || 'KHAC',
        product_group_name: p.product_group_name || 'Chưa phân nhóm',
        forecast_month: normalizeMonth_(l.forecast_month),
        total_quantity: 0,
        total_revenue: 0
      };
    }
    var qty = Number(l.quantity) || 0;
    map[key].total_quantity += qty;
    map[key].total_revenue += qty * (Number(p.avg_price) || 0);
  });

  return Object.keys(map).map(function (k) { return map[k]; });
}

function getB1Summary_(baseMonth, bu) {
  var month = normalizeMonth_(baseMonth);
  var products = productMap_();
  var cycles = {};
  readObjects_(SHEETS.CYCLES).forEach(function (c) { cycles[c.id] = c; });

  var finalVersions = {};
  readObjects_(SHEETS.VERSIONS).forEach(function (v) {
    if (String(v.is_final) !== '1' && v.is_final !== true) return;
    var c = cycles[v.cycle_id];
    if (!c) return;
    if (month && normalizeMonth_(c.base_month) !== month) return;
    if (bu && String(c.business_unit_code) !== String(bu)) return;
    finalVersions[v.id] = c;
  });

  var map = {};
  readObjects_(SHEETS.WEEKLY_SPLITS).forEach(function (w) {
    var cycle = finalVersions[w.version_id];
    if (!cycle) return;
    var p = products[w.sku_code] || {};
    var key = cycle.business_unit_code + '|' + (p.product_group_code || 'KHAC') + '|' + w.week_number + '|' + w.region_code;
    if (!map[key]) {
      map[key] = {
        business_unit_code: cycle.business_unit_code,
        product_group_code: p.product_group_code || 'KHAC',
        product_group_name: p.product_group_name || 'Chưa phân nhóm',
        week_number: Number(w.week_number) || 0,
        region_code: w.region_code,
        total_quantity: 0
      };
    }
    map[key].total_quantity += Number(w.quantity) || 0;
  });

  return Object.keys(map).map(function (k) { return map[k]; });
}

/** Chênh lệch giữa version cuối và version liền trước của cùng chu kỳ. */
function getVariance_(cycleId) {
  if (!cycleId) throw new Error('Thiếu cycleId.');
  var versions = getVersions_(cycleId);
  if (versions.length < 2) {
    return { message: 'Cần ít nhất 2 bản cập nhật để so sánh.', variance: [] };
  }

  var curr = versions[versions.length - 1];
  var prev = versions[versions.length - 2];
  var products = productMap_();
  var lines = readObjects_(SHEETS.MONTHLY_LINES);

  var prevMap = {};
  lines.forEach(function (l) {
    if (String(l.version_id) !== String(prev.id)) return;
    prevMap[l.sku_code + '|' + normalizeMonth_(l.forecast_month)] = Number(l.quantity) || 0;
  });

  var variance = [];
  lines.forEach(function (l) {
    if (String(l.version_id) !== String(curr.id)) return;
    var month = normalizeMonth_(l.forecast_month);
    var key = l.sku_code + '|' + month;
    var currentQty = Number(l.quantity) || 0;
    var previousQty = prevMap[key] || 0;
    if (currentQty === 0 && previousQty === 0) return;
    var p = products[l.sku_code] || {};
    variance.push({
      sku_code: l.sku_code,
      product_name: p.name || l.sku_code,
      product_group_code: p.product_group_code || '',
      forecast_month: month,
      current_qty: currentQty,
      previous_qty: previousQty,
      variance_qty: currentQty - previousQty
    });
  });

  return { currentVersion: curr, previousVersion: prev, variance: variance };
}

function getApprovals_(session, bu, status) {
  var cycles = {};
  readObjects_(SHEETS.CYCLES).forEach(function (c) { cycles[c.id] = c; });
  var versions = {};
  readObjects_(SHEETS.VERSIONS).forEach(function (v) { versions[v.id] = v; });
  var users = {};
  readObjects_(SHEETS.USERS).forEach(function (u) { users[u.id] = u; });

  var list = readObjects_(SHEETS.APPROVALS).map(function (a) {
    var c = cycles[a.cycle_id] || {};
    var v = versions[a.version_id] || {};
    a.business_unit_code = c.business_unit_code || '';
    a.base_month = normalizeMonth_(c.base_month);
    a.cycle_status = c.status || '';
    a.update_week = v.update_week;
    a.iso_week_label = v.iso_week_label || '';
    a.approver_name = (users[a.approver_id] || {}).full_name || '';
    a.requested_by_name = (users[a.requested_by] || {}).full_name || '';
    return a;
  });

  if (session.role !== 'central_admin' && session.role !== 'viewer' && session.bu) {
    list = list.filter(function (a) { return String(a.business_unit_code) === String(session.bu); });
  }
  if (bu) list = list.filter(function (a) { return String(a.business_unit_code) === String(bu); });
  if (status) list = list.filter(function (a) { return String(a.status) === String(status); });

  return list.sort(function (a, b) {
    return String(b.requested_at).localeCompare(String(a.requested_at));
  });
}

