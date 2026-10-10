/**
 * dot2-khung-ui.test.js — chốt ĐỢT 2 (10/10/2026): bộ khung giao diện dùng chung của FC.
 *
 * Không có jsdom nên bài này kiểm hai thứ:
 *  - LOGIC THUẦN nạp thật từ client/src (hàng đợi hộp thoại, toast, sắp xếp, nhớ lựa chọn, giờ VN, bảng thuật ngữ,
 *    đo tương phản WCAG) — chạy mã thật, không stub hàm nào của dự án;
 *  - HỢP ĐỒNG TRONG MÃ NGUỒN của phần giao diện (Dialog có role/Esc/Enter/focus, mọi window.confirm đã biến mất, mọi bảng
 *    chính dùng cùng mẫu bảng, mỗi màn một nút chính...) — đọc file .jsx và bắt mẫu, để ai đó lỡ bỏ đi là bài này đỏ.
 *
 *   node test/dot2-khung-ui.test.js
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
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(jsx|js)$/.test(e.name)) yield p;
  }
}
const tatCaNguon = [...walk(SRC)].map((p) => ({ rel: path.relative(SRC, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf8') }));

async function main() {
  // =====================================================================
  console.log('--- 1. Hộp thoại thống nhất ---');
  const dlg = await imp('services/dialogService.js');
  // Chưa có host: yêu cầu xếp hàng chờ (KHÔNG rơi về window.confirm)
  let sớm = null;
  dlg.appConfirm('Xoá SKU này?', { okLabel: 'Xoá SKU', danger: true }).then((v) => { sớm = v; });
  await Promise.resolve();
  check('chưa có host: yêu cầu chờ, không tự trả lời', sớm === null);
  const thay = [];
  let tra = true;
  const huy = dlg.registerDialogHost((req) => { thay.push(req); req.resolve(tra); });
  await new Promise((r) => setTimeout(r, 0));
  check('có host: yêu cầu đã xếp hàng được phát ra, đúng nhãn + danger', thay.length === 1 && thay[0].okLabel === 'Xoá SKU' && thay[0].danger === true && thay[0].message === 'Xoá SKU này?', thay[0]);
  check('đồng ý -> true', sớm === true);
  tra = false;
  check('huỷ / Esc -> false', (await dlg.appConfirm('Ghi đè?', { okLabel: 'Ghi đè' })) === false);
  tra = true;
  const kqAlert = await dlg.appAlert('Xong rồi.');
  const reqAlert = thay[thay.length - 1];
  check('appAlert: một nút (hideCancel), trả undefined', kqAlert === undefined && reqAlert.hideCancel === true && reqAlert.okLabel === 'Đã hiểu');
  const nhieu = await Promise.all([dlg.appConfirm('a'), dlg.appConfirm('b'), dlg.appConfirm('c')]);
  check('nhiều yêu cầu cùng lúc đều được phát (host tự xếp hàng hiển thị)', nhieu.length === 3 && nhieu.every((v) => v === true));
  huy();

  const dialogSrc = doc('components/Dialog.jsx');
  check('Dialog: role="dialog" + aria-modal + tên từ tiêu đề', /role="dialog"/.test(dialogSrc) && /aria-modal="true"/.test(dialogSrc) && /aria-labelledby/.test(dialogSrc));
  check('Dialog: Esc đóng, chỉ hộp trên cùng, không đóng khi đang lưu', /'Escape'/.test(dialogSrc) && /ngan\[ngan\.length - 1\] !== id/.test(dialogSrc) && /moi\.current\.busy/.test(dialogSrc));
  check('Dialog: Enter đồng ý (onEnter), trừ ô nhiều dòng / nút / danh sách', /e\.key === 'Enter' && onEnter/.test(dialogSrc) && /'TEXTAREA', 'BUTTON'/.test(dialogSrc));
  check('Dialog: tự focus khi mở + Tab xoay vòng + TRẢ focus khi đóng', /data-autofocus/.test(dialogSrc) && /e\.key === 'Tab'/.test(dialogSrc) && /truoc\.focus\(\)/.test(dialogSrc));
  check('Dialog: bấm nền đóng TRỪ khi đang có chữ đã gõ / đang lưu; phải nhấn và nhả cùng trên nền', /!dirty && !busy && !dangCoChu\(\)/.test(dialogSrc) && /nhanNen\.current = e\.target === e\.currentTarget/.test(dialogSrc) && /daGoChu/.test(dialogSrc));
  const hostSrc = doc('components/DialogHost.jsx');
  check('DialogHost: nút danger màu đỏ, nhãn lấy từ okLabel, tự focus nút đồng ý, đang chạy thì quay vòng', /bg-rose-700/.test(hostSrc) && /\{okLabel\}/.test(hostSrc) && /data-autofocus/.test(hostSrc) && /Loader2/.test(hostSrc) && /await run\(\)/.test(hostSrc));
  const loiWindow = tatCaNguon.filter((f) => /(?<![\w.])(window\.)?(confirm|alert|prompt)\s*\(/.test(f.text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  check('không còn window.confirm / alert / prompt ở bất kỳ đâu trong client/src', loiWindow.length === 0, loiWindow.map((f) => f.rel));
  const modalTuViet = tatCaNguon.filter((f) => /fixed inset-0/.test(f.text) && !/from '(\.\/|\.\.\/)Dialog'/.test(f.text) && f.rel !== 'components/Dialog.jsx');
  check('mọi modal (fixed inset-0) đều đi qua <Dialog> dùng chung, không còn khung tự viết', modalTuViet.length === 0, modalTuViet.map((f) => f.rel));
  ['AddProductModal', 'BulkProductsModal', 'ImportActualsModal', 'ImportFromSourceModal', 'ImportForecastModal'].forEach((m) => {
    const s = doc('components/' + m + '.jsx');
    check(m + ': dùng <Dialog>, không tự bắt Escape', /<Dialog /.test(s) && !/'Escape'/.test(s));
  });
  check('Header (Đổi PIN) + CycleBar (Mở lại chu kỳ) + AnnualDialogs dùng <Dialog>', /<Dialog /.test(doc('components/Header.jsx')) && /<Dialog/.test(doc('components/CycleBar.jsx')) && /<Dialog/.test(doc('components/annual/AnnualDialogs.jsx')));
  const annDlg = doc('components/annual/AnnualDialogs.jsx');
  check('hộp từ chối / xoá hàng loạt: nút xác nhận đỏ', /danger \? nutNguyHiem/.test(annDlg) && /nutNguyHiem\} disabled=\{!ds\.length\}/.test(annDlg) && /danger/.test(doc('pages/AnnualPlan.jsx').match(/<ReasonDialog[^>]*"Từ chối kế hoạch"[^>]*>/)?.[0] || ''));
  // Các hộp xác nhận phá dữ liệu đều danger + nhãn đúng hành động
  const nhanDung = [
    ['pages/AnnualPlan.jsx', /okLabel: 'Xóa SKU khỏi mọi khách', danger: true/], ['pages/AnnualPlan.jsx', /okLabel: 'Bỏ bản nháp và dựng lại', danger: true/],
    ['pages/AnnualPlan.jsx', /okLabel: 'Ghi đè KPI năm', danger: true/], ['pages/MonthlyForecast.jsx', /okLabel: 'Ghi đè cột này', danger: true/],
    ['pages/Dashboard.jsx', /okLabel: 'Xoá Kỳ này', danger: true/], ['pages/Approvals.jsx', /okLabel: 'Từ chối kế hoạch', danger: true/],
    ['pages/AnnualPlan.jsx', /okLabel: 'Gửi duyệt'/], ['pages/Approvals.jsx', /okLabel: 'Duyệt kế hoạch' \}/]
  ];
  nhanDung.forEach(([f, re]) => check(`${f}: ${re.source.slice(0, 44)}`, re.test(doc(f))));
  check('chưa có nhãn "OK" chung chung nào cho hộp xác nhận', !tatCaNguon.some((f) => /okLabel:\s*'(OK|Ok|Đồng ý)'/.test(f.text) && f.rel !== 'components/DialogHost.jsx'));

  // --- confirmNavigateAway / confirmLeaveApp dùng hộp thoại chung ---
  const ds = await imp('services/dirtyState.js');
  const hoi = [];
  let traLoi = true;
  dlg.registerDialogHost((req) => { hoi.push(req); req.resolve(traLoi); });
  ds.setDirty(true, 'Bảng Actuals còn 2 ô chưa lưu.');
  await ds.confirmNavigateAway('Đổi tháng');
  check('confirmNavigateAway: hộp đỏ, nhãn "Bỏ thay đổi và tiếp tục", nút huỷ "Ở lại"', hoi[0].danger === true && /Bỏ thay đổi/.test(hoi[0].okLabel) && hoi[0].cancelLabel === 'Ở lại' && /Đổi tháng/.test(hoi[0].title), hoi[0]);
  traLoi = false;
  check('confirmLeaveApp: huỷ -> false và VẪN dirty', (await ds.confirmLeaveApp('Đăng xuất')) === false && ds.isDirty() === true);
  traLoi = true;
  check('confirmLeaveApp: đồng ý -> true và gỡ cờ dirty (kẻo beforeunload hỏi lần hai)', (await ds.confirmLeaveApp('Đăng xuất')) === true && ds.isDirty() === false);

  // =====================================================================
  console.log('--- 2. Toast xếp hàng đợi ---');
  const ts = await imp('services/toastService.js');
  let gio = 0; let idTimer = 0;
  const hen = new Map();
  ts.configureToast({
    setTimeout: (fn, ms) => { idTimer++; hen.set(idTimer, { fn, at: gio + ms }); return idTimer; },
    clearTimeout: (id) => { hen.delete(id); }
  });
  const tien = (ms) => { gio += ms; [...hen.entries()].filter(([, t]) => t.at <= gio).forEach(([id, t]) => { hen.delete(id); t.fn(); }); };
  ts.resetToasts();
  const a = ts.toast.success('Đã lưu 1');
  const b = ts.toast.success('Đã lưu 2');
  const c = ts.toast.success('Đã lưu 3');
  check('3 toast cùng lúc xếp chồng, cái sau KHÔNG xoá cái trước', ts.getToastSnapshot().visible.length === 3 && a !== b && b !== c);
  ts.toast.success('Đã lưu 4'); ts.toast.success('Đã lưu 5'); ts.toast.success('Đã lưu 6');
  let sn = ts.getToastSnapshot();
  check('hiện tối đa ' + ts.MAX_VISIBLE + ' cái, dư thì chờ trong hàng đợi', sn.visible.length === ts.MAX_VISIBLE && sn.waiting === 2, [sn.visible.length, sn.waiting]);
  check('toast chờ CHƯA bắt đầu đếm giờ tắt', hen.size === ts.MAX_VISIBLE, hen.size);
  tien(ts.AUTO_DISMISS_MS - 1);
  check('thường tự tắt ~4 giây (chưa tới thì còn)', ts.getToastSnapshot().visible.length === ts.MAX_VISIBLE);
  tien(1);
  sn = ts.getToastSnapshot();
  check('hết 4 giây: 4 cái đầu tắt, 2 cái chờ lên thay', sn.visible.length === 2 && sn.waiting === 0 && sn.visible[0].text === 'Đã lưu 5', sn.visible.map((t) => t.text));
  tien(ts.AUTO_DISMISS_MS);
  check('rồi các cái đó cũng tắt sau đủ 4 giây của riêng nó', ts.getToastSnapshot().visible.length === 0);
  const e1 = ts.toast.error('Không lưu được: lỗi mạng');
  tien(10 * 60 * 1000);
  check('toast LỖI không tự tắt (10 phút vẫn còn)', ts.getToastSnapshot().visible.some((t) => t.id === e1 && t.type === 'error' && t.duration === 0));
  ts.dismissToast(e1);
  check('nút × (dismissToast) tắt được toast lỗi', ts.getToastSnapshot().visible.length === 0);
  ts.toast.error('Lặp'); ts.toast.error('Lặp'); ts.toast.error('Lặp');
  sn = ts.getToastSnapshot();
  check('cùng nội dung + cùng loại thì gộp "×n" thay vì chất thêm', sn.visible.length === 1 && sn.visible[0].count === 3);
  ts.resetToasts();
  check('thongBao({type,text}) = cầu nối của các màn cũ; null / rỗng bị bỏ qua', ts.thongBao({ type: 'error', text: 'Lỗi X' }) > 0 && ts.getToastSnapshot().visible[0].type === 'error' && ts.thongBao(null) === 0 && ts.thongBao({ type: 'success', text: '' }) === 0);
  ts.resetToasts();
  const hostToast = doc('components/ToastHost.jsx');
  check('ToastHost: nút × cho mọi toast, lỗi là role=alert, nằm trên hộp thoại', /aria-label="Đóng thông báo"/.test(hostToast) && /role=\{t\.type === 'error' \? 'alert'/.test(hostToast) && /z-\[60\]/.test(hostToast));
  const appSrc = doc('App.jsx');
  check('App: gắn DialogHost + ToastHost (cả màn đăng nhập lẫn màn chính)', (appSrc.match(/<DialogHost \/>/g) || []).length === 2 && (appSrc.match(/<ToastHost \/>/g) || []).length === 2);
  ['pages/Actuals.jsx', 'pages/MonthlyForecast.jsx', 'pages/WeeklyForecast.jsx', 'pages/Exports.jsx'].forEach((f) => {
    check(f + ': thông báo kết quả đi qua toast, không còn banner message tại chỗ', /const setMessage = thongBao;/.test(doc(f)) && !/useState\(null\);\s*\n?.*setMessage/.test(doc(f)) && !/\{message && \(/.test(doc(f)));
  });

  // =====================================================================
  console.log('--- 3. Mẫu bảng chung: sắp xếp, trạng thái rỗng/lỗi/Thử lại, dòng tổng ---');
  const st = await imp('utils/tableSortCore.js');
  const hang = [{ k: 'a', so: 30, ten: 'Máy lọc', ngay: '2026-10-05' }, { k: 'b', so: 5, ten: 'Lõi số 2', ngay: '2026-01-15' }, { k: 'c', so: null, ten: '', ngay: '' }, { k: 'd', so: 100, ten: 'Ấm đun', ngay: '2026-09-30' }, { k: 'e', so: 12, ten: 'Lõi số 10', ngay: 'không phải ngày' }];
  const cot = { so: { type: 'number', get: (r) => r.so }, ten: { type: 'text', get: (r) => r.ten }, ngay: { type: 'date', get: (r) => r.ngay } };
  const ks = (rows) => rows.map((r) => r.k).join('');
  check('số tăng dần, ô rỗng xuống cuối', ks(st.sortRows(hang, { key: 'so', dir: 'asc' }, cot)) === 'beadc', ks(st.sortRows(hang, { key: 'so', dir: 'asc' }, cot)));
  check('số giảm dần, ô rỗng VẪN ở cuối', ks(st.sortRows(hang, { key: 'so', dir: 'desc' }, cot)) === 'daebc', ks(st.sortRows(hang, { key: 'so', dir: 'desc' }, cot)));
  check('chữ: so sánh theo tiếng Việt (Ấm trước Lõi trước Máy) + số tự nhiên (Lõi số 2 < Lõi số 10), tên rỗng cuối', ks(st.sortRows(hang, { key: 'ten', dir: 'asc' }, cot)) === 'dbeac', ks(st.sortRows(hang, { key: 'ten', dir: 'asc' }, cot)));
  check('ngày: sớm -> muộn, giá trị không đọc được xuống cuối', ks(st.sortRows(hang, { key: 'ngay', dir: 'asc' }, cot)).slice(0, 3) === 'bda', ks(st.sortRows(hang, { key: 'ngay', dir: 'asc' }, cot)));
  const goc = hang.map((r) => r.k).join('');
  st.sortRows(hang, { key: 'so', dir: 'desc' }, cot);
  check('KHÔNG sửa mảng gốc', ks(hang) === goc);
  check('bằng nhau giữ thứ tự gốc (ổn định)', ks(st.sortRows([{ k: '1', so: 5 }, { k: '2', so: 5 }, { k: '3', so: 5 }], { key: 'so', dir: 'desc' }, cot)) === '123');
  let sp = null;
  const vong = [];
  for (let i = 0; i < 3; i++) { sp = st.nextSpec(sp, 'so'); vong.push(sp ? sp.dir : 'bo'); }
  check('bấm 3 lần: tăng -> giảm -> bỏ sắp xếp; đổi cột thì bắt đầu lại từ tăng', vong.join() === 'asc,desc,bo' && st.nextSpec({ key: 'so', dir: 'desc' }, 'ten').dir === 'asc');
  check('aria-sort đúng', st.ariaSort({ key: 'so', dir: 'asc' }, 'so') === 'ascending' && st.ariaSort({ key: 'so', dir: 'desc' }, 'so') === 'descending' && st.ariaSort(null, 'so') === 'none');
  check('chuỗi số vi-VN và số thường đọc đúng', st.sortKey('1.234,5', 'number') === 1234.5 && st.sortKey('12.5', 'number') === 12.5 && st.sortKey('abc', 'number') === null);

  // Bảng có ô nhập: sắp xếp chốt thứ tự, gõ số không làm dòng nhảy, không mất dữ liệu đang sửa
  const nhap = [{ sku: 'A', q: 10 }, { sku: 'B', q: 30 }, { sku: 'C', q: 20 }];
  const cotNhap = { q: { type: 'number', get: (r) => r.q } };
  const order = st.orderFrom(nhap, { key: 'q', dir: 'desc' }, cotNhap, (r) => r.sku);
  const sauKhiGo = nhap.map((r) => (r.sku === 'A' ? { ...r, q: 999 } : r));    // người dùng gõ 999 vào dòng A
  check('thứ tự đã chốt: sửa số dòng A thành 999 KHÔNG làm A nhảy lên đầu', ks2(st.applyOrder(sauKhiGo, order, (r) => r.sku)) === 'BCA', ks2(st.applyOrder(sauKhiGo, order, (r) => r.sku)));
  function ks2(rows) { return rows.map((r) => r.sku).join(''); }
  check('dữ liệu đang sửa còn nguyên sau khi sắp xếp (giá trị 999 vẫn ở A)', st.applyOrder(sauKhiGo, order, (r) => r.sku).find((r) => r.sku === 'A').q === 999);
  check('dòng mới (chưa có trong thứ tự đã chốt) nằm cuối', ks2(st.applyOrder([...sauKhiGo, { sku: 'D', q: 1000 }], order, (r) => r.sku)) === 'BCAD');
  check('bấm lại tiêu đề mới tính lại theo số hiện tại', ks2(st.applyOrder(sauKhiGo, st.orderFrom(sauKhiGo, { key: 'q', dir: 'desc' }, cotNhap, (r) => r.sku), (r) => r.sku)) === 'ABC');
  check('bỏ sắp xếp -> trả đúng mảng gốc', st.applyOrder(nhap, null, (r) => r.sku) === nhap);

  const ts2 = doc('components/TableStates.jsx');
  check('TableStates: trạng thái đang tải / lỗi (kèm nút "Thử lại") / rỗng thống nhất; SortTh có aria-sort + mũi tên', /Thử lại/.test(ts2) && /kind === 'loading'/.test(ts2) && /kind === 'error'/.test(ts2) && /aria-sort=\{ariaSort/.test(ts2) && /ArrowUp/.test(ts2) && /ArrowDown/.test(ts2));
  const hookSort = doc('utils/useTableSort.js');
  check('useTableSort chốt thứ tự lúc bấm (orderFrom) và áp lại (applyOrder), không sửa dữ liệu', /orderFrom\(/.test(hookSort) && /applyOrder\(/.test(hookSort));
  const bangChinh = [
    ['pages/MonthlyForecast.jsx', 'Forecast tháng'], ['pages/WeeklyForecast.jsx', 'Forecast tuần'], ['pages/Actuals.jsx', 'Thực hiện'], ['pages/Products.jsx', 'Danh mục SKU'],
    ['pages/Approvals.jsx', 'danh sách duyệt'], ['pages/Dashboard.jsx', 'B0.SUM'], ['components/annual/AnnualGrid.jsx', 'Kế hoạch năm (lưới)'], ['pages/AnnualPlan.jsx', 'Kế hoạch năm (Preview)']
  ];
  bangChinh.forEach(([f, ten]) => check(`${ten}: sắp xếp theo cột (useTableSort + tiêu đề SortTh/SortIcon)`, /useTableSort\(/.test(doc(f)) && /SortTh|SortIcon/.test(doc(f))));
  ['pages/MonthlyForecast.jsx', 'pages/WeeklyForecast.jsx', 'pages/Actuals.jsx', 'pages/Products.jsx', 'pages/Dashboard.jsx'].forEach((f) => {
    const s = doc(f);
    check(`${f}: lỗi tải hiện lỗi + "Thử lại" (StateRow kind="error" onRetry), không kẹt "Đang tải…"`, /<StateRow[^>]*kind="error"[^>]*onRetry=/.test(s) && /<StateRow[^>]*kind="loading"/.test(s));
  });
  check('Approvals: danh sách + số liệu có trạng thái tải / lỗi / Thử lại / rỗng', (doc('pages/Approvals.jsx').match(/<StateBlock/g) || []).length >= 6 && /onRetry=\{loadApprovals\}/.test(doc('pages/Approvals.jsx')));
  check('dòng tổng: Forecast tuần (mới thêm), Thực hiện (mới thêm), Forecast tháng / Dashboard / Kế hoạch năm (sẵn có)',
    /<tfoot/.test(doc('pages/WeeklyForecast.jsx')) && /<tfoot/.test(doc('pages/Actuals.jsx')) && /<tfoot/.test(doc('pages/MonthlyForecast.jsx')) && /<tfoot/.test(doc('pages/Dashboard.jsx')) && /Tổng doanh thu/.test(doc('components/annual/AnnualGrid.jsx')));
  check('bảng có ô nhập: lưới đọc thứ tự đã chốt (rows: sapXep) — phím mũi tên / dán Excel khớp thứ tự hiển thị', /rows: sapXep/.test(doc('pages/MonthlyForecast.jsx')) && /rows: sapXep/.test(doc('pages/WeeklyForecast.jsx')));

  // =====================================================================
  console.log('--- 4. Mỗi màn một nút chính; "⋯ Thêm"; nút phá/ghi đè kiểu danger ---');
  ['pages/MonthlyForecast.jsx', 'pages/WeeklyForecast.jsx'].forEach((f) => {
    const s = doc(f);
    check(`${f}: Lưu / Gửi duyệt là CẶP bù nhau — luôn đúng một nút xanh (Lưu khi còn ô chưa lưu, ngược lại Gửi duyệt)`,
      /dirtyKeys\.size > 0 \? NUT_CHINH : NUT_PHU/.test(s) && /dirtyKeys\.size > 0 \? NUT_PHU : NUT_CHINH/.test(s) && !/bg-slate-800 hover:bg-slate-900 text-white px-3\.5/.test(s));
    check(`${f}: thao tác ít dùng gom vào MoreMenu`, /<MoreMenu/.test(s));
  });
  const an = doc('pages/AnnualPlan.jsx');
  check('Kế hoạch năm: Lưu nháp / Gửi duyệt bù nhau theo luuLaChinh; Duyệt xanh, Từ chối viền đỏ; Apply không còn xanh đặc',
    /luuLaChinh \? nutChinh : nutPhu/.test(an) && /luuLaChinh \? nutPhu : nutChinh/.test(an) && /className=\{nutTuChoi\} onClick=\{\(\) => setDlg\(\{ loai: 'tuchoi' \}\)/.test(an) && !/nutChinh\} onClick=\{apDung\}/.test(an));
  check('Kế hoạch năm: Dựng lại + Áp vào KPI (ghi đè) nằm trong "Thêm" và đánh dấu danger', /label: 'Dựng lại từ dữ liệu mới', icon: RefreshCw, danger: true/.test(an) && /label: 'Áp vào KPI OEM \(ghi đè\)', icon: Target, danger: true/.test(an));
  const mm = doc('components/MoreMenu.jsx');
  check('MoreMenu: nhãn "Thêm", mục danger chữ đỏ và tách xuống cuối, Esc + bấm ngoài để đóng, role=menu', /label = 'Thêm'/.test(mm) && /text-rose-700/.test(mm) && /nguyHiem/.test(mm) && /'Escape'/.test(mm) && /role="menu"/.test(mm));
  check('Approvals: Từ chối là nút viền đỏ (danger), Duyệt xanh; không còn nhãn tiếng Anh APPROVE/REJECT', /border-rose-300 text-rose-700/.test(doc('pages/Approvals.jsx')) && !/\(APPROVE\)|\(REJECT\)/.test(doc('pages/Approvals.jsx')));

  // =====================================================================
  console.log('--- 5. Cảnh báo mất dữ liệu chưa lưu ---');
  check('App: beforeunload dùng isDirty()', /addEventListener\('beforeunload'/.test(appSrc) && /if \(!isDirty\(\)\) return;/.test(appSrc));
  check('App: đổi tab (Sidebar), đổi đơn vị, nút Back/Forward (hashchange) đều await confirmNavigateAway', /setActiveTab=\{async \(tab\) => \{ if \(await confirmNavigateAway\(\)\)/.test(appSrc) && /setCurrentBU=\{async \(bu\) => \{ if \(await confirmNavigateAway\('Đổi đơn vị'\)\)/.test(appSrc) && /const handler = async \(\) => \{[\s\S]*?await confirmNavigateAway\(\)/.test(appSrc));
  check('App: Đăng xuất dùng confirmLeaveApp (gỡ cờ trước khi rời để beforeunload không hỏi lần hai)', /await confirmLeaveApp\('Đăng xuất'\)/.test(appSrc));
  const hd = doc('components/Header.jsx');
  check('Header: link Portal + link sang app khác hỏi trước khi rời nếu có ô chưa lưu (không chặn Ctrl+click)', /roiSangApp\('Về Karofi Portal'/.test(hd) && /roiSangApp\('Sang ' \+ a\.ten/.test(hd) && /e\.ctrlKey \|\| e\.metaKey/.test(hd) && /isDirty\(\)/.test(hd) && /confirmLeaveApp/.test(hd));
  check('đổi chu kỳ / bản cập nhật (CycleBar), tháng (Actuals), năm + bản (Kế hoạch năm) hỏi trước và đọc giá trị ô chọn TRƯỚC await', /const id = e\.target\.value;/.test(doc('components/CycleBar.jsx')) && /const v = e\.target\.value;/.test(doc('pages/Actuals.jsx')) && /const v = Number\(e\.target\.value\); if \(await confirmNavigateAway/.test(an));

  // =====================================================================
  console.log('--- 6. Thuật ngữ & badge trạng thái tiếng Việt ---');
  const gl = await imp('utils/glossary.js');
  const bangNhan = { draft: 'Bản thảo', submitted: 'Chờ duyệt', pending: 'Chờ duyệt', pending_approval: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối', locked: 'Đã khóa', superseded: 'Đã thay thế', revision_requested: 'Yêu cầu sửa', drafted: 'Bản thảo' };
  check('mọi mã trạng thái ra nhãn tiếng Việt (kể cả draft, pending_approval, drafted)', Object.entries(bangNhan).every(([k, v]) => gl.statusLabel(k) === v), Object.keys(bangNhan).filter((k) => gl.statusLabel(k) !== bangNhan[k]));
  check('mã lạ KHÔNG hiện thô: "Chưa xác định"; rỗng -> "—"', gl.statusLabel('weird_code_x') === 'Chưa xác định' && gl.statusLabel('') === '—' && gl.statusLabel(null) === '—');
  check('không nhãn nào chứa mã thô (gạch dưới / chữ thường tiếng Anh)', Object.values(gl.STATUS).every((s) => !/[_]|^[a-z]+$/.test(s.label)));
  check('ngayVN: ISO thô -> dd/mm/yyyy; không đọc được -> "—" (không trả chuỗi thô)', gl.ngayVN('2026-10-01') === '01/10/2026' && gl.ngayVN('2026-10-01T00:00:00.000Z') === '01/10/2026' && gl.ngayVN('rác') === '—' && gl.ngayVN('') === '—');
  check('ngayGioVN theo giờ VN (UTC+7): 17:30Z ngày 30/9 = 00:30 ngày 1/10', gl.ngayGioVN('2026-09-30T17:30:00Z') === '00:30 01/10/2026', gl.ngayGioVN('2026-09-30T17:30:00Z'));
  check('roleLabel không hiện mã vai trò thô', gl.roleLabel('bu_editor') === 'Lập kế hoạch' && gl.roleLabel('x_y') === 'Vai trò khác');
  const badge = doc('components/StatusBadge.jsx');
  check('StatusBadge đọc nhãn + màu từ glossary (một bảng), không còn map riêng', /from '\.\.\/utils\/glossary'/.test(badge) && !/draft:/.test(badge));
  const rawChildren = tatCaNguon.filter((f) => /\{\s*[\w.?]*\.(status|base_month|forecast_month|requested_at|decided_at)\s*\}\s*<\/|>\s*\{\s*[\w.?]*\.(status|base_month)\s*\}/.test(f.text));
  check('không JSX nào hiện thẳng .status / .base_month / ngày ISO làm chữ', rawChildren.length === 0, rawChildren.map((f) => f.rel));
  check('Dashboard: ô "Trạng thái chu kỳ" dùng nhãn Việt; Approvals: chu kỳ = Tháng M/YY, ngày giờ = giờ VN', /statusLabel\(cycle\.status\)/.test(doc('pages/Dashboard.jsx')) && /monthLabel\(app\.base_month\)/.test(doc('pages/Approvals.jsx')) && /ngayGioVN\(app\.requested_at\)/.test(doc('pages/Approvals.jsx')));
  check('Kế hoạch năm: nhãn trạng thái / loại bản lấy từ glossary (không còn NHAN_TT / MAU_TT riêng)', !/NHAN_TT|MAU_TT/.test(an) && /statusLabel\(/.test(an) && /NHAN_LOAI_KE_HOACH/.test(an));
  check('vai trò hiện bằng nhãn Việt (Actuals / Approvals), ROLE_LABELS ở glossary', /roleLabel\(user\?\.role\)/.test(doc('pages/Actuals.jsx')) && /roleLabel\(user\?\.role\)/.test(doc('pages/Approvals.jsx')) && /from '\.\.\/utils\/glossary'/.test(doc('services/auth.js')));

  // =====================================================================
  console.log('--- 7. Mỗi mục menu / tab một icon riêng ---');
  const menuSrc = doc('utils/menu.js');
  const icons = [...menuSrc.matchAll(/icon:\s*(\w+)/g)].map((m) => m[1]);
  check('menu có đủ 9 mục, mọi icon KHÁC NHAU', icons.length === 9 && new Set(icons).size === icons.length, icons);
  check('Sidebar đọc menu từ utils/menu.js (một nguồn)', /MENU_ITEMS/.test(doc('components/Sidebar.jsx')) && !/LayoutDashboard/.test(doc('components/Sidebar.jsx')));
  check('tiêu đề trang dùng đúng icon của mục menu (Approvals, Products, Exports)', /MENU_ICON\.exports/.test(doc('pages/Exports.jsx')) && /MENU_ICON\.products/.test(doc('pages/Products.jsx')) && /<CheckCircle2 className="w-5 h-5 text-emerald-700" \/>\s*QUY TRÌNH/.test(doc('pages/Approvals.jsx')));
  const tabIcons = [...an.matchAll(/\['(?:base|plan|preview)',[^\]]*?, (\w+)\]/g)].map((m) => m[1]);
  check('Kế hoạch năm: 3 tab (Cơ sở / Kế hoạch / Xem trước) mỗi tab một icon, không trùng menu', tabIcons.length === 3 && new Set(tabIcons).size === 3 && tabIcons.every((i) => !icons.includes(i)), tabIcons);
  check('Dashboard: hai thẻ cuối không còn dùng chung icon Layers', (doc('pages/Dashboard.jsx').match(/<Layers /g) || []).length === 1 && /<Activity /.test(doc('pages/Dashboard.jsx')));

  // =====================================================================
  console.log('--- 8. Tương phản WCAG của giao diện sáng (đo thật) ---');
  const cc = await import(pathToFileURL(path.join(ROOT, 'tools/check-contrast.mjs')).href);
  const r2 = (x) => Math.round(x * 100) / 100;
  check('máy đo khớp con số đã ghi ở index.css: chữ trắng trên blue-600 = 4,59:1; trên blue-500 = 2,91:1', r2(cc.ratio('white', 'blue-600')) === 4.59 && r2(cc.ratio('white', 'blue-500')) === 2.91, [cc.ratio('white', 'blue-600'), cc.ratio('white', 'blue-500')]);
  check('cặp từng dưới ngưỡng nay đã bị thay: slate-400 trên trắng < 4,5 (cũ), slate-500 trên trắng >= 4,5 (mới)', cc.ratio('slate-400', 'white') < 4.5 && cc.ratio('slate-500', 'white') >= 4.5);
  [['white', 'rose-700'], ['white', 'emerald-700'], ['white', 'amber-700'], ['white', 'blue-600'], ['slate-700', 'slate-100'], ['amber-900', 'amber-100'], ['emerald-800', 'emerald-100'], ['rose-800', 'rose-100'], ['rose-900', 'rose-50'], ['slate-400', 'slate-900'], ['blue-200', 'blue-900']].forEach(([f, b]) => {
    check(`${f} / ${b} = ${r2(cc.ratio(f, b))}:1 >= 4,5`, cc.ratio(f, b) >= 4.5);
  });
  const xau = cc.scan();
  check('quét client/src: KHÔNG còn cụm chữ/nền nào dưới ngưỡng (chữ thường 4,5:1; chữ to 3:1)', xau.length === 0, xau.slice(0, 5).map((x) => `${x.file}:${x.line} ${x.ratio}`));
  check('trạng thái: mọi tông trong glossary đạt >= 4,5:1', Object.values(gl.STATUS).every((s) => {
    const t = s.tone.split(' ');
    const fg = t.find((x) => x.startsWith('text-')).slice(5), bg = t.find((x) => x.startsWith('bg-')).slice(3);
    return cc.ratio(fg, bg) >= 4.5;
  }));

  // =====================================================================
  console.log('--- 9. Nhớ bộ lọc & tab đang mở ---');
  const store = new Map();
  global.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } } };
  const pf = await imp('services/prefs.js');
  check('ghi rồi đọc lại: chuỗi / số / boolean', pf.savePref('tab', 'monthly') && pf.loadPref('tab', 'dashboard') === 'monthly' && pf.savePref('n', 2027) && pf.loadPref('n', 0) === 2027 && pf.savePref('b', false) && pf.loadPref('b', true) === false);
  check('validate: giá trị cũ không còn hợp lệ -> dùng fallback', pf.loadPref('tab', 'dashboard', (v) => ['dashboard', 'annual'].includes(v)) === 'dashboard');
  store.set('karofi_fc_pref:hong', '{không phải json');
  check('JSON hỏng -> fallback, không ném lỗi', pf.loadPref('hong', 'mac-dinh') === 'mac-dinh');
  global.window = { localStorage: { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceeded'); }, removeItem() { throw new Error('x'); } } };
  let nem = false;
  try { const a1 = pf.loadPref('tab', 'dashboard'); const a2 = pf.savePref('tab', 'x'); pf.clearPref('tab'); nem = a1 !== 'dashboard' || a2 !== false; } catch { nem = true; }
  check('localStorage ném lỗi (chế độ riêng tư / bị chặn) -> mọi đọc/ghi đều try/catch, app vẫn chạy', nem === false);
  delete global.window;
  check('không có window (kiểm thử / SSR) -> vẫn trả fallback', pf.loadPref('tab', 'dashboard') === 'dashboard' && pf.savePref('x', 1) === false);
  check('App: nhớ tab (có #hash thì #hash thắng) + nhớ đơn vị', /loadPref\('tab', 'dashboard', laTabHopLe\)/.test(appSrc) && /savePref\('tab', activeTab\)/.test(appSrc) && /loadPref\('bu', ''/.test(appSrc) && /savePref\('bu', currentBU\)/.test(appSrc));
  check('Bảng 0 + Bảng 1: nhớ chu kỳ theo đơn vị (cùng khoá "cycle:<BU>") và khôi phục khi mở', ['pages/MonthlyForecast.jsx', 'pages/WeeklyForecast.jsx'].every((f) => /savePref\('cycle:' \+ currentBU/.test(doc(f)) && /loadAll\(loadPref\('cycle:' \+ currentBU, undefined, laChuoi\)\)/.test(doc(f))));
  check('Tổng quan nhớ Kỳ; Thực hiện nhớ tháng; Xuất báo cáo nhớ tháng; Kế hoạch năm nhớ năm / kiểu bảng / tiền tệ', /savePref\('dashCycle:'/.test(doc('pages/Dashboard.jsx')) && /usePersistedState\('actualsMonth'/.test(doc('pages/Actuals.jsx')) && /usePersistedState\('exportsMonth'/.test(doc('pages/Exports.jsx')) && /usePersistedState\('annualYear'/.test(an) && /usePersistedState\('annualKieu'/.test(an) && /usePersistedState\('annualTien'/.test(an));
  check('bộ lọc nhóm / kênh / "chỉ hiện SKU có số lượng" được nhớ; nhóm không còn tồn tại -> coi như Tất cả', /usePersistedState\('monthlyGroup'/.test(doc('pages/MonthlyForecast.jsx')) && /usePersistedState\('monthlyOnlyNonZero'/.test(doc('pages/MonthlyForecast.jsx')) && /usePersistedState\('weeklyOnlyNonZero'/.test(doc('pages/WeeklyForecast.jsx')) && /usePersistedState\('productsGroup'/.test(doc('pages/Products.jsx')) && /nhomHieuLuc/.test(doc('pages/MonthlyForecast.jsx')));

  // =====================================================================
  console.log('--- 10. Ngày / tháng mặc định theo giờ Việt Nam (UTC+7) ---');
  const pd = await imp('utils/period.js');
  const luc0030Mung1 = new Date(Date.UTC(2026, 8, 30, 17, 30));      // 17:30Z ngày 30/9 = 00:30 ngày 1/10 giờ VN
  check('mô phỏng 00:30 mùng 1/10 giờ VN: vnMonth = 2026-10-01, vnToday = 2026-10-01', pd.vnMonth(luc0030Mung1) === '2026-10-01' && pd.vnToday(luc0030Mung1) === '2026-10-01', [pd.vnMonth(luc0030Mung1), pd.vnToday(luc0030Mung1)]);
  check('cách cũ toISOString().slice(0, 7) ra THÁNG TRƯỚC đúng lúc đó (lý do phải đổi)', luc0030Mung1.toISOString().slice(0, 7) === '2026-09');
  const luc2359 = new Date(Date.UTC(2026, 8, 30, 16, 59));
  check('23:59 ngày 30/9 giờ VN vẫn là tháng 9', pd.vnMonth(luc2359) === '2026-09-01' && pd.vnToday(luc2359) === '2026-09-30');
  check('currentMonth() / todayISO() (tên cũ) đi qua giờ VN', pd.currentMonth(luc0030Mung1) === '2026-10-01' && pd.todayISO(luc0030Mung1) === '2026-10-01');
  check('vnPrevMonth: mặc định tháng của màn Thực hiện; sang năm trước khi đang tháng 1', pd.vnPrevMonth(luc0030Mung1) === '2026-09-01' && pd.vnPrevMonth(new Date(Date.UTC(2026, 0, 5, 3))) === '2025-12-01');
  check('vnYear / vnParts', pd.vnYear(new Date(Date.UTC(2026, 11, 31, 18, 0))) === 2027 && pd.vnParts(luc0030Mung1).d === 1);
  check('nhãn tuần ISO theo ngày giờ VN (mùng 1/10/2026 = W40)', pd.isoWeekLabel(luc0030Mung1) === 'W40', pd.isoWeekLabel(luc0030Mung1));
  const sap = await imp('utils/sapExport.js');
  check('ngày up SAP (thứ Tư tuần kế tiếp) tính theo ngày giờ VN: 00:30 mùng 1/10/2026 (thứ Năm) -> thứ Tư 07/10', sap.wednesdayOfNextWeek(luc0030Mung1) === '20261007', sap.wednesdayOfNextWeek(luc0030Mung1));
  const xl = await imp('utils/annualPlanExcel.js');
  check('tên file xuất Excel mang ngày giờ VN', /_20261001\.xlsx$/.test(xl.tenFile({ code: 'OEM' }, 2027, 'draft', luc0030Mung1)), xl.tenFile({ code: 'OEM' }, 2027, 'draft', luc0030Mung1));
  const xoay = tatCaNguon.filter((f) => !f.rel.startsWith('dev/') && f.rel !== 'utils/period.js').filter((f) => /toISOString\(\)\.slice|new Date\(\)\.(getFullYear|getMonth|getDate)|d\.getMonth\(\)|\.getMonth\(\) \+ 1/.test(f.text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
  check('không còn chỗ nào lấy "hôm nay / tháng này" bằng giờ UTC hoặc giờ máy trong client/src', xoay.length === 0, xoay.map((f) => f.rel));
  check('màn Thực hiện / Xuất báo cáo / Kế hoạch năm / Mở chu kỳ lấy mặc định từ helper giờ VN', /vnPrevMonth/.test(doc('pages/Actuals.jsx')) && /currentMonth\(\)/.test(doc('pages/Exports.jsx')) && /vnParts\(\)/.test(an) && /vnYear\(\)/.test(an) && /currentMonth\(\)/.test(doc('components/CycleBar.jsx')));

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
