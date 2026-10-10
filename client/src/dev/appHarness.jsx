/**
 * appHarness.jsx — CHỈ DEV. Chạy toàn bộ App với "máy chủ giả" (thay window.fetch) để thử giao diện trong trình duyệt mà không cần
 * đăng nhập production: ngăn kéo menu điện thoại, hộp đăng nhập lại khi hết phiên, Phê duyệt tách nhóm, Tổng quan + biểu đồ lười,
 * Forecast 4 tháng / Chia tuần & miền / Thực hiện... Mở /app-harness.html?role=central_admin (hoặc bu_approver, bu_editor, viewer).
 *
 * Phiên giả chỉ là một chuỗi token vô nghĩa trong localStorage của trang dev (không có thông tin đăng nhập thật nào ở đây).
 * Hết phiên: __harness.expire() trong Console; hộp đăng nhập lại chấp nhận mọi PIN ở trang này.
 */
import { vnMonth } from '../utils/period';

const q = new URLSearchParams(window.location.search);
const ROLE = q.get('role') || 'central_admin';
const BU = q.get('bu') || 'OEM';

const BUS = [{ code: 'OEM', name: 'Domestic OEM' }, { code: 'XK', name: 'Xuất khẩu' }, { code: 'GT2', name: 'Kênh GT2' }];
const REGIONS = [{ code: 'MB', name: 'Miền Bắc' }, { code: 'MN', name: 'Miền Nam' }];
const GROUPS = [{ code: 'NHOM_1', name: 'Máy TCM sx' }, { code: 'NHOM_2', name: 'Máy nhập khẩu' }, { code: 'NHOM_3', name: 'Mockup' }, { code: 'NHOM_4', name: 'Lõi' }];
const USER = { id: 'harness', full_name: 'Người thử (giả)', email: '', role: ROLE, business_unit_code: BU };

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

const trangThai = { hetPhien: false, soLanGoi: 0, nhatKy: [], quyetDinh: [] };
const ketQua = (action, p) => {
  switch (action) {
    case 'login': trangThai.hetPhien = false; return { token: 'token-thu-' + Date.now(), user: USER, expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString() };
    case 'logout': return { ok: true };
    case 'getBootstrap': return { businessUnits: BUS, regions: REGIONS, productGroups: GROUPS, user: USER };
    case 'getApprovals': return approvals.filter((a) => !p.status || a.status === p.status);
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
  await new Promise((r) => setTimeout(r, 60));
  const { action, ...p } = body;
  const out = action !== 'login' && trangThai.hetPhien
    ? { error: 'UNAUTHORIZED: Phiên đăng nhập đã hết hạn (giả lập).' }
    : ketQua(action, p);
  return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

window.__harness = { trangThai, expire: () => { trangThai.hetPhien = true; }, thang: vnMonth() };

// Phiên giả — phải có TRƯỚC khi nạp App (auth.js đọc localStorage lúc nạp module).
try {
  localStorage.setItem('karofi_fc_session', JSON.stringify({ token: 'token-thu', user: USER, expiresAt: new Date(Date.now() + 12 * 3600e3).toISOString() }));
  localStorage.removeItem('karofi.session');
} catch { /* trình duyệt chặn localStorage: trang thử không chạy được, kệ */ }

const [{ StrictMode }, { createRoot }] = await Promise.all([import('react'), import('react-dom/client')]);
await import('../index.css');
const { default: App } = await import('../App');
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
