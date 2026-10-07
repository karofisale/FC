/**
 * annualPlanSkuOps.js — SỬA KẾ HOẠCH NĂM THEO DOANH THU KHÁCH + CHẾ ĐỘ LẬP THEO SKU / CATEGORY (07/10/2026).
 * Thuần (không React, không API), mọi hàm trả state MỚI. Dùng bộ máy annualPlanEngine.js (làm tròn chục giữ tổng) và hình dạng state của annualPlanModel.js.
 *
 * Quy ước chung (tháng m, sau khi Apply Target = "đã khóa tỷ trọng tháng"):
 *  - DOANH THU TỪNG KHÁCH TRONG THÁNG là bất biến khi sửa SL ở chế độ SKU: phần chênh luôn được bù bằng SL các SKU CHƯA FIX của đúng khách đó.
 *  - "Fix" = ô (dòng × tháng) có khoa[m] = true: không bị co giãn khi sửa nơi khác. Fix một SKU-tháng / Category-tháng = Fix mọi ô của nó trong tháng đó
 *    (không cần thêm cột lưu trữ). Khi sửa trực tiếp một nút (ô / tổng SKU / tổng Category), các ô BÊN TRONG nút đó được ghi đè (kể cả đang Fix) rồi được Fix lại.
 *  - Chưa Apply: sửa thẳng, không bù, không tự Fix (đúng hành vi cũ của suaKeHoach).
 *
 * Ba thao tác sửa SL ở chế độ SKU (khi đã Apply):
 *  1. suaTongNhom  — sửa tổng SL tháng của một Category: mọi ô trong Category co giãn theo; doanh thu từng khách được bù bằng các SKU chưa Fix NGOÀI Category.
 *  2. suaTongSku   — sửa tổng SL tháng của một SKU: các ô của SKU (mọi khách) co giãn theo; các SKU chưa Fix KHÁC trong cùng Category co giãn để tổng SL Category
 *                    không đổi; doanh thu từng khách được bù bằng các SKU chưa Fix ngoài Category (khách không có SKU ngoài Category thì bù bằng SKU khác trong Category).
 *  3. suaOSkuKhach — sửa SL một SKU của một khách: các SKU chưa Fix khác của khách đó co giãn để doanh thu khách đó không đổi; SL SKU đó của các khách khác co giãn để
 *                    tổng SL SKU không đổi; các khách khác lại được bù bằng SKU chưa Fix khác của chính họ.
 *  Khách không còn SKU nào để bù thì phần ô của khách đó trong nút đang sửa được GIỮ NGUYÊN (không bị co giãn); nếu không bù được ở khách đang sửa thì báo lỗi.
 *
 * Sửa doanh thu khách: suaDoanhThuKhach (một ô khách × tháng; SL SKU của khách co giãn theo tỷ lệ, tùy chọn bù bằng các khách khác để giữ tổng tháng) và
 * apDungBangDoanhThu (tải bảng khách × tháng từ Excel để sửa đồng loạt).
 */

import * as E from './annualPlanEngine.js';
import { themSku, xoaSku } from './annualPlanModel.js';

const so = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const m12 = (v) => new Array(12).fill(v);

export const CHUA_PHAN_LOAI = 'Chưa phân loại';
/** Mã SKU hiển thị của dòng (mã SAP hoặc mã tạm). */
export const maSku = (l) => String((l && (l.skuCode || l.tempSkuId)) || '').trim();
/** Khóa gom SKU xuyên khách: bỏ khoảng trắng đầu/cuối, không phân biệt hoa thường (giống cách gom ở Excel Plan_SKU). */
export const khoaSku = (l) => maSku(l).toLowerCase();
/** Hàm lấy Category của một dòng từ bảng skuInfo { mã: { category } } (server trả + SKU mới thêm ở máy). Không có -> "Chưa phân loại". */
export const phanNhomCua = (info) => (l) => {
  const i = (info || {})[maSku(l)];
  const c = i && String(i.category || '').trim();
  return c || CHUA_PHAN_LOAI;
};

/* ------------------------------ Bảng làm việc của một tháng ------------------------------ */

