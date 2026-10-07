/**
 * annualPlanSkuOps.js — SỬA KẾ HOẠCH NĂM THEO DOANH THU KHÁCH + CHẾ ĐỘ LẬP THEO SKU / CATEGORY (07/10/2026).
 * Thuần (không React, không API), mọi hàm trả state MỚI. Dùng bộ máy annualPlanEngine.js (làm tròn chục giữ tổng) và hình dạng state của annualPlanModel.js.
 *
 * NGUYÊN TẮC (tháng m, sau khi Apply Target = "đã khóa tỷ trọng tháng"): TỔNG DOANH THU THÁNG và DOANH THU TỪNG KHÁCH trong tháng không đổi khi sửa SL ở chế độ SKU. Không giữ được -> BÁO LỖI, không đổi gì.
 *  - Fix có hai cấp: (1) Ô (dòng × tháng) `khoa[m]`: ô đứng yên. (2) Fix TỔNG của một SKU / Category (`state.fixTong`, lưu kèm kế hoạch): chỉ giữ nguyên TỔNG SL của nó, các dòng con VẪN co giãn
 *    (chỉ ô con tự Fix riêng mới đứng yên). Sửa trực tiếp một nút (ô / tổng SKU / tổng nhóm) thì nút đó được Fix lại (ô: khoa; SKU / nhóm: Fix tổng).
 *  - Mọi thao tác giải ĐỒNG THỜI các ràng buộc bằng annualPlanSolver (co giãn theo tỷ lệ), rồi làm tròn số nguyên theo tầng giá và kiểm tra lại: doanh thu khách / tổng tháng trong sai số làm tròn
 *    (10 × đơn giá nhỏ nhất của khách, như kiemTraKeHoach); tổng SL SKU / Category đã Fix phải đúng tuyệt đối.
 *  - Sửa trong một nhóm thì các dòng chưa Fix CÙNG NHÓM co giãn để tổng nhóm không đổi (sửa ô -> giữ tổng SKU; sửa tổng SKU -> giữ tổng Category). Nếu nút cha đang Fix mà không bù được -> lỗi;
 *    nếu cha chưa Fix và không bù được thì tổng cha thay đổi (có ghi chú).
 *  - Chưa Apply: sửa thẳng, không bù, không tự Fix (đúng hành vi cũ của suaKeHoach).
 *
 * Ba thao tác sửa SL ở chế độ SKU (khi đã Apply): suaTongNhom (tổng SL một Category), suaTongSku (tổng SL một SKU), suaOSkuKhach (SL một SKU của một khách).
 *
 * Sửa doanh thu khách: suaDoanhThuKhach (một ô khách × tháng; SL SKU của khách co giãn theo tỷ lệ, tùy chọn bù bằng các khách khác để giữ tổng tháng) và
 * apDungBangDoanhThu (tải bảng khách × tháng từ Excel để sửa đồng loạt).
 */

import * as E from './annualPlanEngine.js';
import { themSku, xoaSku } from './annualPlanModel.js';
import { giaiRangBuoc } from './annualPlanSolver.js';

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

/* ------------------------------ Fix cấp TỔNG (SKU / Category) ------------------------------ */

const kFix = (loai, ten) => loai + ':' + ten;
/**
 * Tổng SKU (loai 'sku', ten = khoaSku) hoặc Category (loai 'cat', ten = tên nhóm) của tháng m có đang Fix không.
 * Fix cấp tổng = GIỮ NGUYÊN TỔNG SL; các dòng con bên trong vẫn được co giãn (chỉ ô con tự Fix riêng mới đứng yên). Lưu ở state.fixTong { 'sku:<khóa>' | 'cat:<nhóm>': boolean[12] }.
 */
