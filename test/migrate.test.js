/**
 * migrate.test.js — kiểm phần DỰNG RECORD của gas/MigrateToSupabase.gs
 * (mỗi dòng Sheet thô -> record Postgres đúng kiểu), KHÔNG đụng mạng/Sheet
 * thật. Chỉ nạp Config.gs (SHEETS) + Utils.gs (normalizeMonth_/normalizeSku_)
 * + MigrateToSupabase.gs — đủ cho các hàm build() vì chúng không gọi
 * getSpreadsheet_/appendObjects_/readObjects_ (những hàm đó chỉ nằm trong
 * migrateXemTruoc_/migrateGhiThat_, không phải trong build()).
 *
 *   node test/migrate.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAS = path.join(__dirname, '..', 'gas');
const FILES = ['Config.gs', 'Utils.gs', 'MigrateToSupabase.gs'];

const sandbox = {
  Utilities: {
    formatDate: (d, tz, f) => {
      const p = (x) => String(x).padStart(2, '0');
      if (f === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    },
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2)
  },
  Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
  Logger: { log: () => {} },
  console, JSON, Math, Date, String, Number, Object, Array, RegExp, Error, isFinite, parseFloat
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
FILES.forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(GAS, f), 'utf8'), sandbox, { filename: f });
});

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); }
  else { fail++; console.log('  FAIL ' + ten + (them === undefined ? '' : '  -> ' + JSON.stringify(them))); }
}
function timBang(nhan) { return sandbox.MS_BANG_.filter((b) => b.nhan === nhan)[0]; }

console.log('1. Hàm quy đổi kiểu thuần');
check('msBoolActive_ trống -> true (đúng quy ước activeOnly_)', sandbox.msBoolActive_('') === true);
check('msBoolActive_ "0" -> false', sandbox.msBoolActive_('0') === false);
check('msBoolActive_ "1" -> true', sandbox.msBoolActive_('1') === true);
check('msBoolExplicit_ trống -> false (KHÁC msBoolActive_)', sandbox.msBoolExplicit_('') === false);
check('msBoolExplicit_ "1" -> true', sandbox.msBoolExplicit_('1') === true);
check('msSo_ chuỗi có phẩy', sandbox.msSo_('1,234') === 1234);
check('msSo_ rỗng -> 0', sandbox.msSo_('') === 0);
check('msSo_ số thật', sandbox.msSo_(500) === 500);
check('msChu_ cắt khoảng trắng', sandbox.msChu_('  abc  ') === 'abc');
check('msMocNullable_ rỗng -> null', sandbox.msMocNullable_('') === null);
check('msMocNullable_ Date thật -> ISO', sandbox.msMocNullable_(new Date(Date.UTC(2026, 0, 1))) === '2026-01-01T00:00:00.000Z');
check('msMocBatBuoc_ rỗng -> giờ hiện tại (chuỗi ISO thật, KHÔNG rỗng/null)',
  typeof sandbox.msMocBatBuoc_('') === 'string' && sandbox.msMocBatBuoc_('') !== '', sandbox.msMocBatBuoc_(''));

console.log('\n2. BusinessUnits');
{
  const b = timBang('BusinessUnits');
  const rec = b.build({ code: ' XK ', name: 'Xuất khẩu', is_active: '1', sap_channel: 'XK', sap_vkorg: '0401', sap_vtweg: '02', sap_sold_to: '*', report_channel: '0401' });
  check('code cắt khoảng trắng', rec.code === 'XK', rec);
  check('is_active đúng boolean', rec.is_active === true);
}

console.log('\n3. Products — sku_code chuẩn hoá, avg_price số thật');
{
  const b = timBang('Products');
  const rec = b.build({ sku_code: '  2013050022  ', name: 'Máy A', short_name: '', product_group_code: '', product_group_name: '', technology: '', default_channel: 'XK', avg_price: '1,234,567', is_active: '', requirements_type: '' });
  check('sku_code giữ nguyên số 0 đầu, cắt khoảng trắng', rec.sku_code === '2013050022', rec.sku_code);
  check('avg_price đọc đúng số có phẩy', rec.avg_price === 1234567, rec.avg_price);
  check('is_active trống -> true', rec.is_active === true);
  check('product_group_code trống -> null (không phải chuỗi rỗng)', rec.product_group_code === null, rec.product_group_code);
}

console.log('\n4. ForecastCycles — base_month chuẩn hoá qua normalizeMonth_, created_at rỗng -> giờ hiện tại (giữ field)');
{
  const b = timBang('ForecastCycles');
  const rec = b.build({ id: 'c-xk-202609', business_unit_code: 'XK', base_month: '2026-09', horizon_months: 4, status: 'draft', created_by: 'a', created_at: '' });
  check('base_month ra đúng dạng yyyy-MM-01', rec.base_month === '2026-09-01', rec.base_month);
  check('created_at rỗng -> VẪN có field, giá trị là giờ hiện tại (không phải bị xoá)',
    'created_at' in rec && typeof rec.created_at === 'string' && rec.created_at !== '', rec);
}

console.log('\n5. ForecastVersions — is_final tường minh, submitted_at nullable giữ null (không xoá field)');
{
  const b = timBang('ForecastVersions');
  const rec = b.build({ id: 'v1', cycle_id: 'c-xk-202609', update_week: 0, update_date: '2026-09-01', iso_week_label: 'W0', submitted_by: '', submitted_at: '', is_final: 1, created_at: new Date(Date.UTC(2026, 8, 1)) });
  check('is_final số 1 -> true', rec.is_final === true);
  check('created_at có giá trị -> giữ ISO thật', rec.created_at === '2026-09-01T00:00:00.000Z', rec.created_at);
  // submitted_at là cột NULLABLE: gửi thẳng null (KHÔNG xoá field) — giữ bộ
  // khoá đồng nhất với mọi dòng khác trong cùng lượt ghi hàng loạt.
  check('submitted_at rỗng -> null (giữ field, không phải chuỗi rỗng)', rec.submitted_at === null, rec.submitted_at);

  // Bug thật bắt được qua migrateXemTruoc_ trên dữ liệu thật 26/09/2026: ô
  // update_date định dạng NGÀY trên Sheet trả về đối tượng Date, và bản đầu
  // dùng msChu_ (String().trim() trần) ép nó thành cả câu
  // "Sat Aug 01 2026 00:00:00 GMT+0700 (Indochina Time)" thay vì "2026-08-01".
  const recDate = b.build({ id: 'v2', cycle_id: 'c1', update_week: 0, update_date: new Date(2026, 7, 1), iso_week_label: 'W0', submitted_by: '', submitted_at: '', is_final: 0, created_at: '' });
  check('update_date là Date thật -> chỉ lấy yyyy-MM-dd, KHÔNG phải cả câu String(Date)',
    recDate.update_date === '2026-08-01', recDate.update_date);
}

console.log('\n6. MonthlyForecastLines — id trống thì tự sinh UUID, quantity số');
{
  const b = timBang('MonthlyForecastLines');
  const rec = b.build({ id: '', version_id: 'v1', sku_code: '1001', forecast_month: '2026-09-01', quantity: '1.234', note: '', updated_at: '', updated_by: 'a' });
  check('id trống -> tự sinh UUID (không rỗng)', typeof rec.id === 'string' && rec.id.length > 0, rec.id);
  check('quantity đọc đúng "1.234" kiểu VN (1 chấm + 3 số sau = nghìn) -> 1234', rec.quantity === 1234, rec.quantity);
}

console.log('\n7. msSo_ — cả hai kiểu Excel (đối chiếu productPaste.test.js)');
{
  const so = sandbox.msSo_;
  check('VN: "1.234.567" -> 1234567', so('1.234.567') === 1234567, so('1.234.567'));
  check('VN: "1.234" (1 chấm, 3 số sau) -> 1234 (nghìn)', so('1.234') === 1234, so('1.234'));
  check('VN: "1.234.567,5" -> 1234567.5', so('1.234.567,5') === 1234567.5, so('1.234.567,5'));
  check('VN: "1234,5" (phẩy thập phân) -> 1234.5', so('1234,5') === 1234.5, so('1234,5'));
  check('EN: "1,234,567" -> 1234567', so('1,234,567') === 1234567, so('1,234,567'));
  check('EN: "1,234" (1 phẩy, 3 số sau) -> 1234 (nghìn)', so('1,234') === 1234, so('1,234'));
  check('EN: "1,234,567.5" -> 1234567.5', so('1,234,567.5') === 1234567.5, so('1,234,567.5'));
  check('EN: "1234.5" (chấm thập phân) -> 1234.5', so('1234.5') === 1234.5, so('1234.5'));
  check('số nguyên trần "3156787"', so('3156787') === 3156787);
  check('số thật (không phải chuỗi) đi thẳng', so(3156787) === 3156787);
  check('khoảng trắng làm dấu nghìn "1 234 567"', so('1 234 567') === 1234567, so('1 234 567'));
  check('NBSP làm dấu nghìn', so('1 234 567') === 1234567, so('1 234 567'));
  check('kèm ký hiệu tiền tệ "1.234.567 d"', so('1.234.567 d') === 1234567, so('1.234.567 d'));
  check('rỗng -> 0', so('') === 0);
  check('null -> 0', so(null) === 0);
}

// Dòng "đủ" (mọi ô có giá trị) và dòng "trống" (mọi ô nullable/mốc thời gian
// để trống) cho 6 bảng còn lại có khả năng lệch bộ khoá — Approvals đã không
// dùng boLoBo_ từ đầu (không cần kiểm lại) nhưng vẫn thêm cho chắc.
const MS_ĐỦ_VÀ_TRỐNG_ = [
  {
    nhan: 'ForecastVersions',
    day: { id: 'v1', cycle_id: 'c1', update_week: 1, update_date: '2026-09-01', iso_week_label: 'W1', submitted_by: 'a', submitted_at: new Date(), is_final: '1', created_at: new Date() },
    trong: { id: 'v2', cycle_id: '', update_week: 0, update_date: '', iso_week_label: '', submitted_by: '', submitted_at: '', is_final: '', created_at: '' }
  },
  {
    nhan: 'MonthlyForecastLines',
    day: { id: 'l1', version_id: 'v1', sku_code: '1001', forecast_month: '2026-09-01', quantity: 5, note: 'x', updated_at: new Date(), updated_by: 'a' },
    trong: { id: '', version_id: '', sku_code: '', forecast_month: '', quantity: '', note: '', updated_at: '', updated_by: '' }
  },
  {
    nhan: 'WeeklyRegionSplits',
    day: { id: 'w1', version_id: 'v1', sku_code: '1001', week_number: 2, region_code: 'MB', quantity: 5, updated_at: new Date(), updated_by: 'a' },
    trong: { id: '', version_id: '', sku_code: '', week_number: '', region_code: '', quantity: '', updated_at: '', updated_by: '' }
  },
  {
    nhan: 'Approvals',
    day: { id: 'a1', cycle_id: 'c1', version_id: 'v1', approver_id: 'admin', status: 'approved', comment: 'ok', requested_by: 'a', requested_at: new Date(), decided_at: new Date() },
    trong: { id: '', cycle_id: '', version_id: '', approver_id: '', status: '', comment: '', requested_by: '', requested_at: '', decided_at: '' }
  },
  {
    nhan: 'ActualSalesResults',
    day: { id: 'r1', business_unit_code: 'XK', sku_code: '1001', actual_month: '2026-09-01', region_code: 'MB', quantity: 5, source_system: 'ZSD450', imported_by: 'a', imported_at: new Date() },
    trong: { id: '', business_unit_code: '', sku_code: '', actual_month: '', region_code: '', quantity: '', source_system: '', imported_by: '', imported_at: '' }
  }
];

console.log('\n8. HỒI QUY — mọi dòng trong 1 bảng phải ra CÙNG bộ khoá (bug thật, 26/09/2026)');
{
  // PostgREST từ chối cả lượt ghi hàng loạt nếu các object trong mảng KHÁC bộ
  // khoá nhau ("All object keys must match") — bản đầu của MigrateToSupabase.gs
  // dùng boLoBo_() xoá field rỗng, nên dòng có business_unit_code/last_login
  // ra khác bộ khoá với dòng không có → GHI THẬT nổ ngay ở bảng Users. Kiểm
  // bằng cách dựng 2 dòng Users CỐ Ý khác nhau nhiều nhất có thể (một dòng đủ
  // mọi trường, một dòng trống gần hết) rồi so JSON.stringify(Object.keys()).
  const b = timBang('Users');
  const day = b.build({
    id: 'u1', full_name: 'A', email: 'a@x.com', role: 'central_admin',
    business_unit_code: 'XK', pin_hash: 'kid$x$y', is_active: '1',
    failed_attempts: 2, locked_until: new Date(), last_login: new Date()
  });
  const trong = b.build({ id: 'u2', full_name: '', email: '', role: '', business_unit_code: '', pin_hash: '', is_active: '', failed_attempts: '', locked_until: '', last_login: '' });
  check('Users: dòng đầy đủ và dòng gần như trống ra CÙNG bộ khoá',
    JSON.stringify(Object.keys(day).sort()) === JSON.stringify(Object.keys(trong).sort()),
    { day: Object.keys(day).sort(), trong: Object.keys(trong).sort() });

  // Áp cho toàn bộ 10 bảng còn lại (trừ Products/BusinessUnits/Regions/
  // ProductGroups vốn không có cột nullable/mốc-thời-gian nào để mà lệch),
  // không riêng Users — để lần sau thêm bảng mới lỡ quên cũng bị bắt ở đây.
  MS_ĐỦ_VÀ_TRỐNG_.forEach(({ nhan, day: dNguon, trong: tNguon }) => {
    const bang = timBang(nhan);
    const d = bang.build(dNguon), t = bang.build(tNguon);
    check(nhan + ': mọi dòng ra cùng bộ khoá dù ô rỗng khác nhau',
      JSON.stringify(Object.keys(d).sort()) === JSON.stringify(Object.keys(t).sort()),
      { day: Object.keys(d).sort(), trong: Object.keys(t).sort() });
  });
}

console.log('\n9. msBoTrungKhoa_ — dọn trùng khoá tổ hợp, GIỮ DÒNG CUỐI (bug thật, 26/09/2026)');
{
  const bo = sandbox.msBoTrungKhoa_;
  const rows = [
    { business_unit_code: 'XK', sku_code: '1001', actual_month: '2026-09-01', region_code: 'MB', quantity: 10 },
    { business_unit_code: 'XK', sku_code: '1002', actual_month: '2026-09-01', region_code: 'MB', quantity: 20 },
    // Trùng dòng đầu — phải bị bỏ, GIỮ dòng này (dòng cuối, quantity 99).
    { business_unit_code: 'XK', sku_code: '1001', actual_month: '2026-09-01', region_code: 'MB', quantity: 99 }
  ];
  const khoa = ['business_unit_code', 'sku_code', 'actual_month', 'region_code'];
  const r = bo(rows, khoa);
  check('bỏ đúng 1 dòng trùng', r.soBoTrung === 1, r.soBoTrung);
  check('còn lại đúng 2 dòng', r.sach.length === 2, r.sach.length);
  const giu = r.sach.filter((x) => x.sku_code === '1001')[0];
  check('giữ DÒNG CUỐI (quantity 99), không phải dòng đầu (quantity 10)', giu.quantity === 99, giu);

  check('không trùng thì giữ nguyên tất cả', bo(rows.slice(0, 2), khoa).soBoTrung === 0);
}

console.log('\n' + pass + ' đạt, ' + fail + ' hỏng');
process.exit(fail ? 1 : 0);