function dungBang(state, m, catOf) {
  return state.lines.map((l, i) => {
    const gia = Math.max(0, so(l.priceVnd));
    return {
      i, c: l.customerKey || '', s: khoaSku(l), k: catOf ? catOf(l) : '', p: gia,
      q: Math.max(0, so(l.qty[m])), f: !!(l.khoa && l.khoa[m]),
      nam: l.qty.reduce((t, v) => t + Math.max(0, so(v)), 0) * gia          // cơ cấu doanh thu cả năm — dùng khi tháng đang trống
    };
  });
}
const tien = (x) => x.q * x.p;
const tongTien = (ds) => ds.reduce((t, x) => t + tien(x), 0);
const tongQ = (ds) => ds.reduce((t, x) => t + x.q, 0);
function nhomTheo(arr, f) {
  const mp = new Map();
  arr.forEach((x) => { const k = f(x); if (!mp.has(k)) mp.set(k, []); mp.get(k).push(x); });
  return mp;
}
const doanhThuKhachMap = (cells) => { const mp = new Map(); nhomTheo(cells, (x) => x.c).forEach((ds, c) => mp.set(c, tongTien(ds))); return mp; };
const tenKhachFn = (state) => (c) => { const k = state.customers.find((x) => x.key === c); return (k && k.name) || c || 'đơn vị'; };
/** Ô dùng được làm ô BÙ: chưa Fix, có đơn giá, có SL trong tháng hoặc có doanh thu trong năm (để chia theo cơ cấu khi tháng trống). */
const duocBu = (x) => !x.f && x.p > 0 && (x.q > 0 || x.nam > 0);

/**
 * Chia `tong` (số nguyên) cho các phần theo trọng số w (>= 0): tổng đúng bằng `tong`, phần dư chia theo phần lẻ lớn nhất.
 * Trọng số toàn 0 -> chia đều.
 */
export function chiaNguyen(w, tong) {
  const n = w.length;
  if (!n) return [];
  const T = Math.max(0, Math.round(so(tong)));
  const s = w.reduce((a, b) => a + Math.max(0, so(b)), 0);
  const raw = s > 0 ? w.map((x) => T * Math.max(0, so(x)) / s) : w.map(() => T / n);
  const out = raw.map((v) => Math.floor(v));
  let thieu = T - out.reduce((a, b) => a + b, 0);
  const thuTu = raw.map((_, i) => i).sort((a, b) => (raw[b] - Math.floor(raw[b])) - (raw[a] - Math.floor(raw[a])) || a - b);
  for (let k = 0; thieu > 0; k++, thieu--) out[thuTu[k % n]] += 1;
  return out;
}

/** Có bù được `delta` (VNĐ, có thể âm) bằng các ô ab không? */
function coTheBu(ab, delta) {
  const A = tongTien(ab);
  const can = A + delta;
  if (can < -0.5) return false;
  if (A > 0) return true;
  return can > 0 && ab.reduce((t, x) => t + x.nam, 0) > 0;
}

/** Sai số làm tròn chục mà kế hoạch chấp nhận cho một khách (cùng cách tính của kiemTraKeHoach): 10 × đơn giá nhỏ nhất trong các dòng có SL của khách. */
const dungSaiKhach = (ds) => E.BUOC_LAM_TRON * Math.min(Infinity, ...ds.filter((x) => x.q > 0 && x.p > 0).map((x) => x.p));

/**
 * Tinh chỉnh THEO ĐƠN VỊ (không còn làm tròn chục) khi làm tròn chục để lại phần dư lớn hơn `tol` — thường do các SKU bù có đơn giá cao (máy). Cộng / trừ từng 1 cái ở ô có
 * giá lớn nhất không vượt phần dư cho tới khi dư còn nhỏ hơn nửa giá thấp nhất của các ô bù. Mặc định (dư đã trong sai số) giữ nguyên SL bội 10.
 */
function tinhChinhDonVi(ab, can, tol) {
  const pMin = Math.min(...ab.map((x) => x.p));
  for (let lan = 0; lan < 5000; lan++) {
    const r = can - tongTien(ab);
    if (Math.abs(r) <= Math.max(tol, pMin / 2)) break;
    const gioiHan = Math.abs(r) + pMin / 2;
    const ung = (r > 0 ? ab : ab.filter((x) => x.q > 0)).filter((x) => x.p <= gioiHan).sort((a, b) => b.p - a.p);
    if (!ung.length) break;
    ung[0].q += r > 0 ? 1 : -1;
  }
}

/** Co giãn các ô ab (cùng một khách) để doanh thu của CHÍNH chúng tăng/giảm `delta`: theo tỷ lệ SL hiện có (tháng trống: theo cơ cấu doanh thu cả năm); làm tròn chục giữ tổng. */
function buDoanhThu(ab, delta, ten, m, tol) {
  const A = tongTien(ab);
  const can = A + delta;
  if (can < -0.5) throw new Error('Khách "' + ten + '" không đủ SKU chưa Fix để bù trong tháng ' + (m + 1) + ' (cần giảm thêm ' + Math.round(-can) + ' VNĐ).');
  let raw;
  if (A > 0) raw = ab.map((x) => x.q * can / A);
  else {
    const S = ab.reduce((t, x) => t + x.nam, 0);
    if (!(S > 0)) throw new Error('Khách "' + ten + '" chưa có SKU nào có doanh thu để chia trong tháng ' + (m + 1) + ' — thêm SKU hoặc nhập SL trước.');
    raw = ab.map((x) => can * (x.nam / S) / x.p);
  }
  const kq = E.lamTronGiuTong(raw, ab.map((x) => x.p), Math.max(0, can));
  ab.forEach((x, k) => { x.q = kq.qty[k]; });
  if (tol > 0 && isFinite(tol) && Math.abs(can - tongTien(ab)) > tol) tinhChinhDonVi(ab, Math.max(0, can), tol);
}

