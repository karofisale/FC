/**
 * test-annual-plan-sku.mjs — 07/10/2026: sửa doanh thu khách theo tháng + chế độ lập KH theo SKU / Category (client/src/utils/annualPlanSkuOps.js).
 * Chạy: node tools/test-annual-plan-sku.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (f) => pathToFileURL(path.join(ROOT, 'client', 'src', 'utils', f)).href;
const M = await import(url('annualPlanModel.js'));
const E = await import(url('annualPlanEngine.js'));
const K = await import(url('annualPlanSkuOps.js'));

let pass = 0, fail = 0;
const check = (ten, dk, them) => { if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them !== undefined ? '  → ' + JSON.stringify(them) : '')); } };
const loi = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

// Category của từng SKU
const CAT = { M1: 'Máy', M2: 'Máy', F1: 'Lõi lọc', F2: 'Lõi lọc', P1: 'Linh kiện' };
const catOf = K.phanNhomCua(Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, { category: v }])));
const GIA = { M1: 10000000, M2: 6000000, F1: 400000, F2: 250000, P1: 90000 };
const THANG = 10;      // tháng thử (T11) — tháng dự kiến

/** 4 khách; DELTA chỉ mua M1 (không có SKU khác để bù). */
function taoState() {
  const lines = [];
  const them = (c, sku, base) => lines.push({ key: c + '|' + sku, customerKey: c, skuCode: sku, tempSkuId: '', skuName: 'SP ' + sku, priceVnd: GIA[sku],
    qtyBase: base, qty: base.slice(), khoa: new Array(12).fill(false) });
  const dai = (v) => new Array(12).fill(0).map((_, i) => Math.round(v * (0.9 + (i % 4) * 0.07)));
  them('A', 'M1', dai(120)); them('A', 'M2', dai(80)); them('A', 'F1', dai(1500)); them('A', 'F2', dai(1200)); them('A', 'P1', dai(4000));
  them('B', 'M1', dai(60)); them('B', 'F1', dai(900)); them('B', 'F2', dai(700)); them('B', 'P1', dai(2500));
  them('C', 'M2', dai(100)); them('C', 'F1', dai(1100)); them('C', 'P1', dai(3000));
  them('D', 'M1', dai(40));
  return { id: 'AP-1', status: 'draft', kind: 'base', shares: E.tyTrongMuaVu(null, null), targetGrowthPct: null, targetRevenueVnd: null, targetApplied: false,
    baselineLastMonth: 8, note: '', customers: ['A', 'B', 'C', 'D'].map((k) => ({ key: k, name: 'Khách ' + k, market: '', isNew: false })), lines, newSkus: [], removedLines: [] };
}
const goc = taoState();
const apdung = (s, pct = 20) => M.apDung(M.datTarget(s, { tangTruongPct: pct })).state;
const S = apdung(goc);

const revKhach = (s, c, m) => s.lines.filter((l) => l.customerKey === c).reduce((t, l) => t + l.qty[m] * l.priceVnd, 0);
const revThang = (s, m) => s.lines.reduce((t, l) => t + l.qty[m] * l.priceVnd, 0);
const qSku = (s, sku, m) => s.lines.filter((l) => l.skuCode === sku).reduce((t, l) => t + l.qty[m], 0);
const qNhom = (s, nhom, m) => s.lines.filter((l) => catOf(l) === nhom).reduce((t, l) => t + l.qty[m], 0);
const line = (s, key) => s.lines.find((l) => l.key === key);
const buocKhach = (s, c) => 10 * Math.max(...s.lines.filter((l) => l.customerKey === c).map((l) => l.priceVnd));      // cận trên sai số làm tròn chục của khách
const khachGiu = (a, b, m, bo = []) => ['A', 'B', 'C', 'D'].filter((c) => !bo.includes(c)).every((c) => Math.abs(revKhach(a, c, m) - revKhach(b, c, m)) <= buocKhach(a, c));
const khongAm = (s) => s.lines.every((l) => l.qty.every((q) => Number.isInteger(q) && q >= 0));
const nguyenVen = (s, m) => s.lines.every((l, i) => l.qty.every((q, k) => k === m || q === S.lines[i].qty[k]));       // chỉ tháng m bị đổi

console.log('--- chiaNguyen ---');
{
  const r = K.chiaNguyen([1, 2, 3], 10);
  check('chia nguyên: tổng đúng, tỷ lệ gần đúng', r.reduce((a, b) => a + b, 0) === 10 && r[2] >= r[1] && r[1] >= r[0], r);
  check('chia nguyên: trọng số 0 -> chia đều; tổng 0', K.chiaNguyen([0, 0, 0], 7).reduce((a, b) => a + b, 0) === 7 && K.chiaNguyen([5, 5], 0).join() === '0,0');
}

console.log('--- sửa SL một SKU của một khách (SKU view, đã Apply) ---');
{
  const bak = JSON.stringify(S);
  const q0 = line(S, 'A|F1').qty[THANG];
  const moi = Math.round(q0 * 1.3 / 10) * 10;
  const r = K.suaOSkuKhach(S, 'A|F1', THANG, moi, catOf);
  const a = r.state;
  check('đầu vào không bị sửa (bất biến)', JSON.stringify(S) === bak);
  check('ô sửa đúng giá trị, được Fix; chỉ tháng đó đổi; không âm / không lẻ', line(a, 'A|F1').qty[THANG] === moi && line(a, 'A|F1').khoa[THANG] && nguyenVen(a, THANG) && khongAm(a));
  check('doanh thu từng khách trong tháng GIỮ NGUYÊN (A bù bằng SKU khác của A; các khách khác bù lại)', khachGiu(S, a, THANG), ['A', 'B', 'C', 'D'].map((c) => [revKhach(S, c, THANG), revKhach(a, c, THANG)]));
  check('tổng SL SKU F1 trong tháng không đổi (các khách khác co giãn)', qSku(a, 'F1', THANG) === qSku(S, 'F1', THANG), [qSku(S, 'F1', THANG), qSku(a, 'F1', THANG)]);
  check('SL F1 của B và C đã đổi ngược chiều', line(a, 'B|F1').qty[THANG] < line(S, 'B|F1').qty[THANG] && line(a, 'C|F1').qty[THANG] < line(S, 'C|F1').qty[THANG]);
  check('tổng tháng không lệch mục tiêu (kiemTra sạch)', M.kiemTra(a).loi.length === 0, M.kiemTra(a).loi);
  check('các SKU khác của A đã co giãn (không còn như cũ)', ['A|M1', 'A|M2', 'A|F2', 'A|P1'].some((k) => line(a, k).qty[THANG] !== line(S, k).qty[THANG]));
}
{
  // ô Fix không bị đụng tới
  const s1 = M.doiKhoaO(S, 'A|P1', THANG), s2 = M.doiKhoaO(s1, 'B|F1', THANG);
  const a = K.suaOSkuKhach(s2, 'A|F1', THANG, line(S, 'A|F1').qty[THANG] + 200, catOf).state;
  check('ô đã Fix (A|P1, B|F1) giữ nguyên khi sửa nơi khác', line(a, 'A|P1').qty[THANG] === line(S, 'A|P1').qty[THANG] && line(a, 'B|F1').qty[THANG] === line(S, 'B|F1').qty[THANG]);
  check('...doanh thu khách vẫn giữ', khachGiu(S, a, THANG));
}
{
  // khách chỉ có SKU này không bù được -> giữ nguyên, SKU tổng thay đổi; khách đang sửa không còn SKU khác -> lỗi
  const dm = K.suaOSkuKhach(S, 'A|M1', THANG, line(S, 'A|M1').qty[THANG] + 20, catOf);
  check('SKU M1: D chỉ mua M1 (không có SKU khác để bù) nên SL của D giữ nguyên; doanh thu D không đổi', line(dm.state, 'D|M1').qty[THANG] === line(S, 'D|M1').qty[THANG] && khachGiu(S, dm.state, THANG));
  check('tổng SKU M1 giữ nguyên nhờ B bù (B còn SKU khác)', qSku(dm.state, 'M1', THANG) === qSku(S, 'M1', THANG));
  check('khách đang sửa không còn SKU nào để bù -> báo lỗi (nêu nguyên tắc bị vi phạm), không đổi gì', /Không giữ được nguyên tắc/.test(loi(() => K.suaOSkuKhach(S, 'D|M1', THANG, line(S, 'D|M1').qty[THANG] + 10, catOf))));
  let s3 = S;
  ['A|M2', 'A|F1', 'A|F2', 'A|P1'].forEach((k) => { s3 = M.doiKhoaO(s3, k, THANG); });
  check('mọi SKU khác của khách đã Fix -> báo lỗi', /Không giữ được nguyên tắc/.test(loi(() => K.suaOSkuKhach(s3, 'A|M1', THANG, line(S, 'A|M1').qty[THANG] + 10, catOf))));
}
{
  // chưa Apply: sửa thẳng, không bù, không Fix
  const a = K.suaOSkuKhach(goc, 'A|F1', THANG, 5000, catOf);
  check('chưa Apply: sửa thẳng (không bù, không Fix)', line(a.state, 'A|F1').qty[THANG] === 5000 && line(a.state, 'A|F2').qty[THANG] === line(goc, 'A|F2').qty[THANG] && !line(a.state, 'A|F1').khoa[THANG]);
}

