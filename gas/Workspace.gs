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
  // getMonthlyLines_ tự chuẩn hoá forecast_month rồi — xem ghi chú ở hàm đó.
  var lines = version ? getMonthlyLines_(version.id) : [];

  return {
    businessUnitCode: bu,
    cycles: cycles,
    cycle: cycle,
    versions: versions,
    version: version,
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

  // Tổng theo SKU của tháng đầu chu kỳ — client dùng làm cột "FC tháng 1"
  // để đối chiếu với tổng các tuần.
  var monthQty = {};
  if (version) {
    getMonthlyLines_(version.id).forEach(function (l) {
      if (normalizeMonth_(l.forecast_month) !== baseMonth) return;
      monthQty[l.sku_code] = (monthQty[l.sku_code] || 0) + (Number(l.quantity) || 0);
    });
  }

  return {
    businessUnitCode: bu,
    cycles: cycles,
    cycle: cycle,
    versions: versions,
    version: version,
    baseMonth: baseMonth,
    regions: regionsFor_('weekly'),
    products: products,
    monthlyQuantities: monthQty,
    splits: version ? getWeeklySplits_(version.id) : [],
    // Gọi thẳng validateWeekly_ thay vì tính lại. Bản cũ chép nguyên phép so
    // khớp (kể cả ngưỡng sai lệch 0.0001 và giới hạn 200 dòng) sang đây, nên
    // mỗi lần đổi quy tắc phải nhớ sửa cả hai chỗ — sửa sót một chỗ là cùng
    // một câu hỏi cho ra hai câu trả lời khác nhau.
    validation: version
      ? validateWeekly_(version.id)
      : { isValid: true, mismatchesCount: 0, baseMonth: baseMonth, mismatches: [] }
  };
}

/**
 * Màn Tổng quan — gộp getCycles + getProducts + getB0Summary.
 *
 * Chỉ ghép kết quả của các hàm trong Queries.gs, không chép lại phép tính
 * nào. Bản cũ tự dựng lại toàn bộ phần tổng hợp theo nhóm hàng để mỗi sheet
 * chỉ phải đọc một lần — nhưng __tableCache_ đã lo việc đó cho cả request
 * rồi, nên phần chép lại chỉ còn là hai chỗ phải sửa mỗi khi đổi nghiệp vụ.
 */
function getDashboardWorkspace_(session, p) {
  var bu = p.bu || session.bu;
  var cycles = cyclesForBU_(session, bu);
  var cycle = pickCycle_(cycles, p.cycleId);

  return {
    businessUnitCode: bu,
    cycles: cycles,
    cycle: cycle,
    productCount: countProducts_(bu),
    b0Summary: cycle ? getB0Summary_(cycle.base_month, bu) : []
  };
}

/**
 * Màn Sản lượng thực hiện — gộp getProducts + getRegions + getActuals +
 * getFcVsActual. Cũng chỉ ghép kết quả, không chép phép tính.
 */