export const laFixTong = (state, loai, ten, m) => !!(state.fixTong && state.fixTong[kFix(loai, ten)] && state.fixTong[kFix(loai, ten)][m]);
/** 'tat' | 'mot-phan' | 'het' cho một tháng (thang = chỉ số) hoặc cả năm (thang = null). */
export function trangThaiFixTong(state, loai, ten, thang) {
  const a = (state.fixTong && state.fixTong[kFix(loai, ten)]) || m12(false);
  const ds = thang === null || thang === undefined ? a : [a[thang]];
  const co = ds.filter(Boolean).length;
  return !co ? 'tat' : (co === ds.length ? 'het' : 'mot-phan');
}
function datFixTong(state, loai, ten, thang, bat) {
  const k = kFix(loai, ten);
  const a = ((state.fixTong && state.fixTong[k]) || m12(false)).slice();
  for (let i = 0; i < 12; i++) if (thang === null || thang === undefined || i === thang) a[i] = !!bat;
  const ft = { ...(state.fixTong || {}) };
  if (a.some(Boolean)) ft[k] = a; else delete ft[k];
  return { ...state, fixTong: ft };
}
/** Bật / tắt Fix tổng: đang 'het' thì bỏ, ngược lại bật. */
export function doiFixTong(state, loai, ten, thang) { return datFixTong(state, loai, ten, thang, trangThaiFixTong(state, loai, ten, thang) !== 'het'); }

/* ------------------------------ Giải thao tác sửa SL bằng ràng buộc đồng thời ------------------------------ */

/** Ghi SL tháng m từ bảng làm việc về state; `danhDau` = tập chỉ số dòng cần Fix (khoa) ở tháng m. */
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

/** Chưa Apply: co giãn các ô của nút theo tỷ lệ, tổng đúng bằng tongMoi; không bù, không Fix. */
function suaThangChuaApply(state, m, cells, idx, tongMoi) {
  const ds = idx.map((i) => cells[i]);
  const w = tongQ(ds) > 0 ? ds.map((x) => x.q) : ds.map((x) => x.nam);
  chiaNguyen(w, tongMoi).forEach((q, k) => { ds[k].q = q; });
  return { state: ghiThang(state, m, cells, null), ghiChu: [] };
}

/** Trọng số co giãn của ô: theo SL hiện có; ô đang 0 nhưng có doanh thu trong năm được trọng số nhỏ (theo SL bình quân tháng) để vẫn nhận được phần bù khi bắt buộc. Ô Fix = 0 (đứng yên). */
const trongSo = (x) => (x.f ? 0 : (x.q > 0 ? x.q : (x.nam > 0 && x.p > 0 ? 0.05 * (x.nam / x.p) / 12 : 0)));
const dongKhach = (cells, c, b) => { const ds = cells.filter((x) => x.c === c); return { loai: 'kh', khoa: c, hien: c, cells: ds.map((x) => x.i), coef: ds.map((x) => x.p), b, mem: false }; };
const dongCot = (loai, khoa, hien, ds, b, mem) => ({ loai, khoa, hien, cells: ds.map((x) => x.i), coef: ds.map(() => 1), b, mem: !!mem });

function thongDiepLoi(loi, ten, m) {
  const f = (v) => Math.abs(Math.round(v)).toLocaleString('vi-VN');
  const t = loi.slice(0, 3).map(({ nhan: h, du }) => {
    if (h.loai === 'kh') return 'doanh thu khách "' + ten(h.khoa) + '" lệch ' + f(du) + ' VNĐ';
    if (h.loai === 'tong') return 'tổng doanh thu tháng lệch ' + f(du) + ' VNĐ';
    if (h.loai === 'sku') return 'tổng SL SKU ' + h.hien + ' lệch ' + f(du);
    return 'tổng SL nhóm "' + h.hien + '" lệch ' + f(du);
  });
  return 'Không giữ được nguyên tắc (tổng doanh thu tháng, doanh thu từng khách, tổng SL SKU / nhóm đã Fix) ở tháng ' + (m + 1) + ': ' + t.join('; ') + (loi.length > 3 ? '…' : '') +
    '. Các ô / SKU / nhóm chưa Fix không đủ để bù — bỏ bớt Fix, thêm SKU cho khách hoặc đổi số nhập.';
}

/**
 * Giải liên tục (giaiRangBuoc) rồi LÀM TRÒN SỐ NGUYÊN theo từng tầng giá (SKU giá cao trước; mỗi tầng xong thì ghim và giải lại phần còn lại, để các SKU rẻ hấp thụ sai số làm tròn của SKU đắt),
 * hoán đổi 1 cái giữa các khách trong cùng cột SKU để khử lệch doanh thu từng khách, rồi KIỂM TRA: tổng SL SKU / nhóm đã giữ phải đúng tuyệt đối; doanh thu khách / tổng tháng trong sai số làm tròn
 * (10 × đơn giá nhỏ nhất của khách, như kiemTraKeHoach). Vi phạm -> ném lỗi (không đổi gì). Cập nhật cells[].q; trả mảng SL nguyên.
 */
