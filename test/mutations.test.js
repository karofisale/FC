/**
 * mutations.test.js — kiểm gas/Mutations.gs qua đúng luồng nghiệp vụ thật:
 * mở chu kỳ mới -> lưu số -> gửi duyệt -> phê duyệt -> mở lại.
 *
 * Viết SAU 2 bug thật gặp 27-28/09/2026: `updateCycleStatus_` và
 * `versionContext_` được GỌI ở nhiều chỗ trong Mutations.gs/Auth.gs nhưng
 * KHÔNG hề được định nghĩa ở đâu trong gas/ — chắc hẳn thất lạc lúc viết lại
 * tầng data-access sang Postgres. `npm test` trước đó vẫn xanh vì
 * portalstats.test.js không gọi tới các luồng ghi (submit/duyệt/mở lại/lưu
 * số), nên bug nằm im tới khi người dùng thật bấm "Gửi duyệt" mới lộ ra
 * ("updateCycleStatus_ is not defined"). Bài test này nạp MÃ THẬT (không
 * stub 2 hàm đó hay bất kỳ hàm nào của dự án — xem giải thích ở
 * portalstats.test.js) và đi hết một vòng đời chu kỳ để không hàm nào trong
 * chuỗi gọi có thể thất lạc mà không bị bắt.
 *
 * Đồng thời kiểm bug "chu kỳ mồ côi" (26-27/09/2026): ForecastCycles có dòng
 * nhưng ForecastVersions ban đầu (week 0) thì không, do lỗi ghi Postgres xảy
 * ra GIỮA 2 lệnh ghi của createCycle_ (không phải 1 giao dịch) — tạo lại báo
 * "đã tồn tại" nhưng mở ra thì rỗng, không sửa được nữa. createCycle_ giờ tự
 * vá bằng cách tạo version còn thiếu thay vì chặn cứng.
 *
 *   node test/mutations.test.js
 */

process.env.TZ = 'Asia/Ho_Chi_Minh';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { taoCSDLGia, taoUrlFetchAppGia, kiemTraKhopBanGoc } = require('./pg-shim');

const GAS = path.join(__dirname, '..', 'gas');
kiemTraKhopBanGoc(path.join(GAS, 'SheetDb.gs'));

const FILES = ['Config.gs', 'Utils.gs', 'SheetDb.gs', 'Queries.gs', 'Auth.gs', 'Mutations.gs'];

let pass = 0, fail = 0;
function check(ten, dieuKien, them) {
  if (dieuKien) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}

function duLieuGoc() {
  return {
    BusinessUnits: [
      ['code', 'name', 'is_active'],
      ['GT2', 'Kênh GT2', '1']
    ],
    Users: [
      ['id', 'full_name', 'email', 'role', 'business_unit_code', 'pin_hash', 'is_active', 'failed_attempts', 'locked_until', 'last_login'],
      ['u-gt2', 'Người GT2', '', 'bu_editor', 'GT2', '', '1', '', '', ''],
      ['u-appr', 'Người duyệt GT2', '', 'bu_approver', 'GT2', '', '1', '', '', ''],
      ['u-admin', 'Admin', '', 'central_admin', '', '', '1', '', '', '']
    ],
    Products: [
      ['sku_code', 'name', 'short_name', 'product_group_code', 'product_group_name', 'technology', 'default_channel', 'avg_price', 'is_active', 'requirements_type'],
      ['1001', 'Máy 1', '', '', '', '', 'GT2', 1000000, '1', '']
    ],
    ForecastCycles: [['id', 'business_unit_code', 'base_month', 'horizon_months', 'status', 'created_by', 'created_at']],
    ForecastVersions: [['id', 'cycle_id', 'update_week', 'update_date', 'iso_week_label', 'submitted_by', 'submitted_at', 'is_final', 'created_at']],
    MonthlyForecastLines: [['id', 'version_id', 'sku_code', 'forecast_month', 'quantity', 'note', 'updated_at', 'updated_by']],
    WeeklyRegionSplits: [['id', 'version_id', 'sku_code', 'week_number', 'region_code', 'quantity', 'updated_at', 'updated_by']],
    Approvals: [['id', 'cycle_id', 'version_id', 'approver_id', 'status', 'comment', 'requested_by', 'requested_at', 'decided_at']],
    Regions: [['code', 'name', 'is_active'], ['MB', 'Miền Bắc', '1']],
    ProductGroups: [['code', 'name']],
    ActualSalesResults: [['id', 'business_unit_code', 'sku_code', 'actual_month', 'region_code', 'quantity', 'source_system', 'imported_by', 'imported_at']],
    AuthLog: [['at', 'user_id', 'event', 'detail']]
  };
}

function nap(tabs) {
  const db = taoCSDLGia(tabs);
  const sandbox = {
    UrlFetchApp: taoUrlFetchAppGia(db),
    Utilities: {
      formatDate: (d, tz, f) => {
        const p = (x) => String(x).padStart(2, '0');
        if (f === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      },
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2)
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => {
          if (k === 'SUPABASE_URL') return 'https://gia.supabase.co';
          if (k === 'SUPABASE_SERVICE_ROLE_KEY') return 'khoa-gia';
          return null;
        },
        setProperty: () => {}
      })
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Logger: { log: () => {} },
    console, JSON, Math, Date, String, Number, Object, Array, RegExp, Error,
    isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  FILES.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), sandbox, { filename: f });
  });
  sandbox.__db = db;
  return sandbox;
}

