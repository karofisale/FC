/**
 * portalstats.test.js — kiểm gas/PortalStats.gs (số tổng quan cho cổng VHKD).
 *
 *   node test/portalstats.test.js
 *
 * Bài test này nạp MÃ THẬT của dự án — Config, Utils, SheetDb, Queries, Auth,
 * PortalStats — và chỉ giả lập SpreadsheetApp, thứ duy nhất không tồn tại
 * trong Node. KHÔNG giả lập một hàm nào của dự án.
 *
 * Vì sao viết rõ điều đó: một bài test tự cấp bản giả cho hàm ĐÁNG LẼ phải có
 * trong dự án sẽ xanh trong khi mã nguồn nổ ReferenceError trên Apps Script.
 * Chuyện này đã xảy ra thật ở dự án Karofi ID (psInLog_ — một hàm của CHÍNH
 * dự án FC bị gọi ở dự án khác, bài test bên đó có bản giả nên không ai biết).
 * Nạp thật cả chuỗi gọi là cách duy nhất bắt được lỗi đó.
 *
 * Điều quan trọng nhất được chốt ở đây là PHÂN QUYỀN: người của một đơn vị
 * không được thấy số của đơn vị khác, kể cả khi gọi thẳng endpoint.
 */

process.env.TZ = 'Asia/Ho_Chi_Minh';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAS = path.join(__dirname, '..', 'gas');
const FILES = ['Config.gs', 'Utils.gs', 'SheetDb.gs', 'Queries.gs', 'Auth.gs', 'PortalStats.gs'];

let pass = 0, fail = 0;
function check(ten, dieuKien, them) {
  if (dieuKien) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}

/** Bảng tính giả: chỉ đủ phần readTable_ dùng tới. */
function bangTinh(tabs) {
  return {
    getSheetByName: (n) => {
      if (!tabs[n]) return null;
      return {
        getDataRange: () => ({ getValues: () => tabs[n] }),
        getRange: () => ({
          setValues: () => {},
          setFontWeight: () => ({ setBackground: () => ({ setFontColor: () => {} }) })
        }),
        setFrozenRows: () => {},
        appendRow: () => {}
      };
    },
    insertSheet: (n) => { throw new Error('Bài test không cho tạo tab mới: ' + n); }
  };
}

function nap(tabs) {
  const sandbox = {
    SpreadsheetApp: { openById: () => bangTinh(tabs) },
    Utilities: {
      formatDate: (d, tz, f) => {
        const p = (x) => String(x).padStart(2, '0');
        if (f === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      },
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2)
    },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Logger: { log: () => {} },
    console, JSON, Math, Date, String, Number, Object, Array, RegExp, Error,
    isFinite, isNaN, parseInt, parseFloat
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  FILES.forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), sandbox, { filename: f });
  });
  return sandbox;
}

/* ------------------------------------------------------------------ *
 * Dữ liệu mẫu: hai kênh, chu kỳ tháng này, horizon 4
 * ------------------------------------------------------------------ */