function giaiVaLamTron(cells, hang, w0, ten, m) {
  const n = cells.length;
  const rows = hang.map((h) => ({ cells: h.cells, coef: h.coef, b: h.b, nhan: h }));
  let x = cells.map((c) => c.q);
  const r0 = giaiRangBuoc(x, w0, rows);
  if (r0.loi.length) throw new Error(thongDiepLoi(r0.loi, ten, m));
  x = r0.x;
  const xong = w0.map((v) => v === 0);
  const hangSku = new Map(hang.filter((h) => h.loai === 'sku').map((h) => [h.khoa, h]));
  const hangCat = new Map(hang.filter((h) => h.loai === 'cat').map((h) => [h.khoa, h]));
  const cot = nhomTheo(cells.filter((c) => !xong[c.i]), (c) => c.s);
  const tangCua = new Map();
  cot.forEach((ds, s) => tangCua.set(s, Math.floor(Math.log(Math.max(1, ...ds.map((c) => c.p))) / Math.log(6))));
  const cacTang = Array.from(new Set(tangCua.values())).sort((a, b) => b - a);
  for (const tang of cacTang) {
    const cacCot = Array.from(cot.keys()).filter((s) => tangCua.get(s) === tang);
    const tongCot = new Map();
    cacCot.forEach((s) => {
      const h = hangSku.get(s);
      if (h) {
        const khac = cells.filter((c) => c.s === s && xong[c.i]).reduce((t, c) => t + x[c.i], 0);       // ô cố định + ô đã làm tròn của cột
        tongCot.set(s, Math.round(h.b - khac));
      } else tongCot.set(s, Math.round(cot.get(s).filter((c) => !xong[c.i]).reduce((t, c) => t + x[c.i], 0)));
    });
    hangCat.forEach((h, k) => {
      const conLai = new Set(cells.filter((c) => c.k === k && !xong[c.i]).map((c) => c.s));
      if (!conLai.size) return;
      const trongTang = Array.from(conLai).filter((s) => tangCua.get(s) === tang);
      if (trongTang.length !== conLai.size) return;                    // còn cột ở tầng sau: các cột đó sẽ bù phần lệch của nhóm
      const khongGiu = trongTang.filter((s) => !hangSku.has(s));
      if (!khongGiu.length) return;
      const daCo = cells.filter((c) => c.k === k && xong[c.i]).reduce((t, c) => t + x[c.i], 0);       // ô cố định + ô đã làm tròn của nhóm (kể cả ô Fix nằm trong cột còn lại)
      const giu = trongTang.filter((s) => hangSku.has(s)).reduce((t, s) => t + tongCot.get(s), 0);
      const phan = Math.round(h.b - daCo - giu);
      if (phan < 0) throw new Error('Không giữ được tổng SL nhóm "' + h.hien + '" tháng ' + (m + 1) + ' (phần đã Fix vượt tổng nhóm).');
      chiaNguyen(khongGiu.map((s) => cot.get(s).filter((c) => !xong[c.i]).reduce((t, c) => t + x[c.i], 0)), phan).forEach((v, j) => tongCot.set(khongGiu[j], v));
    });
    cacCot.forEach((s) => {
      const ds = cot.get(s).filter((c) => !xong[c.i]);
      const t = tongCot.get(s);
      if (t < 0) throw new Error('Không giữ được tổng SL SKU ' + s.toUpperCase() + ' tháng ' + (m + 1) + ' (phần đã Fix vượt tổng).');
      chiaNguyen(ds.map((c) => x[c.i]), t).forEach((v, j) => { x[ds[j].i] = v; xong[ds[j].i] = true; });
    });
    if (xong.every(Boolean)) break;
    // giải lại phần còn lại: chỉ cố gắng hết sức (các ô đã làm tròn đứng yên nên khó khớp tuyệt đối) — kết quả cuối được KIỂM TRA theo sai số làm tròn bên dưới
    x = giaiRangBuoc(x, w0.map((v, i) => (xong[i] ? 0 : v)), rows).x;
  }
  suaLechKhach(cells, x, hang.filter((h) => h.loai === 'kh'), w0);
  cells.forEach((c, i) => { c.q = x[i]; });
  const viPham = [];
  hang.forEach((h) => {
    let t = 0;
    h.cells.forEach((i, k) => { t += h.coef[k] * x[i]; });
    const du = h.b - t;
    const tolDe = (ds) => { const v = dungSaiKhach(ds); return isFinite(v) ? v : 0.5; };
    if (h.loai === 'kh') { if (Math.abs(du) > tolDe(cells.filter((c) => c.c === h.khoa))) viPham.push({ nhan: h, du }); }
    else if (h.loai === 'tong') {
      const kh = new Set(h.cells.map((i) => cells[i].c));
      let tol = 0; kh.forEach((c) => { tol += tolDe(cells.filter((q) => q.c === c)); });
      if (Math.abs(du) > tol) viPham.push({ nhan: h, du });
    } else if (Math.abs(du) > 0.5) viPham.push({ nhan: h, du });
  });
  if (viPham.length) throw new Error(thongDiepLoi(viPham, ten, m));
  return x;
}