console.log('--- sửa tổng SL một SKU (SKU view) ---');
{
  const q0 = qSku(S, 'F1', THANG), moi = Math.round(q0 * 1.25);
  const r = K.suaTongSku(S, 'f1', THANG, moi, catOf);
  const a = r.state;
  check('tổng SKU đúng số nhập; SKU được Fix TỔNG (các ô con KHÔNG bị Fix)', qSku(a, 'F1', THANG) === moi && K.laFixTong(a, 'sku', 'f1', THANG) && ['A|F1', 'B|F1', 'C|F1'].every((k) => !line(a, k).khoa[THANG]) && khongAm(a) && nguyenVen(a, THANG));
  check('doanh thu từng khách giữ nguyên', khachGiu(S, a, THANG), ['A', 'B', 'C', 'D'].map((c) => [revKhach(S, c, THANG), revKhach(a, c, THANG)]));
  check('tổng SL nhóm "Lõi lọc" giữ nguyên: F2 (SKU khác cùng nhóm) co giãn ngược lại', qNhom(a, 'Lõi lọc', THANG) === qNhom(S, 'Lõi lọc', THANG) && qSku(a, 'F2', THANG) < qSku(S, 'F2', THANG), [qNhom(S, 'Lõi lọc', THANG), qNhom(a, 'Lõi lọc', THANG)]);
  check('SKU các nhóm khác chưa Fix cũng co giãn để bù doanh thu', ['M1', 'M2', 'P1'].some((s) => qSku(a, s, THANG) !== qSku(S, s, THANG)));
  check('tỷ lệ giữa các khách trong SKU F1 giữ gần như cũ', Math.abs(line(a, 'A|F1').qty[THANG] / qSku(a, 'F1', THANG) - line(S, 'A|F1').qty[THANG] / q0) < 0.01);
  check('kiemTra sạch (tổng tháng khớp Target)', M.kiemTra(a).loi.length === 0, M.kiemTra(a).loi);
}
{
  // giảm tổng SKU
  const a = K.suaTongSku(S, 'm1', THANG, Math.round(qSku(S, 'M1', THANG) * 0.5), catOf).state;
  check('giảm tổng SKU M1 một nửa (D giữ nguyên vì không bù được): vẫn giữ doanh thu khách', khachGiu(S, a, THANG) && line(a, 'D|M1').qty[THANG] === line(S, 'D|M1').qty[THANG] && qSku(a, 'M1', THANG) === Math.round(qSku(S, 'M1', THANG) * 0.5));
  check('sửa lại cùng SKU lần nữa (ô đã Fix vẫn ghi đè được)', qSku(K.suaTongSku(a, 'm1', THANG, qSku(S, 'M1', THANG), catOf).state, 'M1', THANG) === qSku(S, 'M1', THANG));
  check('tổng nhập nhỏ hơn mức D (chỉ mua M1, doanh thu cố định) giữ được -> báo lỗi nguyên tắc', /Không giữ được nguyên tắc/.test(loi(() => K.suaTongSku(S, 'm1', THANG, line(S, 'D|M1').qty[THANG] - 10, catOf))));
  const chua = K.suaTongSku(goc, 'f1', THANG, 7000, catOf);
  check('chưa Apply: SKU co giãn theo tỷ lệ, không bù', qSku(chua.state, 'F1', THANG) === 7000 && qSku(chua.state, 'F2', THANG) === qSku(goc, 'F2', THANG));
}
{
  // SKU duy nhất của nhóm: tổng nhóm đổi và có ghi chú
  const c1 = M.xoaSku(M.xoaSku(M.xoaSku(S, 'A|P1').state, 'B|P1').state, 'C|P1').state;
  const a = K.suaTongSku(c1, 'f1', THANG, qSku(c1, 'F1', THANG) + 300, catOf);
  check('SKU còn SKU khác cùng nhóm vẫn bù theo nhóm; không có ghi chú lỗi', khachGiu(c1, a.state, THANG));
}

