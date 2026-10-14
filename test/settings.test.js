/**
 * settings.test.js — chốt CÀI ĐẶT CÁ NHÂN (14/10/2026): lựa chọn nhớ theo từng người dùng, bản sao trên máy chủ, màn Cài đặt.
 *
 * Như các bài dot*.test.js (không có jsdom):
 *  - LOGIC THUẦN nạp thật từ client/src và chạy: prefs.js (khoá theo người dùng, chuyển khoá cũ một lần), settings.js (kiểm hợp lệ,
 *    mặc định, ghi đè khoá nhớ, quyết định lúc mở app), prefsSync.js (gộp máy chủ thắng, tải lên lần đầu, ghi xuôi gộp 600ms,
 *    thất bại nhẹ nhàng) — với transport giả và bộ đếm giờ giả, không stub hàm nào của dự án;
 *  - HỢP ĐỒNG TRONG MÃ NGUỒN của phần giao diện (mục Cài đặt ở menu tài khoản, không khoá theo vai trò, App nối đồng bộ, chiều cao
 *    dòng ước lượng khớp CSS Gọn...).
 *
 *   node test/settings.test.js
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

/** localStorage giả, đủ length/key để duyệt khoá. */
function khoGia(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

/** Bộ đếm giờ giả: hẹn thì xếp hàng, tick() chạy các hẹn tới hạn. */
function dongHoGia() {
  let now = 0, id = 0;
  const q = new Map();
  return {
    setTimeout: (fn, ms) => { id += 1; q.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (i) => { q.delete(i); },
    async tick(ms) {
      now += ms;
      for (const [i, t] of [...q.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && q.has(i)) { q.delete(i); await t.fn(); }
      }
    },
    soHen: () => q.size
  };
}
const nghi = () => new Promise((r) => setImmediate(r));

async function main() {
  const pf = await imp('services/prefs.js');
  const stg = await imp('services/settings.js');
  const sync = await imp('services/prefsSync.js');
  const { ST } = stg;

  // =====================================================================
  console.log('--- 1. Lựa chọn nhớ theo TỪNG NGƯỜI DÙNG ---');
  let kho = khoGia();
  pf.__resetPrefsForTest(); pf.__setStorageForTest(kho);
  check('chưa biết người dùng: khoá cũ karofi_fc_pref:<khoá> (hành vi cũ giữ nguyên)', pf.savePref('bu', 'OEM') && kho.getItem('karofi_fc_pref:bu') === '"OEM"' && pf.loadPref('bu', '') === 'OEM');
  kho.setItem('karofi_fc_pref:cycle:OEM', '"c9"');
  kho.setItem('karofi_fc_pref:tab', '"annual"');
  kho.setItem('karofi_fc_sidebar_collapsed', '1');
  pf.setPrefsUser('alice');
  check('migrate một lần: khoá cũ chép sang khoá của người đầu tiên (kể cả khoá có dấu : và menu thu gọn)', pf.loadPref('bu', '') === 'OEM' && pf.loadPref('cycle:OEM', '') === 'c9' && pf.loadPref('tab', '') === 'annual' && pf.loadPref('sidebarCollapsed', false) === true);
  check('...rồi XOÁ khoá cũ (kể cả khoá thô của menu) — người thứ hai không thừa hưởng', ![...kho.m.keys()].some((k) => k.startsWith('karofi_fc_pref:') && !k.startsWith('karofi_fc_pref:@')) && kho.getItem('karofi_fc_sidebar_collapsed') === null);
  check('khoá lưu dưới karofi_fc_pref:@<id>:<khoá>', kho.getItem('karofi_fc_pref:@alice:bu') === '"OEM"');
  pf.savePref('bu', 'XK');
  pf.setPrefsUser('bob');
  check('người thứ hai bắt đầu SẠCH (không thấy bu/tab/cycle của alice)', pf.loadPref('bu', 'trong') === 'trong' && pf.loadPref('tab', 'dashboard') === 'dashboard' && pf.loadPref('cycle:OEM', 'x') === 'x');
  pf.savePref('bu', 'GT2');
  check('ghi của bob không đụng của alice', kho.getItem('karofi_fc_pref:@alice:bu') === '"XK"' && pf.loadPref('bu', '') === 'GT2');
  pf.setPrefsUser('alice');
  check('đổi lại alice: đọc đúng giá trị của alice', pf.loadPref('bu', '') === 'XK');
  pf.setPrefsUser('');
  check('setPrefsUser rỗng (hết phiên giữa chừng) GIỮ người cũ, không rơi về khoá chung', pf.getPrefsUser() === 'alice');
  pf.setPrefsUser('a b/c');
  pf.savePref('bu', 'OEM');
  check('id có ký tự lạ được mã hoá (không đè nhau)', kho.getItem('karofi_fc_pref:@a%20b%2Fc:bu') === '"OEM"');
  // migrate không ghi đè giá trị đã có
  kho = khoGia({ 'karofi_fc_pref:bu': '"CU"', 'karofi_fc_pref:@carol:bu': '"MOI"' });
  pf.__resetPrefsForTest(); pf.__setStorageForTest(kho);
  pf.setPrefsUser('carol');
  check('migrate không ghi đè giá trị đã có của người đó', pf.loadPref('bu', '') === 'MOI');
  // sự kiện ghi
  const sk = [];
  const go = pf.onPrefWrite((e) => sk.push(e));
  pf.savePref('tab', 'monthly'); pf.savePref('tab', 'monthly'); pf.savePref('tab', 'weekly', { silent: true }); pf.clearPref('tab'); pf.clearPref('tab');
  go();
  check('onPrefWrite: chỉ báo khi giá trị THẬT SỰ đổi; ghi silent có cờ; xoá khoá không có thì không báo', sk.length === 3 && sk[0].key === 'tab' && !sk[0].silent && sk[1].silent === true && sk[2].key === 'tab', sk);
  check('listPrefKeys chỉ liệt kê khoá của người hiện tại', (pf.setPrefsUser('dave'), pf.savePref('x1', 1), pf.listPrefKeys().join() === 'x1'));
  // localStorage hỏng
  pf.__setStorageForTest({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } });
  let nem = false;
  try { pf.loadPref('a', 1); pf.savePref('a', 1); pf.clearPref('a'); pf.listPrefKeys(); pf.loadMeta('p', []); pf.saveMeta('p', []); } catch { nem = true; }
  check('localStorage ném lỗi -> mọi đọc/ghi vẫn không ném', nem === false);

  // =====================================================================
  console.log('--- 2. Kiểm hợp lệ + mặc định của cài đặt ---');
  const ctx = { namHienTai: 2026, landingIds: ['dashboard', 'monthly', 'annual'], buCodes: ['OEM', 'XK'] };
  const v = (k, x, c = ctx) => stg.kiemCaiDat(k, x, c);
  check('mật độ: thoang / gon; thời gian toast: 3 / 4 / 6 / 10', v(ST.density, 'gon') && v(ST.density, 'thoang') && !v(ST.density, 'compact') && [3, 4, 6, 10].every((n) => v(ST.toastSec, n)) && !v(ST.toastSec, 5) && !v(ST.toastSec, '4'));
  check('trang đầu: chỉ màn vai trò được thấy; BU: chỉ đơn vị được cấp; năm: hiện tại..+2', v(ST.landing, 'monthly') && !v(ST.landing, 'exports') && !v(ST.landing, 'settings') && v(ST.bu, 'XK') && !v(ST.bu, 'GT2') && v(ST.annualYear, 2027) && !v(ST.annualYear, 2025) && !v(ST.annualYear, 2029) && !v(ST.annualYear, '2027'));
  check('tiền / cách xem / bool', v(ST.annualTien, 'USD') && !v(ST.annualTien, 'EUR') && v(ST.annualKieu, 'sku') && !v(ST.annualKieu, 'x') && v(ST.dashCharts, true) && !v(ST.dashCharts, 'true') && v(ST.onlyNonZero, false) && v(ST.sidebarCollapsed, true));
  check('không có ctx: chỉ kiểm kiểu (không bắt tập giá trị)', v(ST.landing, 'batky', {}) && v(ST.bu, 'ABC', {}) && !v(ST.landing, 'Có Dấu', {}) && !v(ST.bu, 'a b', {}));
  check('khoá lạ không hợp lệ', !stg.kiemCaiDat('st.khac', 1, ctx));
  kho = khoGia(); pf.__resetPrefsForTest(); pf.__setStorageForTest(kho); pf.setPrefsUser('u1');
  const macDinh = stg.readSettings(ctx);
  check('KHÔNG có cài đặt nào = hành vi cũ: mọi ô "tự động" là null, mật độ thoáng, toast 4 giây', macDinh.density === 'thoang' && macDinh.toastSec === 4 && ['sidebarCollapsed', 'landing', 'bu', 'annualYear', 'annualTien', 'annualKieu', 'dashCharts', 'onlyNonZero'].every((k) => macDinh[k] === null), macDinh);
  pf.savePref(ST.density, 'gon'); pf.savePref(ST.toastSec, 10); pf.savePref(ST.bu, 'XK'); pf.savePref(ST.annualYear, 2027); pf.savePref(ST.onlyNonZero, false); pf.savePref(ST.dashCharts, true);
  const co = stg.readSettings(ctx);
  check('đọc lại đúng giá trị đã đặt', co.density === 'gon' && co.toastSec === 10 && co.bu === 'XK' && co.annualYear === 2027 && co.onlyNonZero === false && co.dashCharts === true);
  pf.savePref(ST.density, 'rong'); pf.savePref(ST.toastSec, 99); pf.savePref(ST.bu, 'GT2'); pf.savePref(ST.annualYear, 2020); pf.savePref(ST.landing, 'exports'); pf.savePref(ST.annualTien, 'EUR');
  const sai = stg.readSettings(ctx);
  check('giá trị SAI (máy chủ trả bậy, năm quá cũ, đơn vị bị gỡ quyền, màn không còn thấy) -> coi như chưa đặt', sai.density === 'thoang' && sai.toastSec === 4 && sai.bu === null && sai.annualYear === null && sai.landing === null && sai.annualTien === null, sai);
  check('khoaTuongMinh chỉ liệt kê khoá HỢP LỆ; khoaCaiDatConLai liệt kê cả rác', !stg.khoaTuongMinh(ctx).includes(ST.density) && stg.khoaTuongMinh(ctx).includes(ST.dashCharts) && stg.khoaCaiDatConLai().includes(ST.density));

  // =====================================================================
  console.log('--- 3. Mặc định tường minh vs "nhớ lần cuối" ---');
  kho = khoGia(); pf.__resetPrefsForTest(); pf.__setStorageForTest(kho); pf.setPrefsUser('u2');
  pf.savePref('monthlyOnlyNonZero', true); pf.savePref('annualYear', 2026);
  const ghi = stg.seedRemembered({ sidebarCollapsed: true, annualYear: 2027, annualTien: 'USD', annualKieu: null, dashCharts: false, onlyNonZero: false });
  check('seedRemembered ghi đè khoá nhớ (ẩn dòng 0 -> cả tháng lẫn tuần); ô null thì KHÔNG đụng', pf.loadPref('annualYear', 0) === 2027 && pf.loadPref('monthlyOnlyNonZero', true) === false && pf.loadPref('weeklyOnlyNonZero', true) === false && pf.loadPref('sidebarCollapsed', false) === true && pf.loadPref('annualTien', '') === 'USD' && pf.loadPref('dashCharts', true) === false && pf.loadPref('annualKieu', 'khach') === 'khach' && !ghi.includes('annualKieu'), ghi);
  pf.savePref('annualYear', 2028);   // người dùng đổi tiếp trong phiên
  check('sau khi áp, lựa chọn trong phiên vẫn được nhớ như cũ (không bị ghi đè lại)', pf.loadPref('annualYear', 0) === 2028);
  const chi = []; stg.seedRemembered({ annualYear: 2027, annualTien: 'USD' }, [ST.annualTien], (k, x) => chi.push([k, x]));
  check('seedRemembered(only) chỉ ghi các khoá st.* được nêu', chi.length === 1 && chi[0][0] === 'annualTien');
  const ss = new Map(); const khoPhien = { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, x) => ss.set(k, x) };
  check('lanMoDauCuaPhien: lần đầu true, sau đó false; theo từng người; sessionStorage hỏng -> false', stg.lanMoDauCuaPhien('a', khoPhien) === true && stg.lanMoDauCuaPhien('a', khoPhien) === false && stg.lanMoDauCuaPhien('b', khoPhien) === true && stg.lanMoDauCuaPhien('a', { getItem() { throw new Error('x'); } }) === false);
  const q = (o) => stg.quyetDinhKhoiDong({ moDau: true, coHash: false, tabDaNho: 'monthly', landing: null, bu: null, buHienTai: 'OEM', buCodes: ['OEM', 'XK'], buCuaToi: 'OEM', ...o });
  check('không có cài đặt: giữ tab + đơn vị đã nhớ (hành vi cũ)', q({}).tab === 'monthly' && q({}).bu === 'OEM');
  check('trang đầu tường minh thắng tab nhớ — chỉ ở lần mở đầu và khi KHÔNG có #hash', q({ landing: 'dashboard' }).tab === 'dashboard' && q({ landing: 'dashboard', moDau: false }).tab === 'monthly' && q({ landing: 'dashboard', coHash: true }).tab === 'monthly');
  check('BU tường minh thắng đơn vị nhớ ở lần mở đầu; không phải lần đầu thì giữ đơn vị đang dùng', q({ bu: 'XK' }).bu === 'XK' && q({ bu: 'XK', moDau: false }).bu === 'OEM');
  check('đơn vị nhớ không còn quyền -> rơi về đơn vị của tài khoản; người một đơn vị bị cố định (st.bu không áp)', q({ buHienTai: 'GT2' }).bu === 'OEM' && q({ buHienTai: '', buCuaToi: '' }).bu === 'OEM' && q({ bu: 'XK', buCodes: ['OEM'] }).bu === 'OEM');
  const hen = dongHoGia();
  const nhanh = await stg.choToiDa(Promise.resolve(7), 50, hen);
  const cham = stg.choToiDa(new Promise(() => {}), 50, hen); await hen.tick(60);
  check('choToiDa: kịp thì trả giá trị; quá hạn thì null; Promise lỗi thì null (không ném)', nhanh === 7 && (await cham) === null && (await stg.choToiDa(Promise.reject(new Error('x')), 50, hen)) === null);
  pf.savePref(ST.density, 'gon'); pf.savePref(ST.dashCharts, true); pf.savePref('tab', 'annual');
  const xoa = stg.khoiPhucMacDinh();
  check('Khôi phục mặc định xoá mọi st.* nhưng GIỮ các khoá nhớ thường', xoa >= 2 && pf.loadPref(ST.density, null) === null && pf.loadPref(ST.dashCharts, null) === null && pf.loadPref('tab', '') === 'annual');

  // =====================================================================
  console.log('--- 4. Đồng bộ với máy chủ ---');
  check('khoá nào được đồng bộ: khoá nhớ đã biết, st.*, cycle:/dashCycle:; khoá lạ / sai dạng thì không', ['tab', 'bu', 'annualYear', 'cycle:OEM', 'dashCycle:XK', 'st.density', 'sidebarCollapsed', 'monthlyOnlyNonZero', 'productsBU'].every(sync.laKhoaDongBo) && !['khoa-la', 'Tab', '1abc', 'st.' + 'x'.repeat(60)].some(sync.laKhoaDongBo));

  async function dung(serverPrefs, local = {}, opts = {}) {
    const k = khoGia(); pf.__resetPrefsForTest(); pf.__setStorageForTest(k); sync.resetPrefsSync();
    pf.setPrefsUser(opts.user || 'u9');
    Object.entries(local).forEach(([a, b]) => pf.savePref(a, b));
    if (opts.pending) pf.saveMeta('pending', opts.pending);
    if (opts.first) pf.saveMeta('first', true);
    const dh = dongHoGia(); sync.configurePrefsSync({ setTimeout: dh.setTimeout, clearTimeout: dh.clearTimeout });
    const goi = { get: 0, set: [] };
    const tr = {
      get: async () => { goi.get++; if (opts.getLoi) throw new Error(opts.getLoi); return { prefs: serverPrefs }; },
      set: async (c) => { if (opts.setLoi) throw new Error(opts.setLoi); goi.set.push(c); for (const [a, b] of Object.entries(c)) { if (b === null) delete serverPrefs[a]; else serverPrefs[a] = b; } return { ok: true }; }
    };
    sync.setPrefsTransport(tr);
    return { k, dh, goi, tr, server: serverPrefs };
  }

  let e = await dung({ tab: 'annual', bu: 'XK', 'st.density': 'gon' }, { tab: 'monthly', bu: 'OEM' }, { first: true });
  let r = await sync.startPrefsSync('u9');
  check('máy chủ THẮNG: giá trị máy chủ ghi đè giá trị ở máy, kể cả khoá st.*', r.ok && pf.loadPref('tab', '') === 'annual' && pf.loadPref('bu', '') === 'XK' && pf.loadPref('st.density', '') === 'gon' && r.doi.length === 3, r);
  check('...và không dội lại (ghi từ máy chủ về là silent): không gửi gì lên', e.goi.set.length === 0 && sync.getSyncStatus().pending === 0);

  e = await dung({}, { tab: 'monthly', bu: 'OEM', 'st.toastSec': 6, 'khoa-la': 1 });
  r = await sync.startPrefsSync('u9');
  check('LẦN ĐẦU: khoá máy có mà máy chủ chưa có thì tải lên MỘT lần (khoá lạ không đi)', r.ok && e.goi.set.length === 1 && e.goi.set[0].tab === 'monthly' && e.goi.set[0]['st.toastSec'] === 6 && !('khoa-la' in e.goi.set[0]), e.goi.set);
  check('...rồi đánh dấu đã tải lần đầu, hàng chờ rỗng', pf.loadMeta('first', false) === true && JSON.stringify(pf.loadMeta('pending', null)) === '[]');

  e = await dung({ tab: 'annual' }, { tab: 'monthly', 'st.density': 'gon' }, { first: true });
  r = await sync.startPrefsSync('u9');
  check('SAU lần đầu: st.* vắng trên máy chủ nghĩa là đã khôi phục ở máy khác -> xoá ở đây (không tải lên ngược)', pf.loadPref('st.density', null) === null && e.goi.set.length === 0, e.goi.set);
  check('...còn khoá nhớ thường vắng trên máy chủ thì giữ ở máy (không xoá)', pf.loadPref('tab', '') === 'annual' /* máy chủ thắng khoá có mặt */);

  e = await dung({ bu: 'XK', tab: 'annual' }, { bu: 'GT2', tab: 'weekly' }, { first: true, pending: ['bu'] });
  r = await sync.startPrefsSync('u9');
  check('khoá đang CHỜ GỬI từ lần trước: giá trị ở máy thắng và được gửi lên; khoá khác theo máy chủ', pf.loadPref('bu', '') === 'GT2' && e.server.bu === 'GT2' && pf.loadPref('tab', '') === 'annual', e.server);

  // ghi xuôi
  e = await dung({}, {}, { first: true });
  await sync.startPrefsSync('u9');
  pf.savePref('tab', 'monthly'); pf.savePref('bu', 'XK'); pf.savePref('khoa-la', 1); pf.savePref('st.density', 'gon');
  check('ghi xuôi: chưa gửi ngay (debounce), đánh dấu chờ gửi; khoá lạ không đánh dấu', e.goi.set.length === 0 && sync.getSyncStatus().pending === 3);
  await e.dh.tick(599); check('...599ms vẫn chưa gửi', e.goi.set.length === 0);
  await e.dh.tick(2); check('...sau ~600ms gửi GỘP một lượt, chỉ các khoá đã đổi', e.goi.set.length === 1 && Object.keys(e.goi.set[0]).sort().join() === 'bu,st.density,tab', e.goi.set);
  pf.savePref('tab', 'weekly'); pf.savePref('tab', 'dashboard');
  await e.dh.tick(700);
  check('đổi liên tiếp một khoá -> chỉ gửi giá trị cuối', e.goi.set.length === 2 && e.goi.set[1].tab === 'dashboard' && Object.keys(e.goi.set[1]).length === 1);
  pf.clearPref('st.density'); await e.dh.tick(700);
  check('xoá khoá -> gửi null', e.goi.set.length === 3 && e.goi.set[2]['st.density'] === null && !('st.density' in e.server));

  // chia lượt 40 khoá
  e = await dung({}, {}, { first: true });
  await sync.startPrefsSync('u9');
  for (let i = 0; i < 45; i++) pf.savePref('cycle:BU' + i, 'c' + i);
  await e.dh.tick(700);
  check('tối đa 40 khoá mỗi lượt gửi (giới hạn máy chủ): 45 khoá -> 40 + 5', e.goi.set.length === 2 && Object.keys(e.goi.set[0]).length === 40 && Object.keys(e.goi.set[1]).length === 5, e.goi.set.map((x) => Object.keys(x).length));
  e = await dung({}, {}, { first: true });
  await sync.startPrefsSync('u9');
  pf.savePref('st.landing', 'x'.repeat(1100)); pf.savePref('tab', 'monthly');
  await e.dh.tick(700);
  check('giá trị > 1000 ký tự bị bỏ riêng khoá đó, không làm hỏng cả lượt', e.goi.set.length === 1 && 'tab' in e.goi.set[0] && !('st.landing' in e.goi.set[0]), e.goi.set);

  // THẤT BẠI NHẸ NHÀNG
  e = await dung({}, { tab: 'monthly', 'st.density': 'gon' }, { getLoi: 'relation "fc_user_prefs" does not exist' });
  let nemSync = false; try { r = await sync.startPrefsSync('u9'); } catch { nemSync = true; }
  check('máy chủ chưa có bảng (getMyPrefs lỗi): KHÔNG ném, trả ok=false, giữ giá trị ở máy, trạng thái offline', !nemSync && r.ok === false && pf.loadPref('tab', '') === 'monthly' && pf.loadPref('st.density', '') === 'gon' && sync.getSyncStatus().status === 'offline');
  e = await dung({}, {}, { first: true, setLoi: 'relation "fc_user_prefs" does not exist' });
  await sync.startPrefsSync('u9');
  pf.savePref('st.density', 'gon');
  await e.dh.tick(700);
  check('setMyPrefs lỗi: giữ giá trị ở máy + còn trong hàng chờ BỀN (lần mở sau gửi tiếp), trạng thái offline, không ném', pf.loadPref('st.density', '') === 'gon' && JSON.stringify(pf.loadMeta('pending', [])) === '["st.density"]' && sync.getSyncStatus().status === 'offline');
  let lanThu = 0; for (let i = 0; i < 12; i++) { await e.dh.tick(130000); lanThu++; }
  check('thử lại có giới hạn (không vòng lặp vô hạn khi bảng vẫn chưa có)', sync.getSyncStatus().pending === 1 && e.dh.soHen() === 0, lanThu);
  e.server; // bảng "có" lại
  const khoVd = e.k;
  sync.resetPrefsSync(); pf.__setStorageForTest(khoVd);
  const sv = {}; sync.setPrefsTransport({ get: async () => ({ prefs: sv }), set: async (c) => { Object.assign(sv, c); return {}; } });
  r = await sync.startPrefsSync('u9');
  check('lần mở sau (bảng đã có): hàng chờ bền được gửi', r.ok && sv['st.density'] === 'gon');
  e = await dung({}, {}, {});
  e.tr.get = async () => ({ prefs: [1, 2] });
  r = await sync.startPrefsSync('u9');
  check('máy chủ trả dữ liệu sai dạng -> thất bại nhẹ nhàng (không gộp gì)', r.ok === false);
  sync.setPrefsTransport(null);
  r = await sync.startPrefsSync('u9');
  check('chưa cắm transport -> không làm gì, không ném', r.ok === false);
  e = await dung({}, {}, {});
  r = await sync.startPrefsSync('');
  check('chưa biết người dùng -> không đồng bộ', r.ok === false && e.goi.get === 0);
  check('hằng số khớp giới hạn máy chủ: 600ms, 40 khoá / lượt', sync.DEBOUNCE_MS === 600 && sync.MAX_KEYS_PER_CALL === 40 && sync.MAX_VALUE_CHARS === 1000);

  // =====================================================================
  console.log('--- 5. Hợp đồng trong mã nguồn ---');
  const menu = doc('utils/menu.js'), app = doc('App.jsx'), hd = doc('components/Header.jsx'), st = doc('pages/Settings.jsx'), api = doc('services/api.js'), gas = doc('services/gasClient.js'), css = doc('index.css'), dens = doc('utils/density.js');
  check('màn settings là tab hợp lệ NHƯNG không có trong menu trái (9 mục, không khoá vai trò); mọi vai trò chọn được làm trang đầu chỉ các màn mình thấy', /EXTRA_TABS = \['settings', 'system'\]/.test(menu) && !/id: 'settings'/.test(menu) && /VALID_TABS = \[\.\.\.MENU_ITEMS\.map/.test(menu));
  const mn = await imp('utils/menu.js');
  check('landingIdsFor: viewer / admin thấy Xuất báo cáo, người lập / duyệt thì không; không ai có settings', mn.landingIdsFor('central_admin').includes('exports') && mn.landingIdsFor('viewer').includes('exports') && !mn.landingIdsFor('bu_editor').includes('exports') && !mn.landingIdsFor('bu_approver').includes('exports') && ['central_admin', 'viewer', 'bu_editor', 'bu_approver'].every((r) => !mn.landingIdsFor(r).includes('settings') && mn.landingIdsFor(r).includes('dashboard')) && mn.VALID_TABS.includes('settings'));
  check('Header: mục "Cài đặt" trong menu tài khoản, ChangePinDialog export để màn Cài đặt dùng lại', /Cài đặt/.test(hd) && /onOpenSettings/.test(hd) && /export function ChangePinDialog/.test(hd) && /<ChangePinDialog onClose/.test(st));
  check('App: mở Cài đặt từ Header (qua confirmNavigateAway) + render màn Settings cho mọi vai trò (không điều kiện role)', /onOpenSettings=\{async \(\) => \{ if \(await confirmNavigateAway\(\)\) setActiveTab\('settings'\)/.test(app) && /\{activeTab === 'settings' && <Settings /.test(app));
  check('App: nối đồng bộ (transport api.getMyPrefs / setMyPrefs), chờ tối đa 3s song song với bootstrap, áp mật độ + thời gian toast', /setPrefsTransport\(\{ get: \(\) => api\.getMyPrefs\(\), set: \(changes\) => api\.setMyPrefs\(changes\) \}\)/.test(app) && /choToiDa\(dongBo, CHO_DONG_BO_TOI_DA_MS\)/.test(app) && /applyDensity\(caiDat\.density\)/.test(app) && /configureToast\(\{ autoMs: caiDat\.toastSec \* 1000 \}\)/.test(app));
  check('App: không ghi tab / đơn vị khi chưa đăng nhập (khỏi lọt vào khoá chung); gửi nốt cài đặt trước khi đăng xuất', /if \(session\) savePref\('tab', activeTab\)/.test(app) && /currentBU && session\) savePref\('bu', currentBU\)/.test(app) && /await choToiDa\(flushPrefs\(\), 1500\)/.test(app));
  check('auth.js gắn người dùng cho prefs ngay khi có phiên (module load + mỗi lần đăng nhập), không rơi về khoá chung khi đăng xuất', /setPrefsUser\(session\.user\.id\)/.test(doc('services/auth.js')) && /if \(next\?\.user\?\.id\) setPrefsUser/.test(doc('services/auth.js')));
  check('api: getMyPrefs / setMyPrefs có, quiet, KHÔNG nằm trong NON_IDEMPOTENT_ACTIONS (setMyPrefs là upsert, đọc thì tự thử lại)', /getMyPrefs:/.test(api) && /setMyPrefs:/.test(api) && !/NON_IDEMPOTENT_ACTIONS = new Set\([\s\S]*?(getMyPrefs|setMyPrefs)[\s\S]*?\]\);/.test(gas.replace(/\/\/.*$/gm, '')) && /opts\.quiet/.test(gas));
  check('Sidebar đọc khoá nhớ sidebarCollapsed (không còn khoá thô)', /'sidebarCollapsed'/.test(doc('components/Sidebar.jsx')) && !/localStorage\.(get|set)Item/.test(doc('components/Sidebar.jsx')));
  check('Settings: có đủ các mục (Giao diện / Khi mở app / Thông báo / Bảo mật) và nút Khôi phục mặc định', ['Giao diện', 'Khi mở app', 'Thông báo', 'Bảo mật', 'Khôi phục mặc định', 'Mật độ bảng', 'Trang đầu', 'Đổi mã PIN'].every((t) => st.includes(t)));
  // chiều cao dòng Gọn
  check('CSS Gọn thấp hơn đúng GON_BOT_PX = 8 (py-2 8->4 mỗi bên); ước lượng cuộn ảo đổi theo mật độ ở cả 4 bảng dài', /GON_BOT_PX = 8/.test(dens) && /html\.dens-gon :is\(td, th\)\.py-2 \{ padding-block: 0\.25rem; \}/.test(css) && ['pages/MonthlyForecast.jsx', 'pages/WeeklyForecast.jsx', 'pages/Actuals.jsx', 'pages/Products.jsx'].every((f) => /useRowHeight\(ROW_HEIGHT_PX\)/.test(doc(f)) && /utils\/useRowHeight/.test(doc(f)) && /estimateSize: \(\) => chieuCaoDong/.test(doc(f)) && /rowVirtualizer\.measure\(\)/.test(doc(f))));
  const dn = await imp('utils/density.js');
  check('rowHeightFor: thoáng giữ nguyên, gọn bớt 8px', (dn.rowHeightFor(37, 'thoang') === 37 && dn.rowHeightFor(37, 'gon') === 29 && dn.rowHeightFor(39, 'gon') === 31));
  check('toast: autoMs đọc từ cấu hình (configureToast) — thời gian hiện đổi theo cài đặt', /autoMs: AUTO_DISMISS_MS/.test(doc('services/toastService.js')) && /cfg\.autoMs/.test(doc('services/toastService.js')));
  const ts = await imp('services/toastService.js');
  const dh2 = dongHoGia(); ts.configureToast({ setTimeout: dh2.setTimeout, clearTimeout: dh2.clearTimeout, autoMs: 10000 });
  ts.resetToasts(); ts.toast.info('a'); await dh2.tick(9000); const conSong = ts.getToastSnapshot().visible.length; await dh2.tick(1500);
  check('toast 10 giây: còn sống sau 9s, tắt sau 10s; lỗi vẫn KHÔNG tự tắt', conSong === 1 && ts.getToastSnapshot().visible.length === 0 && (ts.toast.error('lỗi'), await dh2.tick(60000), ts.getToastSnapshot().visible.length === 1));
  ts.resetToasts(); ts.configureToast({ setTimeout: (...a) => globalThis.setTimeout(...a), clearTimeout: (...a) => globalThis.clearTimeout(...a), autoMs: 4000 });

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  if (fail) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