/** Khử lệch doanh thu từng khách sau làm tròn: chuyển 1 cái của cùng một SKU từ khách đang DƯ sang khách đang THIẾU (giữ tổng SL cột SKU / nhóm), chọn cặp giảm lệch nhiều nhất. */
function suaLechKhach(cells, x, hangKh, w0) {
  const dev = new Map();
  hangKh.forEach((h) => { let t = 0; h.cells.forEach((i, k) => { t += h.coef[k] * x[i]; }); dev.set(h.khoa, h.b - t); });
  if (!dev.size) return;
  const cotTheo = nhomTheo(cells.filter((c) => w0[c.i] > 0 && c.p > 0 && dev.has(c.c)), (c) => c.s);
  for (let lan = 0; lan < 5000; lan++) {
    let tot = null, gTot = 1e-9;
    cotTheo.forEach((ds) => {
      const nhan = ds.filter((c) => dev.get(c.c) > 0);
      const cho = ds.filter((c) => dev.get(c.c) < 0 && x[c.i] > 0);
      nhan.forEach((a) => cho.forEach((b) => {
        if (a.c === b.c) return;
        const da = dev.get(a.c), db = dev.get(b.c);
        const g = Math.abs(da) + Math.abs(db) - Math.abs(da - a.p) - Math.abs(db + b.p);
        if (g > gTot) { gTot = g; tot = { a, b }; }
      }));
    });
    if (!tot) break;
    x[tot.a.i] += 1; x[tot.b.i] -= 1;
    dev.set(tot.a.c, dev.get(tot.a.c) - tot.a.p);
    dev.set(tot.b.c, dev.get(tot.b.c) + tot.b.p);
  }
}

/**
 * Ba thao tác sửa SL ở chế độ SKU (đã Apply). spec = { loai: 'cell', i0, sl } | { loai: 'sku', skuKey, T } | { loai: 'nhom', nhom, T }.
 * Ràng buộc CỨNG: doanh thu từng khách trong tháng (→ tổng tháng); tổng SL của mọi SKU / Category đang Fix tổng; nút đang sửa (ô / tổng SKU / tổng nhóm).
 * Ràng buộc MỀM (bỏ nếu không đạt được và nút cha chưa Fix): tổng SL của nút CHA — sửa một ô thì giữ tổng SKU; sửa tổng SKU thì giữ tổng Category.
 * Sau khi sửa: nút vừa sửa được Fix (ô: khoa; SKU / Category: Fix TỔNG, các dòng con vẫn co giãn được).
 */
