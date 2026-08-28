/**
 * Nghiệp vụ ghi: chu kỳ, version, kế hoạch, phê duyệt
 * Một phần của backend FC App — clasp push gộp mọi file .gs vào cùng
 * một phạm vi toàn cục, nên các file gọi chéo hàm của nhau bình thường.
 */

// ---------------------------------------------------------------------
// GHI DỮ LIỆU
// ---------------------------------------------------------------------

function createCycle_(session, p) {
  assertRole_(session, ['bu_editor', 'central_admin']);
  var bu = p.businessUnitCode || session.bu;
  if (!bu) throw new Error('Thiếu đơn vị kinh doanh.');
  assertBU_(session, bu);

  var baseMonth = normalizeMonth_(p.baseMonth);
  if (!baseMonth) throw new Error('Thiếu tháng bắt đầu chu kỳ (baseMonth).');
  var horizon = Number(p.horizonMonths) || 4;

  var existing = readObjects_(SHEETS.CYCLES).filter(function (c) {
    return String(c.business_unit_code) === String(bu) && normalizeMonth_(c.base_month) === baseMonth;
  })[0];
  if (existing) throw new Error('Chu kỳ ' + bu + ' tháng ' + baseMonth + ' đã tồn tại.');

  var cycleId = 'c-' + String(bu).toLowerCase() + '-' + baseMonth.replace(/-/g, '').slice(0, 6);
  var now = new Date().toISOString();

  appendObjects_(SHEETS.CYCLES, [{
    id: cycleId,
    business_unit_code: bu,
    base_month: baseMonth,
    horizon_months: horizon,
    status: 'draft',
    created_by: session.userId,
    created_at: now
  }]);

  var versionId = newVersionId_(bu, 0);
  appendObjects_(SHEETS.VERSIONS, [{
    id: versionId,
    cycle_id: cycleId,
    update_week: 0,
    update_date: baseMonth,
    iso_week_label: 'W0',
    submitted_by: '',
    submitted_at: '',
    is_final: 1,
    created_at: now
  }]);

  return {
    cycle: findOne_(SHEETS.CYCLES, 'id', cycleId),
    initialVersionId: versionId
  };
}

function createVersion_(session, p) {
  var cycle = findOne_(SHEETS.CYCLES, 'id', p.cycleId);
  if (!cycle) throw new Error('Không tìm thấy chu kỳ: ' + p.cycleId);
  assertCanEdit_(session, cycle);

  var updateWeek = Number(p.updateWeek);
  if (!isFinite(updateWeek) || updateWeek < 0) {
    throw new Error('updateWeek phải là số nguyên không âm.');
  }

  var versions = getVersions_(cycle.id);
  if (versions.some(function (v) { return Number(v.update_week) === updateWeek; })) {
    throw new Error('Bản cập nhật tuần ' + updateWeek + ' của chu kỳ này đã tồn tại.');
  }

  var previous = versions[versions.length - 1];
  var versionId = newVersionId_(cycle.business_unit_code, updateWeek);
  var now = new Date().toISOString();

  // Bản mới là bản cuối cùng, các bản trước bỏ cờ is_final
  var vTable = readTable_(SHEETS.VERSIONS);
  var finalIdx = vTable.idx.is_final;
  var changed = false;
  vTable.rows.forEach(function (row) {
    if (String(row[vTable.idx.cycle_id]) === String(cycle.id) && String(row[finalIdx]) !== '0') {
      row[finalIdx] = 0;
      changed = true;
    }
  });
  if (changed) writeTable_(SHEETS.VERSIONS, vTable);

  appendObjects_(SHEETS.VERSIONS, [{
    id: versionId,
    cycle_id: cycle.id,
    update_week: updateWeek,
    update_date: p.updateDate || isoDate_(new Date()),
    iso_week_label: p.isoWeekLabel || ('W' + updateWeek),
    submitted_by: '',
    submitted_at: '',
    is_final: 1,
    created_at: now
  }]);

  // Kế thừa số của bản trước để tuần sau chỉ cần điều chỉnh
  var copied = 0;
  if (previous && p.copyFromPrevious !== false) {
    var monthly = readObjects_(SHEETS.MONTHLY_LINES)
      .filter(function (l) { return String(l.version_id) === String(previous.id); })
      .map(function (l) {
        return {
          id: Utilities.getUuid(),
          version_id: versionId,
          sku_code: l.sku_code,
          forecast_month: normalizeMonth_(l.forecast_month),
          quantity: Number(l.quantity) || 0,
          note: l.note || '',
          updated_at: now,
          updated_by: session.userId
        };
      });

    var weekly = readObjects_(SHEETS.WEEKLY_SPLITS)
      .filter(function (w) { return String(w.version_id) === String(previous.id); })
      .map(function (w) {
        return {
          id: Utilities.getUuid(),
          version_id: versionId,
          sku_code: w.sku_code,
          week_number: Number(w.week_number) || 0,
          region_code: w.region_code,
          quantity: Number(w.quantity) || 0,
          updated_at: now,
          updated_by: session.userId
        };
      });

    if (monthly.length) appendObjects_(SHEETS.MONTHLY_LINES, monthly);
    if (weekly.length) appendObjects_(SHEETS.WEEKLY_SPLITS, weekly);
    copied = monthly.length + weekly.length;
  }

  // Mở lại chu kỳ đã bị từ chối khi có bản cập nhật mới
  if (cycle.status === 'rejected' || cycle.status === 'submitted') {
    updateCycleStatus_(cycle.id, 'draft');
  }

  return {
    version: findOne_(SHEETS.VERSIONS, 'id', versionId),
    copiedRows: copied
  };
}

