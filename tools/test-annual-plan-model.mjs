/**
 * test-annual-plan-model.mjs — 05/10/2026: lớp mô hình giao diện của KẾ HOẠCH NĂM (client/src/utils/annualPlanModel.js).
 * Chạy: node tools/test-annual-plan-model.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = await import(pathToFileURL(path.join(ROOT, 'client', 'src', 'utils', 'annualPlanModel.js')).href);
const E = await import(pathToFileURL(path.join(ROOT, 'client', 'src', 'utils', 'annualPlanEngine.js')).href);

let pass = 0, fail = 0;
const check = (ten, dk, them) => { if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them !== undefined ? '  → ' + JSON.stringify(them) : '')); } };
const loi = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

// Cơ sở: 2 khách; T1–T9 thực hiện, T10–12 dự báo
function taoState() {
  const lines = [];
  const them = (c, sku, gia, base) => lines.push({ key: c + '|' + sku, customerKey: c, skuCode: sku, tempSkuId: '', skuName: 'Máy ' + sku, priceVnd: gia,
    qtyBase: base, qty: base.slice(), khoa: new Array(12).fill(false) });
  them('OEM:ALPHA', '1001', 10000000, [100, 110, 120, 100, 90, 130, 100, 100, 100, 100, 100, 100]);
  them('OEM:ALPHA', '2002', 1000000, [900, 800, 1000, 900, 950, 900, 1000, 900, 900, 900, 900, 900]);
  them('OEM:ALPHA', '2003', 500000, [40, 0, 60, 0, 50, 0, 40, 0, 40, 40, 40, 40]);
  them('OEM:BETA', '1001', 10000000, [20, 30, 20, 25, 25, 30, 20, 20, 20, 20, 20, 20]);
  them('OEM:BETA', '2002', 1000000, [200, 300, 250, 250, 200, 300, 250, 250, 250, 250, 250, 250]);
  return { id: 'AP-1', status: 'draft', kind: 'base', shares: E.tyTrongMuaVu(null, null), targetGrowthPct: null, targetRevenueVnd: null, targetApplied: false,
    baselineLastMonth: 8, note: '', customers: [{ key: 'OEM:ALPHA', name: 'Alpha', market: '', isNew: false }, { key: 'OEM:BETA', name: 'Beta', market: '', isNew: false }],
    lines, newSkus: [] };
}
const s0 = taoState();
const bak = JSON.stringify(s0);

console.log('--- Target + Apply ---');
const t1 = M.datTarget(s0, { tangTruongPct: 20 });
const coSo = M.tong(M.doanhThuCoSo(s0));
check('nhập tăng trưởng 20% -> doanh thu năm = cơ sở × 1,2; nhập doanh thu năm -> suy ngược tăng trưởng', t1.targetRevenueVnd === Math.round(coSo * 1.2) &&
  M.datTarget(s0, { doanhThuMucTieu: Math.round(coSo * 1.5) }).targetGrowthPct === 50);
check('đầu vào không bị sửa (bất biến)', JSON.stringify(s0) === bak);
const ap = M.apDung(t1);
check('Apply: mỗi tháng đúng mục tiêu (lệch < bước làm tròn), SL bội 10', !ap.loi.length && !M.trangThaiMucTieu(ap.state).canApplyLai && ap.state.targetApplied &&
  ap.state.lines.every((l) => l.qty.every((q) => q % 10 === 0)), [ap.loi, M.trangThaiMucTieu(ap.state)]);
check('Apply: tổng 12 tháng ≈ doanh thu mục tiêu (lệch < 1 bước/tháng)', Math.abs(M.tong(M.doanhThuKeHoach(ap.state)) - t1.targetRevenueVnd) < 12 * 10 * 500000, [M.tong(M.doanhThuKeHoach(ap.state)), t1.targetRevenueVnd]);
check('sau Apply không đổi Target / số cơ sở được nữa', /đã Apply/.test(loi(() => M.datTarget(ap.state, { tangTruongPct: 5 }))) && /đã Apply/.test(loi(() => M.suaCoSo(ap.state, 'OEM:ALPHA|1001', 10, 5))));
check('chưa có Target thì Apply báo lỗi', /Chưa có Target/.test(loi(() => M.apDung(s0))));
const mo = M.moKhoaTarget(ap.state);
check('mở khóa Target: về số cơ sở, bỏ khóa ô', mo.targetApplied === false && mo.lines.every((l) => JSON.stringify(l.qty) === JSON.stringify(l.qtyBase) && l.khoa.every((k) => !k)));

console.log('--- sửa số cơ sở ---');
const c1 = M.suaCoSo(s0, 'OEM:ALPHA|1001', 10, 180);
const l1 = c1.lines.find((l) => l.key === 'OEM:ALPHA|1001');
check('sửa SL cơ sở tháng chưa có số: cơ sở và kế hoạch cùng đổi (trước Apply)', l1.qtyBase[10] === 180 && l1.qty[10] === 180);
check('tháng đã có số thực hiện không sửa được', /đã có số thực hiện/.test(loi(() => M.suaCoSo(s0, 'OEM:ALPHA|1001', 3, 1))));

console.log('--- sửa số kế hoạch ---');
const truocApply = M.suaKeHoach(s0, 'OEM:ALPHA|1001', 2, 150);
check('chưa Apply: sửa thẳng, các dòng khác không đổi', truocApply.state.lines.find((l) => l.key === 'OEM:ALPHA|1001').qty[2] === 150 && truocApply.state.lines.find((l) => l.key === 'OEM:BETA|2002').qty[2] === s0.lines[4].qty[2]);
const dt0 = M.doanhThuKeHoach(ap.state);
const sk = M.suaKeHoach(ap.state, 'OEM:ALPHA|1001', 4, 200);
const dt1 = M.doanhThuKeHoach(sk.state);
check('đã Apply: sửa 1 SKU -> SKU đúng giá trị, doanh thu tháng KHÔNG ĐỔI (lệch < bước), tháng khác không đụng, ô được khóa',
  sk.state.lines[0].qty[4] === 200 && Math.abs(dt1[4] - dt0[4]) < 10 * 500000 && dt1.every((v, m) => m === 4 || v === dt0[m]) && sk.state.lines[0].khoa[4] === true, [dt0[4], dt1[4]]);
const sk2 = M.suaKeHoach(sk.state, 'OEM:ALPHA|2002', 4, 300);
check('sửa tiếp SKU khác cùng tháng: SKU đã khóa trước đó không bị co giãn', sk2.state.lines[0].qty[4] === 200 && sk2.state.lines[1].qty[4] === 300, [sk2.state.lines[0].qty[4], sk2.state.lines[1].qty[4]]);
check('đặt SL vượt tổng tháng -> báo lỗi rõ', /vượt mục tiêu/.test(loi(() => M.suaKeHoach(ap.state, 'OEM:ALPHA|1001', 4, 1e6))));
check('khóa / bỏ khóa ô', M.doiKhoaO(sk.state, 'OEM:ALPHA|1001', 4).lines[0].khoa[4] === false);

console.log('--- tỷ trọng tháng ---');
const ty = M.suaTyTrong(ap.state, { 11: 12 }, 'deu');
check('sửa tỷ trọng T12 = 12%: tổng 100%, các tháng trong [1%, 30%], T12 đúng 12,00%', ty.shares.reduce((s, v) => s + v, 0) === 10000 && ty.shares[11] === 1200 && ty.shares.every((v) => v >= 100 && v <= 3000));
check('đổi tỷ trọng sau Apply -> báo cần Apply lại; Apply lại thì hết', M.trangThaiMucTieu(ty).canApplyLai === true && !M.trangThaiMucTieu(M.apDung(ty).state).canApplyLai);
check('chế độ chỉ định: chỉ các tháng được chọn nhận phần chênh', (() => {
  const r = M.suaTyTrong(s0, { 0: 5 }, 'chiDinh', [5, 6]);
  return r.shares.every((v, i) => i === 0 || i === 5 || i === 6 || v === s0.shares[i]) && r.shares.reduce((s, v) => s + v, 0) === 10000;
})());
check('tỷ trọng ngoài [1%, 30%] bị chặn', /1%, 30%/.test(loi(() => M.suaTyTrong(s0, { 0: 31 }))));

console.log('--- khách / SKU ---');
const k1 = M.themKhach(s0, { key: 'NEW:Gamma', name: 'Gamma' });
check('thêm khách mới (đánh dấu mới); trùng bị chặn', k1.customers.length === 3 && k1.customers[2].isNew === true && /đã có/.test(loi(() => M.themKhach(k1, { key: 'NEW:Gamma', name: 'x' }))));
const sku1 = M.themSku(k1, 'NEW:Gamma', { skuCode: '2002', skuName: 'Màng', priceVnd: 1000000, qty: [0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 100] });
check('thêm SKU có sẵn cho khách mới', sku1.lines.length === 6 && sku1.lines[5].key === 'NEW:Gamma|2002' && sku1.lines[5].qty[9] === 100);
const sku2 = M.themSku(k1, 'NEW:Gamma', { tempSkuId: 'NEW-1', skuName: 'Máy mới', priceVnd: 7000000 });
check('thêm SKU mới nhập tay: ghi vào newSkus, dòng dùng mã tạm', sku2.newSkus.length === 1 && sku2.lines[5].tempSkuId === 'NEW-1' && sku2.lines[5].skuCode === '');
check('SKU trùng trong cùng khách bị chặn', /đã có SKU/.test(loi(() => M.themSku(sku1, 'NEW:Gamma', { skuCode: '2002' }))));
const xk = M.xoaKhach(sku1, 'NEW:Gamma').state;
check('xóa khách kéo theo mọi dòng của khách', xk.customers.length === 2 && xk.lines.length === 5);
const dtTruoc = M.doanhThuKeHoach(ap.state);
const xs = M.xoaSku(ap.state, 'OEM:ALPHA|2003');
check('đã Apply: bớt 1 SKU -> doanh thu từng tháng được dồn lại cho SKU còn lại (không vượt, lệch < bước)', xs.state.lines.length === 4 &&
  M.doanhThuKeHoach(xs.state).every((v, m) => v <= dtTruoc[m] + 1e-6 && dtTruoc[m] - v < 10 * 1000000 + 1), [dtTruoc, M.doanhThuKeHoach(xs.state)]);
const nho = M.xoaMatHangNho(ap.state, M.laMayMacDinh, { nguongMay: 1e9, nguongLinhKien: 0 });
check('xóa hàng loạt nhỏ: máy dưới ngưỡng bị xóa, trả danh sách bị xóa', nho.xoa.length === 2 && nho.xoa.every((l) => /^1/.test(l.skuCode)) && nho.state.lines.length === 3);
{
  // Tiêu chí độc lập: chỉ FOC (đơn giá 0 HOẶC tổng giá 0), không đụng mặt hàng nhỏ
  const foc = { ...ap.state, lines: ap.state.lines.map((l, i) => (i === 0 ? { ...l, priceVnd: 0 } : i === 1 ? { ...l, qty: new Array(12).fill(0) } : l)) };
  const r = M.xoaMatHangNho(foc, M.laMayMacDinh, { xoaNho: false, xoaGiaKhong: false, xoaFoc: true });
  check('xóa FOC: đơn giá 0 và tổng giá 0 (SL cả năm 0) đều bị xóa, dòng còn lại giữ', r.xoa.length === 2 && r.xoa.some((l) => l.key === foc.lines[0].key) && r.xoa.some((l) => l.key === foc.lines[1].key) && r.state.lines.length === foc.lines.length - 2);
  const r0 = M.xoaMatHangNho(foc, M.laMayMacDinh, { xoaNho: false, xoaGiaKhong: false, xoaFoc: false });
  check('tắt hết tiêu chí: không xóa dòng nào', r0.xoa.length === 0 && r0.state.lines.length === foc.lines.length);
  check('nhận diện nhóm thanh lý: không phân biệt hoa thường / dấu', ['Hàng thanh lý', 'THANH LÝ tồn kho', 'thanh ly', 'Thanh  Lý'].every(M.laNhomThanhLy) && !['', null, undefined, 'Máy lọc', 'Linh kiện OEM'].some(M.laNhomThanhLy));
  const tlNhom = M.xoaMatHangNho(ap.state, M.laMayMacDinh, { xoaNho: false, xoaGiaKhong: false, xoaTheo: M.laThanhLyTheoNhom({ '2003': 'Hàng thanh lý' }) });
  check('xóa hàng thanh lý theo skuNhom: chỉ SKU thuộc nhóm thanh lý (mọi khách) bị xóa', tlNhom.xoa.length > 0 && tlNhom.xoa.every((l) => l.skuCode === '2003') && tlNhom.state.lines.every((l) => l.skuCode !== '2003'));
  check('sau xóa hàng loạt (bù từng khách) kế hoạch vẫn qua kiểm tra: không có lỗi lệch mục tiêu để Gửi duyệt', M.kiemTra(tlNhom.state).loi.length === 0, M.kiemTra(tlNhom.state).loi);
  const tl = M.xoaMatHangNho(ap.state, M.laMayMacDinh, { xoaNho: false, xoaGiaKhong: false, xoaTheo: (l) => l.skuCode === '2003' });
  check('xóa theo tiêu chí tùy biến (xoaTheo nhận dòng kế hoạch): chỉ dòng khớp bị xóa', tl.xoa.length > 0 && tl.xoa.every((l) => l.skuCode === '2003') && tl.state.lines.every((l) => l.skuCode !== '2003'));
}

console.log('--- bù theo từng khách / khách mới / xóa khách ---');
{
  const doanhThuKhach = (st, ck, m) => st.lines.filter((l) => l.customerKey === ck).reduce((a, l) => a + l.qty[m] * l.priceVnd, 0);
  const dtThang = (st) => M.doanhThuKeHoach(st);
  const base = ap.state;
  const m = 4;
  const r = M.suaKeHoach(base, 'OEM:ALPHA|1001', m, 200);
  const lech = (a, b) => Math.abs(a - b);
  check('sửa SKU của khách ALPHA: doanh thu ALPHA trong tháng KHÔNG ĐỔI (lệch < bước), các khách khác KHÔNG ĐỔI chút nào',
    lech(doanhThuKhach(r.state, 'OEM:ALPHA', m), doanhThuKhach(base, 'OEM:ALPHA', m)) < 10 * 500000 &&
    r.state.lines.filter((l) => l.customerKey === 'OEM:BETA').every((l, i) => JSON.stringify(l.qty) === JSON.stringify(base.lines.filter((x) => x.customerKey === 'OEM:BETA')[i].qty)),
    [doanhThuKhach(r.state, 'OEM:ALPHA', m), doanhThuKhach(base, 'OEM:ALPHA', m)]);
  check('tổng doanh thu tháng vẫn không đổi (lệch < bước)', lech(dtThang(r.state)[m], dtThang(base)[m]) < 10 * 500000);

  // khách chỉ có một SKU: không có SKU nào để bù -> báo lỗi rõ; đặt đúng số cũ thì không sao
  const mot = { ...base, customers: base.customers.concat([{ key: 'OEM:SOLO', name: 'Solo', market: '', isNew: false }]),
    lines: base.lines.concat([{ key: 'OEM:SOLO|1001', customerKey: 'OEM:SOLO', skuCode: '1001', tempSkuId: '', skuName: 'Máy', priceVnd: 10000000, qtyBase: new Array(12).fill(10), qty: new Array(12).fill(10), khoa: new Array(12).fill(false) }]) };
  check('khách chỉ có 1 SKU: sửa SL bị chặn (không có SKU nào để bù), thông báo nêu tên khách', /không còn SKU nào/.test(loi(() => M.suaKeHoach(mot, 'OEM:SOLO|1001', 2, 50))) && /Solo/.test(loi(() => M.suaKeHoach(mot, 'OEM:SOLO|1001', 2, 50))));
  check('đặt đúng số hiện tại cho khách 1 SKU thì không lỗi', !loi(() => M.suaKeHoach(mot, 'OEM:SOLO|1001', 2, 10)));

  // KHÁCH MỚI: nhập SL -> các khách đang có bù, tổng tháng không đổi, khách đang có co giãn theo tỷ lệ
  let cs = M.themKhach(base, { key: 'NEW:Gamma', name: 'Gamma' });
  cs = M.themSku(cs, 'NEW:Gamma', { skuCode: '1001', skuName: 'Máy', priceVnd: 10000000 });
  const truocTong = dtThang(cs)[m];
  const kmoi = M.suaKeHoach(cs, 'NEW:Gamma|1001', m, 20);
  check('khách mới: nhập SL -> doanh thu khách mới đúng (20 × 10 triệu); tổng tháng không đổi (lệch < bước)', doanhThuKhach(kmoi.state, 'NEW:Gamma', m) === 200000000 && lech(dtThang(kmoi.state)[m], truocTong) < 10 * 500000,
    [doanhThuKhach(kmoi.state, 'NEW:Gamma', m), dtThang(kmoi.state)[m], truocTong]);
  check('khách mới: các khách đang có đều giảm (bù), không khách nào tăng', ['OEM:ALPHA', 'OEM:BETA'].every((k) => doanhThuKhach(kmoi.state, k, m) < doanhThuKhach(cs, k, m)));
  check('khách mới: các tháng khác không đổi', [0, 1, 2, 3, 5, 11].every((mm) => dtThang(kmoi.state)[mm] === dtThang(cs)[mm]));
  const kmoi2 = M.suaKeHoach(kmoi.state, 'NEW:Gamma|1001', m, 40);
  check('sửa tiếp khách mới (20 -> 40): khách mới 400 triệu, tổng tháng vẫn không đổi', doanhThuKhach(kmoi2.state, 'NEW:Gamma', m) === 400000000 && lech(dtThang(kmoi2.state)[m], truocTong) < 10 * 500000);

  // XÓA KHÁCH: doanh thu phân bổ lại cho khách còn lại, tổng từng tháng không đổi
  const xk2 = M.xoaKhach(base, 'OEM:BETA');
  check('xóa hẳn khách BETA (đã Apply): ALPHA nhận phần doanh thu, tổng từng tháng không đổi (lệch < bước), BETA biến mất',
    xk2.state.customers.length === 1 && xk2.state.lines.every((l) => l.customerKey === 'OEM:ALPHA') &&
    dtThang(xk2.state).every((v, mm) => lech(v, dtThang(base)[mm]) < 10 * 500000) && doanhThuKhach(xk2.state, 'OEM:ALPHA', m) > doanhThuKhach(base, 'OEM:ALPHA', m), dtThang(xk2.state));
  check('xóa khách khi chưa Apply: chỉ bỏ (tổng giảm), không co giãn', (() => { const x = M.xoaKhach(s0, 'OEM:BETA').state; return x.lines.length === 3 && x.lines.every((l) => JSON.stringify(l.qty) === JSON.stringify(s0.lines.find((y) => y.key === l.key).qty)); })());

  // BỚT SKU trong khách: dồn lại trong khách
  const xs2 = M.xoaSku(base, 'OEM:BETA|2002').state;
  check('bớt 1 SKU của BETA: doanh thu BETA từng tháng giữ (lệch < bước), ALPHA không đổi', M.NHAN_THANG.every((_, mm) => lech(doanhThuKhach(xs2, 'OEM:BETA', mm), doanhThuKhach(base, 'OEM:BETA', mm)) < 10 * 10000000) &&
    xs2.lines.filter((l) => l.customerKey === 'OEM:ALPHA').every((l) => JSON.stringify(l.qty) === JSON.stringify(base.lines.find((y) => y.key === l.key).qty)));
  // XÓA HÀNG LOẠT: từng khách
  const nho2 = M.xoaMatHangNho(base, M.laMayMacDinh, { nguongMay: 1e9, nguongLinhKien: 0 });
  check('xóa hàng loạt: doanh thu từng khách từng tháng được giữ (lệch < bước), không dồn sang khách khác', M.NHAN_THANG.every((_, mm) => ['OEM:ALPHA', 'OEM:BETA'].every((k) => lech(doanhThuKhach(nho2.state, k, mm), doanhThuKhach(base, k, mm)) < 10 * 1000000)));
  // khách bị xóa hết dòng bởi xóa hàng loạt: dồn sang khách khác
  const bm = M.xoaMatHangNho({ ...base, lines: base.lines.filter((l) => l.customerKey === 'OEM:ALPHA' || l.skuCode === '1001') }, M.laMayMacDinh, { nguongMay: 1e9, nguongLinhKien: 0 });
  check('xóa hàng loạt làm một khách hết dòng: doanh thu khách đó dồn sang khách còn lại (tổng tháng giữ)', (() => {
    const truoc = { ...base, lines: base.lines.filter((l) => l.customerKey === 'OEM:ALPHA' || l.skuCode === '1001') };
    return bm.state.lines.every((l) => l.customerKey === 'OEM:ALPHA') && dtThang(bm.state).every((v, mm) => lech(v, dtThang(truoc)[mm]) < 10 * 500000);
  })());
}

console.log('--- tổng hợp hiển thị ---');
const tk = M.tomTatKhach(ap.state), dv = M.tomTatDonVi(ap.state);
check('tổng các khách = tổng đơn vị (cơ sở và kế hoạch)', Math.abs(tk.reduce((s, c) => s + c.planTotal, 0) - dv.planTotal) < 1 && Math.abs(tk.reduce((s, c) => s + c.baseTotal, 0) - dv.baseTotal) < 1);
check('tỷ trọng tháng thực tế cộng = 100%; tăng trưởng cả năm ≈ 20%', Math.abs(dv.share.reduce((s, v) => s + v, 0) - 1) < 1e-9 && Math.abs(dv.growthYear - 0.2) < 0.01, dv.growthYear);
check('khách giữ thứ tự của kế hoạch (Alpha trước Beta)', tk[0].key === 'OEM:ALPHA' && tk[1].key === 'OEM:BETA');
check('kiểm tra kế hoạch đã Apply: không có lỗi; chuyển sang payload đủ trường', M.kiemTra(ap.state).loi.length === 0 && (() => {
  const p = M.chuyenSangPayload(ap.state);
  return p.targetApplied === true && p.lines.length === 5 && p.lines[0].qty.length === 12 && p.customers.length === 2 && Array.isArray(p.newSkus);
})());
check('định dạng: tỷ / phần trăm', M.dinhDangPct(0.1234) === '+12,3%' && M.dinhDangPct(null) === '—' && M.dinhDangTy(1234567890).startsWith('1,23'));

console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
process.exit(fail ? 1 : 0);