function chayThaoTac(state, m, catOf, spec) {
  const ten = tenKhachFn(state);
  const cells = dungBang(state, m, catOf);
  const goc = doanhThuKhachMap(cells);
  const qSku = new Map(), qCat = new Map();
  cells.forEach((c) => { qSku.set(c.s, (qSku.get(c.s) || 0) + c.q); qCat.set(c.k, (qCat.get(c.k) || 0) + c.q); });
  const cung = { sku: new Map(), cat: new Map() }, mem = { sku: new Map(), cat: new Map() };
  qSku.forEach((v, s) => { if (laFixTong(state, 'sku', s, m)) cung.sku.set(s, v); });
  qCat.forEach((v, k) => { if (laFixTong(state, 'cat', k, m)) cung.cat.set(k, v); });
  const ghiChu = [];
  let danhDau = null, fix = null;
  if (spec.loai === 'cell') {
    const x0 = cells[spec.i0];
    if (!cung.sku.has(x0.s)) mem.sku.set(x0.s, qSku.get(x0.s));
    x0.q = spec.sl; x0.f = true;
    danhDau = new Set([spec.i0]);
  } else if (spec.loai === 'sku') {
    const node = cells.filter((c) => c.s === spec.skuKey);
    const k0 = node[0].k;
    cung.sku.set(spec.skuKey, spec.T);
    if (!cung.cat.has(k0)) mem.cat.set(k0, qCat.get(k0));
    const dong = node.filter((c) => c.f), tu = node.filter((c) => !c.f);
    const fz = tongQ(dong);
    if (spec.T < fz) throw new Error('Tổng nhập (' + spec.T + ') nhỏ hơn phần SL đã Fix riêng của các ô (' + fz + ').');
    if (!tu.length && spec.T !== fz) throw new Error('Mọi ô của SKU này đã Fix riêng — bỏ Fix một số ô rồi sửa lại.');
    chiaNguyen(tongQ(tu) > 0 ? tu.map((c) => c.q) : tu.map((c) => c.nam), spec.T - fz).forEach((q, k) => { tu[k].q = q; });
    fix = ['sku', spec.skuKey];
  } else {
    const node = cells.filter((c) => c.k === spec.nhom);
    cung.cat.set(spec.nhom, spec.T);
    const co = node.filter((c) => c.f || cung.sku.has(c.s)), tu = node.filter((c) => !c.f && !cung.sku.has(c.s));
    const fz = tongQ(co);
    if (spec.T < fz) throw new Error('Tổng nhập (' + spec.T + ') nhỏ hơn phần SL đã Fix của nhóm (' + fz + ': SKU / ô đã Fix).');
    if (!tu.length && spec.T !== fz) throw new Error('Mọi SKU / ô trong nhóm "' + spec.nhom + '" đã Fix — bỏ Fix một số SKU rồi sửa lại.');
    chiaNguyen(tongQ(tu) > 0 ? tu.map((c) => c.q) : tu.map((c) => c.nam), spec.T - fz).forEach((q, k) => { tu[k].q = q; });
    fix = ['cat', spec.nhom];
  }
  const q0 = cells.map((c) => c.q);
  const w0 = cells.map(trongSo);
  const khCells = Array.from(new Set(cells.map((c) => c.c)));
  const hangDay = (boMem) => {
    const h = khCells.map((c) => dongKhach(cells, c, goc.get(c)));
    cung.sku.forEach((b, s) => h.push(dongCot('sku', s, s.toUpperCase(), cells.filter((c) => c.s === s), b, false)));
    cung.cat.forEach((b, k) => h.push(dongCot('cat', k, k, cells.filter((c) => c.k === k), b, false)));
    if (!boMem) {
      mem.sku.forEach((b, s) => h.push(dongCot('sku', s, s.toUpperCase(), cells.filter((c) => c.s === s), b, true)));
      mem.cat.forEach((b, k) => h.push(dongCot('cat', k, k, cells.filter((c) => c.k === k), b, true)));
    }
    return h;
  };
  try { giaiVaLamTron(cells, hangDay(false), w0, ten, m); }
  catch (e) {
    if (!mem.sku.size && !mem.cat.size) throw e;
    cells.forEach((c, i) => { c.q = q0[i]; });
    try { giaiVaLamTron(cells, hangDay(true), w0, ten, m); }
    catch (e2) { throw e; }
    ghiChu.push(spec.loai === 'cell'
      ? 'Không giữ được tổng SL ' + maSku(state.lines[spec.i0]) + ' trong tháng ' + (m + 1) + ' (các khách / SKU chưa Fix không đủ để bù) nên tổng SKU thay đổi.'
      : 'Không giữ được tổng SL nhóm "' + cells[cells.findIndex((c) => c.s === spec.skuKey)].k + '" trong tháng ' + (m + 1) + ' (các SKU chưa Fix khác không đủ để bù) nên tổng nhóm thay đổi.');
  }
  let ns = ghiThang(state, m, cells, danhDau);
  if (fix) ns = datFixTong(ns, fix[0], fix[1], m, true);
  return { state: ns, ghiChu };
}