function saveMonthlyLines_(session, versionId, lines) {
  if (!versionId || !Array.isArray(lines)) throw new Error('Thiếu versionId hoặc danh sách dòng.');
  var ctx = versionContext_(versionId);
  assertCanEdit_(session, ctx.cycle);

  var now = new Date().toISOString();
  var toUpsert = [];
  var toDelete = [];
  lines.forEach(function (l) {
    var qty = Number(l.quantity);
    if (!isFinite(qty) || qty < 0) {
      throw new Error('Số lượng không hợp lệ tại SKU ' + l.skuCode + ': ' + l.quantity);
    }
    if (!l.skuCode || !l.forecastMonth) throw new Error('Dòng thiếu skuCode hoặc forecastMonth.');
    var skuCode = String(l.skuCode);
    var forecastMonth = normalizeMonth_(l.forecastMonth);
    // Số lượng 0 nghĩa là không dùng đến SKU/tháng đó — xoá hẳn dòng thay
    // vì lưu số 0, tránh bảng phình to vô hạn theo SKU x tháng x version.
    if (qty === 0) {
      toDelete.push({ version_id: versionId, sku_code: skuCode, forecast_month: forecastMonth });
    } else {
      toUpsert.push({
        id: Utilities.getUuid(),
        version_id: versionId,
        sku_code: skuCode,
        forecast_month: forecastMonth,
        quantity: qty,
        note: l.note || '',
        updated_at: now,
        updated_by: session.userId
      });
    }
  });

  var del = deleteRowsByKeys_(SHEETS.MONTHLY_LINES, ['version_id', 'sku_code', 'forecast_month'], toDelete);
  var written = upsertRows_(SHEETS.MONTHLY_LINES, ['version_id', 'sku_code', 'forecast_month'], toUpsert);
  return {
    message: 'Đã lưu ' + written.total + ' dòng kế hoạch tháng.',
    updated: written.updated,
    inserted: written.inserted,
    deleted: del.deleted
  };
}

