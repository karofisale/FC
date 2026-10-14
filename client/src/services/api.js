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
import { demYeuCauChoDuyet } from '../utils/annualPending';
import { taoCacheCoHan } from '../utils/cacheCoHan';

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
//
// Đợt 4: cache có HẠN (10 phút, utils/cacheCoHan.js). Trước đây giữ tới khi tải lại trang — người khác thêm / sửa SKU thì máy này không thấy
// cả ngày. Hết hạn thì lượt đọc kế tiếp tải mới; mọi lần GHI danh mục ở máy này vẫn xoá cache ngay (addProduct / addProducts / updateProduct /
// upsertProducts), đăng nhập / đăng xuất / hết phiên cũng xoá (clearBootstrapCache).
export const HAN_CACHE_DANH_MUC_MS = 10 * 60 * 1000;
const cacheDanhMuc = taoCacheCoHan(HAN_CACHE_DANH_MUC_MS);   // khoá 'bootstrap' và 'products:<tham số>'

// Danh mục sản phẩm ~750 SKU. Mỗi lần chuyển tab là trang bị unmount và mất
// sạch state, nên không cache ở đây thì cứ quay lại tab là tải lại toàn bộ.
// Khoá theo toàn bộ tham số để không trả nhầm kết quả đã lọc theo kênh/nhóm.
export function clearBootstrapCache() {
  cacheDanhMuc.xoa();
}

function bootstrap() {
  return cacheDanhMuc.lay('bootstrap', () => callGAS('getBootstrap', auth()));
}