/** Lỗi không bù được doanh thu của một khách cụ thể — để thao tác thử lại với khách đó được GIỮ NGUYÊN (loại trừ) thay vì dừng cả thao tác. */
class LoiKhach extends Error {
  constructor(msg, khach) { super(msg); this.khach = khach; }
}

/**
 * Chạy `thuc(loaTru)`; nếu một khách (coThe(khách) = được phép loại) không bù được doanh thu thì loại khách đó khỏi nút đang sửa (giữ nguyên SL của họ) rồi thử lại.
 * Nhờ vậy khách nhỏ chỉ có SKU đắt không chặn cả thao tác: các khách còn lại chia phần chênh.
 */
function chayLoaTru(thuc, coThe, ten) {
  const loaTru = new Set();
  for (let lan = 0; lan <= 500; lan++) {
    try {
      const r = thuc(loaTru);
      if (loaTru.size) r.ghiChu.push('Khách ' + Array.from(loaTru).map(ten).join(', ') + ' không đủ SKU chưa Fix khác để bù doanh thu nên giữ nguyên SL của họ.');
      return r;
    } catch (e) {
      if (e instanceof LoiKhach && coThe(e.khach) && !loaTru.has(e.khach)) { loaTru.add(e.khach); continue; }
      throw e;
    }
  }
  throw new Error('Không bù được doanh thu các khách.');
}

/**
 * Trả doanh thu từng khách về mức gốc `goc` (Map khách -> VNĐ). Ô bù: chưa Fix, ngoài `node`; ưu tiên ô NGOÀI vùng bảo vệ p1, không đủ thì thêm ô TRONG p1.
 * Khách không còn lệch thì bỏ qua. Không bù được -> lỗi.
 */
function canBangKhach(cells, goc, p1, node, ten, m) {
  nhomTheo(cells, (x) => x.c).forEach((ds, c) => {
    const delta = (goc.has(c) ? goc.get(c) : tongTien(ds)) - tongTien(ds);
    if (Math.abs(delta) < 1) return;
    const dung = ds.filter((x) => duocBu(x) && !node.has(x.i));
    const t1 = dung.filter((x) => !p1.has(x.i));
    const thu = [t1, dung].find((ab) => ab.length && coTheBu(ab, delta));
    if (!thu) throw new LoiKhach('Khách "' + ten(c) + '" không đủ SKU chưa Fix để bù doanh thu tháng ' + (m + 1) + ' (lệch ' + Math.round(delta) + ' VNĐ). Bỏ Fix một số ô hoặc thêm SKU cho khách.', c);
    buDoanhThu(thu, delta, ten(c), m, dungSaiKhach(ds));
  });
}

/** Ghi SL tháng m từ bảng làm việc về state; `danhDau` = tập chỉ số dòng cần Fix ở tháng m. */
function ghiThang(state, m, cells, danhDau) {
  const lines = state.lines.map((l, i) => {
    const x = cells[i];
    const doiQty = so(l.qty[m]) !== x.q;
    const doiKhoa = !!(danhDau && danhDau.has(i)) && !(l.khoa && l.khoa[m]);
    if (!doiQty && !doiKhoa) return l;
    const o = { ...l };
    if (doiQty) { o.qty = l.qty.slice(); o.qty[m] = x.q; }
    if (doiKhoa) { o.khoa = (l.khoa || m12(false)).slice(); o.khoa[m] = true; }
    return o;
  });
  return { ...state, lines };
}

/* ------------------------------ Ba thao tác sửa SL (chế độ SKU) ------------------------------ */

/** Chưa Apply: co giãn các ô của nút theo tỷ lệ, tổng đúng bằng tongMoi; không bù, không Fix. */
function suaThangChuaApply(state, m, cells, idx, tongMoi) {
  const ds = idx.map((i) => cells[i]);
  const w = tongQ(ds) > 0 ? ds.map((x) => x.q) : ds.map((x) => x.nam);
  chiaNguyen(w, tongMoi).forEach((q, k) => { ds[k].q = q; });
  return { state: ghiThang(state, m, cells, null), ghiChu: [] };
}