function saveWeeklySplits_(session, versionId, splits) {
  if (!versionId || !Array.isArray(splits)) throw new Error('Thiếu versionId hoặc danh sách dòng.');
  var ctx = versionContext_(versionId);
  assertCanEdit_(session, ctx.cycle);

  var now = new Date().toISOString();
  var toUpsert = [];
  var toDelete = [];
  splits.forEach(function (s) {
    var qty = Number(s.quantity);
    if (!isFinite(qty) || qty < 0) {
      throw new Error('Số lượng không hợp lệ tại SKU ' + s.skuCode + ': ' + s.quantity);
    }
    var week = Number(s.weekNumber);
    if (!(week >= 1 && week <= 6)) throw new Error('Số tuần phải trong khoảng 1–6, nhận được: ' + s.weekNumber);
    if (!s.skuCode || !s.regionCode) throw new Error('Dòng thiếu skuCode hoặc regionCode.');
    var skuCode = String(s.skuCode);
    var regionCode = String(s.regionCode);
    // Số lượng 0 nghĩa là không dùng đến SKU/tuần/miền đó — xoá hẳn dòng
    // thay vì lưu số 0, tránh bảng phình to vô hạn theo SKU x tuần x miền x version.
    if (qty === 0) {
      toDelete.push({ version_id: versionId, sku_code: skuCode, week_number: week, region_code: regionCode });
    } else {
      toUpsert.push({
        id: Utilities.getUuid(),
        version_id: versionId,
        sku_code: skuCode,
        week_number: week,
        region_code: regionCode,
        quantity: qty,
        updated_at: now,
        updated_by: session.userId
      });
    }
  });

  var del = deleteRowsByKeys_(SHEETS.WEEKLY_SPLITS, ['version_id', 'sku_code', 'week_number', 'region_code'], toDelete);
  var written = upsertRows_(SHEETS.WEEKLY_SPLITS, ['version_id', 'sku_code', 'week_number', 'region_code'], toUpsert);
  return {
    message: 'Đã lưu ' + written.total + ' dòng kế hoạch tuần/miền.',
    updated: written.updated,
    inserted: written.inserted,
    deleted: del.deleted
  };
}

function submitCycle_(session, cycleId, versionId) {
  var cycle = findOne_(SHEETS.CYCLES, 'id', cycleId);
  if (!cycle) throw new Error('Không tìm thấy chu kỳ: ' + cycleId);
  assertCanEdit_(session, cycle);

  var version = findOne_(SHEETS.VERSIONS, 'id', versionId);
  if (!version || String(version.cycle_id) !== String(cycleId)) {
    throw new Error('Version không thuộc chu kỳ này.');
  }

  // Không cho gửi duyệt khi tổng tuần chưa khớp tháng đầu chu kỳ
  var check = validateWeekly_(versionId);
  var hasWeekly = readObjects_(SHEETS.WEEKLY_SPLITS).some(function (w) {
    return String(w.version_id) === String(versionId);
  });
  if (hasWeekly && !check.isValid) {
    throw new Error('Còn ' + check.mismatchesCount + ' SKU có tổng tuần/miền chưa khớp kế hoạch tháng 1. Sửa xong mới gửi duyệt được.');
  }

  var now = new Date().toISOString();

  var vTable = readTable_(SHEETS.VERSIONS);
  var vRow = findRowIndex_(vTable, 'id', versionId);
  writeRowPatch_(SHEETS.VERSIONS, vTable, vRow, { submitted_by: session.userId, submitted_at: now });

  updateCycleStatus_(cycleId, 'submitted');

  // Huỷ các yêu cầu đang chờ cũ để chỉ còn đúng một yêu cầu pending
  var aTable = readTable_(SHEETS.APPROVALS);
  var statusIdx = aTable.idx.status;
  var touched = false;
  aTable.rows.forEach(function (row) {
    if (String(row[aTable.idx.cycle_id]) === String(cycleId) && String(row[statusIdx]) === 'pending') {
      row[statusIdx] = 'superseded';
      row[aTable.idx.decided_at] = now;
      touched = true;
    }
  });
  if (touched) writeTable_(SHEETS.APPROVALS, aTable);

  var approvalId = Utilities.getUuid();
  appendObjects_(SHEETS.APPROVALS, [{
    id: approvalId,
    cycle_id: cycleId,
    version_id: versionId,
    approver_id: '',
    status: 'pending',
    comment: '',
    requested_by: session.userId,
    requested_at: now,
    decided_at: ''
  }]);

  return { message: 'Đã gửi kế hoạch lên cấp thẩm định.', approvalId: approvalId };
}

