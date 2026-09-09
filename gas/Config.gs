/**
 * Cấu hình: ID Sheet, lược đồ bảng, tham số bảo mật
 * Một phần của backend FC App — clasp push gộp mọi file .gs vào cùng
 * một phạm vi toàn cục, nên các file gọi chéo hàm của nhau bình thường.
 */


const SPREADSHEET_ID = '1Iq9GTzTWI9A90DIKlAmK26GedaIymy-1bjy63rPuQZE';

const SHEETS = {
  USERS: 'Users',
  BUSINESS_UNITS: 'BusinessUnits',
  REGIONS: 'Regions',
  PRODUCT_GROUPS: 'ProductGroups',
  PRODUCTS: 'Products',
  CYCLES: 'ForecastCycles',
  VERSIONS: 'ForecastVersions',
  MONTHLY_LINES: 'MonthlyForecastLines',
  WEEKLY_SPLITS: 'WeeklyRegionSplits',
  APPROVALS: 'Approvals',
  ACTUALS: 'ActualSalesResults',
  AUDIT: 'AuthLog'
};

const SCHEMA = {
  [SHEETS.USERS]: ['id', 'full_name', 'email', 'role', 'business_unit_code', 'pin_hash', 'is_active', 'failed_attempts', 'locked_until', 'last_login'],
  // sap_channel: đơn vị này nằm trong file upload SAP nào (XK / OEM / GT2).
  // Trước đây suy bằng loại trừ — "không phải XK và OEM thì là GT2" — nên
  // thêm bất kỳ đơn vị mới nào là nó lặng lẽ rơi vào file GT2 / nhà máy 0200.
  // Khai thẳng ở dữ liệu thì thêm đơn vị không cần sửa code, và không đơn
  // vị nào vào nhầm file mà không ai biết.
  [SHEETS.BUSINESS_UNITS]: ['code', 'name', 'is_active', 'sap_channel'],
  [SHEETS.REGIONS]: ['code', 'name', 'is_active'],
  [SHEETS.PRODUCT_GROUPS]: ['code', 'name'],
  [SHEETS.PRODUCTS]: ['sku_code', 'name', 'short_name', 'product_group_code', 'product_group_name', 'technology', 'default_channel', 'avg_price', 'is_active', 'requirements_type'],
  [SHEETS.CYCLES]: ['id', 'business_unit_code', 'base_month', 'horizon_months', 'status', 'created_by', 'created_at'],
  [SHEETS.VERSIONS]: ['id', 'cycle_id', 'update_week', 'update_date', 'iso_week_label', 'submitted_by', 'submitted_at', 'is_final', 'created_at'],
  [SHEETS.MONTHLY_LINES]: ['id', 'version_id', 'sku_code', 'forecast_month', 'quantity', 'note', 'updated_at', 'updated_by'],
  [SHEETS.WEEKLY_SPLITS]: ['id', 'version_id', 'sku_code', 'week_number', 'region_code', 'quantity', 'updated_at', 'updated_by'],
  [SHEETS.APPROVALS]: ['id', 'cycle_id', 'version_id', 'approver_id', 'status', 'comment', 'requested_by', 'requested_at', 'decided_at'],
  [SHEETS.ACTUALS]: ['id', 'business_unit_code', 'sku_code', 'actual_month', 'region_code', 'quantity', 'source_system', 'imported_by', 'imported_at'],
  [SHEETS.AUDIT]: ['at', 'user_id', 'event', 'detail']
};

// Cấu hình bảo mật
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;   // token sống 12 giờ
const MAX_FAILED_ATTEMPTS = 5;                 // sai 5 lần thì khoá
const LOCK_DURATION_MS = 15 * 60 * 1000;       // khoá 15 phút
const MIN_PIN_LENGTH = 6;
const LOCK_TIMEOUT_MS = 30 * 1000;             // chờ LockService tối đa 30s

