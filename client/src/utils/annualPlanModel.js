/**
 * annualPlanModel.js — các thao tác trên MỘT kế hoạch năm ở giao diện (thuần, không React, không gọi API). 05/10/2026.
 * Dựa trên bộ máy tính annualPlanEngine.js (bản sao nguyên văn của fc-api/pure-annual-plan.js). Thiết kế: Projects/De-xuat-Ke-hoach-Nam-FC-2026-10.md.
 *
 * `state` = đúng hình dạng API trả về: { shares[12], targetGrowthPct, targetRevenueVnd, targetApplied, baselineLastMonth,
 *   customers: [{key, name, market, isNew}], lines: [{key, customerKey, skuCode, tempSkuId, skuName, priceVnd, qtyBase[12], qty[12], khoa[12]}], newSkus,
 *   removedLines: [{key, customerKey, skuCode, tempSkuId, skuName, priceVnd, qtyBase[12]}] }.
 * removedLines = các dòng ĐÃ XÓA: giữ số cơ sở gốc để "Cơ sở năm" + tăng trưởng + Target vẫn tính trên cơ sở ban đầu (không co lại sau khi xóa).
 * Mọi hàm trả state MỚI (không sửa đầu vào).
 */

import * as E from './annualPlanEngine.js';

export const NHAN_THANG = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

const so = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const khoaMacDinh = () => new Array(12).fill(false);

/** Dòng ở dạng bộ máy tính cần: { key, price, qty, khoa }. field = 'qty' (kế hoạch) | 'qtyBase' (cơ sở). */
export function dongBoMay(state, field = 'qty') {
  return state.lines.map((l) => ({ key: l.key, price: l.priceVnd, qty: l[field], khoa: l.khoa || khoaMacDinh() }));
}

/** Dòng đã xóa (còn giữ số cơ sở gốc). */
export const dongDaXoa = (state) => state.removedLines || [];
/** Thêm các dòng vừa bị xóa vào danh sách "đã xóa" (giữ số cơ sở gốc; trùng khóa thì lấy bản mới; bỏ dòng cơ sở bằng 0). */
function themDaXoa(state, dongBiXoa) {
  const m = new Map(dongDaXoa(state).map((l) => [l.key, l]));
  dongBiXoa.forEach((l) => {
    if (tong(l.qtyBase || []) > 0) m.set(l.key, { key: l.key, customerKey: l.customerKey, skuCode: l.skuCode, tempSkuId: l.tempSkuId || '', skuName: l.skuName, priceVnd: l.priceVnd, qtyBase: l.qtyBase.slice() });
  });
  return Array.from(m.values());
}
/** Tổng quan phần đã xóa: số dòng + doanh thu cơ sở cả năm của chúng (để ghi chú ở giao diện). */
export function tomTatDaXoa(state) {
  const ds = dongDaXoa(state);
  return { soDong: ds.length, base: ds.reduce((s, l) => s + tong(l.qtyBase || []) * so(l.priceVnd), 0) };
}

export function doanhThuCoSo(state) {
  const d = dongBoMay(state, 'qtyBase').concat(dongDaXoa(state).map((l) => ({ key: l.key, price: l.priceVnd, qty: l.qtyBase, khoa: khoaMacDinh() })));
  return NHAN_THANG.map((_, m) => E.doanhThuThang(d, m));
}
export function doanhThuKeHoach(state) {
  const d = dongBoMay(state, 'qty');
  return NHAN_THANG.map((_, m) => E.doanhThuThang(d, m));
}
export const tong = (arr) => arr.reduce((s, v) => s + so(v), 0);

/* ------------------------------ Target + Apply ------------------------------ */

/** Nhập tăng trưởng % hoặc doanh thu năm; ô còn lại tự đổi theo tổng doanh thu cơ sở năm hiện tại. Đã Apply thì không đổi được. */
export function datTarget(state, { tangTruongPct, doanhThuMucTieu }) {
  if (state.targetApplied) throw new Error('Target đã Apply — mở khóa trước khi sửa.');
  const kq = E.suyRaTarget(tong(doanhThuCoSo(state)), { tangTruongPct, doanhThuMucTieu });
  return { ...state, targetGrowthPct: kq.tangTruongPct, targetRevenueVnd: kq.doanhThuMucTieu };
}

export function mucTieuThang(state) {
  return E.mucTieuTheoThang(so(state.targetRevenueVnd), state.shares);
}

