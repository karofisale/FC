const API_BASE = '/api';

export async function fetchJson(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  // Master Data
  getBUs: () => fetchJson('/master/bus'),
  getRegions: () => fetchJson('/master/regions'),
  getGroups: () => fetchJson('/master/groups'),
  getProducts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson(`/master/products?${query}`);
  },
  getUsers: () => fetchJson('/master/users'),

  // Forecast Cycles
  getCycles: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson(`/cycles?${query}`);
  },
  createCycle: (data) => fetchJson('/cycles', { method: 'POST', body: JSON.stringify(data) }),
  getCycleVersions: (cycleId) => fetchJson(`/cycles/${cycleId}/versions`),
  createVersion: (cycleId, data) => fetchJson(`/cycles/${cycleId}/versions`, { method: 'POST', body: JSON.stringify(data) }),

  // Monthly Forecast (Bảng 0)
  getMonthlyLines: (versionId) => fetchJson(`/forecast/monthly?versionId=${versionId}`),
  saveMonthlyLines: (versionId, lines) => fetchJson('/forecast/monthly/bulk', {
    method: 'POST',
    body: JSON.stringify({ versionId, lines })
  }),

  // Weekly Forecast (Bảng 1)
  getWeeklySplits: (versionId) => fetchJson(`/forecast/weekly?versionId=${versionId}`),
  saveWeeklySplits: (versionId, splits) => fetchJson('/forecast/weekly/bulk', {
    method: 'POST',
    body: JSON.stringify({ versionId, splits })
  }),
  validateWeeklySplits: (versionId) => fetchJson(`/forecast/weekly/validate?versionId=${versionId}`),

  // Summary Reports
  getB0Summary: (baseMonth) => fetchJson(`/summary/b0?baseMonth=${baseMonth}`),
  getB1Summary: (baseMonth) => fetchJson(`/summary/b1?baseMonth=${baseMonth}`),
  getVariance: (cycleId) => fetchJson(`/summary/variance?cycleId=${cycleId}`),

  // Approvals
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
