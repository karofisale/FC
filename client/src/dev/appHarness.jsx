/**
 * appHarness.jsx — CHỈ DEV. Chạy toàn bộ App với "máy chủ giả" (thay window.fetch) để thử giao diện trong trình duyệt mà không cần
 * đăng nhập production: ngăn kéo menu điện thoại, hộp đăng nhập lại khi hết phiên, Phê duyệt tách nhóm, Tổng quan + biểu đồ lười,
 * Forecast 4 tháng / Chia tuần & miền / Thực hiện... Mở /app-harness.html?role=central_admin (hoặc bu_approver, bu_editor, viewer).
 *
 * Phiên giả chỉ là một chuỗi token vô nghĩa trong localStorage của trang dev (không có thông tin đăng nhập thật nào ở đây).
 * Hết phiên: __harness.expire() trong Console; hộp đăng nhập lại chấp nhận mọi PIN ở trang này.
 */
import { vnMonth, vnToday } from '../utils/period';

const q = new URLSearchParams(window.location.search);
const ROLE = q.get('role') || 'central_admin';
const BU = q.get('bu') || 'OEM';
// ?cu=1: giả lập MÁY CHỦ CŨ chưa có hai action Đợt 4 (countPendingApprovals, listPendingAnnualPlans) — để thử đường dự phòng của client mới.
const MAY_CHU_CU = q.get('cu') === '1';

const BUS = [{ code: 'OEM', name: 'Domestic OEM' }, { code: 'XK', name: 'Xuất khẩu' }, { code: 'GT2', name: 'Kênh GT2' }];
const REGIONS = [{ code: 'MB', name: 'Miền Bắc' }, { code: 'MN', name: 'Miền Nam' }];
const GROUPS = [{ code: 'NHOM_1', name: 'Máy TCM sx' }, { code: 'NHOM_2', name: 'Máy nhập khẩu' }, { code: 'NHOM_3', name: 'Mockup' }, { code: 'NHOM_4', name: 'Lõi' }];
// ?uid=<mã>: đổi người dùng giả (thử cài đặt theo từng người trên cùng một trình duyệt).
// ?prefs=off: giả lập máy chủ CHƯA có bảng cài đặt (getMyPrefs / setMyPrefs trả lỗi) — thử đường thất bại nhẹ nhàng.
// ?prefs=slow: getMyPrefs trả lời sau 6 giây (quá hạn chờ của App).
// ?sys=off: giả lập máy chủ CHƯA chạy SQL đợt 8 (getSystemSettings trả tableMissing, getSystemValues báo lỗi, setSystemSetting từ chối).
// ?sys=err: getSystemValues + getSystemSettings đều trả lỗi. ?sys=ok (mặc định): cài đặt hệ thống chạy đủ (có đồ thị ngày hiệu lực + lịch sử).
const SYS_MODE = q.get('sys') || 'ok';
const UID = q.get('uid') || 'harness';
const PREFS_MODE = q.get('prefs') || 'on';
const USER = { id: UID, full_name: 'Người thử (giả)', email: '', role: ROLE, business_unit_code: BU };