/**
 * APPLY: doanh thu từng tháng = Target × tỷ trọng; SL từng dòng co giãn theo (số cũ × tỷ lệ), làm tròn chục giữ tổng tháng. Ô đã khóa giữ nguyên.
 * Trả { state, lech[12], loi[] }.
 */
export function apDung(state) {
  if (!(so(state.targetRevenueVnd) > 0)) throw new Error('Chưa có Target (tăng trưởng % hoặc doanh thu năm).');
  const r = E.apDungMucTieu(dongBoMay(state, 'qty'), mucTieuThang(state));
  const lines = state.lines.map((l, i) => ({ ...l, qty: r.dong[i].qty }));
  return { state: { ...state, lines, targetApplied: true }, lech: r.lech, loi: r.loi };
}

/** Mở khóa Target: quay về số cơ sở (mọi tinh chỉnh SKU bị bỏ) — người gọi phải hỏi xác nhận trước. */
export function moKhoaTarget(state) {
  return { ...state, targetApplied: false, lines: state.lines.map((l) => ({ ...l, qty: l.qtyBase.slice(), khoa: khoaMacDinh() })) };
}

/** Độ lệch từng tháng so với mục tiêu (chỉ khi đã Apply) + có cần Apply lại không (vd sau khi đổi tỷ trọng). */
export function trangThaiMucTieu(state) {
  if (!state.targetApplied) return { lech: null, canApplyLai: false };
  const mt = mucTieuThang(state), dt = doanhThuKeHoach(state);
  const d = dongBoMay(state, 'qty');
  let can = false;
  const lech = mt.map((v, m) => {
    const x = v - dt[m];
    const gia = d.filter((l) => so(l.qty[m]) > 0 && so(l.price) > 0).map((l) => so(l.price));
    const buoc = gia.length ? E.BUOC_LAM_TRON * Math.min(...gia) : 0;
    if (Math.abs(x) > Math.max(buoc, 1)) can = true;
    return x;
  });
  return { lech, canApplyLai: can };
}

/* ------------------------------ Tỷ trọng tháng ------------------------------ */

/** thayDoi = { chỉ số tháng: % mới } (đơn vị %, vd 9.5); cheDo 'deu' | 'chiDinh' (+ thang = [chỉ số tháng]). */
export function suaTyTrong(state, thayDoiPct, cheDo = 'deu', thang = []) {
  const doi = {};
  Object.keys(thayDoiPct).forEach((k) => { doi[k] = Math.round(so(thayDoiPct[k]) * 100); });
  return { ...state, shares: E.suaTyTrong(state.shares, doi, cheDo, thang) };
}
export const tyTrongPct = (state) => state.shares.map((v) => v / 100);

/* ------------------------------ Sửa ô ------------------------------ */

const thayDong = (state, key, fn) => ({ ...state, lines: state.lines.map((l) => (l.key === key ? fn(l) : l)) });

/** Sửa SL cơ sở (chỉ tháng chưa có số thực hiện, chỉ khi chưa Apply). Trước Apply, SL kế hoạch đi theo cơ sở. */
export function suaCoSo(state, key, m, v) {
  if (state.targetApplied) throw new Error('Target đã Apply — mở khóa trước khi sửa số cơ sở.');
  if (m <= state.baselineLastMonth) throw new Error('Tháng ' + (m + 1) + ' đã có số thực hiện, không sửa được.');
  const sl = Math.max(0, Math.round(so(v)));
  return thayDong(state, key, (l) => ({ ...l, qtyBase: l.qtyBase.map((x, i) => (i === m ? sl : x)), qty: l.qty.map((x, i) => (i === m ? sl : x)) }));
}

/** Chỉ số các dòng của cùng một khách (đơn vị một khách: customerKey '' -> mọi dòng). */
const chiSoCungKhach = (state, customerKey) => state.lines.map((l, i) => (l.customerKey === customerKey ? i : -1)).filter((i) => i >= 0);
const tenKhach = (state, key) => { const c = state.customers.find((x) => x.key === key); return (c && c.name) || key || 'đơn vị'; };

const laKhachMoi = (state, customerKey) => { const c = state.customers.find((x) => x.key === customerKey); return !!(c && c.isNew); };

