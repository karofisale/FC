/**
 * pure-annual-plan.js — bộ máy tính KẾ HOẠCH NĂM (05/10/2026). Module THUẦN: không I/O, không phụ thuộc gì — chạy y hệt ở Edge
 * Function (fc-api) và ở trình duyệt (FC client giữ BẢN SAO NGUYÊN VĂN; test so từng ký tự, giống khuôn Arrange Shipping).
 * Thiết kế: Projects/De-xuat-Ke-hoach-Nam-FC-2026-10.md mục 5.
 *
 * Quy ước:
 *  - Tỷ trọng tháng tính bằng PHẦN TRĂM × 100 (số nguyên, 8,33% = 833) để tổng đúng 100,00% = 10000, không lệch do số thực.
 *  - Dòng kế hoạch: { key, price (VNĐ/đơn vị, >= 0), qty: number[12] } — chỉ số 0..11 = T1..T12.
 *  - Doanh thu = Σ qty × price, TÍNH khi đọc, không lưu trùng.
 *  - Số lượng làm tròn CHỤC. Tổng tháng sau làm tròn không thể đúng tuyệt đối (qty nguyên chục × giá bất kỳ): sai lệch luôn
 *    nhỏ hơn "bước mịn nhất" = 10 × giá thấp nhất của dòng đang có SL (`buocMin`). Mọi hàm trả `lech` để người gọi hiện cho người dùng.
 */

export const TY_TRONG_MIN = 100;      // 1,00%
export const TY_TRONG_MAX = 3000;     // 30,00%
export const TY_TRONG_TONG = 10000;   // 100,00%
export const BUOC_LAM_TRON = 10;      // làm tròn chục
export const HE_SO_MIN = 0.5, HE_SO_MAX = 2.0;   // chặn hệ số xu hướng cùng kỳ (đã chốt 05/10/2026)

const so = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

/* ------------------------------ Doanh thu ------------------------------ */

export function doanhThuThang(dong, m) {
  let s = 0;
  for (const l of dong) s += so(l.qty[m]) * so(l.price);
  return s;
}
export function doanhThuNam(dong) {
  let s = 0;
  for (let m = 0; m < 12; m++) s += doanhThuThang(dong, m);
  return s;
}

/* ------------------------------ Tự phân bổ tháng chưa có số (5.1) ------------------------------ */

/**
 * Dự báo SL tháng t cho MỘT dòng. known[12]: SL thực hiện năm nay (null/undefined = chưa có số). prev[12]: SL năm trước.
 * A = trung bình các tháng đã có số (kể cả tháng = 0: có số thực hiện là 0). f = prev[t] ÷ trung bình năm trước của CÙNG các tháng
 * đó, chặn [0,5; 2,0]; thiếu số năm trước / mẫu số 0 -> f = 1.
 */
export function duBaoThang(known, prev, t) {
  const co = [];
  for (let m = 0; m < 12; m++) if (known[m] !== null && known[m] !== undefined && isFinite(Number(known[m]))) co.push(m);
  if (!co.length) return 0;
  const A = co.reduce((s, m) => s + so(known[m]), 0) / co.length;
  let f = 1;
  if (prev) {
    const cung = co.filter((m) => prev[m] !== null && prev[m] !== undefined && isFinite(Number(prev[m])));
    const tb = cung.length ? cung.reduce((s, m) => s + so(prev[m]), 0) / cung.length : 0;
    if (tb > 0 && prev[t] !== null && prev[t] !== undefined && isFinite(Number(prev[t]))) {
      f = Math.min(HE_SO_MAX, Math.max(HE_SO_MIN, so(prev[t]) / tb));
    }
  }
  return A * f;
}

/* ------------------------------ Tỷ trọng tháng (5.3) ------------------------------ */

/**
 * Chia `tong` (đơn vị 1/100 %) cho n tháng theo trọng số w, mỗi tháng trong [min, max]. Điền đầy dần (water-filling): tháng vượt
 * ngưỡng thì GHIM ở ngưỡng, phần còn lại chia lại cho các tháng tự do. Ném lỗi nếu không thể (n×min > tong hoặc n×max < tong).
 */