/**
 * Sửa SL một SKU của một khách (key = khóa dòng). Đã Apply: xem đầu tệp (thao tác 3). Trả { state, ghiChu[] }.
 */
export function suaOSkuKhach(state, key, m, v, catOf) {
  const sl = Math.max(0, Math.round(so(v)));
  const i0 = state.lines.findIndex((l) => l.key === key);
  if (i0 < 0) throw new Error('Không tìm thấy dòng ' + key);
  if (!state.targetApplied) { const cells = dungBang(state, m, catOf); cells[i0].q = sl; return { state: ghiThang(state, m, cells, null), ghiChu: [] }; }
  const c0 = state.lines[i0].customerKey || '';
  return chayLoaTru((loaTru) => suaOSkuKhachLan(state, i0, m, sl, catOf, loaTru), (c) => c !== c0, tenKhachFn(state));
}
function suaOSkuKhachLan(state, i0, m, sl, catOf, loaTru) {
  const cells = dungBang(state, m, catOf);
  const ten = tenKhachFn(state);
  const goc = doanhThuKhachMap(cells);
  const x0 = cells[i0];
  const delta = sl - x0.q;
  x0.q = sl; x0.f = true;
  const cot = new Set(cells.filter((x) => x.s === x0.s).map((x) => x.i));
  const ghiChu = [];
  if (delta !== 0) {
    const bu = (c) => cells.some((x) => x.c === c && !cot.has(x.i) && duocBu(x));
    const F = cells.filter((x) => cot.has(x.i) && x.i !== i0 && !x.f && x.c !== x0.c && !loaTru.has(x.c) && bu(x.c));
    const sumF = tongQ(F);
    if (F.length && (sumF > 0 || delta < 0)) {
      if (sumF - delta < 0) ghiChu.push('Các khách khác không đủ SL ' + maSku(state.lines[i0]) + ' để giảm: tổng SKU tăng thêm ' + (delta - sumF) + '.');
      chiaNguyen(sumF > 0 ? F.map((x) => x.q) : F.map((x) => x.nam), Math.max(0, sumF - delta)).forEach((q, k) => { F[k].q = q; });
    } else ghiChu.push('Không khách nào khác bù được: tổng SL ' + maSku(state.lines[i0]) + ' trong tháng ' + (m + 1) + ' thay đổi ' + (delta > 0 ? '+' : '') + delta + '.');
  }
  canBangKhach(cells, goc, cot, new Set([i0]), ten, m);
  return { state: ghiThang(state, m, cells, new Set([i0])), ghiChu };
}

/** Các chỉ số dòng của một SKU (khóa gom khoaSku). */
const dongCuaSku = (state, skuKey) => state.lines.map((l, i) => (khoaSku(l) === skuKey ? i : -1)).filter((i) => i >= 0);

/**
 * Sửa TỔNG SL tháng của một SKU (mọi khách). Đã Apply: xem đầu tệp (thao tác 2). skuKey = khoaSku. Trả { state, ghiChu[] }.
 */
