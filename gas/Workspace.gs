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
  // getMonthlyLines_ trả forecast_month thô từ sheet; client dựng khoá ô
  // theo trường này và so với mốc tháng dạng YYYY-MM-01, nên phải chuẩn hoá
  // ở đây — giữ đúng hình dạng dữ liệu client đang nhận.
  var lines = version
    ? getMonthlyLines_(version.id).map(function (l) {
        l.forecast_month = normalizeMonth_(l.forecast_month);
        return l;
      })
    : [];

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
    regions: activeOnly_(readObjects_(SHEETS.REGIONS)),
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
  var products = getProducts_(bu, null, null);

  return {
    businessUnitCode: bu,
    cycles: cycles,
    cycle: cycle,
    productCount: products.length,
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

  return {
    businessUnitCode: bu,
    month: month,
    regions: activeOnly_(readObjects_(SHEETS.REGIONS)),
    products: getProducts_(bu, null, null),
    actuals: getActuals_(bu, month, null),
    comparison: getFcVsActual_(bu, month)
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