export function khopTyTrong(w, min = TY_TRONG_MIN, max = TY_TRONG_MAX, tong = TY_TRONG_TONG) {
  const n = w.length;
  if (n * min > tong || n * max < tong) throw new Error('Không thể chia ' + tong + ' cho ' + n + ' tháng trong [' + min + ', ' + max + '].');
  const ghim = new Array(n).fill(null);
  let ideal = [];
  for (let vong = 0; vong <= n + 1; vong++) {
    const tuDo = []; let daGhim = 0;
    for (let i = 0; i < n; i++) { if (ghim[i] === null) tuDo.push(i); else daGhim += ghim[i]; }
    const conLai = tong - daGhim;
    const sw = tuDo.reduce((s, i) => s + Math.max(0, so(w[i])), 0);
    ideal = new Array(n).fill(0);
    ghim.forEach((g, i) => { if (g !== null) ideal[i] = g; });
    tuDo.forEach((i) => { ideal[i] = sw > 0 ? Math.max(0, so(w[i])) / sw * conLai : conLai / tuDo.length; });
    let thap = 0, cao = 0;
    tuDo.forEach((i) => { if (ideal[i] < min) thap += min - ideal[i]; else if (ideal[i] > max) cao += ideal[i] - max; });
    if (!thap && !cao) break;
    tuDo.forEach((i) => {
      if (thap >= cao && ideal[i] < min) ghim[i] = min;
      else if (thap < cao && ideal[i] > max) ghim[i] = max;
    });
  }
  // làm tròn số nguyên theo phần dư lớn nhất, giữ trong [min, max]
  const out = ideal.map((v) => Math.floor(v));
  let thieu = tong - out.reduce((s, v) => s + v, 0);
  const thuTu = ideal.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; thieu > 0 && k < 10 * n; k++) {
    const i = thuTu[k % n].i;
    if (ghim[i] === null && out[i] < max) { out[i]++; thieu--; }
  }
  return out;
}

/** Mẫu mùa vụ: tỷ trọng theo doanh thu 12 tháng của năm trước (của đơn vị; không có thì cả công ty; không có nữa thì đều). */
export function tyTrongMuaVu(doanhThuNamTruoc, doanhThuCongTy) {
  const dung = (a) => Array.isArray(a) && a.length === 12 && a.reduce((s, v) => s + Math.max(0, so(v)), 0) > 0;
  const w = dung(doanhThuNamTruoc) ? doanhThuNamTruoc : (dung(doanhThuCongTy) ? doanhThuCongTy : new Array(12).fill(1));
  return khopTyTrong(w);
}

/**
 * Rải `delta` (1/100 %) đều lên các tháng trong `chiSo`, mỗi tháng kẹp trong [min, max]; phần tràn chia tiếp cho các tháng chưa kẹp.
 * Trả mảng mới. Ném lỗi nếu các tháng đó không đủ chỗ.
 */
export function raiDeu(ty, chiSo, delta, min = TY_TRONG_MIN, max = TY_TRONG_MAX) {
  const out = ty.slice();
  let con = delta;
  let tuDo = chiSo.slice();
  for (let vong = 0; con !== 0 && tuDo.length && vong <= chiSo.length + 1; vong++) {
    const moi = Math.trunc(con / tuDo.length);
    let du = con - moi * tuDo.length;
    let dung = 0;
    const tiep = [];
    for (const i of tuDo) {
      let them = moi + (du > 0 ? 1 : (du < 0 ? -1 : 0));
      if (du > 0) du--; else if (du < 0) du++;
      const kep = Math.min(max, Math.max(min, out[i] + them));
      dung += kep - out[i];
      out[i] = kep;
      if (kep > min && kep < max) tiep.push(i);
    }
    con -= dung;
    tuDo = tiep;
  }
  if (con !== 0) throw new Error('Các tháng được chọn không đủ chỗ để nhận phần thay đổi (còn lệch ' + con / 100 + '%).');
  return out;
}

/**
 * Sửa tỷ trọng một (số) tháng. thayDoi = { chiSo: tyTrongMoi }. Phần lệch (để tổng = 100%) rải ĐỀU lên các tháng còn lại
 * (cheDo 'deu') hoặc lên các tháng chỉ định (cheDo 'chiDinh', thang = [chiSo...]).
 */
