/**
 * Điểm vào HTTP: doGet / doPost và bảng điều phối action
 * Một phần của backend FC App — clasp push gộp mọi file .gs vào cùng
 * một phạm vi toàn cục, nên các file gọi chéo hàm của nhau bình thường.
 */

// ---------------------------------------------------------------------
// ENTRY POINTS
// ---------------------------------------------------------------------

/**
 * doGet chỉ phục vụ health check. Mọi thao tác dữ liệu đi qua doPost để
 * token không bị ghi vào URL / lịch sử trình duyệt.
 */
function doGet() {
  return jsonOutput_({
    status: 'online',
    service: 'Karofi Sales Forecast API v3.0',
    auth: 'PIN required — POST { action: "login", userId, pin }'
  });
}

function doPost(e) {
  // Cache dữ liệu sheet chỉ sống trong PHẠM VI MỘT REQUEST — reset ngay
  // đầu để không phục vụ nhầm dữ liệu cũ từ request trước nếu container
  // Apps Script còn "ấm" và giữ nguyên biến toàn cục giữa các lần gọi.
  resetTableCache_();
  diagReset_();

  var payload;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOutput_({ error: 'Body không phải JSON hợp lệ.' });
  }

  var action = payload.action || '';
  // Client gửi debug:true (xem gasClient.js) để nhận kèm _diag — thời
  // gian từng bước thực thi thật ở server, dùng để tìm chỗ chậm mà
  // không cần đăng nhập được vào GCP project để xem Stackdriver logs.
  var debug = payload.debug === true;

  try {
    var result;

    // 1. Các action không cần token
    if (action === 'ping') {
      result = { ok: true };
    } else if (action === 'login') {
      // login_ vẫn cần đọc sheet Users -> prefetch chung 1 lần cho gọn,
      // rẻ hơn hẳn so với để nó tự mở round-trip riêng.
      prefetchForAction_('login');
      result = login_(payload.userId, payload.pin);
    } else if (action === 'logout') {
      result = logout_(payload.token);
    } else {
      // 2. Mọi action còn lại bắt buộc có token hợp lệ
      var session = requireSession_(payload.token);
      diagMark_('xác thực token xong');

      if (READ_ACTIONS.indexOf(action) < 0 && WRITE_ACTIONS.indexOf(action) < 0) {
        return jsonOutput_({ error: 'Action không hợp lệ: ' + action });
      }

      // 3. Action ghi thì chạy trong LockService để hai người lưu cùng lúc
      //    không ghi đè nhau.
      //
      //    QUAN TRỌNG: phải đọc dữ liệu bên TRONG lock. Bản cũ gọi
      //    prefetchAllSheets_() ở ngoài, trước khi lấy lock — mà upsertRows_
      //    ghi đè LẠI CẢ BẢNG dựa trên bản chụp đó. Hai người cùng mở trang,
      //    A lưu xong rồi B lưu, thì B ghi đè bằng bản chụp chưa có thay đổi
      //    của A -> toàn bộ số A vừa nhập biến mất, không báo lỗi. Lock khi
      //    đó chỉ khiến hai request chạy nối tiếp chứ không bảo vệ dữ liệu.
      if (WRITE_ACTIONS.indexOf(action) >= 0) {
        result = runExclusive_(function () {
          resetTableCache_();
          prefetchForAction_(action);
          return dispatch_(action, payload, session);
        });
      } else {
        // Gom các sheet action này cần trong 1 lần gọi Sheets API, thay vì
        // để mỗi hàm nghiệp vụ tự mở round-trip riêng khi đọc tới.
        prefetchForAction_(action);
        result = dispatch_(action, payload, session);
      }
    }

    diagMark_('dispatch xong');
    if (debug && result && typeof result === 'object') {
      result._diag = diagResult_();
    }
    return jsonOutput_(result);

  } catch (err) {
    var errorBody = { error: (err && err.message) ? err.message : String(err) };
    if (debug) errorBody._diag = diagResult_();
    return jsonOutput_(errorBody);
  }
}

