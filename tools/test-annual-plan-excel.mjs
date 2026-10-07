/**
 * test-annual-plan-excel.mjs — 06/10/2026: xuất Excel kế hoạch năm (client/src/utils/annualPlanExcel.js).
 * Chạy: node tools/test-annual-plan-excel.mjs
 * Dựng workbook, GHI ra bộ nhớ rồi ĐỌC LẠI bằng xlsx để kiểm đúng thứ tự cột, dòng tổng, bộ lọc, số liệu.
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const U = (f) => pathToFileURL(path.join(ROOT, 'client', 'src', 'utils', f)).href;
const X = await import(U('annualPlanExcel.js'));
const E = await import(U('annualPlanEngine.js'));
const M = await import(U('annualPlanModel.js'));
const XLSX = createRequire(path.join(ROOT, 'client', 'package.json'))('xlsx');

let pass = 0, fail = 0;
const check = (ten, dk, them) => { if (dk) { pass++; console.log('  OK   ' + ten); } else { fail++; console.log('  FAIL ' + ten + (them !== undefined ? '  → ' + JSON.stringify(them) : '')); } };

function taoState() {
  const lines = [];
  const them = (c, sku, gia, base, ten) => lines.push({ key: c + '|' + sku, customerKey: c, skuCode: sku, tempSkuId: '', skuName: ten || ('Máy ' + sku), priceVnd: gia, qtyBase: base, qty: base.map((v) => v * 2), khoa: new Array(12).fill(false) });
  them('OEM:ALPHA', '1001', 10000000, [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  them('OEM:ALPHA', '2002', 1000000, [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
  them('OEM:BETA', '1001', 12000000, [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  return { id: 'AP-1', status: 'approved', shares: E.tyTrongMuaVu(null, null), targetApplied: false, baselineLastMonth: 8, note: '',
    customers: [{ key: 'OEM:ALPHA', name: 'Alpha Co', market: '' }, { key: 'OEM:BETA', name: 'Beta Co', market: '' }], lines, newSkus: [], removedLines: [] };
}
const st = taoState();
const donVi = { code: 'OEM', name: 'OEM Nội địa', source: 'oem', single: false };
const info = { 'OEM:ALPHA': { code: '1001', sale: 'Luyến' }, 'OEM:BETA': { code: '1002', sale: '' } };
const skuInfo = { '1001': { name: 'Máy lọc 1001', category: 'RO Machine' }, '2002': { name: 'Lõi 2002', category: 'Filter' } };
const wb = X.taoWorkbook({ state: st, donVi, year: 2027, info, skuInfo });
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const rd = XLSX.read(buf, { type: 'buffer' });
const aoa = (ten) => XLSX.utils.sheet_to_json(rd.Sheets[ten], { header: 1, defval: '' });

check('đúng hai tab, đúng tên và thứ tự', rd.SheetNames.join() === 'Plan_Per_Client,Plan_SKU', rd.SheetNames);

console.log('--- Plan_Per_Client ---');
const pc = aoa('Plan_Per_Client');
check('tiêu đề dòng 2: Mã khách, Tên khách, Sale ID, DT năm nay (dự kiến), DT kế hoạch năm sau, 12 cột tháng', pc[1].length === 17 && pc[1].slice(0, 5).join('|') === 'Mã khách|Tên khách|Sale ID|DT năm 2026 (dự kiến)|DT kế hoạch năm 2027' && pc[1][5] === 'DT KH T1/2027' && pc[1][16] === 'DT KH T12/2027', pc[1]);
check('OEM: tên khách VÀ mã khách đều là Search Code (không phải "Alpha Co", không dùng mã số SAP "1001"); sale; khách không có sale để trống', pc[2][0] === 'ALPHA' && pc[2][1] === 'ALPHA' && pc[2][2] === 'Luyến' && pc[3][0] === 'BETA' && pc[3][1] === 'BETA' && pc[3][2] === '', pc.slice(2));
const wbXk = X.taoWorkbook({ state: { ...st, customers: [{ key: 'XK:Brafco', name: 'Brafco' }], lines: st.lines.filter((l) => l.customerKey === 'OEM:ALPHA').map((l) => ({ ...l, customerKey: 'XK:Brafco' })) }, donVi: { code: 'XK', name: 'Export OEM', source: 'export' }, year: 2027,
  info: { 'XK:Brafco': { code: 'C001', sale: 'Ashley', market: 'Brazil' } }, skuInfo: {} });
const pcXk = XLSX.utils.sheet_to_json(wbXk.Sheets.Plan_Per_Client, { header: 1, defval: '' });
check('Export: mã khách = client_id (C001), tên = Short Name, Sale ID = Sale_ID của khách', pcXk[2][0] === 'C001' && pcXk[2][1] === 'Brafco' && pcXk[2][2] === 'Ashley', pcXk[2]);
const alphaBase = 12 * (10 * 10e6 + 100 * 1e6), alphaPlan = alphaBase * 2;
check('DT năm nay (dự kiến) = cơ sở; DT kế hoạch năm sau = kế hoạch; 12 tháng cộng lại = DT kế hoạch (VNĐ đầy đủ)', pc[2][3] === alphaBase && pc[2][4] === alphaPlan && pc[2].slice(5).reduce((a, b) => a + b, 0) === pc[2][4] && pc[2][5] === alphaPlan / 12, pc[2]);
check('dòng TỔNG ở trên cùng (dòng 1): bằng tổng các khách, cột tháng cũng vậy', pc[0][0] === 'TỔNG' && pc[0][3] === pc[2][3] + pc[3][3] && pc[0][4] === pc[2][4] + pc[3][4] && pc[0][16] === pc[2][16] + pc[3][16], pc[0]);
const wsPc = rd.Sheets['Plan_Per_Client'];
check('dòng TỔNG dùng SUBTOTAL (đổi theo bộ lọc) và có bộ lọc ở dòng tiêu đề bao hết bảng', wsPc.D1.f === 'SUBTOTAL(109,D3:D4)' && wsPc.Q1.f === 'SUBTOTAL(109,Q3:Q4)' && wsPc['!autofilter'].ref === 'A2:Q4', [wsPc.D1, wsPc['!autofilter']]);

console.log('--- Plan_SKU ---');
const sk = aoa('Plan_SKU');
const td = sk[1];
check('5 cột đầu: Kênh, Mã, Tên SKU, Category, Đơn giá (VNĐ)', td.slice(0, 5).join('|') === 'Kênh|Mã SKU|Tên SKU|Category|Đơn giá (VNĐ)', td.slice(0, 5));
check('khối kế hoạch: Năm (SL, DT) + 12 tháng × (SL, DT) = 26 cột; một cột trống; khối năm hiện tại 26 cột không lặp 5 cột đầu; tổng 5 + 26 + 1 + 26 = 58 cột', td.length === 58 && td[5] === 'SL KH 2027 Năm' && td[6] === 'DT KH 2027 Năm' && td[7] === 'SL KH 2027 T1' && td[8] === 'DT KH 2027 T1' && td[29] === 'SL KH 2027 T12' && td[30] === 'DT KH 2027 T12' &&
  td[31] === '' && td[32] === 'SL 2026 (dự kiến) Năm' && td[33] === 'DT 2026 (dự kiến) Năm' && td[57] === 'DT 2026 (dự kiến) T12', [td.length, td[31], td[32], td[57]]);
const r1001 = sk.find((r) => r[1] === '1001'), r2002 = sk.find((r) => r[1] === '2002');
check('gom theo SKU (cộng mọi khách): 1001 = 2 khách; tên + category lấy từ danh mục; kênh = tên đơn vị', r1001[0] === 'OEM Nội địa' && r1001[2] === 'Máy lọc 1001' && r1001[3] === 'RO Machine' && r2002[3] === 'Filter' && sk.length === 4, sk.map((r) => r[1]));
const q1001Plan = 12 * (20 + 10), rev1001Plan = 12 * (20 * 10e6 + 10 * 12e6);
check('SL + DT kế hoạch NĂM và THÁNG đúng; đơn giá = bình quân gia quyền theo SL (1001: 2 khách giá 10tr và 12tr)', r1001[5] === q1001Plan && r1001[6] === rev1001Plan && r1001[7] === 30 && r1001[8] === 20 * 10e6 + 10 * 12e6 && r1001[4] === Math.round(rev1001Plan / q1001Plan), r1001.slice(0, 10));
const q1001Base = 12 * (10 + 5), rev1001Base = 12 * (10 * 10e6 + 5 * 12e6);
check('khối bên phải (sau 1 cột trống) là năm hiện tại: SL + DT cơ sở', r1001[31] === '' && r1001[32] === q1001Base && r1001[33] === rev1001Base && r1001[34] === 15, r1001.slice(31, 36));
check('dòng TỔNG đầu bảng = tổng mọi SKU (SL + DT, cả hai khối); đơn giá không cộng', sk[0][0] === 'TỔNG' && sk[0][6] === sk[2][6] + sk[3][6] && sk[0][33] === sk[2][33] + sk[3][33] && sk[0][32] === sk[2][32] + sk[3][32] && sk[0][4] === '', [sk[0].slice(0, 8)]);
const wsSku = rd.Sheets['Plan_SKU'];
check('SUBTOTAL theo cột + bộ lọc bao hết bảng; cột phân cách không có công thức', wsSku.G1.f === 'SUBTOTAL(109,G3:G4)' && wsSku['!autofilter'].ref === 'A2:BF4' && !(wsSku.AF1 && wsSku.AF1.f), [wsSku.G1, wsSku['!autofilter']]);

console.log('--- mỗi SKU đúng một dòng ---');
{
  // cùng một SKU ở 4 khách (mã lệch khoảng trắng / hoa thường) + 1 SKU khác + SKU mã tạm trùng nhau ở 2 khách
  const mk = (ck, ma, gia, sl) => ({ key: ck + '|' + ma, customerKey: ck, skuCode: ma, tempSkuId: '', skuName: 'Máy ' + ma.trim(), priceVnd: gia, qtyBase: new Array(12).fill(sl), qty: new Array(12).fill(sl * 2), khoa: [] });
  const tam = (ck) => ({ key: ck + '|NEW-9', customerKey: ck, skuCode: '', tempSkuId: 'NEW-9', skuName: 'Máy mới', priceVnd: 3000000, qtyBase: new Array(12).fill(0), qty: new Array(12).fill(10), khoa: [] });
  const s2 = { ...st, customers: ['K1', 'K2', 'K3', 'K4'].map((k) => ({ key: k, name: k })), lines: [mk('K1', '1001', 10e6, 10), mk('K2', '1001 ', 10e6, 20), mk('K3', ' 1001', 12e6, 30), mk('K4', '1001', 10e6, 40), mk('K1', '2002', 1e6, 5), tam('K1'), tam('K2')], removedLines: [] };
  const dong = X.dongSku(s2, donVi, {});
  const maSku = dong.map((r) => r[1]);
  check('mỗi SKU đúng MỘT dòng dù nằm ở nhiều khách / mã lệch khoảng trắng: 3 dòng (1001, 2002, NEW-9)', dong.length === 3 && new Set(maSku.map((x) => String(x).trim().toLowerCase())).size === 3, maSku);
  const d1001 = dong.find((r) => r[1] === '1001');
  check('dòng gộp cộng đủ cả 4 khách: SL kế hoạch năm = 12 × 2 × (10+20+30+40) = 2.400; DT = Σ SL × giá từng khách; đơn giá = bình quân gia quyền', d1001[5] === 2400 && d1001[6] === 12 * 2 * (10 * 10e6 + 20 * 10e6 + 30 * 12e6 + 40 * 10e6) && d1001[4] === Math.round(d1001[6] / d1001[5]), d1001.slice(0, 8));
  check('SKU mã tạm ở 2 khách cũng gộp một dòng (SL 12 × 20 = 240)', dong.find((r) => r[1] === 'NEW-9')[5] === 240);
  const bangTong = X.taoWorkbook({ state: s2, donVi, year: 2027, info: {}, skuInfo: {} });
  const sk4 = XLSX.utils.sheet_to_json(bangTong.Sheets.Plan_SKU, { header: 1, defval: '' }).slice(2);
  check('trong file: cột Mã SKU không trùng nhau; tổng SL năm ở dòng TỔNG = tổng các dòng SKU', new Set(sk4.map((r) => r[1])).size === sk4.length && XLSX.utils.sheet_to_json(bangTong.Sheets.Plan_SKU, { header: 1, defval: '' })[0][5] === sk4.reduce((s, r) => s + r[5], 0));
}

console.log('--- ca biên ---');
const brand = { ...st, customers: [], lines: st.lines.map((l) => ({ ...l, customerKey: '', key: '|' + l.skuCode })).slice(0, 2) };
const wb2 = X.taoWorkbook({ state: brand, donVi: { code: 'GT2', name: 'Kênh GT2', source: 'fc', single: true }, year: 2027, info: {}, skuInfo: {} });
const pc2 = XLSX.utils.sheet_to_json(wb2.Sheets.Plan_Per_Client, { header: 1, defval: '' });
check('đơn vị một khách (Brand): một dòng cho cả đơn vị, sale trống', pc2.length === 3 && pc2[2][0] === 'GT2' && pc2[2][1] === 'Kênh GT2' && pc2[2][2] === '' && pc2[2][4] === pc2[0][4], pc2);
const trong = { ...st, customers: [], lines: [] };
check('kế hoạch rỗng vẫn xuất được (không lỗi)', (() => { try { XLSX.write(X.taoWorkbook({ state: trong, donVi, year: 2027, info: {}, skuInfo: {} }), { type: 'buffer', bookType: 'xlsx' }); return true; } catch (e) { return e.message; } })());
const tam = { ...st, customers: [{ key: 'NEW:Z', name: 'Z' }], lines: [{ key: 'NEW:Z|T1', customerKey: 'NEW:Z', skuCode: '', tempSkuId: 'NEW-1', skuName: 'Máy mới', priceVnd: 5000000, qtyBase: new Array(12).fill(0), qty: new Array(12).fill(10), khoa: [] }] };
const sk3 = XLSX.utils.sheet_to_json(X.taoWorkbook({ state: tam, donVi, year: 2027, info: {}, skuInfo: {} }).Sheets.Plan_SKU, { header: 1, defval: '' });
check('SKU mã tạm: dùng mã tạm làm mã, tên nhập tay', sk3[2][1] === 'NEW-1' && sk3[2][2] === 'Máy mới' && sk3[2][4] === 5000000, sk3[2].slice(0, 6));
check('tên file: đơn vị + năm + trạng thái + ngày', X.tenFile({ code: 'KRF-PHIL' }, 2027, 'submitted', new Date(2026, 9, 6)) === 'KeHoachNam_KRF-PHIL_2027_cho-duyet_20261006.xlsx');
check('không sửa đầu vào', JSON.stringify(st) === JSON.stringify(taoState()));

console.log('--- tải lên bảng doanh thu khách (đọc lại file vừa xuất) ---');
{
  const pcRows = XLSX.utils.sheet_to_json(rd.Sheets.Plan_Per_Client, { header: 1, defval: null, raw: true });
  const dd = X.docBangPerClient(pcRows);
  check('đọc lại tab Plan_Per_Client: bỏ dòng TỔNG, 2 khách, 12 tháng đúng số xuất', !dd.loi && dd.dong.length === 2 && dd.dong[0].ma === 'ALPHA' && dd.dong[0].thang.length === 12 && dd.dong[0].thang[0] === pc[2][5] && dd.dong[1].thang[11] === pc[3][16], dd);
  const kh = X.khopBangVoiKhach(dd.dong, st, info, 'oem');
  check('ghép khách theo Mã khách (OEM: Search Code): 2 khách khớp, không dòng lạ', kh.bang.size === 2 && kh.bang.has('OEM:ALPHA') && kh.bang.has('OEM:BETA') && !kh.khongKhop.length, kh);
  const lan = X.khopBangVoiKhach([{ ma: 'zzz', ten: 'Alpha Co', thang: [1] }, { ma: ' alpha ', ten: '', thang: [2] }, { ma: 'KHONGCO', ten: '', thang: [3] }], st, info, 'oem');
  check('khớp theo tên khi mã lạ; mã không phân biệt hoa thường / khoảng trắng; khách lạ vào khongKhop; khách lặp vào trung', lan.bang.get('OEM:ALPHA')[0] === 2 && lan.khongKhop.length === 1 && lan.khongKhop[0].ma === 'KHONGCO' && lan.trung.length === 1, lan);
  const xk = X.khopBangVoiKhach([{ ma: 'C001', ten: 'x', thang: [5] }], { customers: [{ key: 'XK:Brafco', name: 'Brafco' }, { key: 'XK:Other', name: 'Other' }] }, { 'XK:Brafco': { code: 'C001' }, 'XK:Other': { code: 'C001' } }, 'export');
  check('mã trùng nhiều khách -> không khớp (không ghi nhầm)', xk.bang.size === 0 && xk.khongKhop.length === 1);
  check('số từ ô: 1.234.567 / 1,234,567.5 / 1234567,5 / rỗng / chữ', X.soTuO('1.234.567') === 1234567 && X.soTuO('1,234,567.5') === 1234567.5 && X.soTuO('1234567,5') === 1234567.5 && X.soTuO('') === null && X.soTuO('abc') === null && X.soTuO(7) === 7);
  check('file không đúng định dạng -> thông báo lỗi', /Mã khách/.test(X.docBangPerClient([['a', 'b']]).loi) && /DT KH/.test(X.docBangPerClient([['Mã khách', 'Tên khách']]).loi));
}

console.log('\n' + pass + ' đạt, ' + fail + ' lỗi');
process.exit(fail ? 1 : 0);