const CO_SO = '2026-10-01';
const THANG = ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01'];
const SKUS = Array.from({ length: 40 }, (_, i) => {
  const g = GROUPS[i % 4];
  return { sku_code: String(1001000000 + i * 7), name: (g.code === 'NHOM_4' ? 'Lõi lọc số ' : 'Máy lọc nước RO-') + (100 + i), product_group_code: g.code, product_group_name: g.name, avg_price: 1200000 + i * 150000, default_channel: BU };
});
let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const cycles = [
  { id: 'c1', business_unit_code: BU, base_month: CO_SO, horizon_months: 4, status: 'submitted' },
  { id: 'c0', business_unit_code: BU, base_month: '2026-09-01', horizon_months: 4, status: 'approved' }
];
const versions = [{ id: 'v1', cycle_id: 'c1', update_week: 41, iso_week_label: 'Tuần 41 (W41)', is_final: '1' }];
const monthly = {};            // `${sku}_${thang}` -> qty
SKUS.forEach((p, i) => THANG.forEach((m) => { monthly[`${p.sku_code}_${m}`] = i < 32 ? Math.round((20 + rnd() * 180) / 10) * 10 : 0; }));
const weekly = {};             // `${sku}_${tuan}_${mien}` -> qty
SKUS.forEach((p, i) => {
  const t = monthly[`${p.sku_code}_${THANG[0]}`] || 0;
  if (!t) return;
  const ods = [1, 2, 3, 4, 5].flatMap((w) => REGIONS.map((r) => `${p.sku_code}_${w}_${r.code}`));
  const moi = Math.floor(t / ods.length);
  ods.forEach((k, j) => { weekly[k] = j === ods.length - 1 ? t - moi * (ods.length - 1) : moi; });
  if (i % 5 === 2) weekly[ods[0]] += 10;          // vài dòng LỆCH để thử "chỉ dòng lệch" / "rải đều tất cả dòng lệch"
});
const actuals = {};
SKUS.slice(0, 30).forEach((p, i) => { actuals[p.sku_code] = Math.round((10 + rnd() * 150) / 5) * 5 + (i === 3 ? 0 : 0); });

const approvals = [
  { id: 'a1', business_unit_code: 'OEM', business_unit_name: 'Domestic OEM', base_month: '2026-10-01', update_week: 41, status: 'pending', version_id: 'v1', requested_at: '2026-10-09T08:15:00Z', requested_by_name: 'Lập kế hoạch OEM' },
  { id: 'a2', business_unit_code: 'XK', business_unit_name: 'Xuất khẩu', base_month: '2026-10-01', update_week: 41, status: 'pending', version_id: 'v2', requested_at: '2026-10-08T02:00:00Z', requested_by_name: 'Lập kế hoạch XK' },
  { id: 'a3', business_unit_code: 'OEM', business_unit_name: 'Domestic OEM', base_month: '2026-09-01', update_week: 37, status: 'approved', version_id: 'v0', requested_at: '2026-09-04T02:00:00Z', decided_at: '2026-09-05T03:00:00Z', approver_name: 'Thẩm định A', comment: 'OK' },
  { id: 'a4', business_unit_code: 'GT2', business_unit_name: 'Kênh GT2', base_month: '2026-09-01', update_week: 36, status: 'rejected', version_id: 'v3', requested_at: '2026-09-01T02:00:00Z', decided_at: '2026-09-02T03:00:00Z', approver_name: 'Thẩm định A', comment: 'Thiếu số tháng 12' },
  { id: 'a5', business_unit_code: 'OEM', business_unit_name: 'Domestic OEM', base_month: '2026-08-01', update_week: 33, status: 'superseded', version_id: 'v4', requested_at: '2026-08-04T02:00:00Z', decided_at: '2026-08-04T09:00:00Z' }
];
const tongHop = () => ({
  currentTotal: 5400, previousTotal: 5100, previousVersionLabel: 'bản trước', months: THANG,
  byGroup: GROUPS.map((g, i) => ({ product_group_code: g.code, product_group_name: g.name, months: Object.fromEntries(THANG.map((m, j) => [m, 100 * (i + 1) + j * 10])), total: 400 * (i + 1) + 60 }))
});
const keHoachNam = [
  { id: 'ap1', year: 2027, kind: 'base', revisionNo: 1, status: 'submitted', createdBy: 'ketoan', updatedAt: '2026-10-08T02:00:00Z', submittedAt: '2026-10-08T02:00:00Z' },
  { id: 'ap2', year: 2026, kind: 'base', revisionNo: 1, status: 'approved', createdBy: 'ketoan', updatedAt: '2025-10-08T02:00:00Z' }
];

const trangThai = { hetPhien: false, soLanGoi: 0, nhatKy: [], quyetDinh: [], prefsGoi: [], taoChuKy: [], sysGoi: [] };

