/**
 * system-settings.test.js — chốt CÀI ĐẶT HỆ THỐNG (14/10/2026, Đợt 8): số tháng chu kỳ mới do master đặt + màn "Cài đặt hệ thống".
 *
 * Như settings.test.js (không có jsdom):
 *  - LOGIC THUẦN nạp thật từ client/src và chạy: services/systemSettings.js (đổi %, kiểm hợp lệ, payload, câu xác nhận, nhóm, lịch sử),
 *    services/systemValues.js (kho giá trị: mặc định 4, thất bại nhẹ nhàng), utils/menu.js (chốt chặn vai trò);
 *  - HỢP ĐỒNG TRONG MÃ NGUỒN của phần giao diện (CycleBar không còn gửi horizonMonths, Header chỉ hiện mục cho master, App chặn #hash...).
 *
 *   node test/system-settings.test.js
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
const nghi = () => new Promise((r) => setImmediate(r));

// Hai cài đặt mẫu giống phản hồi getSystemSettings: số nguyên (tháng) và phần trăm.
const THANG = { khoa: 'fc.horizonMonths', nhom: 'Chu kỳ forecast', nhan: 'Số tháng của chu kỳ mới', ghiChu: 'x', kieu: 'integer', min: 1, max: 12, buoc: 1, donVi: 'tháng', fmt: '', macDinh: 4, giaTri: 4, daDat: false, hieuLucTu: null, choHieuLuc: [], lichSu: [] };
const PT = { khoa: 'fc.canhBao', nhom: 'Ngưỡng', nhan: 'Ngưỡng cảnh báo', ghiChu: '', kieu: 'number', min: 0, max: 0.5, buoc: 0.01, donVi: '%', fmt: 'percent', macDinh: 0.15, giaTri: 0.2, daDat: true, hieuLucTu: '2026-09-01', choHieuLuc: [], lichSu: [] };

async function main() {
  const ss = await imp('services/systemSettings.js');
  const sv = await imp('services/systemValues.js');
  const mn = await imp('utils/menu.js');

  // =====================================================================
  console.log('--- 1. Phần trăm: hiển thị x100, gửi lại /100 (không lệch dấu phẩy động) ---');
  check('hiển thị: 0.05 -> 5, 0.07 -> 7 (không ra 7.000000000000001), 0.125 -> 12,5; giá trị thường giữ nguyên', ss.hienThiSo(PT, 0.05) === 5 && ss.hienThiSo(PT, 0.07) === 7 && ss.hienThiSo(PT, 0.125) === 12.5 && ss.hienThiSo(THANG, 4) === 4 && ss.hienThiSo(PT, null) === null && ss.hienThiSo(PT, NaN) === null);
  check('gửi lại: 5 -> 0.05, 7 -> 0.07, 12.5 -> 0.125, 0.29 -> 0.0029; không phần trăm giữ nguyên', ss.veGiaTriGoc(PT, 5) === 0.05 && ss.veGiaTriGoc(PT, 7) === 0.07 && ss.veGiaTriGoc(PT, 12.5) === 0.125 && ss.veGiaTriGoc(PT, 0.29) === 0.0029 && ss.veGiaTriGoc(THANG, 6) === 6);
  check('đi một vòng không đổi: mọi 0.01..0.50 bước 0.01', Array.from({ length: 50 }, (_, i) => (i + 1) / 100).every((v) => ss.veGiaTriGoc(PT, ss.hienThiSo(PT, v)) === v));
  check('chuỗi hiển thị: 5%, 12,5%, "4 tháng", "—"; phần trăm thiếu đơn vị vẫn ra %', ss.chuoiGiaTri(PT, 0.05) === '5%' && ss.chuoiGiaTri(PT, 0.125) === '12,5%' && ss.chuoiGiaTri(THANG, 4) === '4 tháng' && ss.chuoiGiaTri(THANG, null) === '—' && ss.chuoiGiaTri({ fmt: 'percent', donVi: '' }, 0.3) === '30%');
  check('docSoNhap: 7 / 7,5 / 7.5 / " 12 " ok; rỗng, chữ, 1,2,3, 1e3 -> null', ss.docSoNhap('7') === 7 && ss.docSoNhap('7,5') === 7.5 && ss.docSoNhap('7.5') === 7.5 && ss.docSoNhap(' 12 ') === 12 && ss.docSoNhap('') === null && ss.docSoNhap('abc') === null && ss.docSoNhap('1,2,3') === null && ss.docSoNhap('1e3') === null);

  // =====================================================================
  console.log('--- 2. Kiểm giá trị: bắt buộc, số, nguyên, trong [min, max] (tính trên giá trị GỐC, báo lỗi theo đơn vị hiển thị) ---');
  const kt = (s, t) => ss.kiemGiaTri(s, t);
  check('hợp lệ: 4 / 12 / 1 tháng; trả giá trị gốc', kt(THANG, '4').ok && kt(THANG, '4').value === 4 && kt(THANG, '12').ok && kt(THANG, '1').ok);
  check('để trống / chữ -> báo lỗi tiếng Việt', kt(THANG, '').error === 'Nhập giá trị.' && kt(THANG, '  ').ok === false && kt(THANG, 'bốn').error === 'Giá trị phải là một số.');
  check('kiểu integer: 4,5 bị từ chối', kt(THANG, '4,5').ok === false && /nguyên/.test(kt(THANG, '4,5').error));
  check('ngoài khoảng: 0 và 13 -> "từ 1 tháng đến 12 tháng"; số âm', kt(THANG, '0').error === 'Giá trị phải từ 1 tháng đến 12 tháng.' && kt(THANG, '13').ok === false && kt(THANG, '-1').ok === false);
  check('phần trăm: nhập 20 -> gốc 0.2; 0 và 50 (biên) được; 51 và -1 không; lỗi nói bằng %', kt(PT, '20').value === 0.2 && kt(PT, '0').ok && kt(PT, '50').ok && kt(PT, '50').value === 0.5 && kt(PT, '51').error === 'Giá trị phải từ 0% đến 50%.' && !kt(PT, '-1').ok);
  check('phần trăm lẻ: 12,5 và 7.5 ok (kiểu number, không bắt nguyên); biên không bị sai số dấu phẩy động', kt(PT, '12,5').value === 0.125 && kt(PT, '7.5').value === 0.075 && kt(PT, '15').ok);
  check('chỉ có min hoặc chỉ có max: lời nhắn "không nhỏ hơn / không lớn hơn"; không có cả hai thì không chặn', /không nhỏ hơn 1 tháng/.test(kt({ ...THANG, max: undefined }, '0').error) && /không lớn hơn 12 tháng/.test(kt({ ...THANG, min: undefined }, '13').error) && kt({ khoa: 'x', kieu: 'number' }, '99999').ok);

  // =====================================================================
  console.log('--- 3. Ngày hiệu lực: trống = hôm nay; không trước hôm nay; tối đa +1 năm ---');
  const HN = '2026-10-14';
  const kn = (n) => ss.kiemNgay(n, HN);
  check('trống -> hôm nay; hôm nay; ngày mai; đúng +1 năm (14/10/2027) ok', kn('').value === HN && kn(undefined).value === HN && kn(HN).ok && kn('2026-10-15').ok && kn('2027-10-14').ok);
  check('hôm qua -> "không được trước hôm nay"; 15/10/2027 -> "quá 1 năm"', kn('2026-10-13').error === 'Ngày hiệu lực không được trước hôm nay.' && kn('2027-10-15').error === 'Ngày hiệu lực không được quá 1 năm kể từ hôm nay.');
  check('ngày không có thật (30/02, 2026-13-01, chữ) -> không hợp lệ', kn('2026-02-30').error === 'Ngày hiệu lực không hợp lệ.' && !kn('2026-13-01').ok && !kn('mai').ok);
  check('ngayToiDa: +1 năm; 29/2 lùi về 28/2 của năm sau; 31/1 -> 31/1', ss.ngayToiDa('2026-10-14') === '2027-10-14' && ss.ngayToiDa('2028-02-29') === '2029-02-28' && ss.ngayToiDa('2026-01-31') === '2027-01-31' && ss.ngayToiDa('rac') === '');
  check('ngayVN / lucVN: 2026-10-14 -> 14/10/2026; 2026-10-14T20:30Z là 03:30 ngày 15 giờ VN; rỗng -> —', ss.ngayVN('2026-10-14') === '14/10/2026' && ss.lucVN('2026-10-14T20:30:00Z') === '15/10/2026 03:30' && ss.lucVN('') === '—' && ss.lucVN('khong-phai-ngay') === 'khong-phai-ngay');

  // =====================================================================
  console.log('--- 4. Form -> payload setSystemSetting ---');
  const f = (s, o) => ss.kiemForm(s, o, HN);
  let r = f(THANG, { text: '6', ngay: HN, ghiChu: '  tăng cho Q4  ' });
  check('lưu: { khoa, giaTri, ghiChu }; hieuLucTu KHÔNG gửi khi là hôm nay (máy chủ tự mặc định hôm nay)', r.ok && JSON.stringify(r.payload) === JSON.stringify({ khoa: 'fc.horizonMonths', giaTri: 6, ghiChu: 'tăng cho Q4' }), r.payload);
  r = f(THANG, { text: '6', ngay: '2026-11-01', ghiChu: '' });
  check('ngày tương lai -> gửi hieuLucTu; ghi chú trống -> không gửi ghiChu', r.ok && r.payload.hieuLucTu === '2026-11-01' && !('ghiChu' in r.payload) && r.ngay === '2026-11-01');
  r = f(PT, { text: '7', ngay: '', ghiChu: '' });
  check('phần trăm: nhập 7 -> gửi giaTri 0.07', r.ok && r.payload.giaTri === 0.07, r.payload);
  r = f(THANG, { text: 'rác', ngay: HN, ghiChu: '', reset: true });
  check('về mặc định: giaTri null, bỏ qua ô giá trị (kể cả khi đang gõ dở)', r.ok && r.payload.giaTri === null && r.giaTri === null);
  r = f(THANG, { text: '0', ngay: '2026-01-01', ghiChu: 'x'.repeat(301) });
  check('gom đủ lỗi cùng lúc: giá trị + ngày + ghi chú > 300 ký tự; không có payload', !r.ok && r.errGiaTri && r.errNgay && /300/.test(r.errGhiChu) && !r.payload, r);
  check('khongDoi: trùng giá trị đang dùng + hiệu lực hôm nay -> true; ngày tương lai hoặc giá trị khác -> false; reset không bị chặn', ss.khongDoi(THANG, 4, HN, HN) && !ss.khongDoi(THANG, 4, '2026-11-01', HN) && !ss.khongDoi(THANG, 5, HN, HN) && !ss.khongDoi(THANG, null, HN, HN) && ss.khongDoi(PT, 0.2, HN, HN));
  check('câu xác nhận đúng khuôn: Đổi <nhãn> từ X sang Y, hiệu lực từ <ngày>? Chu kỳ đã tạo giữ nguyên.', ss.cauXacNhan(THANG, 6, '2026-11-01') === 'Đổi Số tháng của chu kỳ mới từ 4 tháng sang 6 tháng, hiệu lực từ 01/11/2026? Chu kỳ đã tạo giữ nguyên.', ss.cauXacNhan(THANG, 6, '2026-11-01'));
  check('câu xác nhận phần trăm + về mặc định', ss.cauXacNhan(PT, 0.07, HN) === 'Đổi Ngưỡng cảnh báo từ 20% sang 7%, hiệu lực từ 14/10/2026? Chu kỳ đã tạo giữ nguyên.' && ss.cauXacNhan(PT, null, HN) === 'Đổi Ngưỡng cảnh báo từ 20% sang 15% (mặc định), hiệu lực từ 14/10/2026? Chu kỳ đã tạo giữ nguyên.');

  // =====================================================================
  console.log('--- 5. Hiển thị danh sách: nhóm, trạng thái, lịch sử ---');
  const ds = ss.nhomCaiDat([THANG, PT, { ...THANG, khoa: 'fc.b', nhan: 'B' }, { khoa: 'fc.c', nhan: 'C' }, null, { nhan: 'không khoá' }]);
  check('nhóm theo nhom, giữ thứ tự nhóm xuất hiện trước và thứ tự dòng; thiếu nhom -> "Khác"; bỏ dòng hỏng', ds.map((g) => g.nhom).join('|') === 'Chu kỳ forecast|Ngưỡng|Khác' && ds[0].items.length === 2 && ds[2].items[0].khoa === 'fc.c' && ss.nhomCaiDat(undefined).length === 0);
  const lsPT = { ...PT, lichSu: [
    { giaTri: 0.2, hieuLucTu: '2026-09-01', nguoiSua: 'An', ghiChu: 'a', lucSua: '2026-08-30T03:00:00Z' },
    { giaTri: 0.3, hieuLucTu: '2026-12-01', nguoiSua: 'Bình', ghiChu: 'b', lucSua: '2026-10-10T03:00:00Z' },
    { giaTri: 0.1, hieuLucTu: '2026-08-01', nguoiSua: 'Cường', ghiChu: 'c', lucSua: '2026-10-12T03:00:00Z' }
  ] };
  check('banGhiHienHanh: bản có hiệu lực từ <= hôm nay và MỚI NHẤT theo hiệu lực (bỏ bản tương lai; bản sửa muộn nhưng hiệu lực cũ không thắng)', ss.banGhiHienHanh(lsPT, HN).nguoiSua === 'An' && ss.banGhiHienHanh(THANG, HN) === null);
  check('lichSuMoiNhat: theo lúc sửa, mới nhất trước; không sửa mảng gốc', ss.lichSuMoiNhat(lsPT).map((x) => x.nguoiSua).join() === 'Cường,Bình,An' && lsPT.lichSu[0].nguoiSua === 'An');
  check('trạng thái: chưa đặt -> "Đang dùng mặc định (4 tháng)"', ss.dongTrangThai(THANG, HN) === 'Đang dùng mặc định (4 tháng)');
  check('trạng thái: đã đặt -> "Đã đặt bởi An ngày 30/08/2026" (giờ VN)', ss.dongTrangThai(lsPT, HN) === 'Đã đặt bởi An ngày 30/08/2026', ss.dongTrangThai(lsPT, HN));
  check('trạng thái: đã đặt nhưng thiếu lịch sử -> vẫn có câu, dùng hiệu lực từ', ss.dongTrangThai({ ...PT, lichSu: [] }, HN) === 'Đã đặt (hiệu lực từ 01/09/2026)');
  const ok = ss.chuanHoaCaiDat({ app: 'fc', canEdit: true, today: HN, tableMissing: false, settings: [THANG, null, { x: 1 }] });
  check('chuanHoaCaiDat: giữ cài đặt có khoá; canEdit/tableMissing chỉ true khi đúng true; sai hình dạng -> null', ok.settings.length === 1 && ok.canEdit === true && ok.tableMissing === false && ok.today === HN && ss.chuanHoaCaiDat(null) === null && ss.chuanHoaCaiDat({}) === null && ss.chuanHoaCaiDat({ settings: 'x' }) === null && ss.chuanHoaCaiDat({ settings: [], canEdit: 'true', tableMissing: 1 }).canEdit === false && ss.chuanHoaCaiDat({ settings: [], today: 'hôm nay' }).today === '');

  // =====================================================================
  console.log('--- 6. Kho giá trị hệ thống: mặc định 4, thất bại nhẹ nhàng ---');
  sv.resetSystemValues();
  check('chưa nạp: số tháng chu kỳ mới = 4 (hành vi cũ)', sv.getHorizonMonths() === 4 && sv.HORIZON_MAC_DINH === 4 && sv.getSystemValue('khoa.la', 'z') === 'z');
  check('chưa có transport: loadSystemValues trả false, không ném', (await sv.loadSystemValues()) === false && sv.getHorizonMonths() === 4);
  let goi = 0;
  sv.setSystemValuesTransport(async () => { goi += 1; return { values: { 'fc.horizonMonths': 6 } }; });
  const dem = []; const huy = sv.subscribeSystemValues(() => dem.push(sv.getSystemValuesVersion()));
  check('nạp được: horizon = 6, báo cho người nghe, gọi đúng một lượt', (await sv.loadSystemValues()) === true && sv.getHorizonMonths() === 6 && dem.length === 1 && goi === 1);
  await sv.loadSystemValues();
  check('nạp lại cùng giá trị không báo thừa (không vẽ lại)', dem.length === 1);
  sv.setSystemValuesTransport(async () => { throw new Error('relation "fc_system_settings" does not exist'); });
  check('máy chủ lỗi (bảng chưa có / mất mạng / hết phiên): im lặng, trả false, GIỮ giá trị đang có', (await sv.loadSystemValues()) === false && sv.getHorizonMonths() === 6);
  sv.resetSystemValues();
  check('reset (đăng xuất): về mặc định 4 và báo người nghe', sv.getHorizonMonths() === 4 && dem.length === 2);
  for (const bay of [{ values: { 'fc.horizonMonths': 99 } }, { values: { 'fc.horizonMonths': 0 } }, { values: { 'fc.horizonMonths': 4.5 } }, { values: { 'fc.horizonMonths': '6' } }, { values: { 'fc.horizonMonths': null } }, { values: [] }, { values: 'x' }, {}, null, 'rác']) {
    sv.setSystemValuesTransport(async () => bay);
    await sv.loadSystemValues();
    if (sv.getHorizonMonths() !== 4) check('giá trị sai ' + JSON.stringify(bay) + ' -> vẫn 4', false, sv.getHorizonMonths());
  }
  check('giá trị sai (ngoài 1..12, lẻ, chuỗi, null) hoặc phản hồi sai hình dạng -> luôn dùng mặc định 4', sv.getHorizonMonths() === 4);
  sv.setSystemValuesTransport(async () => ({ values: { 'fc.horizonMonths': 12, 'khoa.la': 5, 'hong': 'abc' } }));
  await sv.loadSystemValues();
  check('biên 12 hợp lệ; khoá lạ kiểu số được giữ, kiểu chuỗi bị bỏ', sv.getHorizonMonths() === 12 && sv.getSystemValue('khoa.la') === 5 && sv.getSystemValue('hong', 'mac') === 'mac');
  // lượt nạp dang dở khi đăng xuất không được "sống lại" sau đó
  let xong; sv.resetSystemValues();
  sv.setSystemValuesTransport(() => new Promise((res) => { xong = () => res({ values: { 'fc.horizonMonths': 9 } }); }));
  const dangNap = sv.loadSystemValues();
  sv.resetSystemValues();
  xong(); await dangNap; await nghi();
  check('đăng xuất giữa lúc đang nạp: kết quả muộn bị bỏ, vẫn 4', sv.getHorizonMonths() === 4);
  huy();

  // =====================================================================
  console.log('--- 7. Chốt chặn vai trò: chỉ master (central_admin) ---');
  const VAI = ['central_admin', 'bu_approver', 'bu_editor', 'viewer'];
  check('tabChoPhep("system"): chỉ central_admin; vai trò lạ / rỗng / undefined không vào', mn.tabChoPhep('system', 'central_admin') && ['bu_approver', 'bu_editor', 'viewer', 'admin', '', undefined, null].every((r) => !mn.tabChoPhep('system', r)));
  check('màn khác không bị khoá theo vai trò (Cài đặt cá nhân + mọi mục menu): 4 vai trò đều vào được', VAI.every((r) => mn.tabChoPhep('settings', r) && mn.MENU_ITEMS.every((m) => mn.tabChoPhep(m.id, r))));
  check('laMaster; "system" là màn hợp lệ nhưng KHÔNG nằm trong menu trái và KHÔNG chọn được làm trang đầu', mn.laMaster('central_admin') && VAI.slice(1).every((r) => !mn.laMaster(r)) && mn.VALID_TABS.includes('system') && !mn.MENU_ITEMS.some((m) => m.id === 'system') && VAI.every((r) => !mn.landingIdsFor(r).includes('system')));

  // =====================================================================
  console.log('--- 8. Hợp đồng trong mã nguồn ---');
  const cyc = doc('components/CycleBar.jsx'), hdr = doc('components/Header.jsx').replace(/\r\n/g, '\n'), app = doc('App.jsx'), api = doc('services/api.js');
  const gas = doc('services/gasClient.js'), page = doc('pages/SystemSettings.jsx'), sbar = doc('components/Sidebar.jsx');
  const callCreate = cyc.replace(/\/\/.*$/gm, '').match(/api\.createCycle\(\{[\s\S]*?\}\)/);
  check('CycleBar: createCycle KHÔNG còn gửi horizonMonths (máy chủ lấy theo cài đặt; gửi là đè lên cài đặt)', !!callCreate && !/horizonMonths/.test(callCreate[0]) && !/horizonMonths:\s*\d/.test(cyc));
  check('CycleBar: xem trước chu kỳ mới theo giá trị hệ thống (useSystemValues + monthsOfCycle)', /useSystemValues\(\)/.test(cyc) && /monthsOfCycle\(/.test(cyc) && /horizon_months: horizonMonths/.test(cyc) && /Chu kỳ đã tạo giữ nguyên/.test(cyc));
  const hardcode = [];
  (function duyet(d) {
    for (const e of fs.readdirSync(path.join(SRC, d), { withFileTypes: true })) {
      const rel = d ? d + '/' + e.name : e.name;
      if (e.isDirectory()) duyet(rel);
      else if (/\.jsx?$/.test(e.name) && !rel.startsWith('dev/') && /horizonMonths\s*:\s*\d/.test(doc(rel))) hardcode.push(rel);
    }
  })('');
  check('không nơi nào trong client còn gán cứng horizonMonths: <số> khi tạo chu kỳ', hardcode.length === 0, hardcode);
  check('Sidebar + ImportFromSourceModal không còn nói cứng "4 tháng" cho chu kỳ mới', !/chu kỳ 4 tháng/.test(sbar) && /useSystemValues/.test(sbar) && !/lấy 4 tháng/.test(doc('components/ImportFromSourceModal.jsx')));
  check('api: ba wrapper getSystemValues / getSystemSettings / setSystemSetting đúng tên action', /getSystemValues: \(\) =>/.test(api) && /callGAS\('getSystemValues'/.test(api) && /getSystemSettings: \(\) => callGAS\('getSystemSettings'/.test(api) && /setSystemSetting: \(payload\) => callGAS\('setSystemSetting', auth\(payload\)\)/.test(api));
  const nonIdem = gas.match(/NON_IDEMPOTENT_ACTIONS = new Set\(\[[\s\S]*?\]\);/)[0];
  check('getSystemValues là lượt gọi nền (quiet); cả ba action KHÔNG nằm trong NON_IDEMPOTENT_ACTIONS (đọc / ghi theo khoá + ngày: gửi lại an toàn)', /callGAS\('getSystemValues', auth\(\{\}\), \{ quiet: true \}\)/.test(api) && !/(getSystemValues|getSystemSettings|setSystemSetting)/.test(nonIdem));
  check('App: nạp giá trị hệ thống một lần sau đăng nhập (loadSystemValues, không await) và xoá khi đăng xuất', /setSystemValuesTransport\(\(\) => api\.getSystemValues\(\)\)/.test(app) && /\n\s*loadSystemValues\(\);/.test(app) && /resetSystemValues\(\);/.test(app));
  check('App: #hash / tab nhớ đi qua tabChoPhep theo vai trò; tab hiển thị được dẫn xuất (người không được vào -> Tổng quan)', /laTabHopLe = \(v\) => VALID_TABS\.includes\(v\) && tabChoPhep\(v, getSession\(\)\?\.user\?\.role\)/.test(app) && /const activeTab = tabChoPhep\(tabDat, user\?\.role\) \? tabDat : 'dashboard'/.test(app));
  check('App: mục Header chỉ được truyền cho master; màn render lười + qua activeTab', /onOpenSystemSettings=\{laMaster\(user\?\.role\) \? async \(\) => \{ if \(await confirmNavigateAway\(\)\) setActiveTab\('system'\)/.test(app) && /activeTab === 'system' && \(/.test(app) && /React\.lazy\(\(\) => import\('\.\/pages\/SystemSettings'\)\)/.test(app));
  check('Header: mục "Cài đặt hệ thống" chỉ hiện khi có onOpenSystemSettings, nằm ngay sau "Cài đặt"', /\{onOpenSystemSettings && \(/.test(hdr) && hdr.indexOf('> Cài đặt\n') > 0 && hdr.indexOf('> Cài đặt\n') < hdr.indexOf('Cài đặt hệ thống') && hdr.indexOf('Cài đặt hệ thống') < hdr.indexOf('Đổi mã PIN'));
  check('màn SystemSettings: tự chặn khi không phải master (không gọi máy chủ), banner tableMissing đúng chữ, tắt Lưu, hỏi xác nhận, nạp lại sau khi lưu', /if \(!laMaster\(user\?\.role\)\)/.test(page) && /Chưa chạy SQL đợt 8 — chưa lưu được/.test(page) && /data\.tableMissing \|\| !data\.canEdit/.test(page) && /appConfirm\(cauXacNhan\(/.test(page) && /Promise\.all\(\[nap\(\), loadSystemValues\(\)\]\)/.test(page));
  check('màn SystemSettings vẽ tổng quát (nhóm theo nhom, Hiệu lực từ min = hôm nay, Lịch sử mở rộng, thay đổi chờ hiệu lực)', /nhomCaiDat\(/.test(page) && /min=\{today\}/.test(page) && /aria-expanded=\{moLichSu\}/.test(page) && /choHieuLuc/.test(page) && /Về mặc định/.test(page) && !/fc\.horizonMonths/.test(page));
  const harness = doc('dev/appHarness.jsx');
  check('app-harness giả lập ba action + chế độ sys=off / sys=err + kiểm vai trò master', /case 'getSystemValues'/.test(harness) && /case 'getSystemSettings'/.test(harness) && /case 'setSystemSetting'/.test(harness) && /SYS_MODE/.test(harness) && /Chỉ master mới xem được cài đặt hệ thống\./.test(harness));

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