export function suaTyTrong(ty, thayDoi, cheDo = 'deu', thang = []) {
  const out = ty.slice();
  const daSua = Object.keys(thayDoi).map(Number);
  for (const i of daSua) {
    const v = Math.round(so(thayDoi[i]));
    if (v < TY_TRONG_MIN || v > TY_TRONG_MAX) throw new Error('Tỷ trọng tháng ' + (i + 1) + ' phải trong [1%, 30%].');
    out[i] = v;
  }
  const lech = TY_TRONG_TONG - out.reduce((s, v) => s + v, 0);
  const dich = cheDo === 'chiDinh' ? thang.filter((i) => daSua.indexOf(i) < 0) : out.map((_, i) => i).filter((i) => daSua.indexOf(i) < 0);
  if (!dich.length && lech !== 0) throw new Error('Không còn tháng nào để nhận phần chênh lệch tỷ trọng.');
  return lech === 0 ? out : raiDeu(out, dich, lech);
}

/* ------------------------------ Target (5.2) ------------------------------ */

/** Từ doanh thu dự kiến năm hiện tại + (tăng trưởng % HOẶC doanh thu năm mục tiêu) suy ra ô còn lại. */
export function suyRaTarget(doanhThuCoSo, { tangTruongPct, doanhThuMucTieu }) {
  const co = so(doanhThuCoSo);
  if (doanhThuMucTieu !== undefined && doanhThuMucTieu !== null && doanhThuMucTieu !== '') {
    const t = Math.round(so(doanhThuMucTieu));
    return { doanhThuMucTieu: t, tangTruongPct: co > 0 ? Math.round((t / co - 1) * 10000) / 100 : null };
  }
  const g = so(tangTruongPct);
  return { doanhThuMucTieu: Math.round(co * (1 + g / 100)), tangTruongPct: Math.round(g * 100) / 100 };
}

/** Doanh thu mục tiêu từng tháng = Target × tỷ trọng, làm tròn VNĐ, tổng đúng bằng Target (phần dư lớn nhất). */
export function mucTieuTheoThang(doanhThuMucTieu, ty) {
  const T = Math.round(so(doanhThuMucTieu));
  const raw = ty.map((p) => T * p / TY_TRONG_TONG);
  const out = raw.map((v) => Math.floor(v));
  let thieu = T - out.reduce((s, v) => s + v, 0);
  raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i).forEach(({ i }) => { if (thieu > 0) { out[i]++; thieu--; } });
  return out;
}

/* ------------------------------ Làm tròn chục giữ tổng tháng (5.4) ------------------------------ */

/**
 * Làm tròn SL thô (raw[]) về bội 10 sao cho Σ q×giá gần mục tiêu nhất mà KHÔNG vượt: bắt đầu từ sàn chục, rồi cộng thêm 10 cho các dòng
 * có phần dư lớn nhất (nhân giá) khi còn đủ chỗ. Dòng giá 0 chỉ làm tròn gần nhất (không ảnh hưởng doanh thu).
 * Trả { qty[], lech (mục tiêu − tổng, >= 0), buocMin }.
 */
export function lamTronGiuTong(raw, price, mucTieu) {
  const n = raw.length;
  const q = raw.map((v, i) => (so(price[i]) > 0 ? Math.floor(Math.max(0, v) / BUOC_LAM_TRON) * BUOC_LAM_TRON : Math.round(Math.max(0, v) / BUOC_LAM_TRON) * BUOC_LAM_TRON));
  const tong = () => q.reduce((s, v, i) => s + v * so(price[i]), 0);
  let lech = mucTieu - tong();
  const ungVien = [];
  for (let i = 0; i < n; i++) if (so(price[i]) > 0 && raw[i] > 0) ungVien.push(i);
  const buocMin = ungVien.length ? BUOC_LAM_TRON * Math.min(...ungVien.map((i) => so(price[i]))) : 0;
  if (lech > 0 && ungVien.length) {
    for (let vong = 0; vong < 50 && lech >= buocMin; vong++) {
      const thuTu = ungVien.slice().sort((a, b) => (raw[b] - q[b]) * so(price[b]) - (raw[a] - q[a]) * so(price[a]) || a - b);
      let them = false;
      for (const i of thuTu) {
        const chiPhi = BUOC_LAM_TRON * so(price[i]);
        if (chiPhi <= lech) { q[i] += BUOC_LAM_TRON; lech -= chiPhi; them = true; }
      }
      if (!them) break;
    }
  }
  return { qty: q, lech: mucTieu - tong(), buocMin };
}

