/**
 * =====================================================================
 * KAROFI SALES FORECAST APP - GOOGLE APPS SCRIPT BACKEND (PHASE 1 - GAS)
 * Nguồn dữ liệu DB: Google Sheets (Tự động khởi tạo các Sheet/Bảng)
 * =====================================================================
 */

// 1. Cấu hình Tên Sheet tương ứng với Bảng CSDL
const SHEETS = {
  PRODUCTS: 'Products',
  BUSINESS_UNITS: 'BusinessUnits',
  CYCLES: 'ForecastCycles',
  VERSIONS: 'ForecastVersions',
  MONTHLY_LINES: 'MonthlyForecastLines',
  WEEKLY_SPLITS: 'WeeklyRegionSplits',
  APPROVALS: 'Approvals'
};

/**
 * Main Web App Entry Point for HTTP GET requests
 */
function doGet(e) {
  const action = e.parameter.action || '';
  let responseData = {};

  try {
    switch (action) {
      case 'getProducts':
        responseData = getProducts(e.parameter);
        break;
      case 'getBUs':
        responseData = getBusinessUnits();
        break;
      case 'getCycles':
        responseData = getCycles(e.parameter);
        break;
      case 'getMonthlyLines':
        responseData = getMonthlyLines(e.parameter.versionId);
        break;
      case 'getWeeklySplits':
        responseData = getWeeklySplits(e.parameter.versionId);
        break;
      case 'getB0Summary':
        responseData = getB0Summary(e.parameter.baseMonth);
        break;
      case 'getApprovals':
        responseData = getApprovals();
        break;
      case 'initDatabase':
        responseData = initDatabaseSheets();
        break;
      default:
        responseData = { status: 'online', service: 'Karofi Sales Forecast GAS API v1.0' };
    }
  } catch (err) {
    responseData = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Main Web App Entry Point for HTTP POST requests
 */
function doPost(e) {
  let responseData = {};
  try {
    const postData = JSON.parse(e.postData.contents || '{}');
    const action = postData.action || '';

    switch (action) {
      case 'saveMonthlyLines':
        responseData = saveMonthlyLines(postData.versionId, postData.lines);
        break;
      case 'saveWeeklySplits':
        responseData = saveWeeklySplits(postData.versionId, postData.splits);
        break;
      case 'submitCycle':
        responseData = submitCycle(postData.cycleId, postData.versionId, postData.userId);
        break;
      case 'decideApproval':
        responseData = decideApproval(postData.approvalId, postData.decision, postData.comment);
        break;
      default:
        responseData = { error: 'Unknown action' };
    }
  } catch (err) {
    responseData = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------
// DATABASE CRUD FUNCTIONS
// ---------------------------------------------------------------------

function getProducts(params) {
  const sheet = getOrCreateSheet(SHEETS.PRODUCTS);
  const data = getSheetDataAsJson(sheet);
  let filtered = data;
  if (params && params.bu) {
    filtered = filtered.filter(p => p.default_channel === params.bu || !p.default_channel);
  }
  return filtered;
}

function getBusinessUnits() {
  const sheet = getOrCreateSheet(SHEETS.BUSINESS_UNITS);
  return getSheetDataAsJson(sheet);
}

function getCycles(params) {
  const sheet = getOrCreateSheet(SHEETS.CYCLES);
  const data = getSheetDataAsJson(sheet);
  if (params && params.bu) {
    return data.filter(c => c.business_unit_code === params.bu);
  }
  return data;
}

function getMonthlyLines(versionId) {
  const sheet = getOrCreateSheet(SHEETS.MONTHLY_LINES);
  const data = getSheetDataAsJson(sheet);
  if (!versionId) return data;
  return data.filter(l => String(l.version_id) === String(versionId));
}

function getWeeklySplits(versionId) {
  const sheet = getOrCreateSheet(SHEETS.WEEKLY_SPLITS);
  const data = getSheetDataAsJson(sheet);
  if (!versionId) return data;
  return data.filter(w => String(w.version_id) === String(versionId));
}

function getB0Summary(baseMonth) {
  const lines = getSheetDataAsJson(getOrCreateSheet(SHEETS.MONTHLY_LINES));
  const prods = getProducts({});
  const prodMap = {};
  prods.forEach(p => { prodMap[p.sku_code] = p; });

  const map = {};
  lines.forEach(l => {
    const p = prodMap[l.sku_code] || {};
    const bu = p.default_channel || 'GT2';
    const groupCode = p.product_group_code || 'NHOM_1';
    const groupName = p.product_group_name || 'Máy TCM sx';
    const key = `${bu}_${groupCode}_${l.forecast_month}`;

    if (!map[key]) {
      map[key] = {
        business_unit_code: bu,
        business_unit_name: bu,
        product_group_code: groupCode,
        product_group_name: groupName,
        forecast_month: l.forecast_month,
        total_quantity: 0,
        total_revenue: 0
      };
    }
    const qty = Number(l.quantity) || 0;
    map[key].total_quantity += qty;
    map[key].total_revenue += qty * (Number(p.avg_price) || 0);
  });

  return Object.values(map);
}

function getApprovals() {
  const sheet = getOrCreateSheet(SHEETS.APPROVALS);
  return getSheetDataAsJson(sheet);
}

function saveMonthlyLines(versionId, lines) {
  const sheet = getOrCreateSheet(SHEETS.MONTHLY_LINES);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    // Append all lines
    lines.forEach(l => {
      sheet.appendRow([Utilities.getUuid(), versionId, l.skuCode, l.forecastMonth, l.quantity, l.note || '', new Date().toISOString()]);
    });
  } else {
    // Upsert lines
    const headers = data[0];
    const vIdx = headers.indexOf('version_id');
    const sIdx = headers.indexOf('sku_code');
    const mIdx = headers.indexOf('forecast_month');
    const qIdx = headers.indexOf('quantity');

    lines.forEach(l => {
      let found = false;
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][vIdx]) === String(versionId) && String(data[r][sIdx]) === String(l.skuCode) && String(data[r][mIdx]) === String(l.forecastMonth)) {
          sheet.getRange(r + 1, qIdx + 1).setValue(l.quantity);
          found = true;
          break;
        }
      }
      if (!found) {
        sheet.appendRow([Utilities.getUuid(), versionId, l.skuCode, l.forecastMonth, l.quantity, l.note || '', new Date().toISOString()]);
      }
    });
  }
  return { message: 'Saved successfully to Google Sheets', count: lines.length };
}