console.log('--- khách nhỏ không bù đủ được: giữ nguyên, các khách khác chia phần chênh ---');
{
  const g2 = taoState();
  g2.customers.push({ key: 'E', name: 'Khách E', market: '', isNew: false });
  [['M1', 40], ['P1', 300]].forEach(([sku, q]) => g2.lines.push({ key: 'E|' + sku, customerKey: 'E', skuCode: sku, tempSkuId: '', skuName: 'SP ' + sku, priceVnd: GIA[sku], qtyBase: new Array(12).fill(q), qty: new Array(12).fill(q), khoa: new Array(12).fill(false) }));
  const S2 = apdung(g2);
  const q0 = qSku(S2, 'M1', THANG);
  const r = K.suaTongSku(S2, 'm1', THANG, Math.round(q0 * 1.6), catOf);
  const ok = r.state;
  check('tăng mạnh tổng SKU M1: vẫn thành công, doanh thu E (chỉ có linh kiện rẻ để bù) giữ trong sai số, tổng SKU đúng', Math.abs(revKhach(ok, 'E', THANG) - revKhach(S2, 'E', THANG)) <= buocKhach(S2, 'E') && qSku(ok, 'M1', THANG) === Math.round(q0 * 1.6), [line(S2, 'E|M1').qty[THANG], line(ok, 'E|M1').qty[THANG]]);
  check('...tổng nhóm Máy giữ nguyên (M2 co lại bù)', qNhom(ok, 'Máy', THANG) === qNhom(S2, 'Máy', THANG), [qNhom(S2, 'Máy', THANG), qNhom(ok, 'Máy', THANG)]);
  check('...các khách còn lại giữ doanh thu; kiemTra sạch', ['A', 'B', 'C', 'D'].every((c) => Math.abs(revKhach(ok, c, THANG) - revKhach(S2, c, THANG)) <= buocKhach(S2, c) * 1) && M.kiemTra(ok).loi.length === 0, M.kiemTra(ok).loi);
}

console.log('--- sửa tổng SL một Category ---');
{
  const q0 = qNhom(S, 'Lõi lọc', THANG), moi = Math.round(q0 * 1.2);
  const r = K.suaTongNhom(S, 'Lõi lọc', THANG, moi, catOf);
  const a = r.state;
  check('tổng nhóm đúng số nhập; nhóm được Fix TỔNG (ô con không Fix)', qNhom(a, 'Lõi lọc', THANG) === moi && K.laFixTong(a, 'cat', 'Lõi lọc', THANG) && S.lines.filter((l) => catOf(l) === 'Lõi lọc').every((l) => !line(a, l.key).khoa[THANG]) && khongAm(a) && nguyenVen(a, THANG));
  check('doanh thu từng khách giữ nguyên (nhóm khác chưa Fix bù)', khachGiu(S, a, THANG), ['A', 'B', 'C', 'D'].map((c) => [revKhach(S, c, THANG), revKhach(a, c, THANG)]));
  check('SKU nhóm khác co giãn ngược chiều; nhóm "Máy" giảm', qNhom(a, 'Máy', THANG) < qNhom(S, 'Máy', THANG) || qNhom(a, 'Linh kiện', THANG) < qNhom(S, 'Linh kiện', THANG));
  check('kiemTra sạch', M.kiemTra(a).loi.length === 0, M.kiemTra(a).loi);
  check('D (chỉ mua Máy) không bị đụng khi sửa nhóm "Lõi lọc"', line(a, 'D|M1').qty[THANG] === line(S, 'D|M1').qty[THANG]);
  // D chỉ có nhóm Máy: sửa nhóm Máy -> D giữ nguyên
  const m = K.suaTongNhom(S, 'Máy', THANG, Math.round(qNhom(S, 'Máy', THANG) * 1.3), catOf);
  check('sửa nhóm "Máy": D (chỉ mua Máy, doanh thu cố định) và mọi khách giữ doanh thu; tổng nhóm đúng', qNhom(m.state, 'Máy', THANG) === Math.round(qNhom(S, 'Máy', THANG) * 1.3) && khachGiu(S, m.state, THANG), m.ghiChu);
  const ft = M.doiKhoaO(S, 'A|P1', THANG);
  const f = K.suaTongNhom(ft, 'Lõi lọc', THANG, moi, catOf).state;
  check('ô Fix ngoài nhóm (A|P1) không bị co giãn', line(f, 'A|P1').qty[THANG] === line(S, 'A|P1').qty[THANG] && khachGiu(S, f, THANG));
  const chua = K.suaTongNhom(goc, 'Lõi lọc', THANG, 9000, catOf);
  check('chưa Apply: chỉ nhóm đổi', qNhom(chua.state, 'Lõi lọc', THANG) === 9000 && qNhom(chua.state, 'Máy', THANG) === qNhom(goc, 'Máy', THANG));
  check('nhóm không tồn tại -> lỗi', /Không tìm thấy nhóm/.test(loi(() => K.suaTongNhom(S, 'Không có', THANG, 1, catOf))));
}

console.log('--- Fix hàng loạt ---');
{
  const keys = ['A|F1', 'B|F1', 'C|F1'];
  check('trạng thái Fix: ban đầu tắt', K.trangThaiFix(S, keys, THANG) === 'tat' && K.trangThaiFix(S, keys, null) === 'tat');
  const a = K.doiFixNhieu(S, keys, THANG);
  check('bật Fix theo tháng cho nhiều dòng: "het" ở tháng đó, "mot-phan" cả năm', K.trangThaiFix(a, keys, THANG) === 'het' && K.trangThaiFix(a, keys, null) === 'mot-phan' && !line(a, 'A|F1').khoa[THANG - 1]);
  check('bấm lần nữa -> bỏ Fix', K.trangThaiFix(K.doiFixNhieu(a, keys, THANG), keys, THANG) === 'tat');
  const c = K.doiFixNhieu(S, ['A|F1'], null);
  check('Fix cả dòng (12 tháng) — tick đầu dòng', c.lines.find((l) => l.key === 'A|F1').khoa.every(Boolean) && K.trangThaiFix(c, ['A|F1'], null) === 'het' && K.trangThaiFix(K.doiFixNhieu(c, ['A|F1'], null), ['A|F1'], null) === 'tat');
}