/**
 * APPLY: co giãn từng tháng về doanh thu mục tiêu của tháng. SL mới = SL cũ × (mục tiêu tháng ÷ doanh thu cũ của tháng), làm tròn chục.
 * Tháng cũ không có doanh thu (không có gì để co giãn): lấy cơ cấu SKU của cả năm làm mẫu. Dòng `khoa` (SL do người dùng chốt) giữ nguyên.
 * Trả { dong (mới), lech: number[12], loi: string[] }.
 */
export function apDungMucTieu(dong, mucTieuThang) {
  const loi = [];
  const lech = new Array(12).fill(0);
  const moi = dong.map((l) => ({ ...l, qty: l.qty.slice() }));
  const coCauNam = dong.map((l) => l.qty.reduce((s, v) => s + so(v), 0) * so(l.price));
  const tongCoCau = coCauNam.reduce((s, v) => s + v, 0);
  for (let m = 0; m < 12; m++) {
    const mt = so(mucTieuThang[m]);
    const cu = doanhThuThang(dong, m);
    const khoa = dong.map((l) => !!(l.khoa && l.khoa[m]));
    const tienKhoa = dong.reduce((s, l, i) => s + (khoa[i] ? so(l.qty[m]) * so(l.price) : 0), 0);
    const tienTuDo = cu - tienKhoa;
    const can = mt - tienKhoa;
    if (can < 0) { loi.push('Tháng ' + (m + 1) + ': phần SL đã khóa vượt mục tiêu tháng.'); continue; }
    const tuDo = dong.map((_, i) => i).filter((i) => !khoa[i]);
    if (!tuDo.length) { lech[m] = mt - tienKhoa; continue; }
    const raw = new Array(dong.length).fill(0);
    if (tienTuDo > 0) {
      const f = can / tienTuDo;
      tuDo.forEach((i) => { raw[i] = so(dong[i].qty[m]) * f; });
    } else if (tongCoCau > 0 && can > 0) {
      // tháng trống: chia theo cơ cấu doanh thu cả năm, SL = phần tiền ÷ giá
      tuDo.forEach((i) => { const gia = so(dong[i].price); raw[i] = gia > 0 ? can * (coCauNam[i] / tongCoCau) / gia : 0; });
    }
    const kq = lamTronGiuTong(tuDo.map((i) => raw[i]), tuDo.map((i) => dong[i].price), can);
    tuDo.forEach((i, k) => { moi[i].qty[m] = kq.qty[k]; });
    lech[m] = kq.lech;
  }
  return { dong: moi, lech, loi };
}

/* ------------------------------ Tinh chỉnh một SKU (5.5) ------------------------------ */

/**
 * Người dùng đặt SL một dòng trong một tháng; các dòng còn lại (trừ dòng khóa) co giãn để TỔNG DOANH THU THÁNG KHÔNG ĐỔI.
 * mucTieuThang: tổng tháng cần giữ (mặc định = doanh thu tháng hiện tại). Ném lỗi nếu không giữ được (vd phần còn lại < 0).
 */
