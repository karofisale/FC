/**
 * dot3-tung-man.test.js — chốt ĐỢT 3 (10/10/2026): sửa từng màn của FC (điện thoại, hết phiên, Bảng 0/1, Thực hiện, Phê duyệt,
 * Kế hoạch năm, Tổng quan, Xuất báo cáo, Menu, dọn dẹp).
 *
 * Cùng cách làm với dot2-khung-ui.test.js (không có jsdom):
 *  - LOGIC THUẦN nạp thật từ client/src và chạy (đếm ô ghi đè, rải đều, hợp nhất số SAP, gom kế hoạch năm chờ duyệt, định dạng tiền,
 *    tạo .zip rồi giải nén lại, dựng file ZPP702...) — không stub hàm nào của dự án;
 *  - HỢP ĐỒNG TRONG MÃ NGUỒN của phần giao diện (ngăn kéo, hộp đăng nhập lại, hộp xác nhận trước khi ghi đè, tab Chờ duyệt / Lịch sử...) —
 *    đọc file .jsx và bắt mẫu, để ai đó lỡ bỏ đi là bài này đỏ. Phần nhìn thấy được đã thử bằng trình duyệt thật (app-harness.html,
 *    annual-harness.html) — xem báo cáo Đợt 3.
 *
 *   node test/dot3-tung-man.test.js
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'client/src');
let pass = 0, fail = 0;
function check(ten, dk, them) {
  if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them !== undefined ? '  -> ' + JSON.stringify(them) : '')); }
}
const doc = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const imp = (f) => import(pathToFileURL(path.join(SRC, f)).href);
const clientNodeModules = path.join(ROOT, 'client/node_modules');
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(jsx|js)$/.test(e.name)) yield p;
  }
}
const tatCaNguon = [...walk(SRC)].map((p) => ({ rel: path.relative(SRC, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf8') }));
const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

async function main() {
  // =====================================================================
  console.log('--- 1. Điện thoại: ngăn kéo menu; hết phiên không mất số đang nhập ---');
  const sb = doc('components/Sidebar.jsx');
  const hd = doc('components/Header.jsx');
  const app = doc('App.jsx');
  check('Sidebar: trên điện thoại là ngăn kéo cố định trượt từ trái (translate-x), từ md: trở lên là cột tĩnh', /fixed inset-y-0 left-0/.test(sb) && /-translate-x-full invisible/.test(sb) && /md:static/.test(sb) && /md:translate-x-0/.test(sb));
  check('Sidebar: có nút Đóng (X), nền mờ bấm để đóng, Esc đóng, khoá cuộn trang nền, trả focus khi đóng', /aria-label="Đóng menu"/.test(sb) && /onClick=\{onClose\}/.test(sb) && /'Escape'/.test(sb) && /document\.body\.style\.overflow = 'hidden'/.test(sb) && /truoc\.focus\(\)/.test(sb));
  check('Sidebar: kéo rộng cửa sổ lên >= 768px thì tự đóng (không kẹt khoá cuộn); chọn mục thì đóng ngăn kéo', /\(min-width: 768px\)/.test(sb) && /onClose\?\.\(\)/.test(sb) && /const chon = \(id\) =>/.test(sb));
  check('Sidebar: trạng thái thu gọn chỉ áp dụng cho cột cố định (tiền tố md:) — ngăn kéo luôn hiện đủ chữ', /collapsed \? 'md:w-16' : 'md:w-64'/.test(sb) && /collapsed \? 'md:hidden'/.test(sb) && !/\$\{collapsed \? 'hidden'/.test(sb));
  check('Sidebar: không dùng khung "fixed inset-0" tự viết (nền mờ dùng inset-y-0 inset-x-0) — rule modal của đợt 2 vẫn nguyên', !/fixed inset-0/.test(sb));
  check('Header: nút ☰ chỉ hiện dưới md, có aria-label / aria-controls / aria-expanded; tên app + vai trò rút gọn trên màn nhỏ', /md:hidden[^"]*"\s*>\s*<Menu/.test(hd.replace(/\s+/g, ' ')) || (/aria-label="Mở menu"/.test(hd) && /aria-controls="menu-chinh"/.test(hd) && /aria-expanded=\{menuOpen\}/.test(hd)));
  check('Header: tiêu đề + tên người dùng ẩn trên màn nhỏ (hidden sm:), ô chọn đơn vị có max-w để không tràn', /hidden sm:block text-base/.test(hd) && /hidden sm:block">/.test(hd) && /max-w-\[7\.5rem\]/.test(hd));
  check('App: nội dung full-width trên điện thoại (min-w-0, p-3), nút ☰ nối với ngăn kéo', /<main className="flex-1 min-w-0 p-3/.test(app) && /onOpenMenu=\{\(\) => setMenuMo\(true\)\}/.test(app) && /open=\{menuMo\}/.test(app));
  // Hết phiên
  const relo = doc('components/ReloginDialog.jsx');
  check('hết phiên: App KHÔNG gỡ về Login nữa — onUnauthorized chỉ xoá token + hiện hộp đăng nhập lại, giữ nguyên session / state các trang', /setHetPhien\(\{ thongBao:/.test(app) && !/onUnauthorized\(\(err\) => \{[\s\S]{0,200}setSession\(null\)/.test(app) && /\{hetPhien && \(\s*<ReloginDialog/.test(app));
  check('hết phiên: đăng nhập lại CÙNG người thì không đổi session (loadInitialData không chạy lại -> trang không bị dựng lại); khác người thì nạp lại từ đầu', /u\.id !== session\?\.user\?\.id\) setSession\(getSession\(\)\)/.test(app) && /Số đang nhập vẫn còn/.test(app));
  check('ReloginDialog: dùng <Dialog> chung, không đóng bằng Esc / bấm nền, tự focus ô PIN, có nút Đăng xuất, dặn người dùng bấm lại thao tác dở', /<Dialog/.test(relo) && /onClose=\{\(\) => \{\}\}/.test(relo) && /data-autofocus/.test(relo) && /Đăng xuất/.test(relo) && /bấm lại/.test(relo) && /from '\.\.\/services\/auth'/.test(relo));
  check('chữ "Máy chủ đang khởi động lại" (thời GAS) đã bỏ khỏi mọi chữ người dùng thấy trong client/src (chú thích lịch sử của gasClient không tính); thay bằng câu đúng với Supabase', !tatCaNguon.some((f) => /khởi động lại/.test(boChuThich(f.text))) && /Không kết nối được máy chủ — đang thử lại/.test(app) && /Không kết nối được máy chủ — đang thử lại/.test(doc('pages/Login.jsx')));
  const gas = doc('services/gasClient.js');
  check('gasClient: thông báo hết giờ không còn nhắc "khởi động lại" / Apps Script, khuyên kiểm tra mạng', !/khởi động lại sau thời gian nghỉ/.test(gas) && /Kiểm tra mạng rồi bấm "Thử lại"/.test(gas));

  // =====================================================================
  console.log('--- 2. Bảng 0 / Bảng 1 / Thực hiện: lăn chuột, ghi đè, Gửi phê duyệt ---');
  const gr = await imp('utils/useGridEditing.js');
  let blurred = 0;
  gr.CHAN_LAN_CHUOT.onWheel({ currentTarget: { blur: () => { blurred++; } } });
  check('CHAN_LAN_CHUOT.onWheel bỏ focus ô (trang cuộn bình thường, số giữ nguyên)', blurred === 1);
  ['pages/MonthlyForecast.jsx', 'pages/WeeklyForecast.jsx', 'pages/Actuals.jsx'].forEach((f) => {
    const s = doc(f);
    const oSo = s.match(/<input[^>]*?type="number"[\s\S]*?\/>/g) || [];
    check(`${f}: MỌI ô type="number" (${oSo.length}) đều chặn lăn chuột`, oSo.length > 0 && oSo.every((o) => /\{\.\.\.CHAN_LAN_CHUOT\}/.test(o)), oSo.filter((o) => !/CHAN_LAN_CHUOT/.test(o)).length);
  });
  const go = await imp('utils/gridOverwrite.js');
  const co = { 'A_t1': 0, 'B_t1': 30, 'C_t1': 50, 'D_t1': 50 };
  const lay = (k, c) => co[`${k}_${c}`] || 0;
  const d1 = go.demGhiDe([{ rowKey: 'A', col: 't1', value: 50 }, { rowKey: 'B', col: 't1', value: 50 }, { rowKey: 'C', col: 't1', value: 50 }, { rowKey: 'D', col: 't1', value: '50' }], lay);
  check('demGhiDe: ô đang 0 điền vào KHÔNG tính ghi đè; ô đang có số khác số mới thì tính; ô đã bằng số mới thì không', d1.ghiDe === 1 && d1.tongCu === 30 && d1.thayDoi === 2 && d1.tong === 4, d1);
  check('demGhiDe: dán chuỗi kiểu Excel ("1.234") đọc đúng số', go.demGhiDe([{ rowKey: 'B', col: 't1', value: '1.234' }], lay).ghiDe === 1);
  check('cauHoiGhiDe: không có ô nào bị đè thì rỗng (khỏi hỏi); có thì nói rõ số ô + tổng + chưa lưu', go.cauHoiGhiDe({ ghiDe: 0, tongCu: 0 }, 'x') === '' && /29 ô đang có số \(tổng 2\.870\)/.test(go.cauHoiGhiDe({ ghiDe: 29, tongCu: 2870 }, 'Điền...')) && /Lưu bản thảo/.test(go.cauHoiGhiDe({ ghiDe: 1, tongCu: 5 }, 'x')));
  const mf = doc('pages/MonthlyForecast.jsx');
  const wf = doc('pages/WeeklyForecast.jsx');
  check('Copy tháng (Bảng 0) hỏi trước khi ghi đè: appConfirm danger, nhãn nói rõ số ô, trước handleCellsChange', /const handleCopyLastMonth = async \(\) =>/.test(mf) && /demGhiDe\(updates, layGiaTriO\)/.test(mf) && /okLabel: `Ghi đè \$\{dem\.ghiDe\.toLocaleString\('vi-VN'\)\} ô`, danger: true/.test(mf));
  const hamCopy = mf.slice(mf.indexOf('const handleCopyLastMonth'), mf.indexOf('const handleLayTuKeHoachNam') > 0 ? mf.indexOf('/**\n   * "Lấy từ kế hoạch năm"') : undefined);
  check('Copy tháng: câu hỏi nằm TRƯỚC lệnh ghi (appConfirm xuất hiện trước handleCellsChange(updates))', hamCopy.indexOf('appConfirm') > 0 && hamCopy.indexOf('appConfirm') < hamCopy.indexOf('handleCellsChange(updates)'));
  check('"Điền xuống cả cột" (Bảng 0 và Bảng 1) hỏi trước qua xacNhanDienCot; hook fillColumnDown chờ xác nhận rồi mới ghi', /xacNhanDienCot: async \(updates, colIdx, value\)/.test(mf) && /xacNhanDienCot: async \(updates, colIdx, value\)/.test(wf)
    && /await xacNhanDienCot\(updates, colIdx, value\)/.test(doc('utils/useGridEditing.js')) && /Điền xuống cả cột\?/.test(mf) && /Điền xuống cả cột\?/.test(wf));
  [['pages/MonthlyForecast.jsx', mf, 'Gửi kế hoạch Forecast của đơn vị'], ['pages/WeeklyForecast.jsx', wf, 'Kiểm tra và gửi kế hoạch Forecast của đơn vị']].forEach(([f, s, cum]) => {
    const h = s.slice(s.indexOf('const handleSubmit = async'));
    const hamSubmit = h.slice(0, h.indexOf('setSaving(true)'));
    check(`${f}: Gửi phê duyệt hỏi lại TRƯỚC khi lưu/gửi, nói rõ đơn vị + chu kỳ + bản + tổng`, hamSubmit.includes(cum) && /\$\{currentBU\}/.test(hamSubmit) && /monthLabelFull\(selectedCycle\.base_month\)/.test(hamSubmit) && /nhanBan/.test(hamSubmit) && /okLabel: 'Gửi phê duyệt'/.test(hamSubmit) && /\)\)\) return;/.test(hamSubmit));
  });

  // =====================================================================
  console.log('--- 3. Bảng 1: Mã SKU dính trái, chỉ dòng lệch, rải đều tất cả dòng lệch ---');
  const wd = await imp('utils/weeklyDistribute.js');
  // bản sao NGUYÊN VĂN cách tính cũ của distributeEvenly (trước Đợt 3) để chứng minh logic dùng lại không đổi
  const cuRaiDeu = (total, tuan, mien) => { const cells = tuan.flatMap((w) => mien.map((r) => `${w}_${r}`)); const per = Math.floor(total / cells.length); const du = total - per * cells.length; return cells.map((k, i) => [k, i === cells.length - 1 ? per + du : per]); };
  let khop = true;
  [0, 1, 7, 10, 99, 100, 1234, 5001].forEach((t) => {
    const moi = wd.capNhatRaiDeu('S', t, [1, 2, 3, 4, 5], ['MB', 'MN']).map((u) => [`${u.col.week}_${u.col.region}`, u.value]);
    if (JSON.stringify(moi) !== JSON.stringify(cuRaiDeu(t, [1, 2, 3, 4, 5], ['MB', 'MN']))) khop = false;
  });
  check('rải đều từng dòng: kết quả GIỐNG HỆT cách tính cũ (floor(tổng / số ô), phần dư dồn ô cuối) với nhiều tổng khác nhau', khop);
  check('chiaDeu: 10 chia 3 ô = 3 + dư 1; 0 ô không chia', JSON.stringify(wd.chiaDeu(10, 3)) === '{"moiO":3,"phanDu":1}' && wd.chiaDeu(10, 0).moiO === 0);
  const tuan = [1, 2], mien = ['MB', 'MN'];
  const monthly = { A: 100, B: 40, C: 0, D: 30, E: 8 };
  const weekly = { A_1_MB: 25, A_1_MN: 25, A_2_MB: 25, A_2_MN: 25, B_1_MB: 10, B_1_MN: 10, B_2_MB: 10, B_2_MN: 20, C_1_MB: 5, D_1_MB: 31, E_2_MN: 8 };
  const ds = ['A', 'B', 'C', 'D', 'E'].map((s) => ({ sku_code: s }));
  const lech = wd.tapSkuLech(ds, monthly, weekly, tuan, mien);
  check('tapSkuLech: A khớp -> không; B (50 ≠ 40), C (5 ≠ 0), D (31 ≠ 30), E (8 ≠ 8? E tuần 8 = tháng 8 nên khớp) -> B, C, D', [...lech].sort().join() === 'B,C,D', [...lech]);
  const kq = wd.tinhRaiDeuTatCa({ danhSach: ds, monthlyMap: monthly, weeklyMap: weekly, tuan, mien });
  check('rải đều tất cả: B và D được rải (có số tháng > 0), C lệch nhưng số tháng = 0 nên KHÔNG đụng (boQua = 1)', kq.dong === 2 && kq.boQua === 1 && kq.updates.length === 8, [kq.dong, kq.boQua, kq.updates.length]);
  const sauKhiRai = { ...weekly };
  kq.updates.forEach((u) => { sauKhiRai[`${u.rowKey}_${u.col.week}_${u.col.region}`] = u.value; });
  check('sau khi áp, B và D hết lệch (tổng tuần/miền = số tháng), A / E không bị đụng', wd.tongTuanCua('B', sauKhiRai, tuan, mien) === 40 && wd.tongTuanCua('D', sauKhiRai, tuan, mien) === 30 && wd.tongTuanCua('A', sauKhiRai, tuan, mien) === 100 && !kq.updates.some((u) => u.rowKey === 'A' || u.rowKey === 'E'));
  check('oGhiDe đếm đúng số ô đang có số khác 0 sẽ đổi giá trị (B: ô (2,MN) 20 -> 10 = 1; D: ô (1,MB) 31 -> 7 = 1... )', typeof kq.oGhiDe === 'number' && kq.oGhiDe >= 2, kq.oGhiDe);
  check('không có dòng lệch -> dong = 0, không có cập nhật nào', wd.tinhRaiDeuTatCa({ danhSach: [{ sku_code: 'A' }], monthlyMap: monthly, weeklyMap: weekly, tuan, mien }).updates.length === 0);
  check('Bảng 1: cột Mã SKU dính trái (header + thân + dòng tổng), có viền bóng thay cho border-collapse', (wf.match(/sticky left-0 z-(30|10)/g) || []).length >= 3 && /sticky left-0 z-30 bg-slate-800 shadow-\[inset_-1px_0_0_#475569\]/.test(wf) && /sticky left-0 z-10 bg-white shadow-\[inset_-1px_0_0_#e2e8f0\]/.test(wf));
  check('Bảng 1: ô lọc "Chỉ dòng lệch (n)" + nút "Rải đều tất cả dòng lệch"; danh sách lệch được CHỐT (không nhảy dòng khi gõ)', /Chỉ dòng lệch \(\{soDongLech/.test(wf) && /Rải đều tất cả dòng lệch/.test(wf) && /lechSkus\.has\(String\(p\.sku_code\)\)/.test(wf) && /tapSkuLech\(/.test(wf));
  check('Rải đều tất cả: xem trước (số dòng, số ô đổi, số dòng bỏ qua) + appConfirm danger TRƯỚC khi ghi; dùng lại tinhRaiDeuTatCa, không công thức mới', /const raiDeuTatCaLech = async/.test(wf) && /tinhRaiDeuTatCa\(\{ danhSach: filteredProducts, monthlyMap, weeklyMap, tuan: weeks, mien: regionCodes, tuanDon, mienDon, tatCa \}/.test(wf) && /title: tatCa \? \(tuanDon === undefined \? 'Rải đều TẤT CẢ các dòng\?' : `Dồn TẤT CẢ các dòng vào \$\{tenDon\}\?`\) : \(tuanDon === undefined \? 'Rải đều tất cả dòng lệch\?' : `Dồn tất cả dòng lệch vào \$\{tenDon\}\?`\), okLabel: `\$\{tuanDon === undefined \? 'Rải đều' : 'Dồn vào ' \+ tenDon\} \$\{kq\.dong\.toLocaleString\('vi-VN'\)\} dòng`, danger: true/.test(wf)
    && wf.indexOf('appConfirm(', wf.indexOf('const raiDeuTatCaLech')) < wf.indexOf('handleCellsChange(kq.updates)'));
  // ---- Phân bổ lại TẤT CẢ các dòng (kể cả dòng đang khớp): sửa bản thảo phân bổ sai cách ----
  const kqTatCa = wd.tinhRaiDeuTatCa({ danhSach: ds, monthlyMap: monthly, weeklyMap: weekly, tuan, mien, tuanDon: 1, tatCa: true });
  const sauTatCa = { ...weekly };
  kqTatCa.updates.forEach((u) => { sauTatCa[`${u.rowKey}_${u.col.week}_${u.col.region}`] = u.value; });
  check('tatCa: A (đang khớp, rải đều) cũng được dồn vào tuần 1 miền MB (100), miền MN và tuần 2 = 0; C (tháng 0, đang lệch) bỏ qua và được ĐẾM để báo; mọi dòng có số tháng > 0 hết lệch',
    kqTatCa.dong === 4 && kqTatCa.boQua === 1 && sauTatCa.A_1_MB === 100 && sauTatCa.A_1_MN === 0 && sauTatCa.A_2_MB === 0 && sauTatCa.A_2_MN === 0
    && ['A', 'B', 'D', 'E'].every((k) => wd.tongTuanCua(k, sauTatCa, tuan, mien) === monthly[k]) && !kqTatCa.updates.some((u) => u.rowKey === 'C'), [kqTatCa.dong, kqTatCa.boQua, sauTatCa]);
  check('không có tatCa: A (đang khớp) KHÔNG bị đụng (hành vi cũ giữ nguyên)', !wd.tinhRaiDeuTatCa({ danhSach: ds, monthlyMap: monthly, weeklyMap: weekly, tuan, mien, tuanDon: 1 }).updates.some((u) => u.rowKey === 'A'));
  check('Bảng 1: có nút "Rải đều / Dồn tất cả các dòng" (hỏi xác nhận, chỉ dòng đang hiển thị) dùng chung hàm raiDeuTatCaLech(true)', /onClick=\{\(\) => raiDeuTatCaLech\(true\)\}/.test(wf) && /onClick=\{\(\) => raiDeuTatCaLech\(false\)\}/.test(wf) && /Rải đều tất cả các dòng/.test(wf) && /Dồn tất cả các dòng vào \$\{tenDon\}/.test(wf) && /Rải đều TẤT CẢ các dòng\?/.test(wf) && /tuanDon, mienDon, tatCa \}\)/.test(wf));

  // ---- Cảnh báo lệch mà "không thấy SKU ở bảng nào": SKU ngoài danh mục + ô tuần/miền không hiện (26/10/2026) ----
  const dmBat = [{ sku_code: 'A' }, { sku_code: 'B' }];
  const ngoai = wd.skuNgoaiDanhMuc(dmBat, { A: 10, X1: 40, X2: 0 }, { A_1_MB: 10, X2_2_MB: 12, '2013100164_1_MN': 5, B_3_MN: 0 }, { X2: 'Lõi XK', '2013100164': 'Lõi 164' });
  check('skuNgoaiDanhMuc: SKU có số tháng (X1) hoặc số ô tuần/miền (X2, 2013100164) mà không có trong danh mục -> dòng riêng có nhãn _ngoai, tên lấy từ server; mã trong danh mục / ô = 0 không tính',
    ngoai.map((x) => x.sku_code).join() === '2013100164,X1,X2' && ngoai.every((x) => x._ngoai === true) && ngoai.find((x) => x.sku_code === 'X2').name === 'Lõi XK' && ngoai.find((x) => x.sku_code === 'X1').name === 'X1', ngoai);
  check('skuCuaKhoa: bỏ đúng hai hậu tố cuối (mã có dấu gạch dưới vẫn đúng)', wd.skuCuaKhoa('A_B_2_MB') === 'A_B' && wd.skuCuaKhoa('1001_1_MN') === '1001');
  const oan = wd.oAnCuaBang({ A_1_MB: 5, A_9_MB: 7, A_2_XX: 3, A_2_MB: 0, B_1_MN: 4 }, [1, 2, 3], ['MB', 'MN']);
  check('oAnCuaBang: ô có số ở tuần 9 và miền XX là "ẩn"; ô trong bảng và ô = 0 không phải', oan.map((o) => o.khoa).join() === 'A_9_MB,A_2_XX' && oan[0].sl === 7 && oan[0].sku === 'A' && oan[1].mien === 'XX', oan);
  check('Bảng 1: dòng ngoài danh mục (tatCa = danh mục + skuNgoai) vào bảng, hàng tổng, đếm dòng lệch, lọc lệch; có nhãn "ngoài danh mục"; ghi chú nguyên nhân cho từng SKU trong cảnh báo',
    /const tatCa = useMemo\(\(\) => \{/.test(wf) && /return tatCa\.filter\(\(p\) => \{/.test(wf) && /tatCa\.filter\(\(p\) => laDongLech/.test(wf) && /tatCa\.forEach\(\(p\) => \{\s*thang \+=/.test(wf)
    && /skuNgoaiDanhMuc\(c\.products, mMap, wMap, tenMa\)/.test(wf) && /p\._ngoai && <span/.test(wf) && /ghiChu=\{ghiChuLech\}/.test(wf) && /onChon=\{\(ma\) =>/.test(wf));
  check('Xoá số ở ô không hiển thị: hỏi xác nhận, thành một bước Hoàn tác, hoàn tác / bỏ thay đổi tính lại danh sách ô ẩn',
    /const xoaOAn = async \(\) => \{/.test(wf) && /title: 'Xoá số ở ô không hiển thị\?'/.test(wf) && /setLichSu\(\(h\) => \[\.\.\.h\.slice\(-29\), buoc\]\);\s*setWeeklyMap\(\(prev\) => \{ const next = \{ \.\.\.prev \}; oAn\.forEach/.test(wf)
    && /setOAn\(oAnCuaBang\(kq\.weeklyMap, weeks, regionCodes\)\)/.test(wf) && /setOAn\(oAnCuaBang\(daLuuRef\.current, weeks, regionCodes\)\)/.test(wf));
  const vaSrc = doc('components/ValidationAlert.jsx');
  check('ValidationAlert: ghi chú nguyên nhân dưới từng SKU + bấm mã để lọc bảng (props tuỳ chọn, không đổi nơi khác)', /ghiChu = \{\}, onChon/.test(vaSrc) && /ghiChu\[String\(m\.sku_code\)\.trim\(\)\]/.test(vaSrc) && /onClick=\{\(\) => onChon\(String\(m\.sku_code\)\)\}/.test(vaSrc));
  check('Forecast 4 tháng: khung cảnh báo mã ngoài danh mục có nút "Đưa số của n mã này về 0" (hỏi xác nhận, đi qua handleCellsChange như mọi sửa ô, chỉ khi canWrite)',
    /const xoaSoMaNgoaiDanhMuc = async \(\) => \{/.test(mf) && /title: 'Xoá số của mã ngoài danh mục\?'/.test(mf) && /updates\.push\(\{ rowKey: ma, col: m, value: 0 \}\)/.test(mf) && /if \(updates\.length\) handleCellsChange\(updates\);/.test(mf)
    && /\{canWrite && \(\s*<button\s+type="button"\s+onClick=\{xoaSoMaNgoaiDanhMuc\}/.test(mf));
  // ---- Forecast 4 tháng: mã ngoài danh mục hiện thành dòng riêng VÀ tính vào tổng (26/10/2026) ----
  const sn = await imp('utils/skuNgoai.js');
  const dm = [{ sku_code: 'A' }, { sku_code: '1001' }];
  const fmap = { 'A_2026-10-01': 5, '1001_2026-10-01': 0, '2013100163_2026-10-01': 300, '2013100163_2026-11-01': 0, '2013100164_2026-11-01': 300, 'X_Y_2026-10-01': 0, '2001020023_2026-12-01': 150 };
  check('maNgoaiDanhMucThang: mã có số ở bất kỳ tháng nào mà không có trong danh mục (3 mã), bỏ mã trong danh mục và mã chỉ có ô 0; sắp theo mã',
    sn.maNgoaiDanhMucThang(dm, fmap).join() === '2001020023,2013100163,2013100164', sn.maNgoaiDanhMucThang(dm, fmap));
  const dn = sn.dongNgoaiDanhMuc(['2013100163', 'ZZ'], { '2013100163': { sku_code: '2013100163', name: 'Bình nóng 1L', product_group_code: 'G1', avg_price: 5, default_channel: 'XK' } });
  check('dongNgoaiDanhMuc: có thông tin thì lấy tên / nhóm / giá / kênh; chưa tra được thì chỉ có mã; luôn gắn _ngoai',
    dn[0].name === 'Bình nóng 1L' && dn[0].avg_price === 5 && dn[0].default_channel === 'XK' && dn[0]._ngoai === true && dn[1].name === 'ZZ' && dn[1].product_group_code === '' && dn[1]._ngoai === true, dn);
  check('Forecast 4 tháng: tatCa = danh mục + mã ngoài danh mục dùng cho bảng, bộ lọc, HÀNG TỔNG / doanh thu và Copy từ tháng; danh sách chốt lúc tải (setMaNgoai trong applyLines)',
    /const tatCa = useMemo\(\(\) => \{/.test(mf) && /return tatCa\.filter\(\(p\) => \{/.test(mf) && /tatCa\.forEach\(\(p\) => \{\s*const nhom = /.test(mf) && /const updates = tatCa\.map\(\(p\) => \(\{/.test(mf)
    && /setMaNgoai\(maNgoaiDanhMucThang\(dsSp \|\| productsRef\.current, map\)\)/.test(mf) && /applyLines\(ws\.lines \|\| \[\], ws\.products \|\| \[\]\)/.test(mf) && /\}, \[tatCa, forecastMap, months\]\);/.test(mf));
  check('Forecast 4 tháng: dòng ngoài danh mục có nhãn "ngoài danh mục"; khung cảnh báo nói rõ ĐƯỢC TÍNH vào tổng (không còn "KHÔNG được tính")',
    /p\._ngoai && <span/.test(mf) && /ĐƯỢC TÍNH vào hàng tổng/.test(mf) && !/KHÔNG được tính vào bảng dưới/.test(mf) && /api\.getProducts\(\{\}\)\s*\.then\(\(ds\) => \{\s*if \(huy\) return;\s*const quan = new Set\(maNgoai\)/.test(mf));
  check('nút rải đều từng dòng dùng chung capNhatRaiDeu (một cách tính)', /capNhatRaiDeu\(skuCode, monthlyMap\[skuCode\] \|\| 0, weeks, regionCodes, tuanDon, mienDon\)/.test(wf));

  // ---- Ô chọn miền + Hoàn tác (25/10/2026) ----
  check('Bảng 1: khi dồn vào một tuần có ô chọn "Miền" (mặc định MB, nhớ lựa chọn, miền lạ quay về MB); nhãn nút / tiêu đề kèm miền',
    /usePersistedState\('weeklyMienDon', 'MB', laChuoi\)/.test(wf) && /mienDonHopLe\(mienDonChon, regionCodes\)/.test(wf) && /const tenDon = tuanDon === undefined \? '' : `Tuần \$\{tuanDon\} · \$\{mienDon\}`/.test(wf)
    && /aria-label="Miền nhận số khi dồn vào một tuần"/.test(wf) && /\{canWrite && tuanDon !== undefined && \(/.test(wf) && /một ô, không chia cho miền khác/.test(wf));
  const luu = { A_1_MB: 5, A_1_MN: 5 };
  const bUp = [{ rowKey: 'A', col: { week: 1, region: 'MB' }, value: '10' }, { rowKey: 'A', col: { week: 1, region: 'MN' }, value: 0 }, { rowKey: 'B', col: { week: 2, region: 'MB' }, value: 7 }];
  const buoc = wd.lapBuocHoanTac(bUp, luu);
  check('lapBuocHoanTac: ghi lại số CŨ của từng ô (A_1_MB 5, A_1_MN 5, B_2_MB 0)', JSON.stringify(buoc) === '[{"key":"A_1_MB","cu":5},{"key":"A_1_MN","cu":5},{"key":"B_2_MB","cu":0}]', buoc);
  check('lapBuocHoanTac: đợt không đổi ô nào -> null (không thành bước)', wd.lapBuocHoanTac([{ rowKey: 'A', col: { week: 1, region: 'MB' }, value: 5 }], luu) === null);
  const hien = { A_1_MB: 10, A_1_MN: 0, B_2_MB: 7 };
  const dirtyTruoc = new Set(['A_1_MB', 'A_1_MN', 'B_2_MB']);
  const ht = wd.apHoanTac(buoc, hien, dirtyTruoc, luu);
  check('apHoanTac: ô về đúng số cũ; ô trở về số ĐÃ LƯU thì hết "chưa lưu" (A_1_MB, A_1_MN, B_2_MB đều về mốc đã lưu -> dirty rỗng)', ht.weeklyMap.A_1_MB === 5 && ht.weeklyMap.A_1_MN === 5 && ht.weeklyMap.B_2_MB === 0 && ht.dirty.size === 0, [ht.weeklyMap, [...ht.dirty]]);
  const buoc2 = wd.lapBuocHoanTac([{ rowKey: 'A', col: { week: 1, region: 'MB' }, value: 20 }], { A_1_MB: 10 });
  const ht2 = wd.apHoanTac(buoc2, { A_1_MB: 20 }, new Set(['A_1_MB']), luu);
  check('hoàn tác nhiều lớp: về số 10 (chưa phải số đã lưu 5) thì ô VẪN "chưa lưu"', ht2.weeklyMap.A_1_MB === 10 && ht2.dirty.has('A_1_MB'));
  check('Bảng 1: nút "Hoàn tác" (bước gần nhất: dán / điền / phân bổ) + "Bỏ thay đổi chưa lưu" (hỏi xác nhận); bước hoàn tác được lập trong handleCellsChange, xoá sau khi lưu / tải',
    /const hoanTac = \(\) => \{/.test(wf) && /const boThayDoi = async \(\) => \{/.test(wf) && /onClick=\{hoanTac\}/.test(wf) && /onClick=\{boThayDoi\}/.test(wf) && /disabled=\{lichSu\.length === 0\}/.test(wf) && /disabled=\{dirtyKeys\.size === 0\}/.test(wf)
    && /lapBuocHoanTac\(updates\.map/.test(wf) && /apHoanTac\(buoc, weeklyMap, dirtyKeys, daLuuRef\.current\)/.test(wf) && /title: 'Bỏ thay đổi chưa lưu\?', okLabel: 'Bỏ thay đổi', danger: true/.test(wf)
    && /daLuuRef\.current = \{ \.\.\.wMap \};\s*setLichSu\(\[\]\);/.test(wf) && /daLuuRef\.current = \{ \.\.\.weeklyMap \};\s*setLichSu\(\[\]\);/.test(wf));

  // ---- Phân bổ tháng đầu vào MỘT tuần (25/10/2026): soạn tay, không nhập từ file ----
  const don2 = wd.capNhatRaiDeu('S', 100, [1, 2, 3, 4, 5], ['MB', 'MN'], 3);
  const giaTri = (arr, w, r) => arr.find((u) => u.col.week === w && u.col.region === r).value;
  check('dồn vào tuần 3 (không chọn miền -> MB): 10 ô được ghi (đủ MỌI ô), CHỈ ô tuần 3 × MB nhận hết 100, mọi ô khác = 0 (không tự chia 2 miền)', don2.length === 10 && giaTri(don2, 3, 'MB') === 100 && giaTri(don2, 3, 'MN') === 0 && don2.filter((u) => !(u.col.week === 3 && u.col.region === 'MB')).every((u) => u.value === 0));
  const don3 = wd.capNhatRaiDeu('S', 101, [1, 2, 3], ['MB', 'MN', 'MT'], 2, 'MT');
  check('dồn vào tuần 2, chọn miền MT trong 3 miền: MT nhận đủ 101, MB / MN = 0, tổng = số tháng', giaTri(don3, 2, 'MT') === 101 && giaTri(don3, 2, 'MB') === 0 && giaTri(don3, 2, 'MN') === 0 && don3.reduce((a, u) => a + u.value, 0) === 101);
  check('mienDonHopLe: miền chọn có trong danh sách -> dùng; không có / rỗng -> MB; không có MB -> miền đầu tiên', wd.mienDonHopLe('MN', ['MB', 'MN']) === 'MN' && wd.mienDonHopLe('XX', ['MB', 'MN']) === 'MB' && wd.mienDonHopLe('', ['MB', 'MN']) === 'MB' && wd.mienDonHopLe(undefined, ['MN', 'MT']) === 'MN' && wd.mienDonHopLe(' MT ', ['MN', 'MT']) === 'MT');
  check('miền mặc định khi không truyền = MB: ô tuần 1 × MB nhận hết, ô MN = 0; chọn MN thì ngược lại', giaTri(wd.capNhatRaiDeu('S', 7, [1, 2], ['MB', 'MN'], 1), 1, 'MB') === 7 && giaTri(wd.capNhatRaiDeu('S', 7, [1, 2], ['MB', 'MN'], 1, 'MN'), 1, 'MN') === 7 && giaTri(wd.capNhatRaiDeu('S', 7, [1, 2], ['MB', 'MN'], 1, 'MN'), 1, 'MB') === 0);
  check('không truyền tuần / tuần không thuộc tháng / tuần rỗng -> RẢI ĐỀU như cũ (không đổi kết quả)', JSON.stringify(wd.capNhatRaiDeu('S', 99, [1, 2], ['MB', 'MN'])) === JSON.stringify(wd.capNhatRaiDeu('S', 99, [1, 2], ['MB', 'MN'], 9)) && JSON.stringify(wd.capNhatRaiDeu('S', 99, [1, 2], ['MB', 'MN'])) === JSON.stringify(wd.capNhatRaiDeu('S', 99, [1, 2], ['MB', 'MN'], '')) && JSON.stringify(wd.capNhatRaiDeu('S', 99, [1, 2], ['MB', 'MN'])) === JSON.stringify(wd.capNhatRaiDeu('S', 99, [1, 2], ['MB', 'MN'], null)));
  check('tuanDonHopLe: "3" (chuỗi từ ô chọn) hợp lệ, 0 / 9 / "x" / 2.5 không', wd.tuanDonHopLe('3', [1, 2, 3]) === 3 && wd.tuanDonHopLe(0, [1, 2, 3]) === undefined && wd.tuanDonHopLe(9, [1, 2, 3]) === undefined && wd.tuanDonHopLe('x', [1, 2, 3]) === undefined && wd.tuanDonHopLe(2.5, [1, 2, 3]) === undefined);
  check('số tháng = 0 -> dồn vào tuần ghi toàn 0 (giống rải đều: xoá sạch ô)', wd.capNhatRaiDeu('S', 0, [1, 2], ['MB', 'MN'], 1).every((u) => u.value === 0));
  const kqDon = wd.tinhRaiDeuTatCa({ danhSach: ds, monthlyMap: monthly, weeklyMap: weekly, tuan, mien, tuanDon: 2 });
  const sauDon = { ...weekly };
  kqDon.updates.forEach((u) => { sauDon[`${u.rowKey}_${u.col.week}_${u.col.region}`] = u.value; });
  check('dồn tất cả dòng lệch vào tuần 2: B và D hết lệch, mọi số nằm ở tuần 2, tuần 1 = 0; C (số tháng 0) bỏ qua; A, E không bị đụng',
    kqDon.dong === 2 && kqDon.boQua === 1 && wd.tongTuanCua('B', sauDon, tuan, mien) === 40 && wd.tongTuanCua('D', sauDon, tuan, mien) === 30
    && sauDon.B_1_MB === 0 && sauDon.B_1_MN === 0 && sauDon.B_2_MB === 40 && sauDon.B_2_MN === 0 && sauDon.D_1_MB === 0 && sauDon.D_2_MB === 30 && sauDon.D_2_MN === 0
    && !kqDon.updates.some((u) => u.rowKey === 'A' || u.rowKey === 'E'), [kqDon.dong, kqDon.boQua, sauDon]);
  check('oGhiDe của chế độ dồn tính đúng: B (10,10,10,20 -> 0,0,40,0: cả 4 ô đang có số đều đổi) + D (31 -> 0 = 1 ô; ô tuần 2 × MB đang trống nên không tính) = 5', kqDon.oGhiDe === 5, kqDon.oGhiDe);
  const kqMN = wd.tinhRaiDeuTatCa({ danhSach: ds, monthlyMap: monthly, weeklyMap: weekly, tuan, mien, tuanDon: 2, mienDon: 'MN' });
  check('dồn tất cả dòng lệch vào tuần 2 × MN: B = 40 ở B_2_MN, D = 30 ở D_2_MN, ô MB = 0', kqMN.updates.find((u) => u.rowKey === 'B' && u.col.week === 2 && u.col.region === 'MN').value === 40 && kqMN.updates.find((u) => u.rowKey === 'D' && u.col.week === 2 && u.col.region === 'MN').value === 30 && kqMN.updates.find((u) => u.rowKey === 'B' && u.col.week === 2 && u.col.region === 'MB').value === 0);
  check('Bảng 1: có ô chọn "Phân bổ tháng đầu" (rải đều / dồn hết vào từng tuần), nhớ lựa chọn, tuần không có ở chu kỳ khác thì quay về rải đều',
    /Phân bổ tháng đầu:/.test(wf) && /<option value="deu">Rải đều các tuần × miền<\/option>/.test(wf) && /Dồn hết vào \{weekLabel\(baseMonth, w\)\}/.test(wf)
    && /usePersistedState\('weeklyCheDoRai', 'deu'/.test(wf) && /tuanDonHopLe\(cheDoRai\.startsWith\('w'\) \? cheDoRai\.slice\(1\) : undefined, weeks\)/.test(wf)
    && /aria-label="Cách phân bổ số tháng 1 vào bảng tuần"/.test(wf));
  check('ô chọn + nút dồn chỉ hiện cho người sửa được (canWrite); nút đũa phép từng dòng đổi gợi ý theo lựa chọn', (wf.match(/\{canWrite && \(\s*<label className="flex items-center gap-1\.5 text-xs text-slate-600 whitespace-nowrap" title="Cách phân bổ/g) || []).length === 1 && /Dồn toàn bộ số tháng 1 vào \$\{tenDon\}/.test(wf));

  // =====================================================================
  console.log('--- 4. Thực hiện: phím mũi tên + dán Excel, hợp nhất khi cào SAP / nhập ZSD450 ---');
  const ac = doc('pages/Actuals.jsx');
  check('Thực hiện dùng lại useGridEditing của Bảng 0 (mũi tên, Enter, Ctrl+D, dán nhiều dòng) — Tab giữ nguyên để không kẹt bàn phím', /useGridEditing\(\{[\s\S]*?columns: COT_NHAP[\s\S]*?rows: sapXep/.test(ac) && /grid\.handleKeyDown\(e, vRow\.index, 0\)/.test(ac) && /grid\.handlePaste\(e, vRow\.index, 0\)/.test(ac) && /e\.key !== 'Tab'/.test(ac) && /ref=\{grid\.registerRef\(p\.sku_code\)\}/.test(ac));
  const am = await imp('utils/actualsMerge.js');
  const totals = { A: 100, B: 200, C: 300, D: 400 };       // server vừa trả (sau khi SAP ghi)
  const goc = { A: 100, B: 150, C: 300, D: 250 };          // lần tải trước
  const dirty = new Set(['A', 'B', 'C']);                   // người dùng đang sửa dở A, B, C
  const map = { A: 111, B: 150, C: 333, D: 250 };           // số đang gõ: A=111 (server không đổi), B không gõ khác số cũ, C=333
  const xd = am.timXungDot({ totals, goc, dirty, map });
  check('timXungDot: chỉ ô mà server VỪA ĐỔI và khác số đang gõ (B: 150 -> 200 vs 150 đang gõ) — A (server không đổi), C (server không đổi) không phải xung đột', xd.join() === 'B', xd);
  const giu = am.gopSo({ totals, dirty, map, xungDot: xd, layTuServer: false });
  check('hợp nhất, giữ số tôi đang gõ: A=111, B=150, C=333 vẫn "chưa lưu"; D (không sửa) lấy số server 400', giu.map.A === 111 && giu.map.B === 150 && giu.map.C === 333 && giu.map.D === 400 && [...giu.dirty].sort().join() === 'A,B,C', [giu.map, [...giu.dirty]]);
  const lay2 = am.gopSo({ totals, dirty, map, xungDot: xd, layTuServer: true });
  check('hợp nhất, lấy số SAP cho ô xung đột: B=200 và hết "chưa lưu"; A, C vẫn giữ số đang gõ', lay2.map.B === 200 && !lay2.dirty.has('B') && lay2.map.A === 111 && lay2.map.C === 333 && lay2.dirty.has('A') && lay2.dirty.has('C'));
  const trung = am.gopSo({ totals: { A: 111 }, dirty: new Set(['A']), map: { A: 111 }, xungDot: [], layTuServer: false });
  check('ô đang sửa mà số gõ trùng số server vừa ghi thì không còn gì để lưu (hết "chưa lưu")', trung.dirty.size === 0 && trung.map.A === 111);
  check('Thực hiện: cào SAP + nhập ZSD450 gọi loadGrid(true) (hợp nhất), không còn tải lại xoá ô đang sửa; Esc/"Giữ" = giữ số của người dùng', (ac.match(/onImported=\{\(\) => loadGrid\(true\)\}/g) || []).length === 2 && /okLabel: 'Lấy số mới từ SAP', cancelLabel: 'Giữ số tôi đang gõ', danger: true/.test(ac) && /if \(!giu\) setLoading\(true\)/.test(ac));
  check('Thực hiện: số vừa Lưu cập nhật mốc so sánh (không bị coi là "server vừa đổi" ở lần hợp nhất sau)', /gocServer\.current\[sku\] = actualsMap\[sku\] \|\| 0/.test(ac));

  // =====================================================================
  console.log('--- 5. Phê duyệt: bắt lý do khi từ chối, tách Chờ duyệt / Lịch sử, tháng đầy đủ ---');
  const ap = doc('pages/Approvals.jsx');
  const pd = await imp('utils/period.js');
  check('monthLabelFull: "Tháng 10/2026" (monthLabel cũ vẫn "Tháng 10/26")', pd.monthLabelFull('2026-10-01') === 'Tháng 10/2026' && pd.monthLabelFull('2026-10-01T00:00:00Z') === 'Tháng 10/2026' && pd.monthLabel('2026-10-01') === 'Tháng 10/26');
  check('Approvals: tháng hiện "Tháng M/YYYY" ở danh sách, tiêu đề chi tiết và cột bảng số liệu; không còn monthLabel(...) ngắn', (ap.match(/monthLabelFull\(/g) || []).length >= 3 && !/[^l]monthLabel\(/.test(boChuThich(ap)));
  check('Approvals: Từ chối BẮT ghi lý do — trống thì không mở hộp xác nhận, hiện lỗi dưới ô + đưa con trỏ vào ô', /if \(!duyet && !ly\) \{[\s\S]*?setLoiYKien\([\s\S]*?oYKien\.current\?\.focus\(\);[\s\S]*?return;/.test(ap) && /aria-invalid=\{!!loiYKien\}/.test(ap) && /role="alert"/.test(ap) && /bắt buộc khi từ chối/.test(ap));
  check('Approvals: lý do đã cắt khoảng trắng mới gửi lên (decideApproval(..., ly))', /api\.decideApproval\(selectedApproval\.id, decision, ly\)/.test(ap));
  check('Approvals: tách HAI nhóm "Chờ duyệt (n)" và "Lịch sử (m)" (role=tablist), chọn mục luôn thuộc nhóm đang mở', /role="tablist"/.test(ap) && /\['cho', 'Chờ duyệt', dsCho\.length\], \['lichSu', 'Lịch sử', dsLichSu\.length\]/.test(ap) && /a\.status === 'pending'/.test(ap) && /a\.status !== 'pending'/.test(ap) && /dsHienTai\.find\(\(a\) => a\.id === selectedId\) \|\| dsHienTai\[0\]/.test(ap));
  check('Approvals: đổi yêu cầu / đổi nhóm thì bỏ ý kiến đang gõ (không gửi nhầm lý do của đơn này cho đơn khác)', /if \(app\.id !== selectedApproval\?\.id\) \{ setComment\(''\); setLoiYKien\(''\); \}/.test(ap) && /const doiTab = \(t\) =>[\s\S]*?setComment\(''\)/.test(ap));
  check('Approvals: sắp xếp theo cột áp cho nhóm đang xem; có ghi ngày xử lý ở lịch sử; vẫn giữ trạng thái tải / lỗi / Thử lại', /useTableSort\(dsHienTai/.test(ap) && /decided_at \? ` · xử lý/.test(ap) && /onRetry=\{loadApprovals\}/.test(ap) && (ap.match(/<StateBlock/g) || []).length >= 6);

  // =====================================================================
  console.log('--- 6. Kế hoạch năm: hộp Chờ duyệt, Lưu nháp giữ trạng thái, phím + dán, Hoàn tác ---');
  const pe = await imp('utils/annualPending.js');
  const goi = [];
  const fakeList = async ({ bu }) => {
    goi.push(bu);
    if (bu === 'BAD') throw new Error('FORBIDDEN: không có quyền');
    if (bu === 'OEM') return { plans: [{ id: 'p1', year: 2027, kind: 'base', revisionNo: 1, status: 'submitted', createdBy: 'a', submittedAt: '2026-10-08T02:00:00Z' }, { id: 'p2', year: 2026, kind: 'base', revisionNo: 1, status: 'approved' }, { id: 'p3', year: 2027, kind: 'adjust', revisionNo: 1, status: 'draft' }] };
    if (bu === 'XK') return { plans: [{ id: 'p4', year: 2026, kind: 'final', revisionNo: 2, status: 'submitted', updatedAt: '2026-10-09T01:00:00Z' }] };
    return { plans: [] };
  };
  const r = await pe.gomKeHoachNamChoDuyet(fakeList, [{ code: 'OEM', name: 'Domestic OEM' }, { code: 'XK', name: 'Export' }, { code: 'GT2', name: 'GT2' }, { code: 'BAD', name: 'Lỗi' }]);
  check('gomKeHoachNamChoDuyet: gọi listAnnualPlans({bu}) cho từng đơn vị (không truyền năm = mọi năm), chỉ lấy status submitted', goi.length === 4 && r.items.length === 2 && r.items.every((x) => ['p1', 'p4'].includes(x.id)), r.items);
  check('kết quả xếp theo năm rồi đơn vị; mỗi mục có đơn vị, năm, loại, lần sửa, ngày gửi', r.items[0].nam === 2026 && r.items[0].bu === 'XK' && r.items[1].nam === 2027 && r.items[1].bu === 'OEM' && r.items[1].lanSua === 1 && !!r.items[1].guiLuc);
  check('một đơn vị lỗi (FORBIDDEN...) không làm hỏng cả hộp: ghi vào loi, các đơn vị khác vẫn có kết quả', r.loi.length === 1 && r.loi[0].bu === 'BAD' && /FORBIDDEN/.test(r.loi[0].text));
  check('không có đơn vị nào -> rỗng (người không có quyền duyệt không gọi gì)', (await pe.gomKeHoachNamChoDuyet(fakeList, [])).items.length === 0);
  const an = doc('pages/AnnualPlan.jsx');
  const hc = doc('components/annual/HopChoDuyet.jsx');
  check('hộp "Chờ duyệt": liệt kê đơn vị × năm, nút "Mở", chỉ người duyệt thấy (laDuyet && choDuyetNam); App gom MỘT lần cho badge + hộp + màn Phê duyệt', /Chờ duyệt \(\{items\.length\}\)/.test(hc) && /onClick=\{\(\) => onMo\(x\)\}/.test(hc) && /const hopChoDuyet = laDuyet && choDuyetNam && \(/.test(an) && /useChoDuyetNam\(!!session && laNguoiDuyet\)/.test(app) && /choDuyetNam=\{choDuyetNam\}/.test(app));
  check('nút "Mở" nhảy tới đúng đơn vị + năm: hỏi mất-dữ-liệu trước, đổi đơn vị qua App, đặt năm; đang đúng chỗ thì mở thẳng bản đó', /const moMucChoDuyet = async \(x\) =>/.test(an) && /confirmNavigateAway\('Mở kế hoạch chờ duyệt'\)/.test(an) && /onChonDonVi\(x\.bu\)/.test(an) && /setYear\(x\.nam\)/.test(an) && /nap\(x\.id\)/.test(an));
  check('Lưu nháp / Gửi duyệt / Duyệt làm mới LẶNG (nap(id, false, true)): không hiện "Đang tải…", giữ bộ lọc, dòng đang mở, tab, Target', (an.match(/nap\([^)]*, false, true\)/g) || []).length === 3 && /if \(!giu\) setLoading\(true\)/.test(an) && /if \(giu\) \{[\s\S]*?setThemVaoKhach\([\s\S]*?\} else \{[\s\S]*?setExpanded\(new Set\(\)\)/.test(an));
  const ag = doc('components/annual/AnnualGrid.jsx');
  check('ô số của lưới kế hoạch: phím mũi tên lên/xuống theo cột tháng, trái/phải theo dòng (khi con trỏ ở mép), Enter chốt rồi xuống', /e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'/.test(ag) && /el\.selectionStart === 0/.test(ag) && /el\.selectionEnd === el\.value\.length/.test(ag) && /diChuyen\(el, 'xuong'\)/.test(ag) && /data-o-luoi="1"/.test(ag) && /data-cot=\{cot\}/.test(ag));
  check('dán Excel vào lưới kế hoạch: một ô -> trình duyệt tự dán; nhiều ô -> áp lần lượt như gõ tay qua đúng bộ xử lý sửa của từng ô (LoCtx), nguyên khối hoặc không gì cả', /onPaste=\{\(e\) => \{/.test(ag) && /split\('\\t'\)/.test(ag) && /chayLo\(\(\) => apDungODan\(dich\), dich\.length\)/.test(ag) && /export const LoCtx = createContext\(null\)/.test(ag) && /<LoCtx\.Provider value=\{chayLo\}>/.test(an)
    && /if \(loRef\.current\.loi\) return null;/.test(an) && /stRef\.current = truoc;\s*setSt\(truoc\);\s*baoLoi\(new Error\('Không dán được '/.test(an));
  check('cả hai lưới (khách + SKU) truyền cot={m} cho ô để biết cột', /<CellInput\s+cot=\{m\}/.test(ag) && /<CellInput cot=\{m\}/.test(doc('components/annual/AnnualSkuGrid.jsx')));
  check('Hoàn tác: nút + Ctrl+Z (trừ khi đang gõ trong ô chữ), tối đa 20 bước, một lô dán = MỘT bước, xoá khi tải lại / đổi bản; mọi thao tác sửa đi qua capNhat nên đều hoàn tác được', /const SO_BUOC_HOAN_TAC = 20/.test(an) && /const hoanTac = \(\) =>/.test(an) && /String\(e\.key\)\.toLowerCase\(\) !== 'z'/.test(an) && /t\.tagName === 'TEXTAREA'/.test(an) && /title="Hoàn tác thao tác sửa gần nhất \(Ctrl\+Z\)"/.test(an) && /lichSu\.current = \[\];\s*setSoBuocHoanTac\(0\)/.test(an) && /ganSt\(next, true\)/.test(an));
  check('Kế hoạch năm: chọn năm luôn có năm đang xem (mở từ hộp Chờ duyệt có thể là năm ngoài khoảng mặc định)', /new Set\(\[nam, nam \+ 1, nam \+ 2, year\]\)/.test(an));
  check('Gửi duyệt / quyết định xong thì hộp Chờ duyệt + badge được nạp lại (choDuyetNam.nap)', (an.match(/choDuyetNam\.nap\(\)/g) || []).length >= 2);

  // =====================================================================
  console.log('--- 7. Tổng quan: recharts tải lười, trạng thái qua glossary, doanh thu tỷ/triệu ---');
  const db = doc('pages/Dashboard.jsx');
  const khongRecharts = tatCaNguon.filter((f) => /from 'recharts'/.test(f.text)).map((f) => f.rel);
  check('recharts chỉ được import ở components/DashboardCharts.jsx (không ở Dashboard / App / trang nào khác)', khongRecharts.join() === 'components/DashboardCharts.jsx', khongRecharts);
  check('Dashboard nạp biểu đồ bằng React.lazy(import) và chỉ dựng khi mở "Xem biểu đồ" (mặc định thu gọn, nhớ lựa chọn); rê chuột / focus nút thì tải sẵn', /React\.lazy\(taiBieuDo\)/.test(db) && /import\('\.\.\/components\/DashboardCharts'\)/.test(db) && /usePersistedState\('dashCharts', false/.test(db) && /\{hienBieuDo && \(/.test(db) && /onMouseEnter=\{taiBieuDo\}/.test(db) && /aria-expanded=\{hienBieuDo\}/.test(db));
  check('App không import Dashboard cứng và chú thích không còn nói recharts nằm trong chunk Dashboard', /React\.lazy\(\(\) => import\('\.\/pages\/Dashboard'\)\)/.test(app) && !/kéo theo recharts/.test(app));
  const gl = await imp('utils/glossary.js');
  check('Dashboard: ô chọn Kỳ hiện trạng thái qua glossary (statusLabel) và tháng đầy đủ, không còn "(nháp)" tự gõ', /statusLabel\(c\.status\)/.test(db) && /monthLabelFull\(c\.base_month\)/.test(db) && !/\(nháp\)/.test(db.slice(db.indexOf('cycles.map'), db.indexOf('cycles.map') + 400)));
  const fm = await imp('utils/formatMoney.js');
  check('tienRutGon: 12,3 tỷ / 345 triệu / 1 tỷ / số nhỏ nguyên đồng', fm.tienRutGon(12_345_678_901) === '12,3 tỷ đ' && fm.tienRutGon(345_600_000) === '346 triệu đ' && fm.tienRutGon(1_000_000_000) === '1 tỷ đ' && fm.tienRutGon(8_400_000) === '8,4 triệu đ' && fm.tienRutGon(950_000) === '950.000 đ' && fm.tienRutGon(0) === '0 đ', ['12,3', fm.tienRutGon(12_345_678_901), fm.tienRutGon(345_600_000), fm.tienRutGon(1_000_000_000), fm.tienRutGon(8_400_000), fm.tienRutGon(950_000)]);
  check('tienRutGon: làm tròn chạm mốc thì nhảy đơn vị (999,96 triệu -> 1 tỷ, không "1.000 triệu"); số âm và rác', fm.tienRutGon(999_960_000) === '1 tỷ đ' && fm.tienRutGon(-2_500_000_000) === '-2,5 tỷ đ' && fm.tienRutGon('abc') === '0 đ' && fm.tienRutGon(null) === '0 đ', [fm.tienRutGon(999_960_000), fm.tienRutGon(-2_500_000_000)]);
  check('tienDayDu (tooltip): số đồng đầy đủ có dấu chấm nghìn', fm.tienDayDu(12_345_678_901) === '12.345.678.901 đ' && fm.tienDayDu(undefined) === '0 đ');
  check('Dashboard: doanh thu dòng nhạt dưới tháng hiện rút gọn + tooltip số đầy đủ', /tienRutGon\(monthTotals\[m\]\?\.revenue \|\| 0\)/.test(db) && /title=\{tienDayDu\(monthTotals\[m\]\?\.revenue \|\| 0\)\}/.test(db));

  // =====================================================================
  console.log('--- 8. Xuất báo cáo: gộp .zip tải một lần; ghi chú nội bộ chỉ admin ---');
  const zf = await imp('utils/zipFiles.js');
  const fz = await import(pathToFileURL(path.join(clientNodeModules, 'fflate/esm/browser.js')).href);
  const f1 = new Uint8Array([1, 2, 3, 4, 5]);
  const f2 = new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256));
  const z = zf.taoZip([{ name: 'ZPP702_Upload_KHKD_0401_KH_XK_2026-10.xlsx', data: f1 }, { name: 'ZPP702_Upload_KHKD_0200_KH_OEM_2026-10.xlsx', data: f2 }, { name: 'ZPP702_Upload_KHKD_0401_KH_XK_2026-10.xlsx', data: f1 }]);
  const un = fz.unzipSync(z);
  const tenTrongZip = Object.keys(un);
  check('taoZip: gói 3 file (kể cả trùng tên) thành MỘT zip giải nén lại đúng nội dung từng file', tenTrongZip.length === 3 && Buffer.compare(Buffer.from(un[tenTrongZip[0]]), Buffer.from(f1)) === 0 && Buffer.compare(Buffer.from(un[tenTrongZip[1]]), Buffer.from(f2)) === 0, tenTrongZip);
  check('tên trùng được đánh -2 (zip không có hai mục cùng tên); ký tự cấm trong tên file bị thay', tenTrongZip.some((t) => /-2\.xlsx$/.test(t)) && Object.keys(fz.unzipSync(zf.taoZip([{ name: 'a/b:c.xlsx', data: f1 }])))[0] === 'a_b_c.xlsx');
  check('zip bắt đầu bằng chữ ký PK (đúng định dạng zip)', z[0] === 0x50 && z[1] === 0x4b);
  const zw = await imp('utils/zpp702Workbook.js');
  const XLSX = await import(pathToFileURL(path.join(clientNodeModules, 'xlsx/xlsx.mjs')).href);
  const dong = [['KH_XK', '2013050022', '0401', '0401', 'VSE', '00', 'X', 2026, '20261007', 10, 20, 30, 40, 0, 0, 0, 0, 0, 0, 0, 0]];
  const bytes = zw.zpp702Bytes(dong);
  const wb = XLSX.read(bytes, { type: 'array' });
  check('zpp702Bytes: file .xlsx hợp lệ (đọc lại được), đúng sheet ZPP702 và dòng dữ liệu', bytes instanceof Uint8Array && wb.SheetNames.join() === 'ZPP702' && wb.Sheets.ZPP702.A3.v === 'KH_XK' && wb.Sheets.ZPP702.B3.v === '2013050022');
  const ex = doc('pages/Exports.jsx');
  check('Xuất SAP: gom file vào danh sách rồi tải MỘT lần (taiVeNhieuFile): từ 2 file gộp .zip, không còn gọi tải liên tiếp từng file', /files\.push\(\{ name: `ZPP702_Upload_KHKD_/.test(ex) && /taiVeNhieuFile\(files, tenZip\)/.test(ex) && !/downloadZpp702\(/.test(ex) && !/XLSX\.writeFile\([^)]*\)[\s\S]{0,40}XLSX\.writeFile/.test(ex));
  check('Xuất SAP: thông báo nói rõ file .zip và số file bên trong', /gộp trong một file \$\{tenZip\}/.test(ex) && /giải nén để lấy \$\{files\.length\} file/.test(ex));
  check('Ghi chú "Khác biệt so với file anh đang làm tay" CHỈ hiện cho admin (central_admin), người xem báo cáo không thấy', /\{user\?\.role === 'central_admin' && \(\s*<div className="bg-amber-50[\s\S]*?Khác biệt so với file anh đang làm tay/.test(ex));
  check('fflate là phụ thuộc của client (có trong package.json)', JSON.parse(fs.readFileSync(path.join(ROOT, 'client/package.json'), 'utf8')).dependencies.fflate !== undefined);

  // =====================================================================
  console.log('--- 9. Menu: tên dễ hiểu + tooltip + badge chờ duyệt đếm cả kế hoạch năm ---');
  const mn = await imp('utils/menu.js');
  const nhan = Object.fromEntries(mn.MENU_ITEMS.map((m) => [m.id, m.label]));
  check('tên mới: Forecast 4 tháng / Chia tuần & miền / Lịch & quy trình lập FC (lấy từ glossary MAN_HINH)', nhan.monthly === 'Forecast 4 tháng' && nhan.weekly === 'Chia tuần & miền' && nhan.guide === 'Lịch & quy trình lập FC' && nhan.monthly === gl.MAN_HINH.monthly.ten && nhan.guide === gl.MAN_HINH.guide.ten, nhan);
  check('tên cũ "Bảng 0: …", "Bảng 1: …", "Sơ đồ Quy trình B5" không còn ở menu', mn.MENU_ITEMS.every((m) => !/Bảng \d|Sơ đồ|B5/.test(m.label)));
  check('mọi mục menu có tooltip mô tả (mota) đủ dài; tooltip của Bảng 0 / 1 / 5 giữ tên cũ trong ngoặc để người quen file Excel đối chiếu', mn.MENU_ITEMS.every((m) => typeof m.mota === 'string' && m.mota.length > 25) && /Bảng 0/.test(gl.MAN_HINH.monthly.mota) && /Bảng 1/.test(gl.MAN_HINH.weekly.mota) && /Bảng 5/.test(gl.MAN_HINH.guide.mota));
  check('Sidebar hiện tooltip (title = mota) — thu gọn thì kèm tên', /title=\{collapsed \? `\$\{item\.label\} — \$\{item\.mota\}` : item\.mota\}/.test(sb));
  check('tiêu đề trang dùng cùng tên: "FORECAST 4 THÁNG (Bảng 0)", "CHIA FORECAST THEO TUẦN & MIỀN (Bảng 1)", "LỊCH & QUY TRÌNH LẬP SALES FORECAST (Bảng 5)"', /MAN_HINH\.monthly\.tieuDe/.test(mf) && /MAN_HINH\.weekly\.tieuDe/.test(wf) && /MAN_HINH\.guide\.tieuDe/.test(doc('pages/WorkflowGuide.jsx')) && gl.MAN_HINH.guide.tieuDe === 'LỊCH & QUY TRÌNH LẬP SALES FORECAST');
  check('câu hướng dẫn trên màn không còn gọi tên cũ "Bảng 0 (Forecast Tháng 1)" / "Bảng 1 sẽ báo chưa khớp"', !/Bảng 0 \(Forecast/.test(doc('components/ValidationAlert.jsx')) && /màn Chia tuần & miền/.test(doc('components/ValidationAlert.jsx')) && !/Bảng 1 sẽ báo/.test(doc('components/ImportForecastModal.jsx')));
  check('badge menu: "Quy trình Phê duyệt" = forecast chờ duyệt + kế hoạch năm chờ duyệt (tooltip tách hai phần); mục "Kế hoạch năm" có badge riêng', /n: pendingApprovalsCount \+ soKhNamChoDuyet/.test(app) && /kế hoạch năm chờ duyệt/.test(app) && /annual: \{ n: soKhNamChoDuyet/.test(app) && /badges\[m\.id\]/.test(sb));
  check('màn Phê duyệt liệt kê kế hoạch năm chờ duyệt (HopChoDuyet) và dẫn sang màn Kế hoạch năm đúng đơn vị × năm (savePref annualYear)', /<HopChoDuyet items=\{keHoachNamChoDuyet\} onMo=\{onMoKeHoachNam\}/.test(ap) && /const moKeHoachNam = async \(x\) =>/.test(app) && /savePref\('annualYear', x\.nam\)/.test(app) && /setActiveTab\('annual'\)/.test(app));

  // =====================================================================
  console.log('--- 10. Dọn dẹp ---');
  ['App.css', 'assets/react.svg', 'assets/vite.svg'].forEach((f) => check(`đã xoá file không dùng: client/src/${f}`, !fs.existsSync(path.join(SRC, f))));
  check('không còn chỗ nào import App.css / react.svg / vite.svg', !tatCaNguon.some((f) => /App\.css|react\.svg|vite\.svg/.test(f.text)) && !/react\.svg|vite\.svg|App\.css/.test(fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8')));
  check('các trang thử cục bộ (app-harness + annual-harness) không nằm trong bản build: vite chỉ lấy index.html', fs.existsSync(path.join(ROOT, 'client/app-harness.html')) && !/app-harness/.test(fs.readFileSync(path.join(ROOT, 'client/vite.config.js'), 'utf8')));

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