const NAY = new Date();
function thangLech(n) {
  const d = new Date(NAY.getFullYear(), NAY.getMonth() + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}
const THANG_NAY = thangLech(0);

function duLieu() {
  return {
    BusinessUnits: [
      ['code', 'name', 'is_active'],
      ['XK', 'Xuất khẩu', '1'],
      ['OEM', 'Kênh OEM', '1']
    ],
    ForecastCycles: [
      ['id', 'business_unit_code', 'base_month', 'horizon_months', 'status', 'created_by', 'created_at'],
      ['c-xk', 'XK', THANG_NAY, 4, 'submitted', 'a', ''],
      ['c-oem', 'OEM', THANG_NAY, 4, 'draft', 'b', '']
    ],
    ForecastVersions: [
      ['id', 'cycle_id', 'update_week', 'update_date', 'iso_week_label', 'submitted_by', 'submitted_at', 'is_final', 'created_at'],
      ['v-xk', 'c-xk', 2, '', '2026-W37', 'a', '', '1', ''],
      ['v-xk-cu', 'c-xk', 1, '', '2026-W36', 'a', '', '', ''],
      ['v-oem', 'c-oem', 1, '', '2026-W36', 'b', '', '1', '']
    ],
    Products: [
      ['sku_code', 'name', 'short_name', 'product_group_code', 'product_group_name', 'technology', 'default_channel', 'avg_price', 'is_active', 'requirements_type'],
      ['S1', 'Máy 1', '', 'G1', 'Nhóm 1', '', 'XK', 1000000, '1', ''],
      ['S2', 'Máy 2', '', 'G2', 'Nhóm 2', '', 'OEM', 2000000, '1', '']
    ],
    MonthlyForecastLines: [
      ['id', 'version_id', 'sku_code', 'forecast_month', 'quantity', 'note', 'updated_at', 'updated_by'],
      ['l1', 'v-xk', 'S1', THANG_NAY, 10, '', '', ''],
      ['l2', 'v-xk', 'S1', thangLech(1), 20, '', '', ''],
      ['l3', 'v-xk', 'S1', thangLech(4), 99, '', '', ''],
      ['l4', 'v-oem', 'S2', THANG_NAY, 5, '', '', ''],
      ['l5', 'v-xk-cu', 'S1', THANG_NAY, 777, '', '', '']
    ],
    Approvals: [
      ['id', 'cycle_id', 'version_id', 'approver_id', 'status', 'comment', 'requested_by', 'requested_at', 'decided_at'],
      ['a1', 'c-xk', 'v-xk', 'u-appr', 'pending', '', 'u-xk', '2026-09-05T02:00:00Z', ''],
      ['a2', 'c-oem', 'v-oem', 'u-appr', 'approved', '', 'u-oem', '2026-09-01T02:00:00Z', '']
    ],
    Users: [
      ['id', 'full_name', 'email', 'role', 'business_unit_code', 'pin_hash', 'is_active', 'failed_attempts', 'locked_until', 'last_login'],
      ['u-xk', 'Người XK', '', 'bu_editor', 'XK', '', '1', '', '', ''],
      ['u-appr', 'Người duyệt', '', 'bu_approver', 'XK', '', '1', '', '', '']
    ],
    Regions: [['code', 'name', 'is_active']],
    ProductGroups: [['code', 'name'], ['G1', 'Nhóm 1'], ['G2', 'Nhóm 2']],
    WeeklyRegionSplits: [['id', 'version_id', 'sku_code', 'week_number', 'region_code', 'quantity', 'updated_at', 'updated_by']],
    ActualSalesResults: [['id', 'business_unit_code', 'sku_code', 'actual_month', 'region_code', 'quantity', 'source_system', 'imported_by', 'imported_at']],
    AuthLog: [['at', 'user_id', 'event', 'detail']]
  };
}

const duAn = nap(duLieu());

console.log('\n1. Danh sách tháng của chu kỳ');
check('đúng 4 tháng liên tiếp', JSON.stringify(duAn.tqDayThang_('2026-11-01', 4))
  === JSON.stringify(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']));
check('tháng không hợp lệ -> mảng rỗng', duAn.tqDayThang_('', 4).length === 0);

console.log('\n2. Tên kế hoạch chờ duyệt nói đủ kênh / chu kỳ / lần cập nhật');
check('có cả ba phần', duAn.tqTenKeHoach_({ business_unit_code: 'XK', base_month: '2026-09-01', iso_week_label: '2026-W37' })
  === 'XK · T09/2026 · 2026-W37');
check('không có nhãn tuần thì dùng số tuần',
  duAn.tqTenKeHoach_({ business_unit_code: 'XK', base_month: '2026-09-01', update_week: 3 })
  === 'XK · T09/2026 · tuần 3');

console.log('\n3. central_admin thấy mọi kênh');
{
  const r = duAn.getPortalStats_({ userId: 'admin', role: 'central_admin', bu: '' });
  check('lấy đúng chu kỳ tháng này', r.baseMonth === THANG_NAY, r.baseMonth);
  check('đánh dấu là tháng hiện tại', r.laThangNay === true);
  check('4 cột tháng', r.months.length === 4, r.months);
  check('hai kênh có số', r.channels.map((c) => c.code).join(',') === 'OEM,XK',
    r.channels.map((c) => c.code));
  const xk = r.channels.filter((c) => c.code === 'XK')[0];
  check('tên kênh lấy từ BusinessUnits', xk.ten === 'Xuất khẩu', xk.ten);
  check('sản lượng tháng 1 = 10', xk.qty[0] === 10, xk.qty);
  check('doanh thu tháng 1 = 10 x 1.000.000', xk.rev[0] === 10000000, xk.rev);
  check('sản lượng tháng 2 = 20', xk.qty[1] === 20, xk.qty);
  // Hai ca đáng giá nhất của mục này: bỏ version không chốt, và bỏ tháng ngoài
  // horizon thay vì dồn nó vào cột cuối.
  check('KHÔNG cộng version chưa chốt (777)', xk.qty[0] === 10 && r.total.qty[0] === 15, r.total.qty);
  check('KHÔNG dồn tháng ngoài horizon vào cột cuối', xk.qty[3] === 0, xk.qty);
  check('tổng tháng 1 = 10 + 5', r.total.qty[0] === 15, r.total.qty);
  check('doanh thu tổng tháng 1 = 10tr + 10tr', r.total.rev[0] === 20000000, r.total.rev);
  check('chỉ 1 kế hoạch chờ duyệt', r.pending.length === 1, r.pending);
  check('kế hoạch chờ duyệt là của XK', r.pending[0].bu === 'XK', r.pending[0]);
  check('có tên người gửi', r.pending[0].nguoiGui === 'Người XK', r.pending[0]);
  check('phạm vi rỗng = toàn bộ', r.phamVi === '', r.phamVi);
}

console.log('\n4. PHÂN QUYỀN — bu_editor của XK chỉ thấy XK');
{
  const r = duAn.getPortalStats_({ userId: 'u-xk', role: 'bu_editor', bu: 'XK' });
  check('chỉ một kênh', r.channels.length === 1, r.channels.map((c) => c.code));
  check('và đúng kênh của mình', r.channels[0].code === 'XK');
  check('tổng KHÔNG chứa số của OEM', r.total.qty[0] === 10, r.total.qty);
  check('phạm vi ghi rõ là XK', r.phamVi === 'XK', r.phamVi);
}
{
  const r = duAn.getPortalStats_({ userId: 'u-oem', role: 'bu_editor', bu: 'OEM' });
  check('người OEM không thấy kế hoạch chờ duyệt của XK', r.pending.length === 0, r.pending);
  check('người OEM chỉ thấy kênh OEM', r.channels.length === 1 && r.channels[0].code === 'OEM');
}
{
  // Chưa gán đơn vị: scopedBU_ ném FORBIDDEN. Đây là fail-closed — nếu ca này
  // đỏ nghĩa là tài khoản thiếu cấu hình đang được cấp quyền xem toàn bộ.
  let loi = '';
  try { duAn.getPortalStats_({ userId: 'x', role: 'bu_editor', bu: '' }); }
  catch (e) { loi = e.message; }
  check('bu_editor chưa gán đơn vị -> FORBIDDEN', loi.indexOf('FORBIDDEN') === 0, loi);
}

console.log('\n5. Chưa có chu kỳ tháng này -> lấy chu kỳ gần nhất, và nói rõ');
{
  const d = duLieu();
  d.ForecastCycles[1][2] = thangLech(-2);
  d.ForecastCycles[2][2] = thangLech(-2);
  d.MonthlyForecastLines[1][3] = thangLech(-2);
  d.MonthlyForecastLines[4][3] = thangLech(-2);
  const r2 = nap(d).getPortalStats_({ userId: 'admin', role: 'central_admin', bu: '' });
  check('rơi về chu kỳ gần nhất', r2.baseMonth === thangLech(-2), r2.baseMonth);
  check('và KHÔNG nhận là tháng hiện tại', r2.laThangNay === false);
}

console.log('\n6. Không có chu kỳ nào -> trả về rỗng, không nổ');
{
  const d = duLieu();
  d.ForecastCycles = [d.ForecastCycles[0]];
  const r3 = nap(d).getPortalStats_({ userId: 'admin', role: 'central_admin', bu: '' });
  check('baseMonth rỗng', r3.baseMonth === '', r3.baseMonth);
  check('không có kênh nào', r3.channels.length === 0);
  check('total là null chứ không phải mảng số 0', r3.total === null, r3.total);
}

console.log('');
console.log(pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