const bienTap = { userId: 'u-gt2', role: 'bu_editor', bu: 'GT2' };
const thamDinh = { userId: 'u-appr', role: 'bu_approver', bu: 'GT2' };

console.log('1. createCycle_ — mở chu kỳ mới, tạo kèm version W0');
{
  const g = nap(duLieuGoc());
  const res = g.createCycle_(bienTap, { businessUnitCode: 'GT2', baseMonth: '2026-10', horizonMonths: 4 });
  check('trả về cycle + initialVersionId', !!res.cycle && !!res.initialVersionId, res);
  check('chu kỳ ở trạng thái draft', res.cycle.status === 'draft', res.cycle);
  const versions = g.getVersions_(res.cycle.id);
  check('CÓ đúng 1 version W0 vừa tạo (không rơi vào ReferenceError)', versions.length === 1 && Number(versions[0].update_week) === 0, versions);

  console.log('\n2. createCycle_ lần 2, cùng đơn vị/tháng — phải báo đã tồn tại (có version)');
  let loi = null;
  try { g.createCycle_(bienTap, { businessUnitCode: 'GT2', baseMonth: '2026-10' }); }
  catch (e) { loi = e.message; }
  check('báo đúng "đã tồn tại"', /đã tồn tại/.test(loi || ''), loi);
}

console.log('\n3. Chu kỳ MỒ CÔI (bug thật 26-27/09/2026): có ForecastCycles, KHÔNG có version nào');
{
  const tabs = duLieuGoc();
  tabs.ForecastCycles.push(['c-gt2-202610', 'GT2', '2026-10-01', 4, 'draft', 'u-gt2', '2026-09-27T00:00:00Z']);
  const g = nap(tabs);

  const truoc = g.getVersions_('c-gt2-202610');
  check('trước khi vá: đúng là mồ côi, 0 version', truoc.length === 0, truoc);

  const res = g.createCycle_(bienTap, { businessUnitCode: 'GT2', baseMonth: '2026-10' });
  check('KHÔNG báo lỗi "đã tồn tại" — tự vá thay vì chặn cứng', !!res.initialVersionId, res);
  check('vẫn là chu kỳ CŨ (giữ nguyên id), không tạo chu kỳ trùng', res.cycle.id === 'c-gt2-202610', res.cycle);

  const sau = g.getVersions_('c-gt2-202610');
  check('sau khi vá: đã có đúng 1 version W0', sau.length === 1 && Number(sau[0].update_week) === 0, sau);
}

console.log('\n4. Vòng đời đầy đủ: lưu số -> gửi duyệt -> phê duyệt -> mở lại (versionContext_/updateCycleStatus_)');
{
  const g = nap(duLieuGoc());
  const mo = g.createCycle_(bienTap, { businessUnitCode: 'GT2', baseMonth: '2026-10' });
  const cycleId = mo.cycle.id;
  const versionId = mo.initialVersionId;

  let loiLuu = null;
  try {
    g.saveMonthlyLines_(bienTap, versionId, [
      { skuCode: '1001', forecastMonth: '2026-10', quantity: 10 }
    ], false);
    // Khớp đủ tổng tuần với tháng 1 (10) để submitCycle_ qua được validateWeekly_
    // — bài test này nhắm vào việc updateCycleStatus_/versionContext_ CÓ THẬT,
    // không nhắm vào validateWeekly_ (đã có test riêng ở nơi khác).
    g.saveWeeklySplits_(bienTap, versionId, [
      { skuCode: '1001', weekNumber: 1, regionCode: 'MB', quantity: 10 }
    ], false);
  } catch (e) { loiLuu = e; }
  check('saveMonthlyLines_/saveWeeklySplits_ không nổ (versionContext_ có thật)', loiLuu === null, loiLuu && loiLuu.message);

  let loiGui = null, guiRes = null;
  try { guiRes = g.submitCycle_(bienTap, cycleId, versionId); }
  catch (e) { loiGui = e; }
  check('submitCycle_ không nổ "updateCycleStatus_ is not defined"', loiGui === null, loiGui && loiGui.message);
  check('gửi duyệt trả về approvalId', !!(guiRes && guiRes.approvalId), guiRes);

  const chuKySauGui = g.findOne_('ForecastCycles', 'id', cycleId);
  check('chu kỳ chuyển đúng sang submitted', chuKySauGui.status === 'submitted', chuKySauGui);

  let loiDuyet = null;
  try { g.decideApproval_(thamDinh, guiRes.approvalId, 'approved', 'Đồng ý'); }
  catch (e) { loiDuyet = e; }
  check('decideApproval_ không nổ', loiDuyet === null, loiDuyet && loiDuyet.message);

  const chuKySauDuyet = g.findOne_('ForecastCycles', 'id', cycleId);
  check('chu kỳ chuyển đúng sang approved', chuKySauDuyet.status === 'approved', chuKySauDuyet);

  let loiMoLai = null, moLaiRes = null;
  try { moLaiRes = g.reopenCycle_(thamDinh, cycleId, 'Sai sản lượng, mở lại để sửa.'); }
  catch (e) { loiMoLai = e; }
  check('reopenCycle_ không nổ', loiMoLai === null, loiMoLai && loiMoLai.message);
  check('reopenCycle_ trả về message', !!(moLaiRes && moLaiRes.message), moLaiRes);

  const chuKySauMoLai = g.findOne_('ForecastCycles', 'id', cycleId);
  check('chu kỳ quay lại draft', chuKySauMoLai.status === 'draft', chuKySauMoLai);
}

console.log('\n' + pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