export function suaTongSku(state, skuKey, m, tongMoi, catOf) {
  const T = Math.max(0, Math.round(so(tongMoi)));
  const idx = dongCuaSku(state, skuKey);
  if (!idx.length) throw new Error('Không tìm thấy SKU ' + skuKey);
  if (!state.targetApplied) return suaThangChuaApply(state, m, dungBang(state, m, catOf), idx, T);
  return chayLoaTru((loaTru) => suaTongSkuLan(state, idx, skuKey, m, T, catOf, loaTru), () => true, tenKhachFn(state));
}
function suaTongSkuLan(state, idx, skuKey, m, T, catOf, loaTru) {
  const cells = dungBang(state, m, catOf);
  const ten = tenKhachFn(state);
  const goc = doanhThuKhachMap(cells);
  const node = new Set(idx);
  const nodeCells = idx.map((i) => cells[i]);
  const k0 = nodeCells[0].k;
  const cat = new Set(cells.filter((x) => x.k === k0).map((x) => x.i));
  const ghiChu = [];
  // ô của SKU thuộc khách còn SKU khác để bù thì co giãn; khách không bù được giữ nguyên
  const bu = (c) => !loaTru.has(c) && cells.some((x) => x.c === c && !node.has(x.i) && duocBu(x));
  const ok = nodeCells.filter((x) => bu(x.c)), khong = nodeCells.filter((x) => !bu(x.c));
  if (!ok.length) throw new Error('Không khách nào của SKU này còn SKU khác chưa Fix để bù doanh thu tháng ' + (m + 1) + '. Bỏ Fix một số ô hoặc thêm SKU cho khách.');
  const tongKhong = tongQ(khong);
  if (T < tongKhong) throw new Error('Tổng nhập (' + T + ') nhỏ hơn phần SL của các khách không bù được (' + tongKhong + ').');
  const khongRieng = khong.filter((x) => !loaTru.has(x.c));       // khách đã bị loại do không bù được đã có ghi chú riêng
  if (khongRieng.length) ghiChu.push(khongRieng.length + ' khách không còn SKU khác để bù nên giữ nguyên SL ' + skuKey.toUpperCase() + ' của họ.');
  const qCu = tongQ(nodeCells);
  chiaNguyen(tongQ(ok) > 0 ? ok.map((x) => x.q) : ok.map((x) => x.nam), T - tongKhong).forEach((q, k) => { ok[k].q = q; });
  // giữ tổng SL Category: các SKU chưa Fix khác trong Category co giãn ngược lại
  const dQ = T - qCu;
  if (dQ !== 0) {
    const ngoai = (c) => !loaTru.has(c) && cells.some((x) => x.c === c && !cat.has(x.i) && duocBu(x));
    const C1 = cells.filter((x) => cat.has(x.i) && !node.has(x.i) && !x.f && ngoai(x.c));
    const sumC1 = tongQ(C1);
    if (C1.length && (sumC1 > 0 || dQ < 0)) {
      if (sumC1 - dQ < 0) ghiChu.push('Các SKU khác trong nhóm "' + k0 + '" không đủ SL để giảm: tổng nhóm tăng thêm ' + (dQ - sumC1) + '.');
      chiaNguyen(sumC1 > 0 ? C1.map((x) => x.q) : C1.map((x) => x.nam), Math.max(0, sumC1 - dQ)).forEach((q, k) => { C1[k].q = q; });
    } else ghiChu.push('Nhóm "' + k0 + '" không còn SKU chưa Fix khác: tổng SL nhóm trong tháng ' + (m + 1) + ' thay đổi ' + (dQ > 0 ? '+' : '') + dQ + '.');
  }
  canBangKhach(cells, goc, cat, node, ten, m);
  return { state: ghiThang(state, m, cells, node), ghiChu };
}

/**
 * Sửa TỔNG SL tháng của một Category (nhóm). Đã Apply: xem đầu tệp (thao tác 1). nhom = tên Category theo catOf. Trả { state, ghiChu[] }.
 */
export function suaTongNhom(state, nhom, m, tongMoi, catOf) {
  const T = Math.max(0, Math.round(so(tongMoi)));
  const cells0 = dungBang(state, m, catOf);
  const idx = cells0.filter((x) => x.k === nhom).map((x) => x.i);
  if (!idx.length) throw new Error('Không tìm thấy nhóm ' + nhom);
  if (!state.targetApplied) return suaThangChuaApply(state, m, cells0, idx, T);
  return chayLoaTru((loaTru) => suaTongNhomLan(state, idx, nhom, m, T, catOf, loaTru), () => true, tenKhachFn(state));
}
function suaTongNhomLan(state, idx, nhom, m, T, catOf, loaTru) {
  const cells = dungBang(state, m, catOf);
  const ten = tenKhachFn(state);
  const goc = doanhThuKhachMap(cells);
  const node = new Set(idx);
  const nodeCells = idx.map((i) => cells[i]);
  const bu = (c) => !loaTru.has(c) && cells.some((x) => x.c === c && !node.has(x.i) && duocBu(x));
  const ok = nodeCells.filter((x) => bu(x.c)), khong = nodeCells.filter((x) => !bu(x.c));
  if (!ok.length) throw new Error('Không khách nào của nhóm "' + nhom + '" còn SKU ngoài nhóm chưa Fix để bù doanh thu tháng ' + (m + 1) + '.');
  const tongKhong = tongQ(khong);
  if (T < tongKhong) throw new Error('Tổng nhập (' + T + ') nhỏ hơn phần SL của các khách không bù được (' + tongKhong + ').');
  const ghiChu = [];
  const khongRieng = khong.filter((x) => !loaTru.has(x.c));
  if (khongRieng.length) ghiChu.push(khongRieng.length + ' dòng của khách không còn SKU ngoài nhóm để bù nên giữ nguyên.');
  chiaNguyen(tongQ(ok) > 0 ? ok.map((x) => x.q) : ok.map((x) => x.nam), T - tongKhong).forEach((q, k) => { ok[k].q = q; });
  canBangKhach(cells, goc, node, node, ten, m);
  return { state: ghiThang(state, m, cells, node), ghiChu };
}

/* ------------------------------ Fix (khoa) ------------------------------ */

