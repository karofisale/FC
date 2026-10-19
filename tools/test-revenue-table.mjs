/**
 * test-revenue-table.mjs — 19/10/2026: mô hình bảng DOANH THU THỰC HIỆN THEO THÁNG (client/src/utils/revenueTable.js) + nối vào menu / App / api.
 * Chạy: node tools/test-revenue-table.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(pathToFileURL(path.join(ROOT, 'client', 'src', 'utils', 'revenueTable.js')).href);
const doc = (p) => readFileSync(path.join(ROOT, 'client', 'src', p), 'utf8');

let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them !== undefined ? '  → ' + JSON.stringify(them) : '')); }
}
const gan = (a, b) => Math.abs(a - b) < 1e-9;

console.log('--- phanTramDoi ---');
check('tăng 50%', gan(M.phanTramDoi(150, 100), 50));
check('giảm 20%', gan(M.phanTramDoi(80, 100), -20));
check('kỳ trước = 0 -> null (không chia 0)', M.phanTramDoi(5, 0) === null);
check('thiếu một bên -> null', M.phanTramDoi(null, 5) === null && M.phanTramDoi(5, undefined) === null);
check('kỳ trước ÂM: dùng trị tuyệt đối để dấu của % đúng chiều (−100 → 100 là +200%)', gan(M.phanTramDoi(100, -100), 200));

console.log('--- dungBangDoanhThuNam ---');
const months = [
  { bu: 'GT2', month: '2025-06-01', netRevenueVnd: 500, quantity: 5, skus: 2 },
  { bu: 'GT2', month: '2025-12-01', netRevenueVnd: 1000, quantity: 10, skus: 3 },
  { bu: 'GT2', month: '2026-01-01', netRevenueVnd: 0, quantity: 12, skus: 2 },        // có dòng nhưng doanh thu 0
  { bu: 'GT2', month: '2026-03-01', netRevenueVnd: 600, quantity: 4, skus: 1 },
  { bu: 'GT2', month: '2026-04-01', netRevenueVnd: 900, quantity: 6, skus: 2 },
  { bu: 'GT2', month: '2026-06-01', netRevenueVnd: -100, quantity: -1, skus: 1 }       // trả hàng → âm
];
const b = M.dungBangDoanhThuNam(months, 2026);
const r = (t) => b.rows[t - 1];
check('đủ 12 dòng T1..T12, key YYYY-MM-01', b.rows.length === 12 && r(1).key === '2026-01-01' && r(12).key === '2026-12-01');
check('tháng CÓ dòng nhưng 0 đ: coSo = true, doanhThu 0 (khác tháng trống)', r(1).coSo === true && r(1).doanhThu === 0 && r(2).coSo === false && r(2).doanhThu === null);
check('tổng chỉ cộng các tháng có số (0 + 600 + 900 − 100 = 1400), đếm 4 tháng có số', b.tong === 1400 && b.soThangCo === 4, [b.tong, b.soThangCo]);
check('năm trước: 1500 đ trong 2 tháng có số', b.tongNamTruoc === 1500 && b.soThangNamTruocCo === 2);
check('so với THÁNG TRƯỚC: T4 vs T3 = +50%; T3 vs T2 (T2 không có số) = null; T1 vs T12/2025 (1000 → 0) = −100%',
  gan(r(4).momPct, 50) && r(3).momPct === null && gan(r(1).momPct, -100), [r(4).momPct, r(3).momPct, r(1).momPct]);
check('so với CÙNG KỲ năm trước: T6 (−100 vs 500) = −120%; T3 (không có 2025) = null', gan(r(6).yoyPct, -120) && r(3).yoyPct === null);
check('cùng kỳ năm trước hiện đúng số năm trước (T6 = 500, T12 = 1000)', r(6).namTruoc === 500 && r(12).namTruoc === 1000 && r(1).namTruoc === null);
check('tỷ trọng theo tổng cả năm: T4 = 900/1400; tháng trống = null', gan(r(4).tyTrong, 900 / 1400 * 100) && r(2).tyTrong === null);
check('maxDoanhThu = trị tuyệt đối lớn nhất (900)', b.maxDoanhThu === 900);
check('số lượng / số mã giữ nguyên (T1: 12 cái, 2 mã)', r(1).soLuong === 12 && r(1).soMa === 2);

const g = M.dungBangDoanhThuNam([{ month: '2026-02-01', netRevenueVnd: 100, quantity: 1, skus: 1 }, { month: '2026-02-01', netRevenueVnd: 50, quantity: 2, skus: 1 }], 2026);
check('nhiều đơn vị cùng tháng được GỘP theo tháng (150 đ, 3 cái, 2 mã)', g.rows[1].doanhThu === 150 && g.rows[1].soLuong === 3 && g.rows[1].soMa === 2);
const rong = M.dungBangDoanhThuNam([], 2026);
check('không có dữ liệu: 12 dòng trống, tổng 0, không lỗi', rong.rows.length === 12 && rong.rows.every((x) => !x.coSo) && rong.tong === 0 && rong.soThangCo === 0);
check('đầu vào null / dữ liệu hỏng không làm sập', M.dungBangDoanhThuNam(null, 2026).tong === 0 && M.dungBangDoanhThuNam([{ month: '2026-01-01', netRevenueVnd: 'abc', quantity: null, skus: undefined }], 2026).rows[0].doanhThu === 0);

console.log('--- chiTietThang ---');
const ct = M.chiTietThang([
  { skuCode: 'B', skuName: 'Bơm', quantity: 4, netRevenueVnd: 400, invoiceLines: 2 },
  { skuCode: 'A', skuName: 'Máy', quantity: 2, netRevenueVnd: 1200, invoiceLines: 1 },
  { skuCode: 'C', skuName: 'Hàng tặng', quantity: 5, netRevenueVnd: 0, invoiceLines: 1 },
  { skuCode: 'D', skuName: 'Trả hàng', quantity: -1, netRevenueVnd: -100, invoiceLines: 1 }
]);
check('xếp doanh thu GIẢM DẦN: A (1200) → B (400) → C (0) → D (−100)', ct.map((x) => x.skuCode).join('') === 'ABCD', ct.map((x) => x.skuCode));
check('đơn giá thực tế = doanh thu ÷ số lượng (A = 600; B = 100; trả hàng D = 100)', ct[0].donGia === 600 && ct[1].donGia === 100 && ct[3].donGia === 100);
check('hàng tặng (doanh thu 0) có đơn giá 0; số lượng 0 không chia 0', ct[2].donGia === 0 && M.chiTietThang([{ skuCode: 'X', quantity: 0, netRevenueVnd: 50 }])[0].donGia === 0);
check('tỷ trọng theo tổng của tháng (A = 1200/1500 = 80%)', gan(ct[0].tyTrong, 80));
check('danh sách rỗng', M.chiTietThang([]).length === 0 && M.chiTietThang(null).length === 0);

console.log('--- nối vào menu / App / api / trang ---');
const menu = doc('utils/menu.js'), app = doc('App.jsx'), api = doc('services/api.js'), page = doc('pages/ActualRevenue.jsx');
check('menu có mục "Doanh thu Thực hiện" (id revenue) ngay sau Sản lượng Thực hiện, không khoá vai trò', /id: 'actuals'[^\n]*\n\s*\{ id: 'revenue', label: 'Doanh thu Thực hiện'/.test(menu.replace(/\r\n/g, '\n')) && !/id: 'revenue'[^\n]*roles:/.test(menu));
check('App render tab revenue bằng trang ActualRevenue (lazy)', /React\.lazy\(\(\) => import\('\.\/pages\/ActualRevenue'\)\)/.test(app) && /activeTab === 'revenue'/.test(app));
check('api.getActualRevenue gọi action getActualRevenue', /getActualRevenue: \(params = \{\}\) => callGAS\('getActualRevenue', auth\(params\)\)/.test(api));
check('trang tải 24 tháng (năm trước + năm xem) và chi tiết từng tháng với detail:true', /from: `\$\{namSo - 1\}-01`, to: `\$\{namSo\}-12`/.test(page) && /detail: true/.test(page));
check('trang chỉ ĐỌC (không gọi saveActuals / sapImport)', !/saveActuals|sapImport/.test(page));
check('trang báo rõ khi máy chủ chưa có bảng (missing)', /thieuBang/.test(page) && /SQL đợt 12/.test(page));

console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
process.exit(fail ? 1 : 0);
