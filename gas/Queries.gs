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


/**
 * Tổng hợp một version cụ thể theo nhóm hàng/tháng — dùng cho màn Phê
 * duyệt để người thẩm định thấy số trước khi quyết định, thay vì chỉ
 * thấy tên đơn vị và tuần cập nhật như bản cũ. Không lọc theo is_final
 * vì version đang chờ duyệt có thể không còn là bản mới nhất nếu người
 * gửi đã tạo thêm bản cập nhật tuần sau đó.
 */
function getVersionSummary_(versionId) {
  if (!versionId) throw new Error('Thiếu versionId.');
  var version = findOne_(SHEETS.VERSIONS, 'id', versionId);
  if (!version) throw new Error('Không tìm thấy version: ' + versionId);
  var cycle = findOne_(SHEETS.CYCLES, 'id', version.cycle_id);
  if (!cycle) throw new Error('Version không gắn với chu kỳ nào.');

  var products = productMap_();
  var lines = readObjects_(SHEETS.MONTHLY_LINES);

  function aggregate(vId) {
    var groups = {};
    var months = {};
    var total = 0;
    lines.forEach(function (l) {
      if (String(l.version_id) !== String(vId)) return;
      var p = products[l.sku_code] || {};
      var groupCode = p.product_group_code || 'KHAC';
      var groupName = p.product_group_name || 'Chưa phân nhóm';
      var month = normalizeMonth_(l.forecast_month);
      var qty = Number(l.quantity) || 0;

      if (!groups[groupCode]) {
        groups[groupCode] = { product_group_code: groupCode, product_group_name: groupName, months: {}, total: 0 };
      }
      groups[groupCode].months[month] = (groups[groupCode].months[month] || 0) + qty;
      groups[groupCode].total += qty;
      months[month] = true;
      total += qty;
    });
    return {
      byGroup: Object.keys(groups).sort().map(function (k) { return groups[k]; }),
      months: Object.keys(months).sort(),
      total: total
    };
  }

  var current = aggregate(versionId);

  var siblings = readObjects_(SHEETS.VERSIONS)
    .filter(function (v) { return String(v.cycle_id) === String(cycle.id); })
    .sort(function (a, b) { return Number(a.update_week) - Number(b.update_week); });
  var idx = -1;
  for (var i = 0; i < siblings.length; i++) {
    if (String(siblings[i].id) === String(versionId)) { idx = i; break; }
  }
  var previousVersion = idx > 0 ? siblings[idx - 1] : null;
  var previousTotal = previousVersion ? aggregate(previousVersion.id).total : null;

  return {
    versionId: versionId,
    cycleId: cycle.id,
    businessUnitCode: cycle.business_unit_code,
    baseMonth: normalizeMonth_(cycle.base_month),
    byGroup: current.byGroup,
    months: current.months,
    currentTotal: current.total,
    previousVersionId: previousVersion ? previousVersion.id : null,
    previousVersionLabel: previousVersion ? (previousVersion.iso_week_label || ('W' + previousVersion.update_week)) : null,
    previousTotal: previousTotal
  };
}

// ---------------------------------------------------------------------
// SẢN LƯỢNG THỰC HIỆN (ACTUALS) & SO SÁNH VỚI FORECAST
// ---------------------------------------------------------------------

function getActuals_(bu, month, sku) {
  var products = productMap_();
  var list = readObjects_(SHEETS.ACTUALS).map(function (a) {
    var p = products[a.sku_code] || {};
    a.quantity = Number(a.quantity) || 0;
    a.actual_month = normalizeMonth_(a.actual_month);
    a.product_name = p.name || a.sku_code;
    a.product_group_code = p.product_group_code || '';
    return a;
  });

  if (bu) list = list.filter(function (a) { return String(a.business_unit_code) === String(bu); });
  if (month) {
    var m = normalizeMonth_(month);
    list = list.filter(function (a) { return a.actual_month === m; });
  }
  if (sku) list = list.filter(function (a) { return String(a.sku_code) === String(sku); });

  return list.sort(function (a, b) {
    return String(b.actual_month).localeCompare(String(a.actual_month)) || String(a.sku_code).localeCompare(String(b.sku_code));
  });
}

/**
 * So sánh FC (từ version mới nhất của chu kỳ gần nhất của đơn vị, đúng
 * tháng yêu cầu) với sản lượng thực hiện đã nhập — trả về % lệch theo
 * từng SKU và tổng, để đo độ chính xác của kế hoạch đã lập.
 */