// Action đọc / action ghi — dùng để chặn viewer và để chọn khoá ghi
const READ_ACTIONS = [
  'getBootstrap', 'getProducts', 'getCycles', 'getVersions', 'getMonthlyLines',
  'getWeeklySplits', 'validateWeekly', 'getB0Summary', 'getB1Summary',
  'getVariance', 'getApprovals', 'getVersionSummary', 'getActuals', 'getFcVsActual',
  // Action gộp theo màn hình — xem Workspace.gs để biết vì sao cần gộp
  'getMonthlyWorkspace', 'getWeeklyWorkspace', 'getDashboardWorkspace',
  'getActualsWorkspace', 'getApprovalsWorkspace',
  // Xuất báo cáo
  'getB0SumExport', 'getSapGt2Weekly', 'getSapExport',
  // Nhập từ Google Sheet ngoài
  'readExternalSheet',
  // Số tổng quan cho cổng VHKD (xem PortalStats.gs)
  'getPortalStats'
];
/**
 * Bảng nào cần đọc sẵn cho từng action.
 *
 * Trước đây mọi request đều batchGet TOÀN BỘ 12 tab, kể cả getBootstrap chỉ
 * cần ba danh mục nhỏ. Vì MonthlyForecastLines/WeeklyRegionSplits phình dần
 * theo từng version, chi phí đó cộng vào MỌI lượt gọi — app chậm dần theo
 * thời gian kể cả với người chỉ mở xem tháng hiện tại.
 *
 * An toàn khi khai thiếu: readTable_ tự động đọc rời bảng chưa có trong
 * cache, nên khai sót chỉ tốn thêm một lượt đọc chứ không sai kết quả. Vì
 * vậy nên khai HƠI DƯ còn hơn thiếu — riêng bốn bảng lớn (PRODUCTS,
 * MONTHLY_LINES, WEEKLY_SPLITS, ACTUALS) thì cân nhắc kỹ, đó mới là chỗ tốn.
 *
 * Action không có trong bảng này sẽ đọc tất cả như cũ.
 */
const ACTION_TABLES = {
  // --- đọc ---
  login:              [SHEETS.USERS, SHEETS.AUDIT],
  getBootstrap:       [SHEETS.BUSINESS_UNITS, SHEETS.REGIONS, SHEETS.PRODUCT_GROUPS],
  getProducts:        [SHEETS.PRODUCTS],
  getCycles:          [SHEETS.CYCLES],
  getVersions:        [SHEETS.VERSIONS, SHEETS.CYCLES],
  getMonthlyLines:    [SHEETS.MONTHLY_LINES, SHEETS.PRODUCTS, SHEETS.VERSIONS, SHEETS.CYCLES],
  getWeeklySplits:    [SHEETS.WEEKLY_SPLITS, SHEETS.PRODUCTS, SHEETS.VERSIONS, SHEETS.CYCLES],
  validateWeekly:     [SHEETS.MONTHLY_LINES, SHEETS.WEEKLY_SPLITS, SHEETS.PRODUCTS, SHEETS.VERSIONS, SHEETS.CYCLES],
  getB0Summary:       [SHEETS.MONTHLY_LINES, SHEETS.PRODUCTS, SHEETS.VERSIONS, SHEETS.CYCLES],
  getB1Summary:       [SHEETS.WEEKLY_SPLITS, SHEETS.PRODUCTS, SHEETS.VERSIONS, SHEETS.CYCLES],
  getVariance:        [SHEETS.MONTHLY_LINES, SHEETS.PRODUCTS, SHEETS.VERSIONS, SHEETS.CYCLES],
  getApprovals:       [SHEETS.APPROVALS, SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.USERS],
  getVersionSummary:  [SHEETS.MONTHLY_LINES, SHEETS.WEEKLY_SPLITS, SHEETS.PRODUCTS, SHEETS.VERSIONS, SHEETS.CYCLES],
  getActuals:         [SHEETS.ACTUALS, SHEETS.PRODUCTS, SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.MONTHLY_LINES],
  getFcVsActual:      [SHEETS.ACTUALS, SHEETS.PRODUCTS, SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.MONTHLY_LINES],
  readExternalSheet:  [SHEETS.AUDIT],
  getB0SumExport:     [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.PRODUCTS, SHEETS.MONTHLY_LINES, SHEETS.BUSINESS_UNITS],
  getSapExport:       [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.PRODUCTS, SHEETS.MONTHLY_LINES, SHEETS.WEEKLY_SPLITS, SHEETS.APPROVALS, SHEETS.BUSINESS_UNITS],
  getSapGt2Weekly:    [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.WEEKLY_SPLITS],

  getMonthlyWorkspace: [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.PRODUCTS, SHEETS.MONTHLY_LINES],
  getWeeklyWorkspace:  [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.PRODUCTS, SHEETS.REGIONS, SHEETS.MONTHLY_LINES, SHEETS.WEEKLY_SPLITS],
  getDashboardWorkspace: [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.PRODUCTS, SHEETS.MONTHLY_LINES],
  getActualsWorkspace: [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.PRODUCTS, SHEETS.REGIONS, SHEETS.MONTHLY_LINES, SHEETS.ACTUALS],
  getApprovalsWorkspace: [SHEETS.APPROVALS, SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.USERS, SHEETS.PRODUCTS, SHEETS.MONTHLY_LINES, SHEETS.WEEKLY_SPLITS],
  // Hợp của getCycles_ + getB0Summary_ + getApprovals_ + tên kênh.
  getPortalStats:      [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.PRODUCTS, SHEETS.MONTHLY_LINES, SHEETS.APPROVALS, SHEETS.USERS, SHEETS.BUSINESS_UNITS],

  // --- ghi ---
  createCycle:        [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.BUSINESS_UNITS],
  createVersion:      [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.MONTHLY_LINES, SHEETS.WEEKLY_SPLITS, SHEETS.AUDIT],
  // PRODUCTS cần cho assertKnownSkus_ — chặn ghi số cho SKU không có thật
  saveMonthlyLines:   [SHEETS.MONTHLY_LINES, SHEETS.VERSIONS, SHEETS.CYCLES, SHEETS.PRODUCTS],
  saveWeeklySplits:   [SHEETS.WEEKLY_SPLITS, SHEETS.VERSIONS, SHEETS.CYCLES, SHEETS.PRODUCTS],
  submitCycle:        [SHEETS.CYCLES, SHEETS.VERSIONS, SHEETS.APPROVALS, SHEETS.MONTHLY_LINES, SHEETS.WEEKLY_SPLITS, SHEETS.PRODUCTS],
  reopenCycle:        [SHEETS.CYCLES, SHEETS.AUDIT],
  decideApproval:     [SHEETS.APPROVALS, SHEETS.CYCLES],
  changeMyPin:        [SHEETS.USERS, SHEETS.AUDIT],
  setUserPin:         [SHEETS.USERS, SHEETS.AUDIT],
  addProduct:         [SHEETS.PRODUCTS],
  addProducts:        [SHEETS.PRODUCTS],
  updateProduct:      [SHEETS.PRODUCTS, SHEETS.AUDIT],
  upsertProducts:     [SHEETS.PRODUCTS, SHEETS.AUDIT],
  importProducts:     [SHEETS.PRODUCTS],
  saveActuals:        [SHEETS.ACTUALS, SHEETS.BUSINESS_UNITS, SHEETS.PRODUCTS]
};

