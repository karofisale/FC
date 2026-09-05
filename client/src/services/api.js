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

/**
 * Danh mục dùng chung ít khi đổi trong một phiên làm việc.
 *
 * Cache giữ chính PROMISE chứ không phải kết quả đã resolve. Bản cũ gán
 * `bootstrapCache = await callGAS(...)` — tức chỉ có giá trị SAU khi request
 * xong — nên khi các trang gọi Promise.all([getGroups(), getBUs(), getRegions()])
 * lúc cache còn rỗng thì cả ba cùng thấy null và cùng bắn một request
 * getBootstrap giống hệt nhau. Ba lượt gọi Apps Script, mỗi lượt 1-5 giây,
 * cho đúng một tập dữ liệu.
 */
let bootstrapPromise = null;

// Danh mục sản phẩm ~750 SKU. Mỗi lần chuyển tab là trang bị unmount và mất
// sạch state, nên không cache ở đây thì cứ quay lại tab là tải lại toàn bộ.
// Khoá theo toàn bộ tham số để không trả nhầm kết quả đã lọc theo kênh/nhóm.
const productsCache = new Map();

export function clearBootstrapCache() {
  bootstrapPromise = null;
  productsCache.clear();
}

function bootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = callGAS('getBootstrap', auth()).catch((err) => {
      bootstrapPromise = null; // lỗi thì cho phép thử lại, không cache lỗi
      throw err;
    });
  }
  return bootstrapPromise;
}

function getProductsCached(params) {
  const key = JSON.stringify([params.bu || '', params.group || '', params.search || '']);
  if (!productsCache.has(key)) {
    productsCache.set(key, callGAS('getProducts', auth(params)).catch((err) => {
      productsCache.delete(key);
      throw err;
    }));
  }
  return productsCache.get(key);
}

export const api = {
  // ----- danh mục -----
  getBootstrap: () => bootstrap(),
  getBUs: async () => (await bootstrap()).businessUnits || [],
  getRegions: async () => (await bootstrap()).regions || [],
  getGroups: async () => (await bootstrap()).productGroups || [],
  getProducts: (params = {}) => getProductsCached(params),
  // Thêm SKU mới làm danh mục đổi -> bỏ cache để lần đọc sau lấy bản mới
  addProduct: (product) =>
    callGAS('addProduct', auth({ product })).then((res) => { productsCache.clear(); return res; }),
  addProducts: (products) =>
    callGAS('addProducts', auth({ products })).then((res) => { productsCache.clear(); return res; }),
  // Sửa một SKU đã có. Gửi trường nào thì server ghi trường đó — trường vắng
  // mặt nghĩa là "không đụng tới", nên đừng gửi kèm null cho các ô để trống.
  updateProduct: (product) =>
    callGAS('updateProduct', auth({ product })).then((res) => { productsCache.clear(); return res; }),
  // Dán hàng loạt CÓ ghi đè mã đã tồn tại. Khác addProducts (bỏ qua mã đã có)
  // nên là hai lối riêng: giao diện phải bắt người dùng chọn có ý thức.
  upsertProducts: (products) =>
    callGAS('upsertProducts', auth({ products })).then((res) => { productsCache.clear(); return res; }),
  readExternalSheet: (spreadsheetId, sheetName) => callGAS('readExternalSheet', auth({ spreadsheetId, sheetName })),

  // Nhập kế hoạch thẳng từ app OEM / app Xuất khẩu. dryRun = chỉ tính và trả
  // về con số, không ghi gì — dùng cho bước xem trước.
  importSopFromSource: (businessUnitCode, baseMonth, dryRun) =>
    callGAS('importSopFromSource', auth({ businessUnitCode, baseMonth, dryRun: !!dryRun })),

  // ----- action gộp cho từng màn hình -----
  // Apps Script chạy TUẦN TỰ các request của cùng một chủ script, nên
  // Promise.all ở client không hề song song — các lượt gọi xếp hàng và cộng
  // dồn. Hai action này trả về toàn bộ dữ liệu một màn cần trong đúng một
  // lần chạy, đọc mỗi sheet một lần thay vì mỗi request đọc lại từ đầu.
  getMonthlyWorkspace: (params = {}) => callGAS('getMonthlyWorkspace', auth(params)),
  getWeeklyWorkspace: (params = {}) => callGAS('getWeeklyWorkspace', auth(params)),
  getDashboardWorkspace: (params = {}) => callGAS('getDashboardWorkspace', auth(params)),
  getActualsWorkspace: (params = {}) => callGAS('getActualsWorkspace', auth(params)),
  getApprovalsWorkspace: (params = {}) => callGAS('getApprovalsWorkspace', auth(params)),

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
  // Rieng cho file upload SAP: lay so cua BAN DA DUYET, khong theo is_final
  getSapExport: (baseMonth) => callGAS('getSapExport', auth({ baseMonth })),
  getSapGt2Weekly: (baseMonth) => callGAS('getSapGt2Weekly', auth({ baseMonth })),

  // ----- phê duyệt -----
  getApprovals: (params = {}) => callGAS('getApprovals', auth(params)),
  submitCycle: (cycleId, versionId) => callGAS('submitCycle', auth({ cycleId, versionId })),
  // Mở lại chu kỳ đã duyệt để sửa số. Backend bắt buộc vai trò thẩm định và
  // có lý do, rồi ghi vào AuthLog.
  reopenCycle: (cycleId, reason) => callGAS('reopenCycle', auth({ cycleId, reason })),
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