function getActualsWorkspace_(session, p) {
  var bu = p.bu || session.bu;
  var month = normalizeMonth_(p.month);
  if (!month) throw new Error('Thiếu tháng cần xem.');
  assertCanReadBU_(session, bu);

  // Mã khách SAP của đơn vị này — màn hình dùng để lọc đúng phần của mình
  // khi đọc file ZSD450 chung. Chưa khai thì trả '' và màn hình nói rõ, chứ
  // không để người dùng nhập nhầm sản lượng của đơn vị khác.
  var donVi = readObjects_(SHEETS.BUSINESS_UNITS).filter(function (b) {
    return String(b.code || '').trim() === String(bu).trim();
  })[0] || {};

  var soLieu = getActuals_(bu, month, null);
  var sanh = getFcVsActual_(bu, month);

  // MỘT CỘT TỔNG, không tách miền. Sản lượng thực hiện không có căn cứ để chia
  // hai miền (ZSD450 không có cột miền), và phần đối chiếu cũng chỉ so tổng.
  //
  // Miền để GHI là miền scope 'actual' (TQ). Tháng cũ có thể đã trót nhập tay
  // theo MB/MN — những dòng đó vẫn được CỘNG vào tổng chứ không bị giấu đi,
  // và màn hình trả về danh sách miền đang giữ số để lúc lưu còn dọn chúng về 0.
  var mienGhi = regionsFor_('actual')[0];
  if (!mienGhi) {
    throw new Error('Chưa có miền dành cho sản lượng thực hiện (scope = actual). '
      + 'Chạy setupDatabase() để thêm miền TQ.');
  }

  var tongTheoSku = {};
  var mienCoSo = {};
  soLieu.forEach(function (a) {
    var sku = normalizeSku_(a.sku_code);
    tongTheoSku[sku] = (tongTheoSku[sku] || 0) + (Number(a.quantity) || 0);
    var m = String(a.region_code || '').trim();
    if (m && m !== mienGhi.code) mienCoSo[m] = true;
  });

  // MÃ NÀO ĐƯỢC HIỆN. Trước đây là toàn bộ danh mục của kênh — vài trăm dòng
  // mà phần lớn không bao giờ có số, nên thứ cần nhìn bị chôn trong đó.
  //
  // Giờ: mã CÓ sản lượng thực hiện, hoặc mã CÓ trong kế hoạch. Hai nguồn này
  // là đúng những gì người dùng cần đối chiếu.
  var duocHien = {};
  Object.keys(tongTheoSku).forEach(function (sku) { duocHien[sku] = true; });
  (sanh.rows || []).forEach(function (r) {
    if (Number(r.forecast_qty) !== 0) duocHien[normalizeSku_(r.sku_code)] = true;
  });

  // Tháng này chưa có kế hoạch thì lấy kế hoạch của BA THÁNG TỚI: đầu kỳ, khi
  // thực hiện đã có mà chu kỳ của chính tháng đó chưa lập, lưới sẽ chỉ còn vài
  // mã có số — nhìn như danh mục hỏng. Ba tháng tới là tập mã gần nhất mà đơn
  // vị đã tự khai là sẽ bán.
  var laySauNay = !Object.keys(duocHien).length
    || !(sanh.rows || []).some(function (r) { return Number(r.forecast_qty) !== 0; });
  var thangSau = [];
  if (laySauNay) {
    var pm = month.split('-').map(Number);
    for (var i = 1; i <= 3; i++) {
      var d = new Date(Date.UTC(pm[0], pm[1] - 1 + i, 1));
      thangSau.push(d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-01');
    }
    var duyet = approvedVersionByCycle_();
    readObjects_(SHEETS.CYCLES).forEach(function (c) {
      if (String(c.business_unit_code) !== String(bu)) return;
      var a = duyet[c.id];
      var banList = readObjectsWhere_(SHEETS.VERSIONS, 'cycle_id', c.id);
      var ban = (a && a.version_id)
        ? banList.filter(function (v) { return String(v.id) === String(a.version_id); })[0]
        : banList.filter(function (v) { return String(v.is_final) === '1' || v.is_final === true; })[0];
      if (!ban) return;
      readObjectsWhere_(SHEETS.MONTHLY_LINES, 'version_id', ban.id).forEach(function (l) {
        if (thangSau.indexOf(normalizeMonth_(l.forecast_month)) < 0) return;
        if (!Number(l.quantity)) return;
        duocHien[normalizeSku_(l.sku_code)] = true;
      });
    });
  }

  // Mã có số thực hiện nhưng KHÔNG thuộc danh mục của kênh vẫn phải hiện —
  // giấu đi là giấu một con số đang được tính vào phần đối chiếu.
  var cuaKenh = getProducts_(bu, null, null);
  var daCo = {};
  var sanPham = [];
  cuaKenh.forEach(function (pr) {
    var sku = normalizeSku_(pr.sku_code);
    if (!duocHien[sku]) return;
    daCo[sku] = true;
    sanPham.push(pr);
  });
  var danhMuc = productMap_();
  Object.keys(duocHien).forEach(function (sku) {
    if (daCo[sku]) return;
    var pr = danhMuc[sku];
    sanPham.push(pr || { sku_code: sku, name: '(không có trong danh mục)' });
  });
  sanPham.sort(function (a, b) { return String(a.sku_code).localeCompare(String(b.sku_code)); });

  return {
    businessUnitCode: bu,
    month: month,
    sapSoldTo: String(donVi.sap_sold_to || '').trim(),
    sapVkorg: String(donVi.sap_vkorg || '').trim(),
    sapVtweg: String(donVi.sap_vtweg || '').trim(),
    // Miền để ghi, và các miền cũ đang còn giữ số của tháng này. Màn hình cần
    // cả hai: ghi vào cái đầu, và đặt 0 cho các cái sau để tổng đúng bằng số
    // vừa gõ.
    regionCode: mienGhi.code,
    legacyRegions: Object.keys(mienCoSo).sort(),
    totals: tongTheoSku,
    products: sanPham,
    fallbackMonths: laySauNay ? thangSau : [],
    comparison: sanh
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