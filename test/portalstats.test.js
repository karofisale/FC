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
 * Ba điều được chốt ở đây:
 *   1. PHÂN QUYỀN — người của một đơn vị không thấy số của đơn vị khác, kể cả
 *      khi gọi thẳng endpoint.
 *   2. "Số máy" chỉ đếm nhóm máy, còn doanh thu cộng hết — hai con số của cùng
 *      một ô KHÔNG cùng phạm vi, và đó là cố ý.
 *   3. Thứ tự dòng theo doanh thu tháng hiện tại, không theo mã kênh.
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
 * Dữ liệu mẫu: hai kênh, chu kỳ tháng này, horizon 4 (cổng chỉ lấy 2)
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
      // NHOM_1/NHOM_2 = Máy TCM sx / Máy nhập khẩu; NHOM_4 = Lõi, KHÔNG phải máy.
      ['1001', 'Máy 1', '', 'NHOM_1', 'Máy TCM sx', '', 'XK', 1000000, '1', ''],
      ['1002', 'Máy 2', '', 'NHOM_2', 'Máy nhập khẩu', '', 'OEM', 2000000, '1', ''],
      ['4001', 'Lõi', '', 'NHOM_4', 'Lõi', '', 'XK', 100000, '1', ''],
      // Hai mã lệch phân loại, cố ý: mã bắt đầu bằng 1 mà nhóm là lõi, và
      // ngược lại. tqDemLechPhanLoai_ phải đếm đúng mỗi bên một mã.
      ['1999', 'Lệch A', '', 'NHOM_4', 'Lõi', '', 'XK', 0, '1', ''],
      ['9001', 'Lệch B', '', 'NHOM_1', 'Máy TCM sx', '', 'XK', 0, '1', ''],
      // Đã tắt: không được tính vào phép đếm lệch. Phải là '0' chứ không phải
      // ô rỗng — activeOnly_ của dự án coi ô rỗng là ĐANG BẬT (SheetDb.gs).
      ['1888', 'Đã tắt', '', 'NHOM_4', 'Lõi', '', 'XK', 0, '0', '']
    ],
    MonthlyForecastLines: [
      ['id', 'version_id', 'sku_code', 'forecast_month', 'quantity', 'note', 'updated_at', 'updated_by'],
      ['l1', 'v-xk', '1001', THANG_NAY, 10, '', '', ''],
      ['l2', 'v-xk', '1001', thangLech(1), 20, '', '', ''],
      ['l3', 'v-xk', '1001', thangLech(2), 99, '', '', ''],
      ['l4', 'v-oem', '1002', THANG_NAY, 5, '', '', ''],
      ['l5', 'v-xk-cu', '1001', THANG_NAY, 777, '', '', ''],
      // Lõi: vào doanh thu nhưng KHÔNG vào "số máy".
      ['l6', 'v-xk', '4001', THANG_NAY, 300, '', '', '']
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
    ProductGroups: [['code', 'name'], ['NHOM_1', 'Máy TCM sx'], ['NHOM_2', 'Máy nhập khẩu'], ['NHOM_4', 'Lõi']],
    WeeklyRegionSplits: [['id', 'version_id', 'sku_code', 'week_number', 'region_code', 'quantity', 'updated_at', 'updated_by']],
    ActualSalesResults: [['id', 'business_unit_code', 'sku_code', 'actual_month', 'region_code', 'quantity', 'source_system', 'imported_by', 'imported_at']],
    AuthLog: [['at', 'user_id', 'event', 'detail']]
  };
}

const duAn = nap(duLieu());

console.log('\n1. Danh sách tháng của chu kỳ');
check('hai tháng liên tiếp', JSON.stringify(duAn.tqDayThang_('2026-11-01', 2))
  === JSON.stringify(['2026-11-01', '2026-12-01']));
check('bắc qua mốc năm', JSON.stringify(duAn.tqDayThang_('2026-12-01', 2))
  === JSON.stringify(['2026-12-01', '2027-01-01']));
check('tháng không hợp lệ -> mảng rỗng', duAn.tqDayThang_('', 2).length === 0);
check('cổng chỉ nhận 2 cột tháng', duAn.TQ_SO_THANG_ === 2, duAn.TQ_SO_THANG_);