/**
 * Sửa SL một SKU của một khách (key = khóa dòng). Đã Apply: các SKU chưa Fix khác của khách co giãn để doanh thu khách không đổi; SL SKU đó của các khách khác co giãn để tổng SKU không đổi
 * (và giữ tổng mọi SKU / nhóm đã Fix); không giữ được -> lỗi. Trả { state, ghiChu[] }.
 */
export function suaOSkuKhach(state, key, m, v, catOf) {
  const sl = Math.max(0, Math.round(so(v)));
  const i0 = state.lines.findIndex((l) => l.key === key);
  if (i0 < 0) throw new Error('Không tìm thấy dòng ' + key);
  if (!state.targetApplied) { const cells = dungBang(state, m, catOf); cells[i0].q = sl; return { state: ghiThang(state, m, cells, null), ghiChu: [] }; }
  return chayThaoTac(state, m, catOf, { loai: 'cell', i0, sl });
}

/** Các chỉ số dòng của một SKU (khóa gom khoaSku). */
const dongCuaSku = (state, skuKey) => state.lines.map((l, i) => (khoaSku(l) === skuKey ? i : -1)).filter((i) => i >= 0);

/**
 * Sửa TỔNG SL tháng của một SKU (mọi khách). Đã Apply: các SKU chưa Fix khác trong cùng Category co giãn để tổng nhóm không đổi; mọi khách giữ doanh thu; SKU được Fix TỔNG.
 */
export function suaTongSku(state, skuKey, m, tongMoi, catOf) {
  const T = Math.max(0, Math.round(so(tongMoi)));
  const idx = dongCuaSku(state, skuKey);
  if (!idx.length) throw new Error('Không tìm thấy SKU ' + skuKey);
  if (!state.targetApplied) return suaThangChuaApply(state, m, dungBang(state, m, catOf), idx, T);
  return chayThaoTac(state, m, catOf, { loai: 'sku', skuKey, T });
}

/**
 * Sửa TỔNG SL tháng của một Category (nhóm). Đã Apply: các SKU chưa Fix trong nhóm co giãn theo, nhóm khác chưa Fix bù để doanh thu từng khách không đổi; nhóm được Fix TỔNG.
 */