/** Trạng thái Fix của một tập dòng trong một tháng (thang = chỉ số) hoặc cả năm (thang = null): 'tat' | 'mot-phan' | 'het'. */
export function trangThaiFix(state, keys, thang) {
  const set = new Set(keys);
  let co = 0, tong = 0;
  state.lines.forEach((l) => {
    if (!set.has(l.key)) return;
    (thang === null || thang === undefined ? l.khoa || [] : [l.khoa && l.khoa[thang]]).forEach((v) => { tong++; if (v) co++; });
  });
  return !tong || !co ? 'tat' : (co === tong ? 'het' : 'mot-phan');
}
/** Bật / tắt Fix cho tập dòng ở một tháng (hoặc cả năm): đang 'het' thì bỏ Fix, ngược lại Fix hết. */
export function doiFixNhieu(state, keys, thang) {
  const bat = trangThaiFix(state, keys, thang) !== 'het';
  const set = new Set(keys);
  return { ...state, lines: state.lines.map((l) => (set.has(l.key)
    ? { ...l, khoa: (l.khoa || m12(false)).map((v, i) => (thang === null || thang === undefined || i === thang ? bat : v)) } : l)) };
}

/* ------------------------------ Doanh thu từng khách theo tháng ------------------------------ */

/**
 * Sửa doanh thu (VNĐ) của MỘT khách trong MỘT tháng: SL các SKU chưa Fix của khách co giãn theo tỷ lệ cho đúng doanh thu mới (ô đã Fix giữ nguyên).
 * Đã Apply và buKhac = true: phần chênh được bù bằng các khách khác (theo tỷ lệ doanh thu tháng, chỉ trong `phamVi` nếu có — vd. các khách đang lọc) để tổng tháng không đổi.
 * Trả { state, ghiChu[] }.
 */
export function suaDoanhThuKhach(state, customerKey, m, tongMoiVnd, { buKhac = true, phamVi = null } = {}) {
  const moi = so(tongMoiVnd);
  if (!(moi >= 0)) throw new Error('Doanh thu phải là số không âm.');
  const cells = dungBang(state, m, null);
  const mine = cells.filter((x) => x.c === (customerKey || ''));
  const ten = tenKhachFn(state);
  if (!mine.length) throw new Error('Khách "' + ten(customerKey) + '" chưa có SKU nào — thêm SKU trước khi nhập doanh thu.');
  const cur = tongTien(mine);
  if (Math.abs(moi - cur) < 1) return { state, ghiChu: [] };
  const free = mine.filter(duocBu);
  if (!free.length || !coTheBu(free, moi - cur)) throw new Error('Khách "' + ten(customerKey) + '": không co giãn được tháng ' + (m + 1) + ' (các SKU đã Fix, đơn giá 0 hoặc doanh thu cần nhập nhỏ hơn phần đã Fix).');
  buDoanhThu(free, moi - cur, ten(customerKey), m, dungSaiKhach(mine));
  const dC = tongTien(mine) - cur;
  const ghiChu = [];
  if (state.targetApplied && buKhac && Math.abs(dC) >= 1) {
    const khac = nhomTheo(cells.filter((x) => x.c !== (customerKey || '') && (!phamVi || phamVi.has(x.c))), (x) => x.c);
    const ds = [];
    khac.forEach((arr, c) => { const ab = arr.filter(duocBu); const A = tongTien(ab); if (A > 0) ds.push({ c, ab, A }); });
    const S = ds.reduce((t, d) => t + d.A, 0);
    if (!(S > 0)) throw new Error('Không có khách nào khác để bù phần chênh (' + Math.round(dC) + ' VNĐ) — tổng tháng sẽ lệch Target. Tắt "bù bằng khách khác" nếu vẫn muốn sửa.');
    if (dC > S + 0.5) throw new Error('Các khách khác không đủ doanh thu để bù (cần giảm ' + Math.round(dC) + ' VNĐ, chỉ còn ' + Math.round(S) + ' VNĐ).');
    ds.forEach((d) => buDoanhThu(d.ab, -dC * d.A / S, ten(d.c), m, dungSaiKhach(cells.filter((x) => x.c === d.c))));
    ghiChu.push('Đã bù ' + (dC > 0 ? 'giảm ' : 'tăng ') + Math.abs(Math.round(dC)).toLocaleString('vi-VN') + ' VNĐ vào ' + ds.length + ' khách khác để giữ tổng tháng.');
  }
  return { state: ghiThang(state, m, cells, null), ghiChu };
}