export function tinhChinhSku(dong, m, keyDong, slMoi, mucTieuThang) {
  const idx = dong.findIndex((l) => l.key === keyDong);
  if (idx < 0) throw new Error('Không tìm thấy dòng ' + keyDong);
  const sl = Math.max(0, Math.round(so(slMoi)));
  const mt = mucTieuThang === undefined ? doanhThuThang(dong, m) : so(mucTieuThang);
  const moi = dong.map((l) => ({ ...l, qty: l.qty.slice() }));
  moi[idx].qty[m] = sl;
  const khac = dong.map((_, i) => i).filter((i) => i !== idx && !(dong[i].khoa && dong[i].khoa[m]));
  const tienCoDinh = moi.reduce((s, l, i) => (khac.indexOf(i) < 0 ? s + so(l.qty[m]) * so(l.price) : s), 0);
  const can = mt - tienCoDinh;
  if (can < 0) throw new Error('SL mới làm doanh thu tháng vượt mục tiêu (' + Math.round(-can) + ' VNĐ).');
  if (!khac.length) return { dong: moi, lech: can };
  const tienKhacCu = khac.reduce((s, i) => s + so(dong[i].qty[m]) * so(dong[i].price), 0);
  if (tienKhacCu <= 0 && can > 0) throw new Error('Không còn dòng nào có doanh thu để co giãn bù cho phần chênh.');
  const f = tienKhacCu > 0 ? can / tienKhacCu : 0;
  const kq = lamTronGiuTong(khac.map((i) => so(dong[i].qty[m]) * f), khac.map((i) => dong[i].price), can);
  khac.forEach((i, k) => { moi[i].qty[m] = kq.qty[k]; });
  return { dong: moi, lech: kq.lech };
}

/* ------------------------------ Xóa hàng loạt mặt hàng nhỏ (5.6) ------------------------------ */

/**
 * Xóa hàng loạt các dòng "không đáng giữ". Mỗi tiêu chí là MỘT lựa chọn độc lập (dòng thỏa BẤT KỲ tiêu chí nào đang bật thì bị xóa):
 *  - xoaNho (mặc định bật): máy có tổng SL năm < nguongMay (100), linh kiện < nguongLinhKien (1000). laMay(l) -> boolean.
 *  - xoaGiaKhong (mặc định bật, giữ hành vi cũ): đơn giá <= 0.
 *  - xoaFoc: hàng FOC = đơn giá <= 0 HOẶC tổng giá (doanh thu cả năm của dòng) = 0.
 *  - xoaTheo(l) -> boolean: tiêu chí tùy biến (vd hàng thanh lý đánh dấu ở dòng).
 * Phần doanh thu bị cắt được TRẢ LẠI cho các dòng còn lại (giữ tổng từng tháng).
 */
export function xoaMatHangNho(dong, laMay, { nguongMay = 100, nguongLinhKien = 1000, xoaGiaKhong = true, xoaNho = true, xoaFoc = false, xoaTheo = null } = {}) {
  const giu = [], xoa = [];
  for (const l of dong) {
    const tong = l.qty.reduce((s, v) => s + so(v), 0);
    const nho = xoaNho && (laMay(l) ? tong < nguongMay : tong < nguongLinhKien);
    const giaKhong = xoaGiaKhong && so(l.price) <= 0;
    const foc = xoaFoc && (so(l.price) <= 0 || tong * so(l.price) === 0);
    const tuyBien = !!xoaTheo && !!xoaTheo(l);
    (nho || giaKhong || foc || tuyBien ? xoa : giu).push(l);
  }
  if (!xoa.length) return { dong: dong.map((l) => ({ ...l, qty: l.qty.slice() })), xoa: [], lech: new Array(12).fill(0), loi: [] };
  const mucTieu = []; for (let m = 0; m < 12; m++) mucTieu.push(doanhThuThang(dong, m));
  const kq = apDungMucTieu(giu, mucTieu);
  return { dong: kq.dong, xoa, lech: kq.lech, loi: kq.loi };
}

/* ------------------------------ Khởi tạo từ MỘT tháng (5.9) ------------------------------ */

/**
 * Đơn vị chưa có số các tháng đầu năm: SL các dòng của tháng gốc (thangGoc) được rải sang các tháng khác theo
 * tỷ trọng tháng: SL(t) = SL(gốc) × ty[t] ÷ ty[gốc]; tỷ lệ giữa các SKU trong tháng giữ nguyên; làm tròn chục giữ tổng tháng.
 */