function decideApproval_(session, approvalId, decision, comment) {
  assertRole_(session, ['bu_approver', 'central_admin']);

  var allowed = ['approved', 'rejected', 'revision_requested'];
  if (allowed.indexOf(decision) < 0) {
    throw new Error('Quyết định không hợp lệ: ' + decision);
  }

  var table = readTable_(SHEETS.APPROVALS);
  var rowIndex = findRowIndex_(table, 'id', approvalId);
  if (rowIndex < 0) throw new Error('Không tìm thấy yêu cầu phê duyệt.');

  var approval = rowToObject_(table.headers, table.rows[rowIndex]);
  if (approval.status !== 'pending') {
    throw new Error('Yêu cầu này đã được xử lý (' + approval.status + ').');
  }

  var cycle = findOne_(SHEETS.CYCLES, 'id', approval.cycle_id);
  if (!cycle) throw new Error('Không tìm thấy chu kỳ của yêu cầu này.');
  assertBU_(session, cycle.business_unit_code);

  // Người gửi không được tự duyệt bản của mình
  if (String(approval.requested_by) === String(session.userId) && session.role !== 'central_admin') {
    throw new Error('Bạn không thể tự phê duyệt kế hoạch do chính mình gửi.');
  }

  var now = new Date().toISOString();
  writeRowPatch_(SHEETS.APPROVALS, table, rowIndex, {
    status: decision,
    comment: comment || '',
    approver_id: session.userId,
    decided_at: now
  });

  updateCycleStatus_(approval.cycle_id, decision === 'approved' ? 'approved' : 'rejected');

  return { message: 'Đã ghi nhận quyết định: ' + decision };
}

function importProducts_(session, products, replace) {
  assertRole_(session, ['central_admin']);
  if (!Array.isArray(products) || !products.length) throw new Error('Danh sách sản phẩm rỗng.');

  var sheet = getOrCreateSheet_(SHEETS.PRODUCTS);
  if (replace) {
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
  }

  var records = products.map(function (p) {
    return {
      sku_code: String(p.sku_code || '').trim(),
      name: p.name || '',
      short_name: p.short_name || '',
      product_group_code: p.product_group_code || '',
      product_group_name: p.product_group_name || '',
      technology: p.technology || '',
      default_channel: p.default_channel || '',
      avg_price: Number(p.avg_price) || 0,
      is_active: 1
    };
  }).filter(function (p) { return p.sku_code; });

  var written = upsertRows_(SHEETS.PRODUCTS, ['sku_code'], records);
  return { message: 'Đã nạp ' + written.total + ' SKU.', updated: written.updated, inserted: written.inserted };
}


/**
 * Nhập sản lượng thực hiện (actuals) — nguồn để đo độ chính xác FC qua
 * getFcVsActual_. Cho phép bu_editor để sale/vận hành tự nhập tay khi
 * chưa có luồng import tự động từ SAP; upsert theo (bu, sku, tháng, miền)
 * nên nhập lại cùng kỳ sẽ ghi đè thay vì cộng dồn.
 */
function saveActuals_(session, rows) {
  assertRole_(session, ['bu_editor', 'central_admin']);
  if (!Array.isArray(rows) || !rows.length) throw new Error('Danh sách sản lượng thực hiện rỗng.');

  var now = new Date().toISOString();
  var records = rows.map(function (r) {
    var bu = r.businessUnitCode || session.bu;
    if (!bu) throw new Error('Thiếu đơn vị kinh doanh.');
    assertBU_(session, bu);

    var qty = Number(r.quantity);
    if (!isFinite(qty) || qty < 0) {
      throw new Error('Số lượng không hợp lệ tại SKU ' + r.skuCode + ': ' + r.quantity);
    }
    if (!r.skuCode || !r.actualMonth || !r.regionCode) {
      throw new Error('Dòng thiếu skuCode, actualMonth hoặc regionCode.');
    }

    return {
      id: Utilities.getUuid(),
      business_unit_code: bu,
      sku_code: String(r.skuCode),
      actual_month: normalizeMonth_(r.actualMonth),
      region_code: String(r.regionCode),
      quantity: qty,
      source_system: r.sourceSystem || 'Manual',
      imported_by: session.userId,
      imported_at: now
    };
  });

  var written = upsertRows_(SHEETS.ACTUALS, ['business_unit_code', 'sku_code', 'actual_month', 'region_code'], records);
  return { message: 'Đã lưu ' + written.total + ' dòng sản lượng thực hiện.', updated: written.updated, inserted: written.inserted };
}