/** Doanh thu kế hoạch từng khách theo tháng: Map khách -> number[12] (VNĐ). */
export function doanhThuKhachThang(state) {
  const mp = new Map(state.customers.map((c) => [c.key, m12(0)]));
  state.lines.forEach((l) => {
    const k = l.customerKey || '';
    if (!mp.has(k)) mp.set(k, m12(0));
    const a = mp.get(k);
    l.qty.forEach((q, m) => { a[m] += so(q) * so(l.priceVnd); });
  });
  return mp;
}

/** Lệch từng tháng của tổng kế hoạch so với Target × tỷ trọng (chỉ khi đã Apply; ngược lại null). dương = đang THIẾU so với mục tiêu. */
export function lechTheoMucTieu(state) {
  if (!state.targetApplied || !(so(state.targetRevenueVnd) > 0)) return null;
  const mt = E.mucTieuTheoThang(so(state.targetRevenueVnd), state.shares);
  const tong = m12(0);
  state.lines.forEach((l) => l.qty.forEach((q, m) => { tong[m] += so(q) * so(l.priceVnd); }));
  return mt.map((v, m) => v - tong[m]);
}

/** Sai số làm tròn chục cho phép của tổng tháng m so với mục tiêu (cùng công thức kiemTraKeHoach: tổng bước nhỏ nhất của từng khách). */
export function saiSoChoPhep(state, m) {
  const gia = new Map();
  state.lines.forEach((l) => {
    if (so(l.qty[m]) > 0 && so(l.priceVnd) > 0) { const k = l.customerKey || ''; gia.set(k, Math.min(gia.has(k) ? gia.get(k) : Infinity, so(l.priceVnd))); }
  });
  return Math.max(E.BUOC_LAM_TRON * Array.from(gia.values()).reduce((a, b) => a + b, 0), 1);
}

/**
 * Áp bảng doanh thu khách × tháng (từ Excel) vào kế hoạch. bang = Map khách -> number[12] (null / NaN = không đổi). Tuỳ chọn:
 *  - canBangVeTarget (mặc định true; chỉ khi đã Apply): sau khi đặt xong, tháng nào tổng lệch Target × tỷ trọng thì co giãn ĐỀU mọi ô chưa Fix của tháng đó về mục tiêu.
 * Mỗi (khách, tháng) lỗi được ghi vào `loi` (không dừng cả bảng). Trả { state, thayDoi: [{key, m, tu, den}], loi: [{key, m, text}], lechTruoc: number[12]|null, lechSau: number[12]|null }.
 */
export function apDungBangDoanhThu(state, bang, { canBangVeTarget = true } = {}) {
  let s = state;
  const thayDoi = [], loi = [];
  bang.forEach((arr, key) => {
    for (let m = 0; m < 12; m++) {
      const v = arr[m];
      if (v === null || v === undefined || !isFinite(Number(v))) continue;
      const tu = (doanhThuKhachThang(s).get(key) || m12(0))[m];
      if (Math.abs(so(v) - tu) < 1) continue;
      try {
        s = suaDoanhThuKhach(s, key, m, so(v), { buKhac: false }).state;
        thayDoi.push({ key, m, tu, den: (doanhThuKhachThang(s).get(key) || m12(0))[m] });
      } catch (e) { loi.push({ key, m, text: e.message }); }
    }
  });
  const lechTruoc = lechTheoMucTieu(s);
  if (canBangVeTarget && lechTruoc && thayDoi.length) {
    const can = lechTruoc.map((v) => Math.abs(v) > 1);
    if (can.some(Boolean)) {
      const dong = s.lines.map((l) => ({ key: l.key, price: l.priceVnd, qty: l.qty, khoa: l.khoa || m12(false) }));
      const r = E.apDungMucTieu(dong, E.mucTieuTheoThang(so(s.targetRevenueVnd), s.shares));
      s = { ...s, lines: s.lines.map((l, i) => (can.some(Boolean) ? { ...l, qty: l.qty.map((x, m) => (can[m] ? r.dong[i].qty[m] : x)) } : l)) };
      r.loi.forEach((t) => loi.push({ key: '', m: -1, text: t }));
    }
  }
  return { state: s, thayDoi, loi, lechTruoc, lechSau: lechTheoMucTieu(s) };
}

/* ------------------------------ Gom theo Category → SKU → khách ------------------------------ */

/**
 * Cấu trúc cho bảng "Theo SKU": [{ nhom, dtNam, qty[12], rev[12], skus: [{ khoa, ma, ten, gia, dtNam, qty[12], rev[12], keys[], dong: [{ line, customerKey }] }] }].
 * Category xếp theo DOANH THU KẾ HOẠCH NĂM giảm dần; trong Category SKU cũng xếp theo doanh thu năm giảm dần (đồng hạng: theo mã).
 */