console.log('--- sửa doanh thu từng khách theo tháng ---');
{
  const bak = JSON.stringify(S);
  const hien = revKhach(S, 'A', THANG), moi = Math.round(hien * 1.15);
  const r = K.suaDoanhThuKhach(S, 'A', THANG, moi, { buKhac: true });
  const a = r.state;
  check('đầu vào không bị sửa', JSON.stringify(S) === bak);
  check('doanh thu khách A đúng số nhập (sai số làm tròn chục), SL SKU của A co giãn theo tỷ lệ', Math.abs(revKhach(a, 'A', THANG) - moi) <= buocKhach(a, 'A') && line(a, 'A|F1').qty[THANG] > line(S, 'A|F1').qty[THANG] && nguyenVen(a, THANG) && khongAm(a),
    [moi, revKhach(a, 'A', THANG)]);
  check('tổng tháng không đổi: các khách khác bù ngược', Math.abs(revThang(a, THANG) - revThang(S, THANG)) <= ['A', 'B', 'C', 'D'].reduce((t, c) => t + buocKhach(a, c), 0) && revKhach(a, 'B', THANG) < revKhach(S, 'B', THANG) && revKhach(a, 'C', THANG) < revKhach(S, 'C', THANG));
  check('kiemTra sạch', M.kiemTra(a).loi.length === 0, M.kiemTra(a).loi);
  check('có ghi chú đã bù cho khách khác', r.ghiChu.length === 1 && /khách khác/.test(r.ghiChu[0]), r.ghiChu);
  const kb = K.suaDoanhThuKhach(S, 'A', THANG, moi, { buKhac: false }).state;
  check('không bù (buKhac=false): chỉ A đổi, tổng tháng đổi theo', khachGiu(S, kb, THANG, ['A']) && Math.abs(revKhach(kb, 'A', THANG) - moi) <= buocKhach(kb, 'A') && revThang(kb, THANG) > revThang(S, THANG));
  const pv = K.suaDoanhThuKhach(S, 'A', THANG, moi, { buKhac: true, phamVi: new Set(['B']) }).state;
  check('phạm vi bù = chỉ khách B (đang lọc): C, D không đổi', revKhach(pv, 'C', THANG) === revKhach(S, 'C', THANG) && revKhach(pv, 'D', THANG) === revKhach(S, 'D', THANG) && revKhach(pv, 'B', THANG) < revKhach(S, 'B', THANG));
  const gi = K.suaDoanhThuKhach(M.doiKhoaO(S, 'A|P1', THANG), 'A', THANG, moi, { buKhac: false }).state;
  check('ô đã Fix của khách giữ nguyên khi co giãn doanh thu khách', line(gi, 'A|P1').qty[THANG] === line(S, 'A|P1').qty[THANG] && Math.abs(revKhach(gi, 'A', THANG) - moi) <= buocKhach(gi, 'A'));
  const giam = K.suaDoanhThuKhach(S, 'A', THANG, Math.round(hien * 0.6), { buKhac: true }).state;
  check('giảm doanh thu khách: các khách khác tăng bù', revKhach(giam, 'B', THANG) > revKhach(S, 'B', THANG) && M.kiemTra(giam).loi.length === 0);
  check('doanh thu âm / khách không SKU -> lỗi', /không âm/.test(loi(() => K.suaDoanhThuKhach(S, 'A', THANG, -5))) && /chưa có SKU/.test(loi(() => K.suaDoanhThuKhach({ ...S, customers: S.customers.concat([{ key: 'Z', name: 'Z' }]) }, 'Z', THANG, 5000000))));
  check('doanh thu giữ nguyên số cũ -> không đổi gì', K.suaDoanhThuKhach(S, 'A', THANG, hien, {}).state === S);
  check('chưa Apply: không bù khách khác', revKhach(K.suaDoanhThuKhach(goc, 'A', THANG, Math.round(revKhach(goc, 'A', THANG) * 1.2), {}).state, 'B', THANG) === revKhach(goc, 'B', THANG));
  const quaLon = loi(() => K.suaDoanhThuKhach(S, 'A', THANG, revThang(S, THANG) * 5, { buKhac: true }));
  check('tăng quá lớn (các khách khác không đủ bù) -> lỗi rõ ràng', /không đủ doanh thu để bù/.test(quaLon), quaLon);
}

console.log('--- tải bảng doanh thu khách × tháng (Excel) ---');
{
  const hien = K.doanhThuKhachThang(S);
  // đổi nhưng giữ tổng từng tháng: A +10 triệu, B −10 triệu ở T11
  const bang = new Map([['A', hien.get('A').map((v, m) => (m === THANG ? v + 10e6 : null))], ['B', hien.get('B').map((v, m) => (m === THANG ? v - 10e6 : null))]]);
  const r = K.apDungBangDoanhThu(S, bang);
  check('bảng cân (tổng tháng không đổi): 2 thay đổi, không lỗi, không cần cân bằng', r.thayDoi.length === 2 && !r.loi.length && M.kiemTra(r.state).loi.length === 0, r.loi);
  check('doanh thu A +10tr, B −10tr (trong sai số làm tròn)', Math.abs(revKhach(r.state, 'A', THANG) - (revKhach(S, 'A', THANG) + 10e6)) <= buocKhach(S, 'A') && Math.abs(revKhach(r.state, 'B', THANG) - (revKhach(S, 'B', THANG) - 10e6)) <= buocKhach(S, 'B'));
  // bảng lệch: tăng A 30tr mà không giảm ai -> cân bằng về target
  const b2 = new Map([['A', hien.get('A').map((v, m) => (m === THANG ? v + 30e6 : null))]]);
  const lech = K.apDungBangDoanhThu(S, b2);
  check('bảng lệch tổng tháng: có lechTruoc ≠ 0 ở T11; sau cân bằng về Target thì kiemTra sạch', Math.abs(lech.lechTruoc[THANG]) > 1e6 && M.kiemTra(lech.state).loi.length === 0 && Math.abs(lech.lechSau[THANG]) <= ['A', 'B', 'C', 'D'].reduce((t, c) => t + buocKhach(S, c), 0), [lech.lechTruoc[THANG], lech.lechSau[THANG]]);
  const khong = K.apDungBangDoanhThu(S, b2, { canBangVeTarget: false });
  check('tắt cân bằng: giữ nguyên số tải lên (tổng tháng lệch Target)', Math.abs(khong.lechSau[THANG]) > 1e6 && khong.state.lines.every((l, i) => l.qty.every((q, m) => m === THANG || q === S.lines[i].qty[m])));
  const b3 = new Map([['Z', hien.get('A').map(() => 5e6)], ['D', hien.get('D').map((v, m) => (m === THANG ? v : null))]]);
  const r3 = K.apDungBangDoanhThu(S, b3);
  check('khách không có SKU -> ghi vào loi, bỏ qua; giá trị bằng số cũ / rỗng -> không đổi', r3.thayDoi.length === 0 && r3.loi.length === 12 && r3.loi.every((x) => x.key === 'Z'));
  const rong = K.apDungBangDoanhThu(S, new Map([['A', hien.get('A').map(() => null)]]));
  check('bảng trống -> không đổi', rong.state.lines.every((l, i) => l === S.lines[i]) && rong.thayDoi.length === 0);
}

console.log('--- gom Category → SKU → khách ---');
{
  const g = K.gomTheoNhomSku(S, catOf);
  check('3 nhóm; xếp theo doanh thu kế hoạch năm giảm dần', g.length === 3 && g.every((n, i) => i === 0 || g[i - 1].dtNam >= n.dtNam), g.map((n) => [n.nhom, Math.round(n.dtNam)]));
  check('SKU trong nhóm xếp theo doanh thu giảm dần; mỗi SKU 1 dòng với đủ khách', g.every((n) => n.skus.every((s, i) => i === 0 || n.skus[i - 1].dtNam >= s.dtNam)) && g.find((n) => n.nhom === 'Máy').skus.find((s) => s.ma === 'M1').dong.length === 3);
  check('tổng nhóm = tổng SKU = tổng dòng', g.every((n) => Math.abs(n.dtNam - n.skus.reduce((t, s) => t + s.dtNam, 0)) < 1) && Math.abs(g.reduce((t, n) => t + n.dtNam, 0) - M.tong(M.doanhThuKeHoach(S))) < 1);
  check('qty tháng của nhóm = tổng qty các SKU', g.every((n) => n.qty.every((q, m) => q === n.skus.reduce((t, s) => t + s.qty[m], 0))));
  const khongInfo = K.gomTheoNhomSku(S, K.phanNhomCua({}));
  check('không có thông tin category -> một nhóm "Chưa phân loại"', khongInfo.length === 1 && khongInfo[0].nhom === K.CHUA_PHAN_LOAI);
}

