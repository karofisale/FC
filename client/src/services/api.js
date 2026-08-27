/**
 * Lớp API của FC App.
 *
 * Chỉ có MỘT nguồn dữ liệu: backend Apps Script. Bản cũ có thêm hai tầng
 * dự phòng (Express localhost và mock trong localStorage) khiến mọi thao
 * tác lưu đều báo thành công kể cả khi không ghi được gì — toàn bộ phần
 * đó đã bỏ. Lưu lỗi thì giao diện phải báo lỗi.
 */
import { callGAS } from './gasClient';
import { getToken } from './auth';

function auth(payload = {}) {
  return { ...payload, token: getToken() };
}

// Danh mục dùng chung ít khi đổi trong một phiên làm việc
let bootstrapCache = null;

export function clearBootstrapCache() {
  bootstrapCache = null;
}

async function bootstrap() {
  if (!bootstrapCache) {
    bootstrapCache = await callGAS('getBootstrap', auth());
  }
  return bootstrapCache;
}

export const api = {
  // ----- danh mục -----
  getBootstrap: () => bootstrap(),
  getBUs: async () => (await bootstrap()).businessUnits || [],
  getRegions: async () => (await bootstrap()).regions || [],
  getGroups: async () => (await bootstrap()).productGroups || [],
  getProducts: (params = {}) => callGAS('getProducts', auth(params)),
  addProduct: (product) => callGAS('addProduct', auth({ product })),

  // ----- chu kỳ & version -----
  getCycles: (params = {}) => callGAS('getCycles', auth(params)),
  createCycle: (data) => callGAS('createCycle', auth(data)),
  getCycleVersions: (cycleId) => callGAS('getVersions', auth({ cycleId })),
  createVersion: (cycleId, data) => callGAS('createVersion', auth({ cycleId, ...data })),

  // ----- bảng 0: kế hoạch tháng -----
  getMonthlyLines: (versionId) => callGAS('getMonthlyLines', auth({ versionId })),
  saveMonthlyLines: (versionId, lines) => callGAS('saveMonthlyLines', auth({ versionId, lines })),

  // ----- bảng 1: kế hoạch tuần / miền -----
  getWeeklySplits: (versionId) => callGAS('getWeeklySplits', auth({ versionId })),
  saveWeeklySplits: (versionId, splits) => callGAS('saveWeeklySplits', auth({ versionId, splits })),
  validateWeeklySplits: (versionId) => callGAS('validateWeekly', auth({ versionId })),

  // ----- báo cáo -----
  getB0Summary: (baseMonth, bu) => callGAS('getB0Summary', auth({ baseMonth, bu })),
  getB1Summary: (baseMonth, bu) => callGAS('getB1Summary', auth({ baseMonth, bu })),
  getVariance: (cycleId) => callGAS('getVariance', auth({ cycleId })),
  getVersionSummary: (versionId) => callGAS('getVersionSummary', auth({ versionId })),
  getB0SumExport: (baseMonth) => callGAS('getB0SumExport', auth({ baseMonth })),
  getSapGt2Weekly: (baseMonth) => callGAS('getSapGt2Weekly', auth({ baseMonth })),

  // ----- phê duyệt -----
  getApprovals: (params = {}) => callGAS('getApprovals', auth(params)),
  submitCycle: (cycleId, versionId) => callGAS('submitCycle', auth({ cycleId, versionId })),
  decideApproval: (approvalId, decision, comment) =>
    callGAS('decideApproval', auth({ approvalId, decision, comment })),

  // ----- sản lượng thực hiện (actuals) -----
  getActuals: (params = {}) => callGAS('getActuals', auth(params)),
  getFcVsActual: (bu, month) => callGAS('getFcVsActual', auth({ bu, month })),
  saveActuals: (rows) => callGAS('saveActuals', auth({ rows })),

  // ----- tài khoản -----
  changeMyPin: (currentPin, newPin) => callGAS('changeMyPin', auth({ currentPin, newPin })),
  setUserPin: (userId, newPin) => callGAS('setUserPin', auth({ userId, newPin }))
};