export function gomTheoNhomSku(state, catOf) {
  const nhomMap = new Map();
  state.lines.forEach((l) => {
    const k = catOf(l), sk = khoaSku(l);
    let n = nhomMap.get(k);
    if (!n) { n = { nhom: k, qty: m12(0), rev: m12(0), skuMap: new Map() }; nhomMap.set(k, n); }
    let s = n.skuMap.get(sk);
    if (!s) { s = { khoa: sk, ma: maSku(l), ten: l.skuName || '', giaDau: so(l.priceVnd), qty: m12(0), rev: m12(0), keys: [], dong: [] }; n.skuMap.set(sk, s); }
    s.keys.push(l.key);
    s.dong.push({ line: l, customerKey: l.customerKey || '' });
    for (let m = 0; m < 12; m++) {
      const q = so(l.qty[m]), r = q * so(l.priceVnd);
      s.qty[m] += q; s.rev[m] += r; n.qty[m] += q; n.rev[m] += r;
    }
  });
  const tong = (a) => a.reduce((t, v) => t + v, 0);
  return Array.from(nhomMap.values()).map((n) => {
    const skus = Array.from(n.skuMap.values()).map((s) => {
      const dt = tong(s.rev), sl = tong(s.qty);
      return { khoa: s.khoa, ma: s.ma, ten: s.ten, gia: sl > 0 ? dt / sl : s.giaDau, dtNam: dt, qty: s.qty, rev: s.rev, keys: s.keys, dong: s.dong };
    }).sort((a, b) => b.dtNam - a.dtNam || (a.ma < b.ma ? -1 : 1));
    return { nhom: n.nhom, dtNam: tong(n.rev), qty: n.qty, rev: n.rev, skus };
  }).sort((a, b) => b.dtNam - a.dtNam || (a.nhom < b.nhom ? -1 : 1));
}

/* ------------------------------ Xóa / sửa mã / thêm SKU cho nhiều khách ------------------------------ */

/**
 * Sửa mã SKU cho TOÀN BỘ khách có SKU đó: mã mới (và tên nếu nhập) thay vào mọi dòng; số lượng, đơn giá, Fix giữ nguyên. Khách đã có sẵn mã mới -> lỗi (không tự gộp).
 * Mã tạm đổi sang mã SAP thì bỏ khỏi danh sách SKU mới nếu không còn dòng nào dùng.
 */
export function doiMaSku(state, skuKey, { skuCode, skuName = '' }) {
  const moi = String(skuCode || '').trim();
  if (!moi) throw new Error('Nhập mã SKU mới.');
  const idx = dongCuaSku(state, skuKey);
  if (!idx.length) throw new Error('Không tìm thấy SKU ' + skuKey);
  if (moi.toLowerCase() === skuKey) {
    if (!String(skuName).trim()) return state;
  }
  const trong = new Set(idx);
  const co = new Set(state.lines.filter((_, i) => !trong.has(i)).map((l) => l.key.toLowerCase()));
  const loi = idx.map((i) => state.lines[i].customerKey + '|' + moi).filter((k) => co.has(k.toLowerCase()));
  if (loi.length) throw new Error('Đã có SKU ' + moi + ' ở ' + loi.length + ' khách (' + loi.slice(0, 3).map((k) => k.split('|')[0]).join(', ') + '…) — xóa dòng trùng trước.');
  const lines = state.lines.map((l, i) => (trong.has(i)
    ? { ...l, key: l.customerKey + '|' + moi, skuCode: moi, tempSkuId: '', skuName: String(skuName).trim() || l.skuName } : l));
  const dung = new Set(lines.map((l) => l.tempSkuId).filter(Boolean));
  return { ...state, lines, newSkus: (state.newSkus || []).filter((n) => dung.has(n.tempId)) };
}

/** Thêm một SKU cho NHIỀU khách (mỗi khách một dòng, SL 0). Khách đã có SKU đó bị bỏ qua. Trả { state, them: [customerKey], boQua: [customerKey] }. */
export function themSkuNhieuKhach(state, customerKeys, du) {
  let s = state;
  const them = [], boQua = [];
  customerKeys.forEach((ck) => {
    try { s = themSku(s, ck, du); them.push(ck); } catch (e) { boQua.push(ck); }
  });
  return { state: s, them, boQua };
}

/** Xóa một SKU khỏi TOÀN BỘ khách có SKU đó. Đã Apply: doanh thu mỗi dòng bị xóa dồn lại cho các SKU còn lại của đúng khách đó (như xoaSku từng dòng). */
export function xoaSkuTatCa(state, skuKey) {
  let s = state;
  dongCuaSku(state, skuKey).map((i) => state.lines[i].key).forEach((k) => { s = xoaSku(s, k).state; });
  return s;
}