/**
 * KHÁCH MỚI (thêm sau khi lập): doanh thu của khách do người dùng nhập SL quyết định, nên phần chênh được BÙ bằng CÁC KHÁCH ĐANG CÓ
 * (co giãn theo tỷ lệ) để tổng doanh thu tháng không đổi. Các dòng của khách mới khác (và ô đã chốt) giữ nguyên.
 */
function suaKhachMoi(state, goc, m, sl) {
  const mt = mucTieuThang(state)[m];
  const tatCa = dongBoMay(state, 'qty').map((d, i) => {
    const l = state.lines[i];
    const coDinh = l.key !== goc.key && laKhachMoi(state, l.customerKey);          // dòng khách mới khác: không dùng để bù
    return coDinh ? { ...d, khoa: d.khoa.map((x, j) => (j === m ? true : x)) } : d;
  });
  const conBu = tatCa.filter((d) => d.key !== goc.key && !(d.khoa && d.khoa[m]) && so(d.price) > 0);
  if (!conBu.length) throw new Error('Không còn khách nào đang có (chưa chốt) để bù doanh thu tháng ' + (m + 1) + '.');
  const r = E.tinhChinhSku(tatCa, m, goc.key, sl, mt);
  const buoc = E.BUOC_LAM_TRON * Math.min(...conBu.map((d) => so(d.price)));
  if (Math.abs(r.lech) > Math.max(buoc, 1)) throw new Error('Không bù đủ bằng các khách đang có (lệch ' + Math.round(r.lech) + ' VNĐ).');
  const lines = state.lines.map((l, i) => ({ ...l, qty: r.dong[i].qty, khoa: l.key === goc.key ? l.khoa.map((x, j) => (j === m ? true : x)) : l.khoa }));
  return { state: { ...state, lines }, lech: r.lech };
}

/**
 * Sửa SL kế hoạch của một dòng trong một tháng. Đã Apply: CHỈ các dòng còn lại CỦA CÙNG KHÁCH co giãn để doanh thu của khách đó trong
 * tháng KHÔNG ĐỔI (nên tổng tháng và các khách khác cũng không đổi); ô bị sửa được khóa. Khách không còn SKU nào để bù -> báo lỗi.
 * Chưa Apply: sửa thẳng. Trả { state, lech }.
 */
export function suaKeHoach(state, key, m, v) {
  const sl = Math.max(0, Math.round(so(v)));
  if (!state.targetApplied) {
    return { state: thayDong(state, key, (l) => ({ ...l, qty: l.qty.map((x, i) => (i === m ? sl : x)) })), lech: 0 };
  }
  const goc = state.lines.find((l) => l.key === key);
  if (!goc) throw new Error('Không tìm thấy dòng ' + key);
  if (laKhachMoi(state, goc.customerKey)) return suaKhachMoi(state, goc, m, sl);
  const chiSo = chiSoCungKhach(state, goc.customerKey);
  const tatCa = dongBoMay(state, 'qty');
  const sub = chiSo.map((i) => tatCa[i]);
  const tienKhach = E.doanhThuThang(sub, m);                 // doanh thu của khách trong tháng — GIỮ NGUYÊN
  const bu = sub.filter((d) => d.key !== key && !(d.khoa && d.khoa[m]) && so(d.price) > 0);
  if (!bu.length && Math.abs(sl * so(goc.priceVnd) - so(goc.qty[m]) * so(goc.priceVnd)) > 0.5) {
    throw new Error('Khách "' + tenKhach(state, goc.customerKey) + '" không còn SKU nào (chưa chốt) để bù trong tháng ' + (m + 1) + '. Thêm SKU cho khách hoặc đổi Target / tỷ trọng rồi Apply lại.');
  }
  const r = E.tinhChinhSku(sub, m, key, sl, tienKhach);
  const buoc = bu.length ? E.BUOC_LAM_TRON * Math.min(...bu.map((d) => so(d.price))) : 0;
  if (Math.abs(r.lech) > Math.max(buoc, 1)) {
    throw new Error('Không bù đủ trong các SKU còn lại của khách "' + tenKhach(state, goc.customerKey) + '" (lệch ' + Math.round(r.lech) + ' VNĐ).');
  }
  const qtyMoi = new Map(chiSo.map((i, k) => [i, r.dong[k].qty]));
  const lines = state.lines.map((l, i) => (qtyMoi.has(i)
    ? { ...l, qty: qtyMoi.get(i), khoa: l.key === key ? l.khoa.map((x, j) => (j === m ? true : x)) : l.khoa }
    : l));
  return { state: { ...state, lines }, lech: r.lech };
}