function dispatch_(action, p, session) {
  switch (action) {
    // ----- đọc -----
    case 'getBootstrap':    return getBootstrap_(session);
    case 'getProducts':     return getProducts_(p.bu, p.group, p.search);
    case 'getCycles':       return getCycles_(session, p.bu, p.status);
    // Các action dưới đây nhận versionId/cycleId/bu THẲNG TỪ CLIENT. Trước
    // đây chúng không nhận session nên không kiểm tra gì: một người dùng có
    // token hợp lệ chỉ cần đổi tham số là đọc được số liệu của kênh khác.
    // Chặn ngay tại đây để giữ Queries.gs thuần truy vấn, và để toàn bộ quy
    // tắc phân quyền đọc nằm gọn một chỗ dễ rà.
    //
    // getProducts KHÔNG bị ép phạm vi: danh mục SKU dùng chung toàn hệ thống,
    // và màn nhập từ file cần đọc toàn bộ danh mục để biết mã nào chưa có —
    // ép theo kênh sẽ khiến SKU của kênh khác bị báo nhầm là "chưa tồn tại".
    case 'getVersions':     assertCanReadCycle_(session, p.cycleId);
                            return getVersions_(p.cycleId);
    case 'getMonthlyLines': assertCanReadVersion_(session, p.versionId);
                            return getMonthlyLines_(p.versionId);
    case 'getWeeklySplits': assertCanReadVersion_(session, p.versionId);
                            return getWeeklySplits_(p.versionId);
    case 'validateWeekly':  assertCanReadVersion_(session, p.versionId);
                            return validateWeekly_(p.versionId);
    case 'getB0Summary':    return getB0Summary_(p.baseMonth, scopedBU_(session, p.bu));
    case 'getB1Summary':    return getB1Summary_(p.baseMonth, scopedBU_(session, p.bu));
    case 'getVariance':     assertCanReadCycle_(session, p.cycleId);
                            return getVariance_(p.cycleId);
    case 'getApprovals':    return getApprovals_(session, p.bu, p.status);
    case 'getVersionSummary': assertCanReadVersion_(session, p.versionId);
                            return getVersionSummary_(p.versionId);
    case 'getActuals':      return getActuals_(scopedBU_(session, p.bu), p.month, p.sku);
    case 'getFcVsActual':   return getFcVsActual_(scopedBU_(session, p.bu), p.month);

    // ----- đọc gộp theo màn hình (1 request thay cho 5-7) -----
    case 'getMonthlyWorkspace':   return getMonthlyWorkspace_(session, p);
    case 'getWeeklyWorkspace':    return getWeeklyWorkspace_(session, p);
    case 'getDashboardWorkspace': return getDashboardWorkspace_(session, p);
    case 'getActualsWorkspace':   return getActualsWorkspace_(session, p);
    case 'getApprovalsWorkspace': return getApprovalsWorkspace_(session, p);
    case 'getB0SumExport':  return getB0SumExport_(session, p.baseMonth);
    case 'getSapGt2Weekly': return getSapGt2Weekly_(session, p.baseMonth);
    case 'readExternalSheet': return readExternalSheet_(session, p.spreadsheetId, p.sheetName);

    // ----- ghi -----
    case 'createCycle':      return createCycle_(session, p);
    case 'createVersion':    return createVersion_(session, p);
    case 'saveMonthlyLines': return saveMonthlyLines_(session, p.versionId, p.lines);
    case 'saveWeeklySplits': return saveWeeklySplits_(session, p.versionId, p.splits);
    case 'submitCycle':      return submitCycle_(session, p.cycleId, p.versionId);
    case 'reopenCycle':      return reopenCycle_(session, p.cycleId, p.reason);
    case 'decideApproval':   return decideApproval_(session, p.approvalId, p.decision, p.comment);
    case 'changeMyPin':      return changeMyPin_(session, p.currentPin, p.newPin);
    case 'setUserPin':       return setUserPin_(session, p.userId, p.newPin);
    case 'importProducts':   return importProducts_(session, p.products, p.replace);
    case 'addProduct':       return addProduct_(session, p.product);
    case 'addProducts':      return addProducts_(session, p.products);
    case 'saveActuals':      return saveActuals_(session, p.rows);
  }
  throw new Error('Action chưa được cài đặt: ' + action);
}