console.log('--- xóa / sửa mã / thêm SKU cho nhiều khách ---');
{
  const a = K.xoaSkuTatCa(S, 'm1');
  check('xóa SKU M1: mọi khách có M1 mất dòng; doanh thu từng khách trong năm giữ (dồn sang SKU khác của khách; D không còn dòng nào)', !a.lines.some((l) => l.skuCode === 'M1') && a.removedLines.length === 3 &&
    Math.abs(revKhach(a, 'A', THANG) - revKhach(S, 'A', THANG)) <= buocKhach(S, 'A') && Math.abs(revKhach(a, 'B', THANG) - revKhach(S, 'B', THANG)) <= buocKhach(S, 'B') && a.lines.filter((l) => l.customerKey === 'D').length === 0);
  const r = K.doiMaSku(S, 'm1', { skuCode: 'M1X', skuName: 'Máy mới' });
  check('sửa mã M1 -> M1X cho cả 3 khách: khóa dòng, tên đổi; số lượng / giá / Fix giữ nguyên', r.lines.filter((l) => l.skuCode === 'M1X').length === 3 && !r.lines.some((l) => l.skuCode === 'M1') && r.lines.find((l) => l.key === 'A|M1X').skuName === 'Máy mới' &&
    r.lines.find((l) => l.key === 'A|M1X').qty.join() === line(S, 'A|M1').qty.join() && r.lines.find((l) => l.key === 'A|M1X').priceVnd === GIA.M1);
  check('sửa mã trùng mã khác đang có ở cùng khách -> lỗi', /Đã có SKU/.test(loi(() => K.doiMaSku(S, 'm1', { skuCode: 'M2' }))) && /Nhập mã/.test(loi(() => K.doiMaSku(S, 'm1', { skuCode: ' ' }))));
  const tam = M.themSku(S, 'A', { skuCode: '', tempSkuId: 'NEW-1', skuName: 'Tạm', priceVnd: 1000 });
  const t2 = K.doiMaSku(tam, 'new-1', { skuCode: '5000001' });
  check('mã tạm đổi sang mã SAP: bỏ khỏi danh sách SKU mới, tempSkuId rỗng', t2.lines.find((l) => l.key === 'A|5000001').tempSkuId === '' && t2.newSkus.length === 0);
  const them = K.themSkuNhieuKhach(S, ['A', 'B', 'D'], { skuCode: 'X9', skuName: 'Mới', priceVnd: 12345 }, M.themSku);
  check('thêm SKU mới cho nhiều khách: mỗi khách một dòng SL 0; khách đã có thì bỏ qua', them.them.length === 3 && ['A|X9', 'B|X9', 'D|X9'].every((k) => line(them.state, k) && line(them.state, k).qty.every((q) => q === 0)) &&
    K.themSkuNhieuKhach(them.state, ['A', 'C'], { skuCode: 'X9', skuName: 'Mới', priceVnd: 12345 }, M.themSku).boQua.join() === 'A');
}

{
  // SKU mới thêm (SL 0 ở mọi khách): nhập tổng -> chia đều cho các khách, doanh thu từng khách vẫn giữ
  const th = K.themSkuNhieuKhach(S, ['A', 'B', 'C'], { skuCode: 'X9', skuName: 'Mới', priceVnd: 200000 });
  const catX = (l) => (l.skuCode === 'X9' ? 'Phụ kiện' : catOf(l));
  const r = K.suaTongSku(th.state, 'x9', THANG, 300, catX);
  check('SKU mới (SL 0): nhập tổng 300 -> chia đều 100 / khách, Fix tổng; doanh thu từng khách giữ nguyên', ['A|X9', 'B|X9', 'C|X9'].every((k) => line(r.state, k).qty[THANG] === 100) && K.laFixTong(r.state, 'sku', 'x9', THANG) && khachGiu(th.state, r.state, THANG), r.ghiChu);
}