export function suaTongNhom(state, nhom, m, tongMoi, catOf) {
  const T = Math.max(0, Math.round(so(tongMoi)));
  const cells0 = dungBang(state, m, catOf);
  const idx = cells0.filter((x) => x.k === nhom).map((x) => x.i);
  if (!idx.length) throw new Error('Không tìm thấy nhóm ' + nhom);
  if (!state.targetApplied) return suaThangChuaApply(state, m, cells0, idx, T);
  return chayThaoTac(state, m, catOf, { loai: 'nhom', nhom, T });
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
/** Tháng m có SKU / Category nào đang Fix tổng không (khi đó sửa doanh thu khách phải giữ cả các tổng đó -> dùng bộ giải). */
const coFixTongThang = (state, m) => !!state.fixTong && Object.keys(state.fixTong).some((k) => state.fixTong[k] && state.fixTong[k][m]);

/** Ràng buộc cứng giữ tổng SL của mọi SKU / Category đang Fix tổng ở tháng m (theo số đang có). */
function hangFixCung(state, m, cells) {
  const qS = new Map(), qK = new Map();
  cells.forEach((c) => { qS.set(c.s, (qS.get(c.s) || 0) + c.q); qK.set(c.k, (qK.get(c.k) || 0) + c.q); });
  const h = [];
  qS.forEach((v, sk) => { if (laFixTong(state, 'sku', sk, m)) h.push(dongCot('sku', sk, sk.toUpperCase(), cells.filter((c) => c.s === sk), v, false)); });
  qK.forEach((v, k) => { if (laFixTong(state, 'cat', k, m)) h.push(dongCot('cat', k, k, cells.filter((c) => c.k === k), v, false)); });
  return h;
}

/**
 * Sửa doanh thu khách khi có SKU / Category đang Fix tổng: giải đồng thời — doanh thu khách = số nhập; (đã Apply + buKhac) tổng tháng của các khách trong phạm vi không đổi, khách ngoài phạm vi giữ nguyên;
 * tổng SL các SKU / nhóm đã Fix không đổi; ô Fix riêng đứng yên. `giu` = các khách đã được đặt doanh thu (tải Excel đồng loạt) — giữ nguyên.
 */
function suaDoanhThuKhachGiai(state, customerKey, m, moi, { buKhac, phamVi, giu, catOf }) {
  const ten = tenKhachFn(state);
  const cells = dungBang(state, m, catOf);
  const goc = doanhThuKhachMap(cells);
  const c0 = customerKey || '';
  const hang = [dongKhach(cells, c0, moi)];
  const khac = Array.from(goc.keys()).filter((c) => c !== c0);
  if (state.targetApplied && buKhac) {
    const trong = new Set(khac.filter((c) => !phamVi || phamVi.has(c)));
    khac.filter((c) => !trong.has(c)).forEach((c) => hang.push(dongKhach(cells, c, goc.get(c))));
    const ds = cells.filter((x) => x.c === c0 || trong.has(x.c));
    hang.push({ loai: 'tong', khoa: 'tong', hien: 'tong', cells: ds.map((x) => x.i), coef: ds.map((x) => x.p), b: ds.reduce((t, x) => t + x.q * x.p, 0), mem: false });
  } else if (giu) khac.filter((c) => giu.has(c)).forEach((c) => hang.push(dongKhach(cells, c, goc.get(c))));
  hang.push(...hangFixCung(state, m, cells));
  giaiVaLamTron(cells, hang, cells.map(trongSo), ten, m);
  return { state: ghiThang(state, m, cells, null), ghiChu: state.targetApplied && buKhac ? ['Đã bù phần chênh vào các khách khác để giữ tổng tháng; tổng SL SKU / nhóm đã Fix giữ nguyên.'] : [] };
}

export function suaDoanhThuKhach(state, customerKey, m, tongMoiVnd, { buKhac = true, phamVi = null, giu = null, catOf = null } = {}) {
  const moi = so(tongMoiVnd);
  if (!(moi >= 0)) throw new Error('Doanh thu phải là số không âm.');
  const cells = dungBang(state, m, null);
  const mine = cells.filter((x) => x.c === (customerKey || ''));
  const ten = tenKhachFn(state);
  if (!mine.length) throw new Error('Khách "' + ten(customerKey) + '" chưa có SKU nào — thêm SKU trước khi nhập doanh thu.');
  const cur = tongTien(mine);
  if (Math.abs(moi - cur) < 1) return { state, ghiChu: [] };
  if (coFixTongThang(state, m)) return suaDoanhThuKhachGiai(state, customerKey, m, moi, { buKhac, phamVi, giu, catOf });
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
export function apDungBangDoanhThu(state, bang, { canBangVeTarget = true, catOf = null } = {}) {
  let s = state;
  const thayDoi = [], loi = [];
  const giuThang = Array.from({ length: 12 }, () => new Set());       // khách đã được đặt doanh thu ở từng tháng — các lần sau giữ nguyên
  bang.forEach((arr, key) => {
    for (let m = 0; m < 12; m++) {
      const v = arr[m];
      if (v === null || v === undefined || !isFinite(Number(v))) continue;
      const tu = (doanhThuKhachThang(s).get(key) || m12(0))[m];
      if (Math.abs(so(v) - tu) < 1) continue;
      try {
        s = suaDoanhThuKhach(s, key, m, so(v), { buKhac: false, giu: giuThang[m], catOf }).state;
        giuThang[m].add(key);
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
  let fixTong = state.fixTong;
  const kCu = kFix('sku', skuKey), kMoi = kFix('sku', moi.toLowerCase());
  if (fixTong && fixTong[kCu] && kCu !== kMoi) {
    fixTong = { ...fixTong };
    fixTong[kMoi] = (fixTong[kMoi] || m12(false)).map((v, i) => v || fixTong[kCu][i]);
    delete fixTong[kCu];
  }
  return { ...state, lines, fixTong, newSkus: (state.newSkus || []).filter((n) => dung.has(n.tempId)) };
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
  if (s.fixTong && s.fixTong[kFix('sku', skuKey)]) { const ft = { ...s.fixTong }; delete ft[kFix('sku', skuKey)]; s = { ...s, fixTong: ft }; }
  return s;
}
