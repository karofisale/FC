/**
 * annualPlanExcel.js — XUẤT EXCEL KẾ HOẠCH NĂM (06/10/2026). Hai tab:
 *
 *  Plan_Per_Client — Mã khách (OEM: Search Code; Export: client_id) | Tên khách (OEM: Search Code; Export: Short Name) | Sale ID | DT năm nay (dự kiến) | DT kế hoạch năm sau | 12 cột DT kế hoạch tháng.
 *    Dòng TỔNG trên cùng (SUBTOTAL — đổi theo bộ lọc), tiêu đề ở dòng 2, tự lọc (autofilter) theo mọi cột, trong đó Sale ID.
 *  Plan_SKU — Kênh | Mã SKU | Tên SKU | Category | Đơn giá (VNĐ) | Sản lượng + Doanh thu kế hoạch NĂM và 12 THÁNG (năm: 2 cột, mỗi tháng 2 cột) |
 *    cột trống | cùng bảng đó cho NĂM HIỆN TẠI (không lặp 5 cột đầu). Dòng TỔNG đầu bảng.
 *
 * Số tiền xuất bằng VNĐ ĐẦY ĐỦ (không theo đơn vị đang hiển thị trên màn hình) để cộng / lọc trong Excel không bị làm tròn. Xuất toàn bộ kế hoạch
 * (không phụ thuộc bộ lọc đang bật trên màn hình).
 *
 * Các hàm dựng* thuần (trả mảng dòng) để test; taoWorkbook / xuatExcel mới đụng tới thư viện xlsx.
 */

import * as XLSX from 'xlsx';
import { NHAN_THANG, tomTatKhach, tenKhachHienThi } from './annualPlanModel.js';

const so = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const lam = (v) => Math.round(so(v));
const tongM = (a) => a.reduce((s, v) => s + so(v), 0);

/** Dòng dữ liệu của Plan_Per_Client: [mã, tên, sale, DT năm nay, DT KH, ...12 tháng KH]. */
export function dongPerClient(state, donVi, info) {
  const nguon = donVi && donVi.source;
  if (!state.customers.length) {            // đơn vị một khách (Brand): một dòng cho cả đơn vị
    const plan = new Array(12).fill(0), base = new Array(12).fill(0);
    state.lines.forEach((l) => l.qty.forEach((q, m) => { plan[m] += so(q) * so(l.priceVnd); base[m] += so(l.qtyBase[m]) * so(l.priceVnd); }));
    return [[donVi ? donVi.code : '', donVi ? donVi.name : '', '', lam(tongM(base)), lam(tongM(plan))].concat(plan.map(lam))];
  }
  return tomTatKhach(state).map((c) => {
    const i = (info || {})[c.key] || {};
    const ten = tenKhachHienThi(c.key, c.name, nguon);
    const ma = nguon === 'oem' ? ten : (i.code || ten);          // OEM: mã khách cũng là Search Code (không dùng mã số SAP)
    return [ma, ten, i.sale || '', lam(c.baseTotal), lam(c.planTotal)].concat(c.plan.map(lam));
  });
}

export function tieuDePerClient(year) {
  return ['Mã khách', 'Tên khách', 'Sale ID', 'DT năm ' + (year - 1) + ' (dự kiến)', 'DT kế hoạch năm ' + year]
    .concat(NHAN_THANG.map((t, m) => 'DT KH T' + (m + 1) + '/' + year));
}

/**
 * Gom theo SKU (cộng mọi khách): MỖI SKU ĐÚNG MỘT DÒNG. Khóa gom = mã SKU đã bỏ khoảng trắng đầu/cuối và không phân biệt hoa thường, nên cùng một SKU ở
 * nhiều khách (hoặc mã lệch khoảng trắng / hoa thường) vẫn chỉ ra một dòng. Trả [{ ma, ten, category, gia, planQty[12], planRev[12], baseQty[12], baseRev[12] }]
 * xếp theo doanh thu kế hoạch giảm dần.
 */
export function gomTheoSku(state, skuInfo) {
  const m = new Map();
  state.lines.forEach((l) => {
    const ma = String(l.skuCode || l.tempSkuId || '').trim();
    const khoa = ma.toLowerCase();
    let g = m.get(khoa);
    if (!g) { g = { ma, ten: l.skuName || '', giaDau: so(l.priceVnd), planQty: new Array(12).fill(0), planRev: new Array(12).fill(0), baseQty: new Array(12).fill(0), baseRev: new Array(12).fill(0) }; m.set(khoa, g); }
    for (let k = 0; k < 12; k++) {
      g.planQty[k] += so(l.qty[k]); g.planRev[k] += so(l.qty[k]) * so(l.priceVnd);
      g.baseQty[k] += so(l.qtyBase[k]); g.baseRev[k] += so(l.qtyBase[k]) * so(l.priceVnd);
    }
  });
  return Array.from(m.values()).map((g) => {
    const info = (skuInfo || {})[g.ma] || {};
    const pq = tongM(g.planQty), bq = tongM(g.baseQty);
    const gia = pq > 0 ? tongM(g.planRev) / pq : (bq > 0 ? tongM(g.baseRev) / bq : g.giaDau);     // đơn giá bình quân gia quyền theo SL
    return { ...g, ten: info.name || g.ten, category: info.category || '', gia: lam(gia) };
  }).sort((a, b) => tongM(b.planRev) - tongM(a.planRev) || (a.ma < b.ma ? -1 : 1));
}

