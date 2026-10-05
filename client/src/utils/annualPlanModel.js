/**
 * annualPlanModel.js — các thao tác trên MỘT kế hoạch năm ở giao diện (thuần, không React, không gọi API). 05/10/2026.
 * Dựa trên bộ máy tính annualPlanEngine.js (bản sao nguyên văn của fc-api/pure-annual-plan.js). Thiết kế: Projects/De-xuat-Ke-hoach-Nam-FC-2026-10.md.
 *
 * `state` = đúng hình dạng API trả về: { shares[12], targetGrowthPct, targetRevenueVnd, targetApplied, baselineLastMonth,
 *   customers: [{key, name, market, isNew}], lines: [{key, customerKey, skuCode, tempSkuId, skuName, priceVnd, qtyBase[12], qty[12], khoa[12]}], newSkus }.
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

export function doanhThuCoSo(state) {
  const d = dongBoMay(state, 'qtyBase');
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

/**
 * Sửa SL kế hoạch của một dòng trong một tháng. Đã Apply: các dòng còn lại co giãn để doanh thu tháng KHÔNG ĐỔI (ô bị sửa được khóa).
 * Chưa Apply: sửa thẳng. Trả { state, lech }.
 */
export function suaKeHoach(state, key, m, v) {
  const sl = Math.max(0, Math.round(so(v)));
  if (!state.targetApplied) {
    return { state: thayDong(state, key, (l) => ({ ...l, qty: l.qty.map((x, i) => (i === m ? sl : x)) })), lech: 0 };
  }
  const mt = mucTieuThang(state)[m];
  const r = E.tinhChinhSku(dongBoMay(state, 'qty'), m, key, sl, mt);
  const lines = state.lines.map((l, i) => ({ ...l, qty: r.dong[i].qty, khoa: l.key === key ? l.khoa.map((x, j) => (j === m ? true : x)) : l.khoa }));
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
export function xoaKhach(state, key) {
  return { ...state, customers: state.customers.filter((c) => c.key !== key), lines: state.lines.filter((l) => l.customerKey !== key) };
}

/** Thêm dòng SKU cho một khách. SKU có mã (skuCode) hoặc SKU mới nhập tay (tempSkuId + tên + giá). SL các tháng ban đầu = 0. */
export function themSku(state, customerKey, { skuCode = '', tempSkuId = '', skuName = '', priceVnd = 0, qty }) {
  const key = customerKey + '|' + (skuCode || tempSkuId);
  if (state.lines.some((l) => l.key === key)) throw new Error('Khách này đã có SKU ' + (skuCode || tempSkuId) + '.');
  const q = (qty && qty.length === 12 ? qty : new Array(12).fill(0)).map((v) => Math.max(0, Math.round(so(v))));
  const dong = { key, customerKey, skuCode, tempSkuId, skuName, priceVnd: Math.max(0, so(priceVnd)), qtyBase: new Array(12).fill(0), qty: q, khoa: khoaMacDinh() };
  const moi = tempSkuId && !state.newSkus.some((n) => n.tempId === tempSkuId)
    ? state.newSkus.concat([{ tempId: tempSkuId, name: skuName, description: '', priceVnd: dong.priceVnd }]) : state.newSkus;
  return { ...state, lines: state.lines.concat([dong]), newSkus: moi };
}

/** Bớt một dòng SKU. Đã Apply: doanh thu bị bỏ được dồn lại cho các dòng còn lại (giữ tổng tháng). Trả { state, lech }. */
export function xoaSku(state, key) {
  const conLai = state.lines.filter((l) => l.key !== key);
  if (!state.targetApplied || !conLai.length) return { state: { ...state, lines: conLai }, lech: new Array(12).fill(0) };
  const dt = doanhThuKeHoach(state);
  const r = E.apDungMucTieu(dongBoMay({ ...state, lines: conLai }, 'qty'), dt);
  return { state: { ...state, lines: conLai.map((l, i) => ({ ...l, qty: r.dong[i].qty })) }, lech: r.lech };
}

/** Xóa hàng loạt mặt hàng nhỏ (máy tổng SL năm < 100, linh kiện < 1000, giá 0). laMay(line) -> boolean. Trả { state, xoa: [dòng bị xóa] }. */
export function xoaMatHangNho(state, laMay, tuyChon) {
  const bangKey = new Map(state.lines.map((l) => [l.key, l]));
  const r = E.xoaMatHangNho(dongBoMay(state, 'qty'), (d) => laMay(bangKey.get(d.key)), tuyChon);
  const qtyMoi = new Map(r.dong.map((d) => [d.key, d.qty]));
  const lines = state.lines.filter((l) => qtyMoi.has(l.key)).map((l) => ({ ...l, qty: qtyMoi.get(l.key) }));
  return { state: { ...state, lines }, xoa: r.xoa.map((d) => bangKey.get(d.key)), loi: r.loi };
}
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
    lines: state.lines.map((l) => ({ key: l.key, skuCode: l.skuCode, tempSkuId: l.tempSkuId, priceVnd: l.priceVnd, qty: l.qty })) });
}

/** Nội dung gửi API lưu. */
export function chuyenSangPayload(state) {
  return { targetGrowthPct: state.targetGrowthPct, targetRevenueVnd: state.targetRevenueVnd, targetApplied: !!state.targetApplied, shares: state.shares,
    note: state.note || '', fxRate: state.fxRate === undefined ? null : state.fxRate, customers: state.customers,
    lines: state.lines.map((l) => ({ key: l.key, customerKey: l.customerKey, skuCode: l.skuCode, tempSkuId: l.tempSkuId, skuName: l.skuName, priceVnd: l.priceVnd,
      qtyBase: l.qtyBase, qty: l.qty, khoa: l.khoa || khoaMacDinh() })), newSkus: state.newSkus };
}

/* ------------------------------ Định dạng ------------------------------ */
export const dinhDangTy = (v) => (so(v) / 1e9).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dinhDangTrieu = (v) => Math.round(so(v) / 1e6).toLocaleString('vi-VN');
export const dinhDangSo = (v) => Math.round(so(v)).toLocaleString('vi-VN');
export const dinhDangPct = (v, d = 1) => (v === null || v === undefined ? '—' : (v >= 0 ? '+' : '') + (v * 100).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