export function khoiTaoTuMotThang(dong, thangGoc, ty) {
  const moi = dong.map((l) => ({ ...l, qty: new Array(12).fill(0) }));
  const tienGoc = doanhThuThang(dong, thangGoc);
  for (let m = 0; m < 12; m++) {
    const f = ty[m] / ty[thangGoc];
    const raw = dong.map((l) => so(l.qty[thangGoc]) * f);
    const mt = tienGoc * f;
    if (m === thangGoc) { dong.forEach((l, i) => { moi[i].qty[m] = so(l.qty[thangGoc]); }); continue; }
    const kq = lamTronGiuTong(raw, dong.map((l) => l.price), mt);
    kq.qty.forEach((v, i) => { moi[i].qty[m] = v; });
  }
  return moi;
}

/* ------------------------------ Dựng bảng cơ sở từ lịch sử ------------------------------ */

/**
 * rows: [{ ckey, cname, sku, sname, y, m (1-12), qty, rev }] — lịch sử đã gom theo (khách, SKU, năm, tháng), CỦA MỘT ĐƠN VỊ, cho hai năm
 * (năm cơ sở = năm kế hoạch − 1 và năm trước nữa). Trả bảng cơ sở năm hiện tại: tháng đã có số = thực hiện, tháng còn lại = dự báo (5.1).
 * Khách "active" = có số lượng trong năm cơ sở; sắp từ doanh thu cao xuống thấp; trong khách, SKU từ SL nhiều xuống ít.
 * Giá = doanh thu ÷ SL của năm cơ sở (không có thì của năm trước); 0 nếu không suy ra được.
 */
export function xayDungCoSo(rows, namKeHoach) {
  const nCs = namKeHoach - 1, nTruoc = namKeHoach - 2;
  const coThang = (y) => { const s = new Set(); rows.forEach((r) => { if (r.y === y) s.add(r.m - 1); }); return s; };
  const csThang = coThang(nCs), trThang = coThang(nTruoc);
  const lastMonth = csThang.size ? Math.max(...csThang) : -1;
  const map = new Map();
  rows.forEach((r) => {
    if (r.y !== nCs && r.y !== nTruoc) return;
    const k = r.ckey + '\u0001' + r.sku;
    let g = map.get(k);
    if (!g) {
      g = { ckey: r.ckey, cname: r.cname || '', sku: r.sku, sname: r.sname || '', cs: new Array(12).fill(0), tr: new Array(12).fill(0), revCs: 0, qtyCs: 0, revTr: 0, qtyTr: 0 };
      map.set(k, g);
    }
    if (r.y === nCs) { g.cs[r.m - 1] += so(r.qty); g.qtyCs += so(r.qty); g.revCs += so(r.rev); if (!g.sname && r.sname) g.sname = r.sname; }
    else { g.tr[r.m - 1] += so(r.qty); g.qtyTr += so(r.qty); g.revTr += so(r.rev); }
    if (r.cname && !g.cname) g.cname = r.cname;
  });
  const lines = [], revKhach = new Map(), tenKhach = new Map();
  const doanhThuTruoc = new Array(12).fill(0);
  // doanh thu năm trước theo tháng của đơn vị (cho mẫu mùa vụ)
  rows.forEach((r) => { if (r.y === nTruoc) doanhThuTruoc[r.m - 1] += so(r.rev); });
  map.forEach((g) => {
    if (g.qtyCs <= 0) return;
    const known = new Array(12).fill(null);
    for (let m = 0; m <= lastMonth; m++) known[m] = Math.max(0, g.cs[m]);
    const prev = new Array(12).fill(null);
    for (let m = 0; m < 12; m++) if (trThang.has(m)) prev[m] = g.tr[m];
    const qtyBase = known.map((v, m) => (v !== null ? v : Math.max(0, Math.round(duBaoThang(known, prev, m)))));
    const gia = g.qtyCs > 0 ? g.revCs / g.qtyCs : (g.qtyTr > 0 ? g.revTr / g.qtyTr : 0);
    const price = Math.max(0, Math.round(gia));
    lines.push({ key: g.ckey + '|' + g.sku, customerKey: g.ckey, skuCode: g.sku, skuName: g.sname, priceVnd: price, qtyBase, tongCs: g.qtyCs });
    revKhach.set(g.ckey, (revKhach.get(g.ckey) || 0) + g.revCs);
    if (!tenKhach.has(g.ckey)) tenKhach.set(g.ckey, g.cname);
  });
  const khach = Array.from(revKhach.keys()).map((k) => ({ key: k, name: tenKhach.get(k) || k, doanhThu: revKhach.get(k) }))
    .sort((a, b) => b.doanhThu - a.doanhThu || (a.key < b.key ? -1 : 1));
  const thuTuKhach = new Map(khach.map((c, i) => [c.key, i]));
  lines.sort((a, b) => thuTuKhach.get(a.customerKey) - thuTuKhach.get(b.customerKey) || b.tongCs - a.tongCs || (a.key < b.key ? -1 : 1));
  lines.forEach((l, i) => { l.ord = i; delete l.tongCs; });
  return { lastMonth, customers: khach, lines, doanhThuNamTruoc: doanhThuTruoc };
}