console.log('--- Fix cấp TỔNG: Fix nhóm / SKU chỉ giữ tổng, các dòng con vẫn co giãn ---');
{
  const fix = (st, loai, ten) => K.doiFixTong(st, loai, ten, THANG);
  const kiemGia = (a, ten, dk, them) => check(ten, dk, them);
  const tongTh = (st) => revThang(st, THANG);
  const tolThang = (st) => ['A', 'B', 'C', 'D'].reduce((t, c) => t + buocKhach(st, c), 0);
  // trạng thái cờ
  const f1 = fix(S, 'cat', 'Lõi lọc');
  check('cờ Fix tổng: bật theo tháng; cả năm "mot-phan"; bấm lại thì bỏ; không đụng khoa của ô', K.laFixTong(f1, 'cat', 'Lõi lọc', THANG) && K.trangThaiFixTong(f1, 'cat', 'Lõi lọc', null) === 'mot-phan' && K.trangThaiFixTong(K.doiFixTong(f1, 'cat', 'Lõi lọc', THANG), 'cat', 'Lõi lọc', THANG) === 'tat' && !K.doiFixTong(f1, 'cat', 'Lõi lọc', THANG).fixTong['cat:Lõi lọc'] && f1.lines.every((l) => !l.khoa[THANG]));
  check('Fix tổng cả năm (tick đầu dòng): 12 tháng', K.trangThaiFixTong(K.doiFixTong(S, 'sku', 'f1', null), 'sku', 'f1', null) === 'het');

  // 1) Fix nhóm "Lõi lọc"; sửa tổng SKU F1 trong nhóm -> F2 (chưa Fix) co lại để tổng nhóm KHÔNG đổi
  const moi = Math.round(qSku(S, 'F1', THANG) * 1.2);
  const a = K.suaTongSku(f1, 'f1', THANG, moi, catOf).state;
  kiemGia(a, 'nhóm đã Fix + sửa tổng SKU F1: tổng nhóm đúng như cũ, F1 đúng số nhập, F2 co lại', qNhom(a, 'Lõi lọc', THANG) === qNhom(S, 'Lõi lọc', THANG) && qSku(a, 'F1', THANG) === moi && qSku(a, 'F2', THANG) < qSku(S, 'F2', THANG), [qNhom(S, 'Lõi lọc', THANG), qNhom(a, 'Lõi lọc', THANG), qSku(a, 'F2', THANG)]);
  kiemGia(a, '...doanh thu từng khách và tổng tháng không đổi; nhóm vẫn Fix tổng, F1 được Fix tổng; ô con không Fix', khachGiu(S, a, THANG) && Math.abs(tongTh(a) - tongTh(S)) <= tolThang(S) && K.laFixTong(a, 'cat', 'Lõi lọc', THANG) && K.laFixTong(a, 'sku', 'f1', THANG) && a.lines.every((l) => !l.khoa[THANG]) && M.kiemTra(a).loi.length === 0, M.kiemTra(a).loi);

  // 2) Fix nhóm; sửa MỘT Ô trong nhóm -> tổng SKU và tổng nhóm đều giữ
  const b = K.suaOSkuKhach(f1, 'A|F1', THANG, line(S, 'A|F1').qty[THANG] + 150, catOf).state;
  kiemGia(b, 'nhóm đã Fix + sửa ô A|F1: tổng nhóm và tổng SKU F1 giữ nguyên, doanh thu khách giữ', qNhom(b, 'Lõi lọc', THANG) === qNhom(S, 'Lõi lọc', THANG) && qSku(b, 'F1', THANG) === qSku(S, 'F1', THANG) && line(b, 'A|F1').qty[THANG] === line(S, 'A|F1').qty[THANG] + 150 && khachGiu(S, b, THANG), [qNhom(S, 'Lõi lọc', THANG), qNhom(b, 'Lõi lọc', THANG)]);

  // 3) Fix SKU F1 (tổng); sửa ô A|F2 -> tổng F1 giữ nguyên, các ô F1 vẫn được co giãn giữa các khách khi cần
  const f2 = fix(S, 'sku', 'f1');
  const c = K.suaOSkuKhach(f2, 'A|P1', THANG, line(S, 'A|P1').qty[THANG] + 400, catOf).state;
  kiemGia(c, 'SKU F1 đã Fix tổng + sửa ô A|P1: tổng F1 không đổi; doanh thu khách giữ; tổng tháng giữ', qSku(c, 'F1', THANG) === qSku(S, 'F1', THANG) && khachGiu(S, c, THANG) && Math.abs(tongTh(c) - tongTh(S)) <= tolThang(S) && M.kiemTra(c).loi.length === 0, M.kiemTra(c).loi);
  const sau = ['A|F1', 'B|F1', 'C|F1'].map((k) => line(c, k).qty[THANG] - line(S, k).qty[THANG]);
  kiemGia(c, '...Fix tổng không chặn dòng con: SL F1 của các khách có thể đổi nhưng tổng bằng 0', sau.reduce((t, v) => t + v, 0) === 0, sau);

  // 4) SKU F1, F2 đều Fix tổng + nhóm Fix tổng: sửa ô vẫn được (giữ cả ba tổng); sửa tổng NHÓM thì lỗi (không còn SKU nào để bù)
  let g = fix(fix(fix(S, 'sku', 'f1'), 'sku', 'f2'), 'cat', 'Lõi lọc');
  const d = K.suaOSkuKhach(g, 'A|F1', THANG, line(S, 'A|F1').qty[THANG] + 100, catOf).state;
  kiemGia(d, 'cả nhóm + 2 SKU Fix tổng: sửa ô A|F1 -> F1, F2, nhóm đều giữ nguyên tổng; doanh thu khách giữ', qSku(d, 'F1', THANG) === qSku(S, 'F1', THANG) && qSku(d, 'F2', THANG) === qSku(S, 'F2', THANG) && qNhom(d, 'Lõi lọc', THANG) === qNhom(S, 'Lõi lọc', THANG) && khachGiu(S, d, THANG));
  kiemGia(g, 'mọi SKU trong nhóm đã Fix tổng: sửa tổng nhóm -> báo lỗi', /đã Fix/.test(loi(() => K.suaTongNhom(g, 'Lõi lọc', THANG, qNhom(S, 'Lõi lọc', THANG) + 500, catOf))));

  // 5) nhóm Máy Fix tổng + M2 Fix tổng: sửa tổng SKU M1 -> không còn SKU nào trong nhóm để bù => lỗi, không đổi gì
  const h = fix(fix(S, 'cat', 'Máy'), 'sku', 'm2');
  const bakH = JSON.stringify(h);
  kiemGia(h, 'nhóm Máy Fix tổng, M2 Fix tổng: sửa tổng M1 -> lỗi nguyên tắc; trạng thái không đổi', /Không giữ được nguyên tắc/.test(loi(() => K.suaTongSku(h, 'm1', THANG, qSku(S, 'M1', THANG) + 20, catOf))) && JSON.stringify(h) === bakH);

  // 6) nhóm Máy Fix tổng; sửa tổng SKU F1 (nhóm khác) -> tổng nhóm Máy không đổi
  const e = K.suaTongSku(fix(S, 'cat', 'Máy'), 'f1', THANG, Math.round(qSku(S, 'F1', THANG) * 1.3), catOf).state;
  kiemGia(e, 'nhóm Máy Fix tổng: sửa SKU nhóm khác -> tổng nhóm Máy đúng như cũ (các SKU Máy co giãn giữa khách khi cần), doanh thu khách giữ', qNhom(e, 'Máy', THANG) === qNhom(S, 'Máy', THANG) && khachGiu(S, e, THANG) && M.kiemTra(e).loi.length === 0, [qNhom(S, 'Máy', THANG), qNhom(e, 'Máy', THANG)]);

  // 6b) ô Fix riêng nằm trong nhóm đã Fix tổng: ô đứng yên, tổng nhóm vẫn đúng tuyệt đối
  const fz = K.doiFixTong(M.doiKhoaO(S, 'B|F2', THANG), 'cat', 'Lõi lọc', THANG);
  const fzR = K.suaTongSku(fz, 'f1', THANG, Math.round(qSku(S, 'F1', THANG) * 1.15), catOf).state;
  kiemGia(fzR, 'nhóm Fix tổng + ô B|F2 Fix riêng: B|F2 đứng yên, tổng nhóm đúng như cũ, doanh thu khách giữ', line(fzR, 'B|F2').qty[THANG] === line(S, 'B|F2').qty[THANG] && qNhom(fzR, 'Lõi lọc', THANG) === qNhom(S, 'Lõi lọc', THANG) && khachGiu(S, fzR, THANG) && M.kiemTra(fzR).loi.length === 0, [qNhom(S, 'Lõi lọc', THANG), qNhom(fzR, 'Lõi lọc', THANG)]);

  // 6c) tắt "tự Fix": sửa xong không để lại cờ / khoa nào; nhóm đã sửa trước vẫn dùng được để bù ở lần sửa sau
  const t1 = K.suaTongNhom(S, 'Lõi lọc', THANG, Math.round(qNhom(S, 'Lõi lọc', THANG) * 1.1), catOf, { tuFix: false }).state;
  check('tuFix=false: sửa tổng nhóm không để lại Fix tổng', !K.laFixTong(t1, 'cat', 'Lõi lọc', THANG) && Object.keys(t1.fixTong || {}).length === 0);
  const t2 = K.suaOSkuKhach(t1, 'A|M1', THANG, line(t1, 'A|M1').qty[THANG] + 10, catOf, { tuFix: false }).state;
  check('tuFix=false: sửa ô không Fix ô; nhóm Lõi lọc (sửa trước đó) co giãn bù được; doanh thu khách giữ', !line(t2, 'A|M1').khoa[THANG] && khachGiu(t1, t2, THANG) && qSku(t2, 'M1', THANG) === qSku(t1, 'M1', THANG));
  const u1 = K.suaTongNhom(S, 'Lõi lọc', THANG, Math.round(qNhom(S, 'Lõi lọc', THANG) * 1.1), catOf).state;
  check('tuFix mặc định bật: sửa tổng nhóm Fix tổng nhóm đó', K.laFixTong(u1, 'cat', 'Lõi lọc', THANG));

  // 7) sửa doanh thu khách khi có SKU Fix tổng: tổng SKU Fix giữ nguyên, tổng tháng giữ (bù khách khác)
  const hien = revKhach(S, 'A', THANG), moiDt = Math.round(hien * 1.1);
  const r = K.suaDoanhThuKhach(f2, 'A', THANG, moiDt, { buKhac: true, catOf });
  check('sửa doanh thu khách A khi F1 Fix tổng: A đúng số nhập; tổng F1 giữ; tổng tháng giữ; kiemTra sạch', Math.abs(revKhach(r.state, 'A', THANG) - moiDt) <= buocKhach(S, 'A') && qSku(r.state, 'F1', THANG) === qSku(S, 'F1', THANG) && Math.abs(tongTh(r.state) - tongTh(S)) <= tolThang(S) && M.kiemTra(r.state).loi.length === 0, [moiDt, revKhach(r.state, 'A', THANG)]);
  const rb = K.apDungBangDoanhThu(f2, new Map([['A', K.doanhThuKhachThang(S).get('A').map((v, i) => (i === THANG ? v + 10e6 : null))], ['B', K.doanhThuKhachThang(S).get('B').map((v, i) => (i === THANG ? v - 10e6 : null))]]), { catOf });
  check('tải Excel khi có Fix tổng: A +10tr, B −10tr; tổng F1 giữ; không lỗi; kiemTra sạch', !rb.loi.length && qSku(rb.state, 'F1', THANG) === qSku(S, 'F1', THANG) && Math.abs(revKhach(rb.state, 'A', THANG) - revKhach(S, 'A', THANG) - 10e6) <= buocKhach(S, 'A') && M.kiemTra(rb.state).loi.length === 0, rb.loi);

  // 8) cờ đi theo SKU khi đổi mã / mất khi xóa SKU; mở khóa Target xóa mọi Fix tổng; payload mang theo fixTong
  const dm = K.doiMaSku(f2, 'f1', { skuCode: 'F1X' });
  check('đổi mã SKU: cờ Fix tổng chuyển sang mã mới', K.laFixTong(dm, 'sku', 'f1x', THANG) && !K.laFixTong(dm, 'sku', 'f1', THANG));
  check('xóa SKU: cờ Fix tổng của SKU đó mất', !K.xoaSkuTatCa(f2, 'f1').fixTong['sku:f1']);
  check('mở khóa Target (về số cơ sở): xóa mọi Fix tổng; payload lưu fixTong', Object.keys(M.moKhoaTarget(f2).fixTong || {}).length === 0 && M.chuyenSangPayload(f2).fixTong['sku:f1'][THANG] === true);
}