/**
 * Nhóm hàng được coi là MÁY khi đếm "số máy".
 *
 * Phân loại theo danh mục ProductGroups, KHÔNG suy từ tiền tố mã: nhóm là bảng
 * người dùng sửa được, còn "mã bắt đầu bằng 1" là quy ước ngầm dễ sai khi có mã
 * mới. Quyết định này đã có ở màn Kế hoạch tháng từ trước — xem chú thích đầu
 * `client/src/pages/MonthlyForecast.jsx`, nơi có `NHOM_MAY` cùng giá trị.
 *
 * HAI BẢN SAO, cố ý: client là bản build riêng, không import được hằng số của
 * backend. Sửa một bên thì phải sửa bên kia, nếu không màn Kế hoạch tháng và
 * số tổng quan trên cổng VHKD sẽ nói hai con số "số máy" khác nhau.
 *
 * `getPortalStats_` báo ra số mã mà hai cách phân loại KHÔNG khớp nhau, để chỗ
 * lệch hiện thành một dòng cảnh báo chứ không thành một con số sai im lặng.
 */
const NHOM_MAY = ['NHOM_1', 'NHOM_2'];   // Máy TCM sx, Máy nhập khẩu

const WRITE_ACTIONS = [
  'createCycle', 'createVersion', 'saveMonthlyLines', 'saveWeeklySplits',
  'submitCycle', 'reopenCycle', 'decideApproval', 'changeMyPin', 'setUserPin',
  'importProducts', 'saveActuals', 'addProduct', 'addProducts',
  'updateProduct', 'upsertProducts',
  // Nhập SOP tạo chu kỳ + bản mới rồi ghi dòng tháng/tuần, nên phải nằm ở
  // nhóm GHI để chạy trong runExclusive_. Để nhầm sang nhóm đọc thì nó chạy
  // ngoài lock và có thể ghi đè lên số người khác vừa lưu.
  'importSopFromSource'
];