console.log('\n2. Nhóm nào được đếm là máy');
check('NHOM_1 là máy', duAn.tqLaNhomMay_('NHOM_1') === true);
check('NHOM_2 là máy', duAn.tqLaNhomMay_('NHOM_2') === true);
check('NHOM_4 (lõi) KHÔNG phải máy', duAn.tqLaNhomMay_('NHOM_4') === false);
check('nhóm rỗng KHÔNG phải máy', duAn.tqLaNhomMay_('') === false);
/**
 * NHOM_MAY có HAI bản chép tay: `gas/Config.gs` (backend) và
 * `client/src/pages/MonthlyForecast.jsx` (màn Kế hoạch tháng). Client là bản
 * build riêng nên không import được hằng số của backend.
 *
 * Ca này so hai bản bằng cách đọc thẳng hai file. Nếu chúng trôi lệch thì màn
 * Kế hoạch tháng và thẻ tổng quan trên cổng sẽ nói hai con số "số máy" khác
 * nhau cho cùng một chu kỳ — và không có gì báo, vì cả hai đều "chạy đúng".
 *
 * Không so bằng `duAn.NHOM_MAY`: `const` ở tầng cao nhất trong vm không trở
 * thành thuộc tính của sandbox (chỉ `var` mới thành), nên phép so đó luôn
 * undefined === undefined ở một phía và xanh vì lý do sai.
 */
