/**
 * annualHarness.jsx — CHỈ DEV. Dựng trang Kế hoạch năm với "máy chủ giả" trong bộ nhớ (dùng đúng bộ máy tính của app),
 * để thử giao diện không cần đăng nhập production. Mở /annual-harness.html?role=bu_editor (hoặc bu_approver, central_admin, viewer; &single=1).
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import AnnualPlan from '../pages/AnnualPlan';
import { api } from '../services/api';
import * as E from '../utils/annualPlanEngine';

const q = new URLSearchParams(window.location.search);
const ROLE = q.get('role') || 'central_admin';
const SINGLE = q.get('single') === '1';
const YEAR = new Date().getFullYear() + 1;

// ---- dữ liệu lịch sử giả (năm YEAR-1 có T1–T9, YEAR-2 đủ 12 tháng) ----
const KHACH = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA'];
const SKU = [['1001110001', 'Máy lọc RO-104', 9500000], ['1001110002', 'Máy lọc RO-205', 12500000], ['2012010191', 'Màng RO 75GPD', 180000],
  ['2012010192', 'Lõi PP 5 micron', 45000], ['3004010035', 'Bơm tăng áp', 320000], ['3004010049', 'Van điện từ', 95000]];
function rows() {
  const out = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  KHACH.forEach((k, ki) => {
    SKU.forEach((s, si) => {
      if ((ki + si) % 4 === 3) return;
      const heSo = (ki === 0 ? 3 : 1) * (si < 2 ? 1 : 12);
      for (let m = 1; m <= 12; m++) {
        const base = Math.round((20 + rnd() * 60) * heSo);
        out.push({ ckey: SINGLE ? '' : 'OEM:' + k, cname: SINGLE ? '' : 'Khách ' + k, sku: s[0], sname: s[1], y: YEAR - 2, m, qty: base, rev: base * s[2] });
        if (m <= 9) {
          const q2 = Math.round(base * (1.05 + rnd() * 0.2));
          out.push({ ckey: SINGLE ? '' : 'OEM:' + k, cname: SINGLE ? '' : 'Khách ' + k, sku: s[0], sname: s[1], y: YEAR - 1, m, qty: q2, rev: q2 * s[2] });
        }
      }
    });
  });
  return out;
}
const LICH_SU = rows();
const donVi = { code: 'OEM', name: 'Domestic OEM', source: 'oem', single: SINGLE };
const kho = { plans: [], seq: 0 };
const sao = (x) => JSON.parse(JSON.stringify(x));

function dungCoSo() {
  const cs = E.xayDungCoSo(LICH_SU, YEAR);
  const mua = E.tyTrongMuaVu(cs.doanhThuNamTruoc, null);
  return { ...cs, tyTrongMuaVu: mua, soDongLichSu: LICH_SU.length };
}
const tomTat = (p) => ({ id: p.id, year: p.planYear, kind: p.kind, revisionNo: p.revisionNo, status: p.status, parentPlanId: p.parentPlanId || '', targetGrowthPct: p.targetGrowthPct, targetRevenueVnd: p.targetRevenueVnd, createdBy: 'harness', updatedAt: new Date().toISOString() });
const tim = (id) => { const p = kho.plans.find((x) => x.id === id); if (!p) throw new Error('Không tìm thấy kế hoạch ' + id); return p; };
const tre = (v) => new Promise((r) => setTimeout(() => r(v), 80));

api.getAnnualPlanWorkspace = async (p) => {
  const ds = kho.plans.filter((x) => x.planYear === Number(p.year));
  let chon = p.planId ? ds.find((x) => x.id === p.planId) : (ds.find((x) => x.status === 'draft' || x.status === 'submitted') || ds.find((x) => x.status === 'approved') || ds.find((x) => x.status === 'rejected'));
  return tre({ unit: donVi, year: Number(p.year), plans: ds.map(tomTat), plan: chon ? sao(chon) : null, baseline: !chon ? dungCoSo() : null, skuNhom: { [SKU[1][0]]: 'Hàng thanh lý', [SKU[0][0]]: 'Máy lọc' } });
};
api.createAnnualPlan = async (p) => {
  const dangCo = kho.plans.find((x) => x.kind === (p.kind || 'base') && ['draft', 'submitted', 'rejected'].includes(x.status));
  if (dangCo) return tre({ planId: dangCo.id, existed: true, plan: sao(dangCo) });
  const cs = dungCoSo();
  const id = 'AP-H' + (++kho.seq);
  const goc = kho.plans.find((x) => x.status === 'approved' && x.kind !== 'adjust');
  const plan = p.kind === 'adjust' && goc
    ? { ...sao(goc), id, kind: 'adjust', status: 'draft', parentPlanId: goc.id, revisionNo: 1 }
    : { id, businessUnitCode: 'OEM', planYear: Number(p.year), kind: 'base', revisionNo: 1, parentPlanId: '', status: 'draft', targetGrowthPct: null, targetRevenueVnd: null, targetApplied: false,
      baselineLastMonth: cs.lastMonth, shares: cs.tyTrongMuaVu, note: '', decisionComment: '',
      customers: cs.customers.map((c) => ({ key: c.key, name: c.name, market: '', isNew: false })),
      lines: cs.lines.map((l) => ({ key: l.key, customerKey: l.customerKey, skuCode: l.skuCode, tempSkuId: '', skuName: l.skuName, priceVnd: l.priceVnd, qtyBase: l.qtyBase, qty: l.qtyBase.slice(), khoa: new Array(12).fill(false) })), newSkus: [] };
  kho.plans.push(plan);
  return tre({ planId: id, existed: false, plan: sao(plan) });
};
api.saveAnnualPlan = async ({ planId, plan }) => { const p = tim(planId); Object.assign(p, sao(plan), { status: 'draft' }); return tre({ ok: true, planId, canhBao: [] }); };
api.submitAnnualPlan = async ({ planId }) => { const p = tim(planId); p.status = 'submitted'; return tre({ ok: true, planId, canhBao: [] }); };
api.decideAnnualPlan = async ({ planId, decision, comment }) => { const p = tim(planId); p.status = decision; p.decisionComment = comment || ''; return tre({ ok: true, planId, status: decision }); };
api.saveAnnualPlanFinal = async ({ sourcePlanId, plan, reason }) => {
  const id = 'AP-H' + (++kho.seq);
  kho.plans.forEach((x) => { if (x.kind === 'final' && x.status === 'approved') x.status = 'superseded'; });
  const goc = tim(sourcePlanId);
  kho.plans.push({ ...goc, ...sao(plan), id, kind: 'final', status: 'approved', revisionNo: kho.plans.filter((x) => x.kind === 'final').length + 1, parentPlanId: sourcePlanId, decisionComment: reason });
  return tre({ ok: true, planId: id, canhBao: [] });
};

function Khung() {
  const [role, setRole] = useState(ROLE);
  return (
    <div className="p-4 max-w-[1500px] mx-auto">
      <div className="text-[11px] text-slate-500 mb-2 flex items-center gap-2">
        Thử cục bộ{SINGLE ? ' · đơn vị một khách' : ''} — vai trò:
        <select id="harness-role" value={role} onChange={(e) => setRole(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5 bg-white">
          {['bu_editor', 'bu_approver', 'central_admin', 'viewer'].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <AnnualPlan key={role} currentBU="OEM" user={{ role, business_unit_code: 'OEM' }} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><Khung /></StrictMode>);