function getProductsCached(params) {
  const key = 'products:' + JSON.stringify([params.bu || '', params.group || '', params.search || '']);
  return cacheDanhMuc.lay(key, () => callGAS('getProducts', auth(params)));
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
    callGAS('addProduct', auth({ product })).then((res) => { clearBootstrapCache(); return res; }),
  addProducts: (products) =>
    callGAS('addProducts', auth({ products })).then((res) => { clearBootstrapCache(); return res; }),
  // Sửa một SKU đã có. Gửi trường nào thì server ghi trường đó — trường vắng
  // mặt nghĩa là "không đụng tới", nên đừng gửi kèm null cho các ô để trống.
  updateProduct: (product) =>
    callGAS('updateProduct', auth({ product })).then((res) => { clearBootstrapCache(); return res; }),
  // Dán hàng loạt CÓ ghi đè mã đã tồn tại. Khác addProducts (bỏ qua mã đã có)
  // nên là hai lối riêng: giao diện phải bắt người dùng chọn có ý thức.
  upsertProducts: (products) =>
    callGAS('upsertProducts', auth({ products })).then((res) => { clearBootstrapCache(); return res; }),
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
  // replaceAll: chỉ đường nhập từ file dùng — xoá sạch bản cũ của kỳ rồi ghi lại
  saveMonthlyLines: (versionId, lines, replaceAll) =>
    callGAS('saveMonthlyLines', auth({ versionId, lines, replaceAll })),

  // ----- bảng 1: kế hoạch tuần / miền -----
  getWeeklySplits: (versionId) => callGAS('getWeeklySplits', auth({ versionId })),
  saveWeeklySplits: (versionId, splits, replaceAll) =>
    callGAS('saveWeeklySplits', auth({ versionId, splits, replaceAll })),
  validateWeeklySplits: (versionId) => callGAS('validateWeekly', auth({ versionId })),

  // ----- báo cáo -----
  getB0Summary: (baseMonth, bu) => callGAS('getB0Summary', auth({ baseMonth, bu })),
  getB1Summary: (baseMonth, bu) => callGAS('getB1Summary', auth({ baseMonth, bu })),
  getVariance: (cycleId) => callGAS('getVariance', auth({ cycleId })),
  getVersionSummary: (versionId) => callGAS('getVersionSummary', auth({ versionId })),
  getFcReportExport: (baseMonth) => callGAS('getFcReportExport', auth({ baseMonth })),
  // Rieng cho file upload SAP: lay so cua BAN DA DUYET, khong theo is_final
  getSapExport: (baseMonth) => callGAS('getSapExport', auth({ baseMonth })),
  getSapGt2Weekly: (baseMonth) => callGAS('getSapGt2Weekly', auth({ baseMonth })),

  // ----- phê duyệt -----
  getApprovals: (params = {}) => callGAS('getApprovals', auth(params)),
  // Đợt 4: chỉ ĐẾM yêu cầu đang chờ (chấm số menu lúc mở app), không tải cả danh sách. Server cũ chưa có action này thì rơi về getApprovals.
  countPendingApprovals: () => demYeuCauChoDuyet((action, payload) => callGAS(action, auth(payload))),
  submitCycle: (cycleId, versionId) => callGAS('submitCycle', auth({ cycleId, versionId })),
  // Mở lại chu kỳ đã duyệt để sửa số. Backend bắt buộc vai trò thẩm định và
  // có lý do, rồi ghi vào AuthLog.
  reopenCycle: (cycleId, reason) => callGAS('reopenCycle', auth({ cycleId, reason })),
  // Xoá hẳn một chu kỳ (kèm bản cập nhật, số tháng/tuần, yêu cầu duyệt). Chỉ central_admin; server chỉ cho xoá chu kỳ NHÁP hoặc năm cũ.
  deleteCycle: (cycleId) => callGAS('deleteCycle', auth({ cycleId })),
  decideApproval: (approvalId, decision, comment) =>
    callGAS('decideApproval', auth({ approvalId, decision, comment })),

  // ----- sản lượng thực hiện (actuals) -----
  getActuals: (params = {}) => callGAS('getActuals', auth(params)),
  // KHONG cache: panel "Cao tu SAP" hoi vong dong nay de biet luot chay xong
  // chua — voi mot ban cache thi moc thoi gian dung yen dung cai no can theo doi.
  getNhipTim: () => callGAS('getNhipTim', auth()),
  getFcVsActual: (bu, month) => callGAS('getFcVsActual', auth({ bu, month })),
  saveActuals: (rows) => callGAS('saveActuals', auth({ rows })),

  // ----- kế hoạch năm (05/10/2026) -----
  getAnnualPlanWorkspace: (params) => callGAS('getAnnualPlanWorkspace', auth(params)),
  listAnnualPlans: (params) => callGAS('listAnnualPlans', auth(params)),
  // Đợt 4: MỌI kế hoạch năm đang chờ duyệt mà người này duyệt được, một lượt (server cũ chưa có -> utils/annualPending.js tự dự phòng)
  listPendingAnnualPlans: () => callGAS('listPendingAnnualPlans', auth()),
  createAnnualPlan: (params) => callGAS('createAnnualPlan', auth(params)),
  saveAnnualPlan: (params) => callGAS('saveAnnualPlan', auth(params)),
  discardAnnualPlan: (params) => callGAS('discardAnnualPlan', auth(params)),
  searchAnnualSku: (params) => callGAS('searchAnnualSku', auth(params)),
  submitAnnualPlan: (params) => callGAS('submitAnnualPlan', auth(params)),
  decideAnnualPlan: (params) => callGAS('decideAnnualPlan', auth(params)),
  saveAnnualPlanFinal: (params) => callGAS('saveAnnualPlanFinal', auth(params)),
  // Số lượng SKU của MỘT tháng theo kế hoạch năm đã duyệt (Final -> điều chỉnh -> gốc) — nút "Lấy từ kế hoạch năm" ở Forecast tháng
  getAnnualPlanForMonth: (params) => callGAS('getAnnualPlanForMonth', auth(params)),
  // Ghi đè KPI năm của OEM bằng bản kế hoạch đã duyệt (chỉ central_admin)
  applyAnnualPlanToKpi: (params) => callGAS('applyAnnualPlanToKpi', auth(params)),

  // ----- cài đặt cá nhân (14/10/2026) — bản sao theo tài khoản của services/prefs.js; xem services/prefsSync.js -----
  // Lượt gọi NỀN: quiet = không hiện "đang thử lại..."; không có token thì không gọi (tránh bật hộp "hết phiên" vì một việc nền).
  // getMyPrefs là đọc; setMyPrefs là upsert theo khoá (gửi lại cùng payload ra cùng kết quả) nên KHÔNG nằm trong NON_IDEMPOTENT_ACTIONS.
  getMyPrefs: () => {
    if (!getToken()) return Promise.reject(new Error('Chưa đăng nhập.'));
    return callGAS('getMyPrefs', auth({}), { quiet: true });
  },
  setMyPrefs: (changes) => {
    if (!getToken()) return Promise.reject(new Error('Chưa đăng nhập.'));
    return callGAS('setMyPrefs', auth({ changes }), { quiet: true });
  },

  // ----- cài đặt hệ thống (14/10/2026) — giá trị dùng chung do master chỉnh; xem services/systemValues.js + services/systemSettings.js -----
  // getSystemValues: MỌI vai trò, là đọc, lượt gọi NỀN (quiet; không có token thì không gọi). Lỗi thì nơi gọi im lặng dùng mặc định.
  getSystemValues: () => {
    if (!getToken()) return Promise.reject(new Error('Chưa đăng nhập.'));
    return callGAS('getSystemValues', auth({}), { quiet: true });
  },
  // getSystemSettings: CHỈ master (người khác nhận lỗi 'Chỉ master mới xem được cài đặt hệ thống.'). Người dùng chủ động mở màn nên không quiet.
  getSystemSettings: () => callGAS('getSystemSettings', auth({})),
  // setSystemSetting: { khoa, giaTri (số | null = về mặc định), hieuLucTu?, ghiChu? }. Ghi theo khoá + ngày nên gửi lại an toàn:
  // KHÔNG nằm trong NON_IDEMPOTENT_ACTIONS (cố ý), được tự thử lại khi mạng chập chờn.
  setSystemSetting: (payload) => callGAS('setSystemSetting', auth(payload)),

  // ----- tài khoản -----
  changeMyPin: (currentPin, newPin) => callGAS('changeMyPin', auth({ currentPin, newPin })),
  setUserPin: (userId, newPin) => callGAS('setUserPin', auth({ userId, newPin }))
};