/** Khối 26 cột (Năm: SL, DT; rồi từng tháng: SL, DT) cho một mảng SL + DT 12 tháng. */
const khoi = (qty, rev) => [lam(tongM(qty)), lam(tongM(rev))].concat(...qty.map((q, k) => [lam(q), lam(rev[k])]));
const nhanKhoi = (tienTo) => ['SL ' + tienTo + ' Năm', 'DT ' + tienTo + ' Năm'].concat(...NHAN_THANG.map((t) => ['SL ' + tienTo + ' ' + t, 'DT ' + tienTo + ' ' + t]));

export function tieuDeSku(year) {
  return ['Kênh', 'Mã SKU', 'Tên SKU', 'Category', 'Đơn giá (VNĐ)']
    .concat(nhanKhoi('KH ' + year), [''], nhanKhoi((year - 1) + ' (dự kiến)'));
}

export function dongSku(state, donVi, skuInfo) {
  const kenh = donVi ? (donVi.name || donVi.code) : '';
  return gomTheoSku(state, skuInfo).map((g) => [kenh, g.ma, g.ten, g.category, g.gia].concat(khoi(g.planQty, g.planRev), [''], khoi(g.baseQty, g.baseRev)));
}

/** Dựng sheet: dòng 1 = TỔNG (công thức SUBTOTAL(109) trên các cột số, kèm giá trị đã tính), dòng 2 = tiêu đề, từ dòng 3 = dữ liệu; autofilter ở tiêu đề. */
function dungSheet(tieuDe, dong, cotSo, rongCot) {
  const n = dong.length, hangDau = 3, hangCuoi = Math.max(hangDau, n + 2);
  const aoa = [new Array(tieuDe.length).fill(''), tieuDe].concat(dong);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  aoa[0][0] = 'TỔNG';
  ws[XLSX.utils.encode_cell({ r: 0, c: 0 })] = { t: 's', v: 'TỔNG' };
  cotSo.forEach((c) => {
    const ref = XLSX.utils.encode_col(c);
    const tong = dong.reduce((s, r) => s + so(r[c]), 0);
    const o = { t: 'n', v: tong, z: '#,##0' };
    if (n) o.f = 'SUBTOTAL(109,' + ref + hangDau + ':' + ref + hangCuoi + ')';
    ws[XLSX.utils.encode_cell({ r: 0, c })] = o;
  });
  for (let r = 2; r < aoa.length; r++) cotSo.forEach((c) => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = '#,##0'; });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, aoa.length - 1), c: tieuDe.length - 1 } });
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 1, c: 0 }, e: { r: Math.max(1, aoa.length - 1), c: tieuDe.length - 1 } }) };
  ws['!cols'] = rongCot;
  return ws;
}

export function taoWorkbook({ state, donVi, year, info, skuInfo }) {
  const pc = dongPerClient(state, donVi, info);
  const wsPc = dungSheet(tieuDePerClient(year), pc, Array.from({ length: 14 }, (_, i) => i + 3),
    [{ wch: 14 }, { wch: 26 }, { wch: 14 }, { wch: 18 }, { wch: 18 }].concat(new Array(12).fill({ wch: 15 })));
  const sk = dongSku(state, donVi, skuInfo);
  const td = tieuDeSku(year);
  const cotSo = td.map((_, i) => i).filter((i) => i >= 5 && td[i] !== '');
  const wsSku = dungSheet(td, sk, cotSo, [{ wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 14 }].concat(td.slice(5).map((t) => ({ wch: t === '' ? 3 : 13 }))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsPc, 'Plan_Per_Client');
  XLSX.utils.book_append_sheet(wb, wsSku, 'Plan_SKU');
  return wb;
}

const NHAN_TT = { draft: 'dang-soan', submitted: 'cho-duyet', approved: 'da-duyet', rejected: 'bi-tu-choi', superseded: 'da-thay-the' };

/** Tên file: KeHoachNam_<đơn vị>_<năm>_<trạng thái>_<ngày>.xlsx */
export function tenFile(donVi, year, status, homNay) {
  const d = homNay || new Date();
  const ngay = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return 'KeHoachNam_' + String((donVi && donVi.code) || 'DV').replace(/[^\w-]+/g, '') + '_' + year + '_' + (NHAN_TT[status] || status || 'ban-nhap') + '_' + ngay + '.xlsx';
}

export function xuatExcel(tuyChon) {
  const wb = taoWorkbook(tuyChon);
  XLSX.writeFile(wb, tenFile(tuyChon.donVi, tuyChon.year, tuyChon.status));
}