console.log('--- thử ngẫu nhiên (dữ liệu giống thực tế: máy đắt + linh kiện rẻ), mọi thao tác thành công phải giữ nguyên tắc ---');
{
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const KH = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
  const SKUS = [['1001', 12500000, 'Máy'], ['1002', 9500000, 'Máy'], ['2001', 180000, 'Màng'], ['2002', 45000, 'Màng'], ['3001', 320000, 'Bơm'], ['3002', 95000, 'Bơm'], ['3003', 15000, 'Bơm']];
  const catF = (l) => SKUS.find((x) => x[0] === l.skuCode)[2];
  const lines = [];
  KH.forEach((c, ci) => SKUS.forEach(([sku, gia], si) => {
    if ((ci + si) % 5 === 4) return;
    const heSo = (ci === 0 ? 3 : 1) * (gia > 1e6 ? 1 : 12);
    const base = new Array(12).fill(0).map(() => Math.round((20 + rnd() * 60) * heSo));
    lines.push({ key: c + '|' + sku, customerKey: c, skuCode: sku, tempSkuId: '', skuName: sku, priceVnd: gia, qtyBase: base, qty: base.slice(), khoa: new Array(12).fill(false) });
  }));
  const goc0 = { id: 'F', status: 'draft', kind: 'base', shares: E.tyTrongMuaVu(null, null), targetGrowthPct: null, targetRevenueVnd: null, targetApplied: false, baselineLastMonth: 8, note: '',
    customers: KH.map((k) => ({ key: k, name: k, market: '', isNew: false })), lines, newSkus: [], removedLines: [] };
  let st = apdung(goc0);
  const tolK = (s2, c, m) => { const ds = s2.lines.filter((l) => l.customerKey === c && l.qty[m] > 0); return Math.max(10 * Math.min(...ds.map((l) => l.priceVnd)), 1); };
  const revK = (s2, c, m) => s2.lines.filter((l) => l.customerKey === c).reduce((t, l) => t + l.qty[m] * l.priceVnd, 0);
  const qS = (s2, sku, m) => s2.lines.filter((l) => l.skuCode === sku).reduce((t, l) => t + l.qty[m], 0);
  const qC = (s2, nh, m) => s2.lines.filter((l) => catF(l) === nh).reduce((t, l) => t + l.qty[m], 0);
  let ok = 0, loiN = 0, vp = [];
  const nhomDs = ['Máy', 'Màng', 'Bơm'];
  for (let lan = 0; lan < 90; lan++) {
    if (lan % 6 === 0) st = { ...st, fixTong: {}, lines: st.lines.map((l) => ({ ...l, khoa: new Array(12).fill(false) })) };       // người dùng bỏ Fix định kỳ — nếu để dồn mãi thì mọi thứ bị Fix và báo lỗi là đúng
    const m = 9 + Math.floor(rnd() * 3);
    const kind = Math.floor(rnd() * 5);
    let kq = null, nx = null, edS = '', edN = '';
    const truoc = st;
    try {
      if (kind === 0) { const sk = SKUS[Math.floor(rnd() * SKUS.length)][0]; edS = sk; nx = K.suaTongSku(st, sk, m, Math.round(qS(st, sk, m) * (0.8 + rnd() * 0.5)), catF); }
      else if (kind === 1) { const nh = nhomDs[Math.floor(rnd() * 3)]; edN = nh; nx = K.suaTongNhom(st, nh, m, Math.round(qC(st, nh, m) * (0.85 + rnd() * 0.3)), catF); }
      else if (kind === 2) { const l = st.lines[Math.floor(rnd() * st.lines.length)]; nx = K.suaOSkuKhach(st, l.key, m, Math.round(l.qty[m] * (0.7 + rnd() * 0.7)), catF); }
      else if (kind === 3) { const c = KH[Math.floor(rnd() * 6)]; nx = K.suaDoanhThuKhach(st, c, m, revK(st, c, m) * (0.9 + rnd() * 0.2), { buKhac: true, catOf: catF }); }
      else { const sk = SKUS[Math.floor(rnd() * SKUS.length)][0]; const nh = nhomDs[Math.floor(rnd() * 3)]; st = rnd() < 0.5 ? K.doiFixTong(st, 'sku', sk, m) : K.doiFixTong(st, 'cat', nh, m); continue; }
      kq = nx.state;
    } catch (e) { loiN++; continue; }
    ok++;
    // nguyên tắc: doanh thu từng khách + tổng tháng; tổng SL Fix giữ; số nguyên không âm; tháng khác không đổi
    const sai = [];
    KH.forEach((c) => { if (kind !== 3 && Math.abs(revK(kq, c, m) - revK(truoc, c, m)) > tolK(kq, c, m)) sai.push('khách ' + c + ' lệch ' + Math.round(revK(kq, c, m) - revK(truoc, c, m))); });
    const tong = (s2) => s2.lines.reduce((t, l) => t + l.qty[m] * l.priceVnd, 0);
    const tolT = KH.reduce((t, c) => t + tolK(kq, c, m), 0);
    if (Math.abs(tong(kq) - tong(truoc)) > tolT) sai.push('tổng tháng lệch ' + Math.round(tong(kq) - tong(truoc)) + ' > ' + Math.round(tolT));
    SKUS.forEach(([sk]) => { if (K.laFixTong(truoc, 'sku', sk, m) && sk !== edS && qS(kq, sk, m) !== qS(truoc, sk, m)) sai.push('SKU ' + sk + ' Fix tổng nhưng đổi (kind ' + kind + ')'); });
    nhomDs.forEach((nh) => { if (K.laFixTong(truoc, 'cat', nh, m) && nh !== edN && qC(kq, nh, m) !== qC(truoc, nh, m)) sai.push('nhóm ' + nh + ' Fix tổng nhưng đổi (kind ' + kind + ')'); });
    if (!khongAm(kq)) sai.push('SL âm / lẻ');
    if (kq.lines.some((l, i) => l.qty.some((q, k) => k !== m && q !== truoc.lines[i].qty[k]))) sai.push('tháng khác bị đổi');
    if (sai.length) vp.push('lần ' + lan + ' kind ' + kind + ' T' + (m + 1) + ': ' + sai.join('; '));
    st = kq;
  }
  check('90 thao tác ngẫu nhiên (' + ok + ' thành công, ' + loiN + ' báo lỗi): mọi thao tác thành công đều giữ doanh thu khách, tổng tháng, tổng SKU / nhóm đã Fix', vp.length === 0, vp.slice(0, 4));
  check('tỷ lệ báo lỗi hợp lý (< 40%) — lỗi chỉ khi thật sự không giữ được nguyên tắc', loiN < 0.4 * (ok + loiN), [ok, loiN]);
}