// ----- Cài đặt hệ thống giả: hai cài đặt (một số nguyên, một phần trăm) để thử hiển thị tổng quát, ngày hiệu lực, lịch sử -----
const HOM_NAY = vnToday();
const SYS_DEF = [
  { khoa: 'fc.horizonMonths', nhom: 'Chu kỳ forecast', nhan: 'Số tháng của chu kỳ mới', ghiChu: 'Chu kỳ tạo SAU khi cài đặt có hiệu lực sẽ gồm chừng này tháng. Chu kỳ đã tạo giữ nguyên.', kieu: 'integer', min: 1, max: 12, buoc: 1, donVi: 'tháng', fmt: '', macDinh: 4 },
  { khoa: 'fc.canhBaoLech', nhom: 'Ngưỡng cảnh báo', nhan: 'Ngưỡng cảnh báo lệch forecast', ghiChu: 'Cảnh báo khi số thực hiện lệch forecast quá ngưỡng này (cài đặt thử của trang thử, hiển thị dạng phần trăm).', kieu: 'number', min: 0, max: 0.5, buoc: 0.01, donVi: '%', fmt: 'percent', macDinh: 0.15 }
];
const sysLichSu = { 'fc.horizonMonths': [], 'fc.canhBaoLech': [
  { giaTri: 0.2, hieuLucTu: '2026-09-01', nguoiSua: 'Nguyễn Văn Quản', ghiChu: 'Nới ngưỡng tháng 9', lucSua: '2026-08-30T03:00:00Z' },
  { giaTri: 0.125, hieuLucTu: '2026-10-01', nguoiSua: 'Nguyễn Văn Quản', ghiChu: '', lucSua: '2026-09-30T03:00:00Z' }
] };
const sysHieuLuc = (s) => {
  const ds = sysLichSu[s.khoa].filter((x) => x.hieuLucTu <= HOM_NAY).sort((a, b) => (a.hieuLucTu + a.lucSua).localeCompare(b.hieuLucTu + b.lucSua));
  const x = ds[ds.length - 1];
  return x ? { giaTri: x.giaTri === null ? s.macDinh : x.giaTri, daDat: x.giaTri !== null, hieuLucTu: x.hieuLucTu } : { giaTri: s.macDinh, daDat: false, hieuLucTu: null };
};
const sysTraCuu = () => ({
  app: 'fc', canEdit: SYS_MODE !== 'off', today: HOM_NAY, tableMissing: SYS_MODE === 'off',
  settings: SYS_DEF.map((s) => { const h = sysHieuLuc(s); return { ...s, giaTri: h.giaTri, daDat: h.daDat, hieuLucTu: h.hieuLucTu, choHieuLuc: sysLichSu[s.khoa].filter((x) => x.hieuLucTu > HOM_NAY), lichSu: sysLichSu[s.khoa] }; })
});
const sysGhi = (p) => {
  const s = SYS_DEF.find((x) => x.khoa === p.khoa);
  if (!s) return { error: 'Không có cài đặt "' + p.khoa + '".' };
  const ngay = p.hieuLucTu || HOM_NAY;
  if (ngay < HOM_NAY) return { error: 'Ngày hiệu lực không được trước hôm nay.' };
  if (p.giaTri !== null) {
    if (typeof p.giaTri !== 'number' || p.giaTri < s.min || p.giaTri > s.max) return { error: 'Giá trị "' + s.nhan + '" phải nằm trong khoảng cho phép (máy chủ từ chối).' };
    if (s.kieu === 'integer' && !Number.isInteger(p.giaTri)) return { error: 'Giá trị phải là số nguyên.' };
  }
  sysLichSu[s.khoa].push({ giaTri: p.giaTri, hieuLucTu: ngay, nguoiSua: USER.full_name, ghiChu: p.ghiChu || '', lucSua: new Date().toISOString() });
  return { ok: true, khoa: p.khoa, hieuLucTu: ngay };
};
// "Máy chủ" giữ cài đặt cá nhân trong localStorage của trang thử, theo uid — tải lại trang / mở uid khác để thử đa thiết bị.
const KHO_PREFS = '__harness_srv_prefs:' + UID;
const docKhoPrefs = () => { try { return JSON.parse(localStorage.getItem(KHO_PREFS) || '{}'); } catch { return {}; } };
const ghiKhoPrefs = (o) => { try { localStorage.setItem(KHO_PREFS, JSON.stringify(o)); } catch { /* kệ */ } };
const ketQua = (action, p) => {
  switch (action) {
    case 'login': trangThai.hetPhien = false; return { token: 'token-thu-' + Date.now(), user: USER, expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString() };
    case 'logout': return { ok: true };
    case 'getMyPrefs': return PREFS_MODE === 'off' ? { error: 'relation "fc_user_prefs" does not exist' } : { prefs: docKhoPrefs() };
    case 'setMyPrefs': {
      if (PREFS_MODE === 'off') return { error: 'relation "fc_user_prefs" does not exist' };
      const kho = docKhoPrefs();
      Object.entries(p.changes || {}).forEach(([k, v]) => { if (v === null) delete kho[k]; else kho[k] = v; });
      ghiKhoPrefs(kho);
      trangThai.prefsGoi.push(p.changes);
      return { ok: true };
    }
    case 'getSystemValues': {
      if (SYS_MODE !== 'ok') return { error: 'relation "fc_system_settings" does not exist' };
      return { values: Object.fromEntries(SYS_DEF.map((s) => [s.khoa, sysHieuLuc(s).giaTri]).filter(([k]) => k === 'fc.horizonMonths')) };
    }
    case 'getSystemSettings':
      if (ROLE !== 'central_admin') return { error: 'Chỉ master mới xem được cài đặt hệ thống.' };
      if (SYS_MODE === 'err') return { error: 'Không đọc được cài đặt hệ thống (giả lập lỗi).' };
      return sysTraCuu();
    case 'setSystemSetting':
      trangThai.sysGoi.push(p);
      if (ROLE !== 'central_admin') return { error: 'Chỉ master mới sửa được cài đặt hệ thống.' };
      if (SYS_MODE === 'off') return { error: 'Chưa chạy SQL đợt 8 — chưa lưu được cài đặt hệ thống.' };
      return sysGhi(p);
    case 'createCycle': {
      trangThai.taoChuKy.push(p);
      const hz = p.horizonMonths !== undefined ? p.horizonMonths : (SYS_MODE === 'ok' ? sysHieuLuc(SYS_DEF[0]).giaTri : 4);
      const c = { id: 'c' + (cycles.length + 10), business_unit_code: p.businessUnitCode, base_month: p.baseMonth, horizon_months: hz, status: 'draft' };
      return { cycle: c, initialVersionId: 'v1' };
    }
    case 'getBootstrap': return { businessUnits: BUS, regions: REGIONS, productGroups: GROUPS, user: USER };
    case 'getApprovals': return approvals.filter((a) => !p.status || a.status === p.status);
    case 'countPendingApprovals': return MAY_CHU_CU ? { error: 'Action chưa được cài đặt: ' + action }
      : { count: approvals.filter((a) => a.status === 'pending' && (ROLE === 'central_admin' || ROLE === 'viewer' || a.business_unit_code === BU)).length };
    case 'listPendingAnnualPlans': {
      if (MAY_CHU_CU) return { error: 'Action chưa được cài đặt: ' + action };
      if (ROLE !== 'central_admin' && ROLE !== 'bu_approver') return { error: 'FORBIDDEN: Vai trò "' + ROLE + '" không được phép thực hiện thao tác này.' };
      const tat = [
        { id: 'ap1', businessUnitCode: 'OEM', unitName: 'Domestic OEM', year: 2027, kind: 'base', revisionNo: 1, status: 'submitted', submittedBy: 'ketoan', submittedAt: '2026-10-08T02:00:00Z', createdBy: 'ketoan', updatedAt: '2026-10-08T02:00:00Z', totalRevenueVnd: 128_400_000_000 },
        { id: 'ap9', businessUnitCode: 'XK', unitName: 'Export OEM', year: 2027, kind: 'base', revisionNo: 2, status: 'submitted', submittedBy: 'ketoan', submittedAt: '2026-10-09T02:00:00Z', createdBy: 'ketoan', updatedAt: '2026-10-09T02:00:00Z', totalRevenueVnd: 0 }
      ];
      return { plans: tat.filter((x) => ROLE === 'central_admin' || x.businessUnitCode === BU) };
    }
    case 'getApprovalsWorkspace': return { approvals, summary: tongHop() };
    case 'getVersionSummary': return tongHop();
    case 'decideApproval': { const a = approvals.find((x) => x.id === p.approvalId); if (a) { a.status = p.decision; a.decided_at = new Date().toISOString(); a.comment = p.comment; } trangThai.quyetDinh.push({ id: p.approvalId, decision: p.decision, comment: p.comment }); return { ok: true }; }
    case 'getDashboardWorkspace': return {
      productCount: SKUS.length, cycle: cycles[0], cycles,
      b0Summary: GROUPS.flatMap((g, i) => THANG.map((m, j) => ({ business_unit_code: BU, business_unit_name: BUS.find((b) => b.code === BU)?.name, product_group_code: g.code, product_group_name: g.name, forecast_month: m, total_quantity: 300 + i * 120 + j * 40, total_revenue: (300 + i * 120 + j * 40) * (9_500_000 + i * 1_700_000) })))
    };
    case 'getMonthlyWorkspace': return { cycles, products: SKUS, cycle: cycles[0], versions, version: versions[0], lines: Object.entries(monthly).map(([k, v]) => ({ sku_code: k.slice(0, k.lastIndexOf('_')), forecast_month: k.slice(k.lastIndexOf('_') + 1), quantity: v })) };
    case 'getWeeklyWorkspace': return {
      cycles, products: SKUS, regions: REGIONS, cycle: cycles[0], versions, version: versions[0],
      monthlyQuantities: Object.fromEntries(SKUS.map((s) => [s.sku_code, monthly[`${s.sku_code}_${THANG[0]}`] || 0]).filter(([, v]) => v > 0)),
      splits: Object.entries(weekly).map(([k, v]) => { const a = k.split('_'); return { sku_code: a[0], week_number: Number(a[1]), region_code: a[2], quantity: v }; }),
      validation: { isValid: false, mismatchesCount: 6, mismatches: [] }
    };
    case 'validateWeekly': return { isValid: false, mismatchesCount: 6, mismatches: [] };
    case 'saveMonthlyLines': case 'saveWeeklySplits': return { message: 'Đã lưu (giả).' };
    case 'submitCycle': return { message: 'Đã gửi duyệt (giả).' };
    case 'getActualsWorkspace': {
      const tongFc = 5200, tongTh = Object.values(actuals).reduce((s, v) => s + v, 0);
      return {
        products: SKUS.filter((p) => actuals[p.sku_code] !== undefined), regionCode: 'TQ', legacyRegions: [], fallbackMonths: [], sapSoldTo: '*', sapVkorg: '0400', sapVtweg: '01', totals: { ...actuals },
        comparison: { cycleFound: true, leadMonths: 0, cycleBaseMonth: '2026-09-01', versionBasis: 'approved', totalForecast: tongFc, totalActual: tongTh, totalVariance: tongTh - tongFc, totalVariancePct: Math.round((tongTh - tongFc) / tongFc * 1000) / 10, rows: SKUS.slice(0, 12).map((s, i) => ({ sku_code: s.sku_code, product_name: s.name, forecast_qty: 100 + i, actual_qty: 90 + i * 2, variance_qty: -10 + i, variance_pct: -9 + i })) }
      };
    }
    // Doanh thu thuần theo tháng (Đợt 12). ?rev=off: máy chủ CHƯA chạy SQL đợt 12 (missing). ?rev=err: lỗi.
    case 'getActualRevenue': {
      const REV = q.get('rev') || 'ok';
      if (REV === 'off') return { rows: [], months: [], missing: true };
      if (REV === 'err') throw new Error('Máy chủ doanh thu đang bận (giả).');
      const kyTu = String(p.from || '2000-01'), kyDen = String(p.to || '2999-12');
      const SKU = [['1001040834', 'Máy RO Karofi KAQ-GZ', 2471000], ['2003000001', 'Lõi lọc PP', 95000], ['1008040001', 'Hàng tặng', 0]];
      const thang = [];
      const dem = (y, m) => (y === 2025 ? [6, 7, 12] : [1, 3, 4, 6, 7, 8, 9]).includes(m);
      [2025, 2026].forEach((y) => { for (let m = 1; m <= 12; m++) { if (!dem(y, m)) continue;
        const k = y + '-' + String(m).padStart(2, '0'); if (k < kyTu || k > kyDen) continue;
        const sl = m === 6 && y === 2026 ? -1 : 10 + m * 3;
        thang.push({ bu: p.bu || 'GT2', month: k + '-01', netRevenueVnd: m === 1 && y === 2026 ? 0 : (m === 6 && y === 2026 ? -1248148 : sl * 2471000 * (y === 2025 ? 0.8 : 1)), quantity: sl, skus: 3, importedAt: new Date().toISOString() }); } });
      const rows = [];
      if (p.detail) thang.forEach((t) => SKU.forEach(([c, n, g], i) => rows.push({ bu: t.bu, month: t.month, skuCode: c, skuName: n, quantity: Math.round(t.quantity / (i + 1)), netRevenueVnd: Math.round(t.netRevenueVnd * [0.7, 0.3, 0][i]), invoiceLines: i + 1 })));
      return { missing: false, months: thang, rows };
    }
    case 'getFcVsActual': return { cycleFound: false };
    case 'saveActuals': (p.rows || []).forEach((r) => { actuals[r.skuCode] = r.quantity; }); return { message: `Đã lưu ${(p.rows || []).length} dòng (giả).` };
    case 'getNhipTim': return { nhipTim: [] };
    case 'listAnnualPlans': return { plans: p.bu === 'OEM' ? keHoachNam : (p.bu === 'XK' ? [{ id: 'ap9', year: 2027, kind: 'base', revisionNo: 2, status: 'submitted', createdBy: 'ketoan', updatedAt: '2026-10-09T02:00:00Z', submittedAt: '2026-10-09T02:00:00Z' }] : []) };
    case 'getFcReportExport': case 'getSapExport': return { rows: [], businessUnits: [], reportChannels: [], missingApproval: ['XK'], buChannels: {}, baseMonth: p.baseMonth };
    case 'getProducts': return SKUS;
    case 'getVersions': return versions;
    default: return { error: 'Hành động chưa giả lập trong trang thử: ' + action };
  }
};

