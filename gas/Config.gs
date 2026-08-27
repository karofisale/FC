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
  [SHEETS.BUSINESS_UNITS]: ['code', 'name', 'is_active'],
  [SHEETS.REGIONS]: ['code', 'name', 'is_active'],
  [SHEETS.PRODUCT_GROUPS]: ['code', 'name'],
  [SHEETS.PRODUCTS]: ['sku_code', 'name', 'short_name', 'product_group_code', 'product_group_name', 'technology', 'default_channel', 'avg_price', 'is_active'],
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
  'getVariance', 'getApprovals', 'getVersionSummary', 'getActuals', 'getFcVsActual'
];
const WRITE_ACTIONS = [
  'createCycle', 'createVersion', 'saveMonthlyLines', 'saveWeeklySplits',
  'submitCycle', 'decideApproval', 'changeMyPin', 'setUserPin', 'importProducts',
  'saveActuals'
];

