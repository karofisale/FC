import { 
  initialBUs, 
  initialRegions, 
  initialGroups, 
  initialUsers, 
  initialProducts, 
  generateInitialMockForecast 
} from '../data/seedData';

const API_BASE = '/api';

// Local storage state helpers for standalone/GitHub Pages mode
function getLocalStore(key, defaultVal) {
  try {
    const item = localStorage.getItem(`karofi_fc_${key}`);
    return item ? JSON.parse(item) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setLocalStore(key, val) {
  try {
    localStorage.setItem(`karofi_fc_${key}`, JSON.stringify(val));
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
}

// Initialize local mock store if empty
const mockData = generateInitialMockForecast();
let localCycles = getLocalStore('cycles', mockData.cycles);
let localVersions = getLocalStore('versions', mockData.versions);
let localMonthlyLines = getLocalStore('monthlyLines', mockData.monthlyLines);
let localWeeklySplits = getLocalStore('weeklySplits', mockData.weeklySplits);
let localApprovals = getLocalStore('approvals', mockData.approvals);

export async function fetchJson(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    // Fallback to local data layer for GitHub Pages / static hosting
    return handleLocalFallback(endpoint, options);
  }
}

function handleLocalFallback(endpoint, options = {}) {
  const [path, queryString] = endpoint.split('?');
  const params = new URLSearchParams(queryString || '');

  // Master data
  if (path === '/master/bus') return initialBUs;
  if (path === '/master/regions') return initialRegions;
  if (path === '/master/groups') return initialGroups;
  if (path === '/master/users') return initialUsers;
  if (path === '/master/products') {
    const bu = params.get('bu');
    const group = params.get('group');
    const search = params.get('search');
    let res = initialProducts;
    if (bu) res = res.filter(p => p.default_channel === bu || !p.default_channel);
    if (group) res = res.filter(p => p.product_group_code === group);
    if (search) {
      const s = search.toLowerCase();
      res = res.filter(p => p.sku_code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s));
    }
    return res;
  }

  // Cycles & Versions
  if (path === '/cycles') {
    const bu = params.get('bu');
    let res = localCycles;
    if (bu) res = res.filter(c => c.business_unit_code === bu);
    return res;
  }
  if (path.match(/^\/cycles\/[^\/]+\/versions$/)) {
    const cycleId = path.split('/')[2];
    return localVersions.filter(v => v.cycle_id === cycleId);
  }

  // Monthly Lines (Bảng 0)
  if (path === '/forecast/monthly') {
    const versionId = params.get('versionId');
    return localMonthlyLines.filter(l => l.version_id === versionId);
  }

  if (path === '/forecast/monthly/bulk') {
    const { versionId, lines } = JSON.parse(options.body || '{}');
    const newLines = localMonthlyLines.filter(l => l.version_id !== versionId);
    lines.forEach(l => {
      const prod = initialProducts.find(p => p.sku_code === l.skuCode) || {};
      newLines.push({
        version_id: versionId,
        sku_code: l.skuCode,
        forecast_month: l.forecastMonth,
        quantity: l.quantity,
        product_name: prod.name || l.skuCode,
        product_group_code: prod.product_group_code,
        avg_price: prod.avg_price || 0
      });
    });
    localMonthlyLines = newLines;
    setLocalStore('monthlyLines', localMonthlyLines);
    return { message: 'Updated successfully', count: lines.length };
  }

  // Weekly Splits (Bảng 1)
  if (path === '/forecast/weekly') {
    const versionId = params.get('versionId');
    return localWeeklySplits.filter(w => w.version_id === versionId);
  }

  if (path === '/forecast/weekly/bulk') {
    const { versionId, splits } = JSON.parse(options.body || '{}');
    const newSplits = localWeeklySplits.filter(w => w.version_id !== versionId);
    splits.forEach(s => {
      const prod = initialProducts.find(p => p.sku_code === s.skuCode) || {};
      newSplits.push({
        version_id: versionId,
        sku_code: s.skuCode,
        week_number: s.weekNumber,
        region_code: s.regionCode,
        quantity: s.quantity,
        product_name: prod.name || s.skuCode,
        product_group_code: prod.product_group_code
      });
    });
    localWeeklySplits = newSplits;
    setLocalStore('weeklySplits', localWeeklySplits);
    return { message: 'Updated successfully', count: splits.length };
  }

  if (path === '/forecast/weekly/validate') {
    const versionId = params.get('versionId');
    const version = localVersions.find(v => v.id === versionId) || {};
    const cycle = localCycles.find(c => c.id === version.cycle_id) || {};
    const baseMonth = cycle.base_month || '2026-07-01';

    const mLines = localMonthlyLines.filter(l => l.version_id === versionId && l.forecast_month === baseMonth);
    const wSplits = localWeeklySplits.filter(w => w.version_id === versionId);

    const mismatches = [];
    mLines.forEach(m => {
      const weekSum = wSplits.filter(w => w.sku_code === m.sku_code).reduce((sum, w) => sum + w.quantity, 0);
      if (weekSum !== m.quantity) {
        mismatches.push({
          sku_code: m.sku_code,
          product_name: m.product_name,
          month_qty: m.quantity,
          week_sum: weekSum,
          variance: weekSum - m.quantity
        });
      }
    });

    return {
      isValid: mismatches.length === 0,
      mismatchesCount: mismatches.length,
      mismatches
    };
  }

  // Summaries (B0.SUM & B1.SUM)
  if (path === '/summary/b0') {
    const map = {};
    localMonthlyLines.forEach(l => {
      const prod = initialProducts.find(p => p.sku_code === l.sku_code) || {};
      const bu = prod.default_channel || 'GT2';
      const key = `${bu}_${l.product_group_code || 'NHOM_1'}_${l.forecast_month}`;
      if (!map[key]) {
        map[key] = {
          business_unit_code: bu,
          business_unit_name: bu,
          product_group_code: l.product_group_code || 'NHOM_1',
          product_group_name: l.product_group_name || 'Máy TCM sx',
          forecast_month: l.forecast_month,
          total_quantity: 0,
          total_revenue: 0
        };
      }
      map[key].total_quantity += l.quantity;
      map[key].total_revenue += l.quantity * (l.avg_price || prod.avg_price || 0);
    });
    return Object.values(map);
  }

  // Approvals
  if (path === '/approvals') {
    return localApprovals;
  }

  if (path === '/approvals/submit') {
    const { cycleId, versionId } = JSON.parse(options.body || '{}');
    const cyc = localCycles.find(c => c.id === cycleId);
    if (cyc) cyc.status = 'submitted';
    setLocalStore('cycles', localCycles);
    return { message: 'Submitted successfully' };
  }

  if (path === '/approvals/decide') {
    const { approvalId, decision, comment } = JSON.parse(options.body || '{}');
    const app = localApprovals.find(a => a.id === approvalId);
    if (app) {
      app.status = decision;
      app.comment = comment;
      app.decided_at = new Date().toISOString();
      const cyc = localCycles.find(c => c.id === app.cycle_id);
      if (cyc) cyc.status = decision === 'approved' ? 'approved' : 'rejected';
      setLocalStore('cycles', localCycles);
      setLocalStore('approvals', localApprovals);
    }
    return { message: `Recorded decision: ${decision}` };
  }

  return [];
}

export const api = {
  getBUs: () => fetchJson('/master/bus'),
  getRegions: () => fetchJson('/master/regions'),
  getGroups: () => fetchJson('/master/groups'),
  getProducts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson(`/master/products?${query}`);
  },
  getUsers: () => fetchJson('/master/users'),

  getCycles: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson(`/cycles?${query}`);
  },
  createCycle: (data) => fetchJson('/cycles', { method: 'POST', body: JSON.stringify(data) }),
  getCycleVersions: (cycleId) => fetchJson(`/cycles/${cycleId}/versions`),
  createVersion: (cycleId, data) => fetchJson(`/cycles/${cycleId}/versions`, { method: 'POST', body: JSON.stringify(data) }),

  getMonthlyLines: (versionId) => fetchJson(`/forecast/monthly?versionId=${versionId}`),
  saveMonthlyLines: (versionId, lines) => fetchJson('/forecast/monthly/bulk', {
    method: 'POST',
    body: JSON.stringify({ versionId, lines })
  }),

  getWeeklySplits: (versionId) => fetchJson(`/forecast/weekly?versionId=${versionId}`),
  saveWeeklySplits: (versionId, splits) => fetchJson('/forecast/weekly/bulk', {
    method: 'POST',
    body: JSON.stringify({ versionId, splits })
  }),
  validateWeeklySplits: (versionId) => fetchJson(`/forecast/weekly/validate?versionId=${versionId}`),

  getB0Summary: (baseMonth) => fetchJson(`/summary/b0?baseMonth=${baseMonth}`),
  getB1Summary: (baseMonth) => fetchJson(`/summary/b1?baseMonth=${baseMonth}`),
  getVariance: (cycleId) => fetchJson(`/summary/variance?cycleId=${cycleId}`),

  getApprovals: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson(`/approvals?${query}`);
  },
  submitCycle: (cycleId, versionId, userId) => fetchJson('/approvals/submit', {
    method: 'POST',
    body: JSON.stringify({ cycleId, versionId, userId })
  }),
  decideApproval: (approvalId, decision, comment, userId) => fetchJson('/approvals/decide', {
    method: 'POST',
    body: JSON.stringify({ approvalId, decision, comment, userId })
  })
};