export function doiKhoaO(state, key, m) {
  return thayDong(state, key, (l) => ({ ...l, khoa: l.khoa.map((x, i) => (i === m ? !x : x)) }));
}

/* ------------------------------ Khách / SKU ------------------------------ */

export function themKhach(state, { key, name, market = '' }) {
  if (state.customers.some((c) => c.key === key)) throw new Error('Khách "' + key + '" đã có trong bảng.');
  return { ...state, customers: state.customers.concat([{ key, name, market, isNew: true }]) };
}
/**
 * Bớt một khách (kèm mọi SKU của khách). Đã Apply: doanh thu từng tháng của khách bị bỏ được PHÂN BỔ LẠI cho các khách còn lại
 * (co giãn theo tỷ lệ, làm tròn chục) để tổng tháng không đổi. Chưa Apply: chỉ bỏ. Trả { state, lech }.
 */
export function xoaKhach(state, key) {
  const conLai = { ...state, customers: state.customers.filter((c) => c.key !== key), lines: state.lines.filter((l) => l.customerKey !== key),
    removedLines: themDaXoa(state, state.lines.filter((l) => l.customerKey === key)) };
  if (!state.targetApplied || !conLai.lines.length) return { state: conLai, lech: new Array(12).fill(0) };
  const r = E.apDungMucTieu(dongBoMay(conLai, 'qty'), doanhThuKeHoach(state));
  return { state: { ...conLai, lines: conLai.lines.map((l, i) => ({ ...l, qty: r.dong[i].qty })) }, lech: r.lech };
}

/** Thêm dòng SKU cho một khách. SKU có mã (skuCode) hoặc SKU mới nhập tay (tempSkuId + tên + giá). SL các tháng ban đầu = 0. */
export function themSku(state, customerKey, { skuCode = '', tempSkuId = '', skuName = '', priceVnd = 0, qty }) {
  const key = customerKey + '|' + (skuCode || tempSkuId);
  if (state.lines.some((l) => l.key === key)) throw new Error('Khách này đã có SKU ' + (skuCode || tempSkuId) + '.');
  const q = (qty && qty.length === 12 ? qty : new Array(12).fill(0)).map((v) => Math.max(0, Math.round(so(v))));
  // Thêm lại đúng dòng đã xóa trước đó: trả số cơ sở gốc về dòng (không đếm hai lần)
  const daXoa = dongDaXoa(state).find((l) => l.key === key);
  const dong = { key, customerKey, skuCode, tempSkuId, skuName, priceVnd: Math.max(0, so(priceVnd)), qtyBase: daXoa ? daXoa.qtyBase.slice() : new Array(12).fill(0), qty: q, khoa: khoaMacDinh() };
  const moi = tempSkuId && !state.newSkus.some((n) => n.tempId === tempSkuId)
    ? state.newSkus.concat([{ tempId: tempSkuId, name: skuName, description: '', priceVnd: dong.priceVnd }]) : state.newSkus;
  return { ...state, lines: state.lines.concat([dong]), newSkus: moi, removedLines: dongDaXoa(state).filter((l) => l.key !== key) };
}

/**
 * Bớt một dòng SKU. Đã Apply: doanh thu của dòng bị bỏ được dồn lại cho CÁC SKU CÒN LẠI CỦA CÙNG KHÁCH (giữ doanh thu từng tháng của khách).
 * Khách không còn SKU nào thì doanh thu đó mất (tổng tháng giảm -> cần Apply lại). Trả { state, lech }.
 */
export function xoaSku(state, key) {
  const goc = state.lines.find((l) => l.key === key);
  if (!goc) return { state, lech: new Array(12).fill(0) };
  const conLai = state.lines.filter((l) => l.key !== key);
  const daXoa = themDaXoa(state, [goc]);
  if (!state.targetApplied) return { state: { ...state, lines: conLai, removedLines: daXoa }, lech: new Array(12).fill(0) };
  const cung = state.lines.filter((l) => l.customerKey === goc.customerKey);
  const muc = NHAN_THANG.map((_, m) => E.doanhThuThang(dongBoMay({ ...state, lines: cung }, 'qty'), m));   // doanh thu khách trước khi bớt
  const conLaiKhach = cung.filter((l) => l.key !== key);
  if (!conLaiKhach.length) return { state: { ...state, lines: conLai, removedLines: daXoa }, lech: new Array(12).fill(0) };
  const r = E.apDungMucTieu(dongBoMay({ ...state, lines: conLaiKhach }, 'qty'), muc);
  const qtyMoi = new Map(conLaiKhach.map((l, i) => [l.key, r.dong[i].qty]));
  return { state: { ...state, lines: conLai.map((l) => (qtyMoi.has(l.key) ? { ...l, qty: qtyMoi.get(l.key) } : l)), removedLines: daXoa }, lech: r.lech };
}

