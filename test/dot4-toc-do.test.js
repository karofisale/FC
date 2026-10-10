/**
 * dot4-toc-do.test.js — chốt ĐỢT 4 (11/10/2026), phần CLIENT của FC: bớt request thừa lúc mở app, hộp "Chờ duyệt" kế hoạch năm dùng
 * MỘT action của server (có dự phòng cho server cũ), cache danh mục có hạn, kiểm tra build/chunk.
 *
 * Cùng cách làm với dot3-tung-man.test.js: LOGIC THUẦN nạp thật từ client/src và chạy; phần giao diện/dây nối kiểm bằng mẫu trong mã nguồn.
 *   node test/dot4-toc-do.test.js
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

async function main() {
  // =====================================================================
  console.log('--- 1. Hộp "Chờ duyệt" kế hoạch năm: một lượt gọi, có dự phòng cho server cũ ---');
  const pe = await imp('utils/annualPending.js');
  const plans = [
    { id: 'p2', businessUnitCode: 'XK', unitName: 'Export OEM', year: 2027, kind: 'base', revisionNo: 2, status: 'submitted', submittedBy: 'ketoan', submittedAt: '2026-10-09T02:00:00Z', createdBy: 'ketoan', updatedAt: '2026-10-09T02:00:00Z', totalRevenueVnd: 0 },
    { id: 'p1', businessUnitCode: 'OEM', unitName: 'Domestic OEM', year: 2026, kind: 'adjust', revisionNo: 1, status: 'submitted', submittedBy: 'lan', submittedAt: '2026-10-08T02:00:00Z', createdBy: 'lan', updatedAt: '2026-10-08T02:00:00Z', totalRevenueVnd: 128_400_000_000 },
    { id: 'p3', businessUnitCode: 'OEM', unitName: 'Domestic OEM', year: 2027, kind: 'base', revisionNo: 1, status: 'submitted', submittedBy: '', submittedAt: null, createdBy: 'hoa', updatedAt: '2026-10-07T02:00:00Z', totalRevenueVnd: 5 }
  ];
  const goi = { motLuot: 0, liet: [], layDonVi: 0 };
  const nguon = (over) => ({
    motLuot: async () => { goi.motLuot++; return { plans }; },
    liet: async ({ bu }) => { goi.liet.push(bu); return { plans: [] }; },
    layDonVi: async () => { goi.layDonVi++; return [{ code: 'OEM' }]; },
    ...over
  });
  let r = await pe.gomChoDuyet(nguon());
  check('server mới: đúng MỘT lượt gọi listPendingAnnualPlans, không gọi listAnnualPlans từng đơn vị, không đọc danh sách đơn vị', goi.motLuot === 1 && goi.liet.length === 0 && goi.layDonVi === 0 && r.dungDuPhong === false);
  check('mục có đơn vị (mã + tên), năm, loại, lần sửa, người gửi, ngày gửi, tổng — cùng hình dạng với cách cũ (bu, tenDonVi, nam, loai, lanSua, guiLuc, nguoiTao)',
    r.items.length === 3 && r.items[0].bu === 'OEM' && r.items[0].tenDonVi === 'Domestic OEM' && r.items[0].nam === 2026 && r.items[0].loai === 'adjust' && r.items[0].lanSua === 1
    && r.items[0].nguoiGui === 'lan' && r.items[0].guiLuc === '2026-10-08T02:00:00Z' && r.items[0].tong === 128_400_000_000 && r.items[0].nguoiTao === 'lan' && r.items[0].id === 'p1', r.items[0]);
  check('xếp theo năm, rồi đơn vị, rồi loại (như cách cũ)', r.items.map((x) => x.id).join() === 'p1,p3,p2', r.items.map((x) => x.id));
  check('chưa ghi ngày gửi thì lấy ngày cập nhật; chưa ghi người gửi thì lấy người tạo', r.items.find((x) => x.id === 'p3').guiLuc === '2026-10-07T02:00:00Z' && r.items.find((x) => x.id === 'p3').nguoiGui === 'hoa');

  goi.motLuot = 0; goi.liet = []; goi.layDonVi = 0;
  const cu = await pe.gomChoDuyet(nguon({
    motLuot: async () => { goi.motLuot++; throw new Error('Action chưa được cài đặt: listPendingAnnualPlans'); },
    layDonVi: async () => { goi.layDonVi++; return [{ code: 'OEM', name: 'Domestic OEM' }, { code: 'XK', name: 'Export' }]; },
    liet: async ({ bu }) => { goi.liet.push(bu); return { plans: bu === 'OEM' ? [{ id: 'q1', year: 2027, kind: 'base', revisionNo: 1, status: 'submitted', createdBy: 'a' }, { id: 'q2', year: 2026, kind: 'base', revisionNo: 1, status: 'approved' }] : [] }; }
  }));
  check('server CŨ (báo "Action chưa được cài đặt"): tự rơi về cách cũ — đọc danh sách đơn vị rồi listAnnualPlans từng đơn vị, vẫn ra đúng kết quả', goi.motLuot === 1 && goi.layDonVi === 1 && goi.liet.join() === 'OEM,XK' && cu.dungDuPhong === true && cu.items.length === 1 && cu.items[0].id === 'q1' && cu.items[0].bu === 'OEM', cu);

  goi.liet = []; goi.layDonVi = 0;
  let loi = null;
  try { await pe.gomChoDuyet(nguon({ motLuot: async () => { throw new Error('FORBIDDEN: Vai trò "viewer" không được phép thực hiện thao tác này.'); } })); } catch (e) { loi = e; }
  check('lỗi KHÁC (FORBIDDEN, mất mạng...) ném ra, KHÔNG dự phòng (dự phòng cũng sẽ lỗi và chỉ nhân số lượt gọi)', loi && /FORBIDDEN/.test(loi.message) && goi.liet.length === 0 && goi.layDonVi === 0);
  check('laLoiChuaCoHam chỉ nhận đúng câu "Action chưa được cài đặt: ..." (không nhận nhầm lỗi nghiệp vụ có chữ "không tồn tại")', pe.laLoiChuaCoHam(new Error('Action chưa được cài đặt: x')) && !pe.laLoiChuaCoHam(new Error('Chu kỳ không tồn tại')) && !pe.laLoiChuaCoHam(new Error('FORBIDDEN: ...')) && !pe.laLoiChuaCoHam(null));
  check('cách gom CŨ (gomKeHoachNamChoDuyet) vẫn còn nguyên làm đường dự phòng', typeof pe.gomKeHoachNamChoDuyet === 'function');

  const hc = doc('components/annual/HopChoDuyet.jsx');
  const api = doc('services/api.js');
  check('hook useChoDuyetNam: gọi gomChoDuyet với api.listPendingAnnualPlans; danh sách đơn vị chỉ đọc khi phải dự phòng (hàm layDonVi chạy lười)', /gomChoDuyet\(\{/.test(hc) && /motLuot: api\.listPendingAnnualPlans/.test(hc) && /liet: api\.listAnnualPlans/.test(hc) && /layDonVi: async \(\) =>/.test(hc));
  check('hook vẫn chỉ chạy cho người duyệt (batDau) và nuốt lỗi (hộp / badge chỉ là phần phụ)', /if \(!batDau\) \{ setKq\(KHONG_CO\); return; \}/.test(hc) && /catch \{/.test(hc));
  check('hộp hiện người gửi + ngày gửi + tổng doanh thu rút gọn (tooltip số đầy đủ)', /x\.nguoiGui/.test(hc) && /tienRutGon\(x\.tong\)/.test(hc) && /tienDayDu\(x\.tong\)/.test(hc));
  check('api.js: listPendingAnnualPlans không tham số (phạm vi theo quyền ở server)', /listPendingAnnualPlans: \(\) => callGAS\('listPendingAnnualPlans', auth\(\)\)/.test(api));

  // =====================================================================
  console.log('--- 2. Lúc mở app: đếm nhẹ thay cho tải cả danh sách phê duyệt ---');
  const goiDem = [];
  const dem1 = await pe.demYeuCauChoDuyet(async (a, p) => { goiDem.push(a); return a === 'countPendingApprovals' ? { count: 7 } : []; });
  check('server mới: chỉ gọi countPendingApprovals (một dòng đếm), không gọi getApprovals', dem1 === 7 && goiDem.join() === 'countPendingApprovals');
  goiDem.length = 0;
  const dem2 = await pe.demYeuCauChoDuyet(async (a, p) => {
    goiDem.push(a + JSON.stringify(p || {}));
    if (a === 'countPendingApprovals') throw new Error('Action chưa được cài đặt: countPendingApprovals');
    return [{ id: 1 }, { id: 2 }, { id: 3 }];
  });
  check('server CŨ: rơi về getApprovals({status: pending}) rồi đếm — badge vẫn đúng', dem2 === 3 && goiDem.join('|') === 'countPendingApprovals{}|getApprovals{"status":"pending"}', goiDem);
  let loi2 = null;
  try { await pe.demYeuCauChoDuyet(async () => { throw new Error('Không kết nối được máy chủ.'); }); } catch (e) { loi2 = e; }
  check('lỗi khác ném ra (App bắt và coi như 0, không chặn cả trang)', loi2 && /kết nối/.test(loi2.message));
  const app = doc('App.jsx');
  check('App.loadInitialData: gọi api.countPendingApprovals (song song với getBootstrap), KHÔNG còn getApprovals({status:"pending"}) lúc mở app', /api\.countPendingApprovals\(\)\.catch\(\(\) => 0\)/.test(app) && !/api\.getApprovals\(/.test(app) && /setPendingApprovalsCount\(soChoDuyet\)/.test(app) && /api\.getBootstrap\(\),/.test(app));
  check('api.js: countPendingApprovals đi qua demYeuCauChoDuyet (có dự phòng server cũ)', /countPendingApprovals: \(\) => demYeuCauChoDuyet\(/.test(api));
  check('hộp Chờ duyệt kế hoạch năm vẫn chỉ gọi cho người duyệt (bu_approver / central_admin)', /useChoDuyetNam\(!!session && laNguoiDuyet\)/.test(app) && /laNguoiDuyet = user\?\.role === 'bu_approver' \|\| user\?\.role === 'central_admin'/.test(app));
  check('màn Phê duyệt vẫn cập nhật chấm số khi người dùng xử lý (onCountChange) — con số do lượt đếm lúc mở app chỉ là giá trị đầu', /onCountChange=\{setPendingApprovalsCount\}/.test(app));

  // =====================================================================
  console.log('--- 3. Cache danh mục có hạn ---');
  const cc = await imp('utils/cacheCoHan.js');
  let t = 0;
  const kho = cc.taoCacheCoHan(1000, () => t);
  let soNap = 0;
  const nap = (v) => async () => { soNap++; return v + soNap; };
  const [a1, a2] = await Promise.all([kho.lay('k', nap('x')), kho.lay('k', nap('x'))]);
  check('hai nơi gọi cùng lúc cùng khoá -> MỘT lượt nạp (giữ promise)', soNap === 1 && a1 === a2 && a1 === 'x1');
  t = 999;
  check('còn hạn -> dùng lại, không nạp', (await kho.lay('k', nap('x'))) === 'x1' && soNap === 1);
  t = 1000;
  check('hết hạn -> lượt kế tiếp nạp mới', (await kho.lay('k', nap('x'))) === 'x2' && soNap === 2);
  check('khoá khác có cache riêng', (await kho.lay('k2', nap('y'))) === 'y3' && soNap === 3);
  kho.xoa();
  check('xoa() vô hiệu hoá toàn bộ (mọi lần ghi danh mục / đăng nhập / đăng xuất)', (await kho.lay('k', nap('x'))) === 'x4' && kho.kichThuoc === 1);
  let loi3 = null;
  try { await kho.lay('hong', async () => { throw new Error('mạng'); }); } catch (e) { loi3 = e; }
  check('nạp lỗi thì KHÔNG cache lỗi — lượt sau thử lại được', loi3 && (await kho.lay('hong', async () => 'ok')) === 'ok');
  // Lỗi của lượt nạp cũ không được xoá lượt nạp mới hơn cùng khoá
  const tre = cc.taoCacheCoHan(10, () => t);
  let huy;
  const dai = tre.lay('z', () => new Promise((_, rej) => { huy = rej; }));
  dai.catch(() => {});
  await new Promise((r) => setTimeout(r, 2));
  t += 50;
  const moi = tre.lay('z', async () => 'moi');
  huy(new Error('cu hỏng muộn'));
  await new Promise((r) => setTimeout(r, 5));
  check('lỗi muộn của lượt nạp CŨ không xoá cache của lượt nạp MỚI cùng khoá', (await moi) === 'moi' && (await tre.lay('z', async () => 'khac')) === 'moi');
  check('api.js: danh mục + sản phẩm dùng cache có hạn 10 phút; mọi lần ghi danh mục xoá cache; không còn Map cache vô hạn', /HAN_CACHE_DANH_MUC_MS = 10 \* 60 \* 1000/.test(api) && /taoCacheCoHan\(HAN_CACHE_DANH_MUC_MS\)/.test(api) && (api.match(/clearBootstrapCache\(\); return res;/g) || []).length === 4 && !/new Map\(\)/.test(api) && !/bootstrapPromise/.test(api));

  // =====================================================================
  console.log('--- 4. Dọn dẹp: build / chunk ---');
  const dist = path.join(ROOT, 'client/dist/assets');
  if (fs.existsSync(dist)) {
    const files = fs.readdirSync(dist).filter((f) => /\.js$/.test(f));
    const kb = (f) => fs.statSync(path.join(dist, f)).size / 1024;
    const chunkDash = files.find((f) => /^Dashboard-/.test(f));
    check('chunk Dashboard còn nhỏ (< 40 KB, chưa nén) — thư viện biểu đồ nằm riêng', chunkDash && kb(chunkDash) < 40, chunkDash && Math.round(kb(chunkDash)));
    check('chunk biểu đồ (recharts) tách riêng khỏi Dashboard và khỏi chunk chính', files.some((f) => /^DashboardCharts-/.test(f)));
  } else {
    console.log('  (bỏ qua: chưa có client/dist — chạy npm run build trước)');
  }

  console.log(`\n${pass} đạt, ${fail} lỗi`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