console.log('--- dữ liệu dị biệt (25 khách, 40 SKU giá 12 nghìn → 20 triệu, 6 nhóm): sửa tổng nhóm / SKU / ô giữ doanh thu khách trong mức triệu ---');
{
  let seed2 = 5;
  const rnd2 = () => { seed2 = (seed2 * 1103515245 + 12345) & 0x7fffffff; return seed2 / 0x7fffffff; };
  const NKH = 25, NSK = 40, NNH = 6;
  const SK = Array.from({ length: NSK }, (_, i) => ({ code: 'S' + i, gia: Math.round(Math.exp(Math.log(12000) + rnd2() * (Math.log(20e6) - Math.log(12000)))), cat: 'C' + (i % NNH) }));
  const KHs = Array.from({ length: NKH }, (_, i) => 'K' + i);
  const dong = [];
  KHs.forEach((c) => { const n = 3 + Math.floor(rnd2() * 13); SK.slice().sort(() => rnd2() - 0.5).slice(0, n).forEach((x) => {
    const rev = Math.exp(Math.log(5e6) + rnd2() * (Math.log(2e9) - Math.log(5e6))); const q0 = Math.max(1, Math.round(rev / x.gia));
    const base = new Array(12).fill(0).map(() => Math.max(0, Math.round(q0 * (0.7 + rnd2() * 0.6))));
    dong.push({ key: c + '|' + x.code, customerKey: c, skuCode: x.code, tempSkuId: '', skuName: x.code, priceVnd: x.gia, qtyBase: base, qty: base.slice(), khoa: new Array(12).fill(false) }); }); });
  const catR = (l) => SK.find((x) => x.code === l.skuCode).cat;
  const g2 = { id: 'R', status: 'draft', kind: 'base', shares: E.tyTrongMuaVu(null, null), targetGrowthPct: null, targetRevenueVnd: null, targetApplied: false, baselineLastMonth: 8, note: '',
    customers: KHs.map((k) => ({ key: k, name: k, market: '', isNew: false })), lines: dong, newSkus: [], removedLines: [] };
  const st0 = apdung(g2);
  const qSk = (s2, sk, m) => s2.lines.filter((l) => l.skuCode === sk).reduce((t, l) => t + l.qty[m], 0), qNh = (s2, nh, m) => s2.lines.filter((l) => catR(l) === nh).reduce((t, l) => t + l.qty[m], 0);
  const rK = (s2, c, m) => s2.lines.filter((l) => l.customerKey === c).reduce((t, l) => t + l.qty[m] * l.priceVnd, 0);
  let thanhCong = 0, tong = 0, lechMax = 0, sai2 = [];
  for (let lan = 0; lan < 36; lan++) {
    const m = 9 + Math.floor(rnd2() * 3), kind = lan % 3;
    tong++;
    let nx;
    try {
      if (kind === 0) { const sk = SK[Math.floor(rnd2() * NSK)].code; nx = K.suaTongSku(st0, sk.toLowerCase(), m, Math.round(qSk(st0, sk, m) * (0.8 + rnd2() * 0.5)), catR); }
      else if (kind === 1) { const nh = 'C' + Math.floor(rnd2() * NNH); nx = K.suaTongNhom(st0, nh, m, Math.round(qNh(st0, nh, m) * (0.85 + rnd2() * 0.3)), catR); }
      else { const l = st0.lines[Math.floor(rnd2() * st0.lines.length)]; nx = K.suaOSkuKhach(st0, l.key, m, Math.round(l.qty[m] * (0.7 + rnd2() * 0.7)), catR); }
    } catch (e) { continue; }
    thanhCong++;
    KHs.forEach((c) => {
      const d = Math.abs(rK(nx.state, c, m) - rK(st0, c, m)); lechMax = Math.max(lechMax, d);
      const gia = nx.state.lines.filter((l) => l.customerKey === c && l.qty[m] > 0).map((l) => l.priceVnd);
      if (d > Math.max(1e6, 0.5 * Math.min(...gia)) + 1) sai2.push(c + ' T' + (m + 1) + ' lệch ' + Math.round(d));
    });
    const dm = Math.abs(nx.state.lines.reduce((t, l) => t + l.qty[m] * l.priceVnd, 0) - st0.lines.reduce((t, l) => t + l.qty[m] * l.priceVnd, 0));
    if (dm > 5e6) sai2.push('tổng tháng lệch ' + Math.round(dm));
    if (!khongAm(nx.state)) sai2.push('SL âm / lẻ');
  }
  check('36 thao tác trên dữ liệu dị biệt: ' + thanhCong + ' thành công; thành công thì doanh thu khách lệch tối đa ' + Math.round(lechMax / 1e3) + ' nghìn VNĐ (≤ 1 triệu hoặc nửa đơn giá SKU rẻ nhất), tổng tháng ≤ 5 triệu', sai2.length === 0, sai2.slice(0, 4));
  check('đa số thao tác thành công (≥ 90%) — chỉ báo lỗi khi khách thật sự không còn SKU để bù', thanhCong >= 0.9 * tong, [thanhCong, tong]);
}

console.log('--- ' + pass + ' đạt, ' + fail + ' lỗi ---');
process.exit(fail ? 1 : 0);