function docMangNhomMay(duongDan) {
  const src = fs.readFileSync(duongDan, 'utf8');
  const m = src.match(/NHOM_MAY\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  return m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}
{
  const banBackend = docMangNhomMay(path.join(GAS, 'Config.gs'));
  const banClient = docMangNhomMay(path.join(__dirname, '..', 'client', 'src', 'pages', 'MonthlyForecast.jsx'));
  check('đọc được NHOM_MAY ở cả hai file', !!banBackend && !!banClient, [banBackend, banClient]);
  check('hai bản chép tay khớp nhau',
    JSON.stringify(banBackend) === JSON.stringify(banClient), [banBackend, banClient]);
  check('và đúng là NHOM_1 + NHOM_2',
    JSON.stringify(banBackend) === JSON.stringify(['NHOM_1', 'NHOM_2']), banBackend);
}

console.log('\n3. Tên kế hoạch chờ duyệt nói đủ kênh / chu kỳ / lần cập nhật');
check('có cả ba phần', duAn.tqTenKeHoach_({ business_unit_code: 'XK', base_month: '2026-09-01', iso_week_label: '2026-W37' })
  === 'XK · T09/2026 · 2026-W37');
check('không có nhãn tuần thì dùng số tuần',
  duAn.tqTenKeHoach_({ business_unit_code: 'XK', base_month: '2026-09-01', update_week: 3 })
  === 'XK · T09/2026 · tuần 3');

console.log('\n4. central_admin thấy mọi kênh');
{
  const r = duAn.getPortalStats_({ userId: 'admin', role: 'central_admin', bu: '' });
  check('lấy đúng chu kỳ tháng này', r.baseMonth === THANG_NAY, r.baseMonth);
  check('đánh dấu là tháng hiện tại', r.laThangNay === true);
  check('đúng 2 cột tháng', r.months.length === 2, r.months);
  check('hai kênh có số', r.channels.length === 2, r.channels.map((c) => c.code));
  const xk = r.channels.filter((c) => c.code === 'XK')[0];
  check('tên kênh lấy từ BusinessUnits', xk.ten === 'Xuất khẩu', xk.ten);
  check('sản lượng tháng 1 = 10', xk.qty[0] === 10, xk.qty);
  check('sản lượng tháng 2 = 20', xk.qty[1] === 20, xk.qty);

  check('KHÔNG cộng version chưa chốt (777)', xk.qty[0] === 10 && r.total.qty[0] === 15, r.total.qty);
  check('KHÔNG dồn tháng thứ 3 vào cột cuối', xk.qty[1] === 20, xk.qty);

  // Hai ca cốt lõi của cách tính mới: lõi vào doanh thu nhưng không vào số máy.
  check('lõi KHÔNG vào số máy', xk.qty[0] === 10, xk.qty);
  check('lõi VẪN vào doanh thu (10x1tr + 300x100k)', xk.rev[0] === 40000000, xk.rev);

  check('tổng tháng 1 = 10 + 5 máy', r.total.qty[0] === 15, r.total.qty);
  check('doanh thu tổng tháng 1 = 40tr + 10tr', r.total.rev[0] === 50000000, r.total.rev);

  // Sắp theo doanh thu tháng hiện tại, cao -> thấp. XK 40tr trên OEM 10tr.
  check('kênh doanh thu cao nằm trên', r.channels[0].code === 'XK',
    r.channels.map((c) => [c.code, c.rev[0]]));

  check('đếm mã lệch: có đầu số 1 mà không phải nhóm máy',
    r.lechPhanLoai.coDauSoMaKhongNhomMay === 1, r.lechPhanLoai);
  check('đếm mã lệch: nhóm máy mà không có đầu số 1',
    r.lechPhanLoai.nhomMayMaKhongDauSo === 1, r.lechPhanLoai);

  check('chỉ 1 kế hoạch chờ duyệt', r.pending.length === 1, r.pending);
  check('kế hoạch chờ duyệt là của XK', r.pending[0].bu === 'XK', r.pending[0]);
  check('có tên người gửi', r.pending[0].nguoiGui === 'Người XK', r.pending[0]);
  check('phạm vi rỗng = toàn bộ', r.phamVi === '', r.phamVi);
}

console.log('\n5. Thứ tự dòng đảo theo doanh thu, không cố định theo mã');
{
  // OEM nâng lên 100 máy x 2tr = 200tr > XK 40tr -> OEM phải lên đầu. Ca này đỏ
  // nghĩa là danh sách vẫn đang xếp theo mã kênh.
  const d = duLieu();
  d.MonthlyForecastLines[4][4] = 100;
  const r = nap(d).getPortalStats_({ userId: 'admin', role: 'central_admin', bu: '' });
  check('OEM lên đầu khi doanh thu cao hơn', r.channels[0].code === 'OEM',
    r.channels.map((c) => [c.code, c.rev[0]]));
}

console.log('\n6. PHÂN QUYỀN — bu_editor của XK chỉ thấy XK');
{
  const r = duAn.getPortalStats_({ userId: 'u-xk', role: 'bu_editor', bu: 'XK' });
  check('chỉ một kênh', r.channels.length === 1, r.channels.map((c) => c.code));
  check('và đúng kênh của mình', r.channels[0].code === 'XK');
  check('tổng KHÔNG chứa số của OEM', r.total.qty[0] === 10, r.total.qty);
  check('tổng doanh thu cũng KHÔNG chứa OEM', r.total.rev[0] === 40000000, r.total.rev);
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

console.log('\n7. Chưa có chu kỳ tháng này -> lấy chu kỳ gần nhất, và nói rõ');
{
  const d = duLieu();
  d.ForecastCycles[1][2] = thangLech(-2);
  d.ForecastCycles[2][2] = thangLech(-2);
  d.MonthlyForecastLines[1][3] = thangLech(-2);
  d.MonthlyForecastLines[4][3] = thangLech(-2);
  d.MonthlyForecastLines[6][3] = thangLech(-2);
  const r2 = nap(d).getPortalStats_({ userId: 'admin', role: 'central_admin', bu: '' });
  check('rơi về chu kỳ gần nhất', r2.baseMonth === thangLech(-2), r2.baseMonth);
  check('và KHÔNG nhận là tháng hiện tại', r2.laThangNay === false);
  check('vẫn có số', r2.channels.length === 2, r2.channels.map((c) => c.code));
}

console.log('\n8. Không có chu kỳ nào -> trả về rỗng, không nổ');
{
  const d = duLieu();
  d.ForecastCycles = [d.ForecastCycles[0]];
  const r3 = nap(d).getPortalStats_({ userId: 'admin', role: 'central_admin', bu: '' });
  check('baseMonth rỗng', r3.baseMonth === '', r3.baseMonth);
  check('không có kênh nào', r3.channels.length === 0);
  check('total là null chứ không phải mảng số 0', r3.total === null, r3.total);
  check('không đọc phân loại khi chưa có chu kỳ', r3.lechPhanLoai === null, r3.lechPhanLoai);
}

console.log('');
console.log(pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