/**
 * Xóa hàng loạt theo các tiêu chí độc lập (tuyChon): xoaNho (+ nguongMay / nguongLinhKien), xoaFoc (đơn giá = 0 hoặc tổng giá = 0),
 * xoaGiaKhong, và xoaTheo(line) cho tiêu chí tùy biến (vd. hàng thanh lý; nhận dòng kế hoạch gốc). laMay(line) -> boolean.
 * Trả { state, xoa: [dòng bị xóa] }.
 */
export function xoaMatHangNho(state, laMay, tuyChon) {
  const bangKey = new Map(state.lines.map((l) => [l.key, l]));
  if (tuyChon && typeof tuyChon.xoaTheo === 'function') { const f = tuyChon.xoaTheo; tuyChon = { ...tuyChon, xoaTheo: (d) => f(bangKey.get(d.key)) }; }
  const qtyMoi = new Map(), xoa = [], loi = [];
  // Làm TỪNG KHÁCH: doanh thu các dòng bị xóa dồn lại cho các SKU còn lại của đúng khách đó (giữ doanh thu từng tháng của khách).
  const khachCo = Array.from(new Set(state.lines.map((l) => l.customerKey)));
  khachCo.forEach((ck) => {
    const cung = state.lines.filter((l) => l.customerKey === ck);
    const r = E.xoaMatHangNho(dongBoMay({ ...state, lines: cung }, 'qty'), (d) => laMay(bangKey.get(d.key)), tuyChon);
    r.dong.forEach((d) => qtyMoi.set(d.key, d.qty));
    r.xoa.forEach((d) => xoa.push(bangKey.get(d.key)));
    r.loi.forEach((t) => loi.push(t));
  });
  let lines = state.lines.filter((l) => qtyMoi.has(l.key)).map((l) => ({ ...l, qty: qtyMoi.get(l.key) }));
  // Khách bị xóa HẾT dòng: doanh thu của khách đó phân bổ lại cho các khách còn lại (giữ tổng tháng), như khi bớt cả khách.
  const conLaiKhach = new Set(lines.map((l) => l.customerKey));
  if (state.targetApplied && lines.length && khachCo.some((ck) => !conLaiKhach.has(ck))) {
    const r = E.apDungMucTieu(dongBoMay({ ...state, lines }, 'qty'), doanhThuKeHoach(state));
    lines = lines.map((l, i) => ({ ...l, qty: r.dong[i].qty }));
  }
  return { state: { ...state, lines, removedLines: themDaXoa(state, xoa) }, xoa, loi };
}
/** Nhóm sản phẩm có phải HÀNG THANH LÝ không: so khớp "thanh lý" không phân biệt hoa thường / dấu (Category trong Products OEM hoặc nhóm trong doanh thu). */
export const laNhomThanhLy = (nhom) => /thanh\s*ly/.test(String(nhom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase());
/** Bộ lọc cho xoaMatHangNho({ xoaTheo }): dòng có SKU thuộc nhóm thanh lý. skuNhom = { sku: nhóm } do server trả về. */
export const laThanhLyTheoNhom = (skuNhom) => (l) => !!l && !!l.skuCode && laNhomThanhLy((skuNhom || {})[l.skuCode]);
/** Quy ước máy: mã SAP bắt đầu bằng "1" (như Export). SKU mã tạm coi là linh kiện. */
export const laMayMacDinh = (l) => /^1/.test(l.skuCode || '');

/* ------------------------------ Tổng hợp để hiển thị ------------------------------ */

const cong12 = (a, b) => a.map((v, i) => v + b[i]);

/** Từng khách: doanh thu cơ sở / kế hoạch theo tháng, tổng năm, tăng trưởng theo tháng + cả năm. Giữ thứ tự khách của kế hoạch. */
export function tomTatKhach(state) {
  const th = new Map(state.customers.map((c) => [c.key, { key: c.key, name: c.name, isNew: !!c.isNew, base: new Array(12).fill(0), plan: new Array(12).fill(0), lines: [] }]));
  state.lines.forEach((l) => {
    let c = th.get(l.customerKey);
    if (!c) { c = { key: l.customerKey, name: l.customerKey, isNew: false, base: new Array(12).fill(0), plan: new Array(12).fill(0), lines: [] }; th.set(l.customerKey, c); }
    c.base = cong12(c.base, l.qtyBase.map((q) => so(q) * so(l.priceVnd)));
    c.plan = cong12(c.plan, l.qty.map((q) => so(q) * so(l.priceVnd)));
    c.lines.push(l);
  });
  // Dòng đã xóa vẫn tính vào cơ sở của khách còn trong bảng (khách đã bị bớt hẳn thì chỉ còn trong tổng đơn vị)
  dongDaXoa(state).forEach((l) => {
    const c = th.get(l.customerKey);
    if (c) c.base = cong12(c.base, l.qtyBase.map((q) => so(q) * so(l.priceVnd)));
  });
  return Array.from(th.values()).map((c) => ({ ...c, baseTotal: tong(c.base), planTotal: tong(c.plan),
    growth: c.plan.map((v, m) => (c.base[m] > 0 ? v / c.base[m] - 1 : null)), growthYear: tong(c.base) > 0 ? tong(c.plan) / tong(c.base) - 1 : null }));
}

/** Dòng tổng + tỷ trọng tháng + tăng trưởng toàn đơn vị. */
export function tomTatDonVi(state) {
  const base = doanhThuCoSo(state), plan = doanhThuKeHoach(state), tPlan = tong(plan), tBase = tong(base);
  return { base, plan, baseTotal: tBase, planTotal: tPlan,
    share: plan.map((v) => (tPlan > 0 ? v / tPlan : 0)), growth: plan.map((v, m) => (base[m] > 0 ? v / base[m] - 1 : null)),
    growthYear: tBase > 0 ? tPlan / tBase - 1 : null };
}

/** Các SKU đang có trong bảng (mọi khách), duy nhất theo mã — để chọn "SKU tương tự" khi thêm item. */
export function skuTrongBang(state) {
  const m = new Map();
  state.lines.forEach((l) => {
    const k = l.skuCode || l.tempSkuId;
    if (!m.has(k)) m.set(k, { skuCode: l.skuCode, tempSkuId: l.tempSkuId, skuName: l.skuName, priceVnd: l.priceVnd });
  });
  return Array.from(m.values()).sort((a, b) => ((a.skuCode || a.tempSkuId) < (b.skuCode || b.tempSkuId) ? -1 : 1));
}

export function kiemTra(state) {
  return E.kiemTraKeHoach({ shares: state.shares, targetRevenueVnd: state.targetRevenueVnd, targetApplied: state.targetApplied,
    lines: state.lines.map((l) => ({ key: l.key, customerKey: l.customerKey, skuCode: l.skuCode, tempSkuId: l.tempSkuId, priceVnd: l.priceVnd, qty: l.qty })) });
}

/** Nội dung gửi API lưu. */
export function chuyenSangPayload(state) {
  return { targetGrowthPct: state.targetGrowthPct, targetRevenueVnd: state.targetRevenueVnd, targetApplied: !!state.targetApplied, shares: state.shares,
    note: state.note || '', fxRate: state.fxRate === undefined ? null : state.fxRate, customers: state.customers,
    lines: state.lines.map((l) => ({ key: l.key, customerKey: l.customerKey, skuCode: l.skuCode, tempSkuId: l.tempSkuId, skuName: l.skuName, priceVnd: l.priceVnd,
      qtyBase: l.qtyBase, qty: l.qty, khoa: l.khoa || khoaMacDinh() })), newSkus: state.newSkus, removedLines: dongDaXoa(state) };
}

/* ------------------------------ Định dạng ------------------------------ */
export const dinhDangTy = (v) => (so(v) / 1e9).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dinhDangTrieu = (v) => Math.round(so(v) / 1e6).toLocaleString('vi-VN');
export const dinhDangSo = (v) => Math.round(so(v)).toLocaleString('vi-VN');
export const dinhDangPct = (v, d = 1) => (v === null || v === undefined ? '—' : (v >= 0 ? '+' : '') + (v * 100).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