function saveWeeklySplits(versionId, splits) {
  const sheet = getOrCreateSheet(SHEETS.WEEKLY_SPLITS);
  splits.forEach(s => {
    sheet.appendRow([Utilities.getUuid(), versionId, s.skuCode, s.weekNumber, s.regionCode, s.quantity, new Date().toISOString()]);
  });
  return { message: 'Saved weekly splits successfully to Google Sheets', count: splits.length };
}

function submitCycle(cycleId, versionId, userId) {
  const sheet = getOrCreateSheet(SHEETS.CYCLES);
  const data = sheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === String(cycleId)) {
      sheet.getRange(r + 1, 5).setValue('submitted');
      break;
    }
  }
  return { message: 'Submitted cycle for approval' };
}

function decideApproval(approvalId, decision, comment) {
  const sheet = getOrCreateSheet(SHEETS.APPROVALS);
  sheet.appendRow([approvalId || Utilities.getUuid(), decision, comment, new Date().toISOString()]);
  return { message: `Recorded decision: ${decision}` };
}

// ---------------------------------------------------------------------
// HELPER FUNCTIONS FOR GOOGLE SHEETS
// ---------------------------------------------------------------------

function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function getSheetDataAsJson(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const result = [];
  for (let r = 1; r < data.length; r++) {
    const rowObj = {};
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = data[r][c];
    }
    result.push(rowObj);
  }
  return result;
}

/**
 * Hàm khởi tạo các cột bảng chuẩn tự động trên Google Sheets
 */
function initDatabaseSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const schema = {
    [SHEETS.BUSINESS_UNITS]: ['code', 'name', 'is_active', 'created_at'],
    [SHEETS.PRODUCTS]: ['sku_code', 'name', 'short_name', 'product_group_code', 'product_group_name', 'technology', 'default_channel', 'avg_price'],
    [SHEETS.CYCLES]: ['id', 'business_unit_code', 'base_month', 'horizon_months', 'status', 'created_by', 'created_at'],
    [SHEETS.VERSIONS]: ['id', 'cycle_id', 'update_week', 'update_date', 'iso_week_label', 'submitted_by', 'is_final'],
    [SHEETS.MONTHLY_LINES]: ['id', 'version_id', 'sku_code', 'forecast_month', 'quantity', 'note', 'updated_at'],
    [SHEETS.WEEKLY_SPLITS]: ['id', 'version_id', 'sku_code', 'week_number', 'region_code', 'quantity', 'updated_at'],
    [SHEETS.APPROVALS]: ['id', 'cycle_id', 'version_id', 'status', 'comment', 'requested_at', 'decided_at']
  };

  Object.keys(schema).forEach(sName => {
    let sheet = ss.getSheetByName(sName);
    if (!sheet) sheet = ss.insertSheet(sName);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(schema[sName]);
      sheet.getRange(1, 1, 1, schema[sName].length).setFontWeight('bold').setBackground('#0284c7').setFontColor('#ffffff');
    }
  });

  return { message: 'Google Sheets DB schema initialized successfully!' };
}