/* ------------------------------ Kiểm tra kế hoạch (dùng khi Save / Submit) ------------------------------ */

/**
 * plan = { shares[12], targetRevenueVnd, targetApplied, lines: [{ key, skuCode, tempSkuId, priceVnd, qty[12] }] }.
 * Trả { loi: string[], canhBao: string[] }. `loi` chặn Submit; `canhBao` chỉ nhắc.
 */
export function kiemTraKeHoach(plan) {
  const loi = [], canhBao = [];
  const ty = plan.shares || [];
  if (ty.length !== 12 || ty.some((v) => !Number.isInteger(v))) loi.push('Tỷ trọng tháng phải có đủ 12 số nguyên (đơn vị 1/100 %).');
  else {
    if (ty.reduce((s, v) => s + v, 0) !== TY_TRONG_TONG) loi.push('Tổng tỷ trọng 12 tháng phải bằng 100%.');
    ty.forEach((v, i) => { if (v < TY_TRONG_MIN || v > TY_TRONG_MAX) loi.push('Tỷ trọng tháng ' + (i + 1) + ' phải trong [1%, 30%].'); });
  }
  const dong = plan.lines || [];
  const thay = new Set();
  dong.forEach((l) => {
    if (thay.has(l.key)) loi.push('Trùng dòng ' + l.key + '.'); else thay.add(l.key);
    if (!l.skuCode && !l.tempSkuId) loi.push('Dòng ' + l.key + ' thiếu SKU.');
    if (!isFinite(Number(l.priceVnd)) || Number(l.priceVnd) < 0) loi.push('Dòng ' + l.key + ': đơn giá không hợp lệ.');
    if (!Array.isArray(l.qty) || l.qty.length !== 12 || l.qty.some((v) => !isFinite(Number(v)) || Number(v) < 0)) loi.push('Dòng ' + l.key + ': SL 12 tháng không hợp lệ.');
    if (so(l.priceVnd) === 0) canhBao.push('Dòng ' + l.key + ' có đơn giá 0 (không tạo doanh thu).');
    if (l.tempSkuId) canhBao.push('Dòng ' + l.key + ' dùng SKU mã tạm (chưa nạp được sang FC hàng tháng).');
  });
  if (plan.targetApplied) {
    if (!(so(plan.targetRevenueVnd) > 0)) loi.push('Đã Apply nhưng doanh thu mục tiêu năm không hợp lệ.');
    else if (!loi.length) {
      const mt = mucTieuTheoThang(plan.targetRevenueVnd, ty);
      const dongGia = dong.map((l) => ({ price: l.priceVnd, qty: l.qty }));   // doanhThuThang đọc `price`, dòng kế hoạch lưu `priceVnd`
      for (let m = 0; m < 12; m++) {
        const tong = doanhThuThang(dongGia, m);
        const g = dong.filter((l) => so(l.qty[m]) > 0 && so(l.priceVnd) > 0).map((l) => so(l.priceVnd));
        const buoc = g.length ? BUOC_LAM_TRON * Math.min(...g) : 0;
        if (Math.abs(mt[m] - tong) > Math.max(buoc, 1)) loi.push('Tháng ' + (m + 1) + ' lệch mục tiêu ' + Math.round(mt[m] - tong) + ' VNĐ (cho phép < ' + Math.round(buoc) + ').');
      }
    }
  }
  return { loi, canhBao };
}