const fetchGoc = window.fetch.bind(window);
window.fetch = async (url, init) => {
  if (!String(url).includes('functions/v1/fc-api')) return fetchGoc(url, init);
  const body = JSON.parse(init.body);
  trangThai.soLanGoi += 1;
  trangThai.nhatKy.push(body.action);
  await new Promise((r) => setTimeout(r, body.action === 'getMyPrefs' && PREFS_MODE === 'slow' ? 6000 : 60));
  const { action, ...p } = body;
  const out = action !== 'login' && trangThai.hetPhien
    ? { error: 'UNAUTHORIZED: Phiên đăng nhập đã hết hạn (giả lập).' }
    : ketQua(action, p);
  return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

import * as prefsSync from '../services/prefsSync';
import * as prefs from '../services/prefs';
window.__harness = { trangThai, expire: () => { trangThai.hetPhien = true; }, thang: vnMonth(), prefsSync, prefs };

// Phiên giả — phải có TRƯỚC khi nạp App (auth.js đọc localStorage lúc nạp module).
try {
  localStorage.setItem('karofi_fc_session', JSON.stringify({ token: 'token-thu', user: USER, expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString() }));
  localStorage.removeItem('karofi.session');
} catch { /* trình duyệt chặn localStorage: trang thử không chạy được, kệ */ }

const [{ StrictMode }, { createRoot }] = await Promise.all([import('react'), import('react-dom/client')]);
await import('../index.css');
const { default: App } = await import('../App');
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