function getFcVsActual_(bu, month) {
  if (!bu || !month) throw new Error('Cần truyền cả bu và month.');
  var normMonth = normalizeMonth_(month);
  var products = productMap_();

  var cycle = readObjects_(SHEETS.CYCLES)
    .filter(function (c) { return String(c.business_unit_code) === String(bu); })
    .sort(function (a, b) { return String(b.base_month).localeCompare(String(a.base_month)); })[0];

  var fcBySku = {};
  if (cycle) {
    var finalVersion = readObjects_(SHEETS.VERSIONS).filter(function (v) {
      return String(v.cycle_id) === String(cycle.id) && (String(v.is_final) === '1' || v.is_final === true);
    })[0];
    if (finalVersion) {
      readObjects_(SHEETS.MONTHLY_LINES).forEach(function (l) {
        if (String(l.version_id) !== String(finalVersion.id)) return;
        if (normalizeMonth_(l.forecast_month) !== normMonth) return;
        fcBySku[l.sku_code] = (fcBySku[l.sku_code] || 0) + (Number(l.quantity) || 0);
      });
    }
  }

  var actualBySku = {};
  readObjects_(SHEETS.ACTUALS).forEach(function (a) {
    if (String(a.business_unit_code) !== String(bu)) return;
    if (normalizeMonth_(a.actual_month) !== normMonth) return;
    actualBySku[a.sku_code] = (actualBySku[a.sku_code] || 0) + (Number(a.quantity) || 0);
  });

  var skus = {};
  Object.keys(fcBySku).forEach(function (s) { skus[s] = 1; });
  Object.keys(actualBySku).forEach(function (s) { skus[s] = 1; });

  var rows = Object.keys(skus).map(function (sku) {
    var p = products[sku] || {};
    var fc = fcBySku[sku] || 0;
    var actual = actualBySku[sku] || 0;
    return {
      sku_code: sku,
      product_name: p.name || sku,
      product_group_code: p.product_group_code || '',
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
    month: normMonth,
    cycleFound: !!cycle,
    totalForecast: totalFc,
    totalActual: totalActual,
    totalVariance: totalActual - totalFc,
    totalVariancePct: totalFc > 0 ? Math.round(((totalActual - totalFc) / totalFc) * 1000) / 10 : null,
    rows: rows
  };
}

// ---------------------------------------------------------------------
// XUẤT BÁO CÁO (B0.SUM / SAP ZPP702)
// ---------------------------------------------------------------------

/**
 * Sản lượng theo SKU × đơn vị kinh doanh × tháng, cho 4 tháng bắt đầu từ
 * baseMonth — nguồn cho xuất Excel B0.SUM (một dòng/SKU, cột theo BU×
 * tháng) và cho phần XK/OEM của xuất SAP ZPP702 (dùng lại đúng dữ liệu
 * này, lọc theo BU ở phía client, đỡ phải gọi thêm request).
 */
function getB0SumExport_(session, baseMonth) {
  assertRole_(session, ['central_admin', 'viewer']);
  var month0 = normalizeMonth_(baseMonth);
  if (!month0) throw new Error('Thiếu tháng cần xuất.');

  var parts = month0.split('-').map(Number);
  var months = [];
  for (var i = 0; i < 4; i++) {
    var d = new Date(Date.UTC(parts[0], parts[1] - 1 + i, 1));
    months.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-01');
  }

  var products = productMap_();
  var cycles = readObjects_(SHEETS.CYCLES).filter(function (c) {
    return normalizeMonth_(c.base_month) === month0;
  });

  var versions = readObjects_(SHEETS.VERSIONS);
  var buByVersionId = {};
  cycles.forEach(function (c) {
    var v = versions.filter(function (vv) {
      return String(vv.cycle_id) === String(c.id) && (String(vv.is_final) === '1' || vv.is_final === true);
    })[0];
    if (v) buByVersionId[v.id] = c.business_unit_code;
  });

  var rowsMap = {};
  readObjects_(SHEETS.MONTHLY_LINES).forEach(function (l) {
    var bu = buByVersionId[l.version_id];
    if (!bu) return;
    var m = normalizeMonth_(l.forecast_month);
    if (months.indexOf(m) < 0) return;

    var sku = l.sku_code;
    if (!rowsMap[sku]) {
      var p = products[sku] || {};
      rowsMap[sku] = {
        sku_code: sku,
        name: p.name || sku,
        short_name: p.short_name || '',
        product_group_code: p.product_group_code || '',
        product_group_name: p.product_group_name || '',
        technology: p.technology || '',
        default_channel: p.default_channel || '',
        avg_price: Number(p.avg_price) || 0,
        monthly: {}
      };
    }
    if (!rowsMap[sku].monthly[m]) rowsMap[sku].monthly[m] = {};
    rowsMap[sku].monthly[m][bu] = (rowsMap[sku].monthly[m][bu] || 0) + (Number(l.quantity) || 0);
  });

  var businessUnits = {};
  cycles.forEach(function (c) { businessUnits[c.business_unit_code] = true; });

  return {
    baseMonth: month0,
    months: months,
    businessUnits: Object.keys(businessUnits).sort(),
    rows: Object.keys(rowsMap).map(function (k) { return rowsMap[k]; })
  };
}

/**
 * Tổng sản lượng theo tuần (SUM cả 2 miền) của GT2 cho đúng tháng đầu
 * chu kỳ — dùng cho cột tuần (J-N) khi xuất SAP ZPP702 kênh GT2.
 */
function getSapGt2Weekly_(session, baseMonth) {
  assertRole_(session, ['central_admin', 'viewer']);
  var month0 = normalizeMonth_(baseMonth);
  if (!month0) throw new Error('Thiếu tháng cần xuất.');

  var cycle = readObjects_(SHEETS.CYCLES).filter(function (c) {
    return String(c.business_unit_code) === 'GT2' && normalizeMonth_(c.base_month) === month0;
  })[0];
  if (!cycle) return { baseMonth: month0, rows: [] };

  var version = readObjects_(SHEETS.VERSIONS).filter(function (v) {
    return String(v.cycle_id) === String(cycle.id) && (String(v.is_final) === '1' || v.is_final === true);
  })[0];
  if (!version) return { baseMonth: month0, rows: [] };

  var weekTotals = {};
  readObjects_(SHEETS.WEEKLY_SPLITS).forEach(function (w) {
    if (String(w.version_id) !== String(version.id)) return;
    var wk = Number(w.week_number);
    if (!weekTotals[w.sku_code]) weekTotals[w.sku_code] = {};
    weekTotals[w.sku_code][wk] = (weekTotals[w.sku_code][wk] || 0) + (Number(w.quantity) || 0);
  });

  return {
    baseMonth: month0,
    rows: Object.keys(weekTotals).map(function (sku) { return { sku_code: sku, weeks: weekTotals[sku] }; })
  };
}