/**
 * Thêm một SKU mới vào danh mục Products — dùng khi sale đang nhập
 * forecast mà phát hiện thiếu mã hàng, thêm ngay tại chỗ thay vì phải
 * nhờ admin chạy importProducts_ (vốn chỉ dành cho central_admin và có
 * thể xoá sạch danh mục nếu bật replace). Hàm này an toàn hơn: chỉ CHÈN
 * MỘT dòng mới, không cho ghi đè SKU đã tồn tại — tránh việc một editor
 * vô tình (hoặc cố ý) sửa dữ liệu sản phẩm của người khác qua đường này.
 */
function addProduct_(session, p) {
  assertRole_(session, ['bu_editor', 'central_admin']);
  if (!p) throw new Error('Thiếu dữ liệu sản phẩm.');

  var skuCode = String(p.skuCode || '').trim();
  if (!skuCode) throw new Error('Thiếu mã SKU.');
  if (!p.name) throw new Error('Thiếu tên sản phẩm.');

  var existing = findOne_(SHEETS.PRODUCTS, 'sku_code', skuCode);
  if (existing) throw new Error('Mã SKU ' + skuCode + ' đã có trong danh mục — không ghi đè qua đường này.');

  var record = {
    sku_code: skuCode,
    name: p.name,
    short_name: p.shortName || '',
    product_group_code: p.productGroupCode || '',
    product_group_name: p.productGroupName || '',
    technology: p.technology || '',
    default_channel: p.defaultChannel || '',
    avg_price: Number(p.avgPrice) || 0,
    is_active: 1
  };

  appendObjects_(SHEETS.PRODUCTS, [record]);
  logAuth_(session.userId, 'product_added', skuCode + ' (' + record.name + ')');

  return { message: 'Đã thêm SKU ' + skuCode + ' vào danh mục.', product: record };
}

/**
 * Thêm NHIỀU SKU mới cùng lúc — dùng khi nhập forecast từ file ngoài
 * (Excel/Google Sheet) và phát hiện một loạt mã chưa có trong danh mục.
 * Bỏ qua (không lỗi) SKU đã tồn tại thay vì chặn cả batch, vì thường chỉ
 * một phần trong file là SKU thật sự mới.
 */
function addProducts_(session, products) {
  assertRole_(session, ['bu_editor', 'central_admin']);
  if (!Array.isArray(products) || !products.length) throw new Error('Danh sách sản phẩm rỗng.');

  var existingSkus = {};
  readObjects_(SHEETS.PRODUCTS).forEach(function (p) { existingSkus[p.sku_code] = true; });

  var toInsert = [];
  var skippedExisting = [];
  var seenInBatch = {};

  products.forEach(function (p) {
    var skuCode = String(p.skuCode || '').trim();
    if (!skuCode) return;
    if (existingSkus[skuCode] || seenInBatch[skuCode]) {
      skippedExisting.push(skuCode);
      return;
    }
    seenInBatch[skuCode] = true;
    toInsert.push({
      sku_code: skuCode,
      name: p.name || skuCode,
      short_name: p.shortName || '',
      product_group_code: p.productGroupCode || '',
      product_group_name: p.productGroupName || '',
      technology: p.technology || '',
      default_channel: p.defaultChannel || '',
      avg_price: Number(p.avgPrice) || 0,
      is_active: 1
    });
  });

  if (toInsert.length) {
    appendObjects_(SHEETS.PRODUCTS, toInsert);
    logAuth_(session.userId, 'products_bulk_added', toInsert.length + ' SKU');
  }

  return {
    message: 'Đã thêm ' + toInsert.length + ' SKU mới' + (skippedExisting.length ? ', bỏ qua ' + skippedExisting.length + ' SKU đã tồn tại.' : '.'),
    inserted: toInsert.length,
    products: toInsert,
    skippedExisting: skippedExisting
  };
}
