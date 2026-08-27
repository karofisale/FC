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
  var payload;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOutput_({ error: 'Body không phải JSON hợp lệ.' });
  }

  var action = payload.action || '';

  try {
    // 1. Các action không cần token
    if (action === 'ping') return jsonOutput_({ ok: true });
    if (action === 'login') return jsonOutput_(login_(payload.userId, payload.pin));
    if (action === 'logout') return jsonOutput_(logout_(payload.token));

    // 2. Mọi action còn lại bắt buộc có token hợp lệ
    var session = requireSession_(payload.token);

    if (READ_ACTIONS.indexOf(action) < 0 && WRITE_ACTIONS.indexOf(action) < 0) {
      return jsonOutput_({ error: 'Action không hợp lệ: ' + action });
    }

    // 3. Action ghi thì chạy trong LockService để hai người lưu cùng lúc
    //    không ghi đè nhau
    if (WRITE_ACTIONS.indexOf(action) >= 0) {
      return jsonOutput_(runExclusive_(function () {
        return dispatch_(action, payload, session);
      }));
    }

    return jsonOutput_(dispatch_(action, payload, session));

  } catch (err) {
    return jsonOutput_({ error: (err && err.message) ? err.message : String(err) });
  }
}

function dispatch_(action, p, session) {
  switch (action) {
    // ----- đọc -----
    case 'getBootstrap':    return getBootstrap_(session);
    case 'getProducts':     return getProducts_(p.bu, p.group, p.search);
    case 'getCycles':       return getCycles_(session, p.bu, p.status);
    case 'getVersions':     return getVersions_(p.cycleId);
    case 'getMonthlyLines': return getMonthlyLines_(p.versionId);
    case 'getWeeklySplits': return getWeeklySplits_(p.versionId);
    case 'validateWeekly':  return validateWeekly_(p.versionId);
    case 'getB0Summary':    return getB0Summary_(p.baseMonth, p.bu);
    case 'getB1Summary':    return getB1Summary_(p.baseMonth, p.bu);
    case 'getVariance':     return getVariance_(p.cycleId);
    case 'getApprovals':    return getApprovals_(session, p.bu, p.status);
    case 'getVersionSummary': return getVersionSummary_(p.versionId);
    case 'getActuals':      return getActuals_(p.bu, p.month, p.sku);
    case 'getFcVsActual':   return getFcVsActual_(p.bu, p.month);

    // ----- đọc gộp theo màn hình (1 request thay cho 5-7) -----
    case 'getMonthlyWorkspace':   return getMonthlyWorkspace_(session, p);
    case 'getWeeklyWorkspace':    return getWeeklyWorkspace_(session, p);
    case 'getDashboardWorkspace': return getDashboardWorkspace_(session, p);
    case 'getActualsWorkspace':   return getActualsWorkspace_(session, p);
    case 'getApprovalsWorkspace': return getApprovalsWorkspace_(session, p);

    // ----- ghi -----
    case 'createCycle':      return createCycle_(session, p);
    case 'createVersion':    return createVersion_(session, p);
    case 'saveMonthlyLines': return saveMonthlyLines_(session, p.versionId, p.lines);
    case 'saveWeeklySplits': return saveWeeklySplits_(session, p.versionId, p.splits);
    case 'submitCycle':      return submitCycle_(session, p.cycleId, p.versionId);
    case 'decideApproval':   return decideApproval_(session, p.approvalId, p.decision, p.comment);
    case 'changeMyPin':      return changeMyPin_(session, p.currentPin, p.newPin);
    case 'setUserPin':       return setUserPin_(session, p.userId, p.newPin);
    case 'importProducts':   return importProducts_(session, p.products, p.replace);
    case 'saveActuals':      return saveActuals_(session, p.rows);
  }
  throw new Error('Action chưa được cài đặt: ' + action);
}

