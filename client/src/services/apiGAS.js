/**
 * Client API Adapter cho Google Apps Script (GAS) Backend - Giai đoạn 1
 * Kết nối REST API qua GAS Web App Deployment URL
 */

export const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwPwHxjP3VuN5WIWLnhpt0GzeLlOT7pn2oFJkzRRwmlO8c9zjtfvLSQ_o3DwBUwfU7J/exec';

export async function fetchGAS(action, params = {}, postData = null) {
  if (!GAS_WEB_APP_URL) {
    throw new Error('Chưa cấu hình URL Google Apps Script Web App');
  }

  if (postData) {
    // HTTP POST
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...postData })
    });
    return await res.json();
  } else {
    // HTTP GET
    const queryParams = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${GAS_WEB_APP_URL}?${queryParams}`);
    return await res.json();
  }
}

export const apiGAS = {
  getBUs: () => fetchGAS('getBUs'),
  getProducts: (params = {}) => fetchGAS('getProducts', params),
  getCycles: (params = {}) => fetchGAS('getCycles', params),
  getMonthlyLines: (versionId) => fetchGAS('getMonthlyLines', { versionId }),
  getWeeklySplits: (versionId) => fetchGAS('getWeeklySplits', { versionId }),
  getB0Summary: (baseMonth) => fetchGAS('getB0Summary', { baseMonth }),
  getApprovals: () => fetchGAS('getApprovals'),

  saveMonthlyLines: (versionId, lines) => fetchGAS('saveMonthlyLines', {}, { versionId, lines }),
  saveWeeklySplits: (versionId, splits) => fetchGAS('saveWeeklySplits', {}, { versionId, splits }),
  submitCycle: (cycleId, versionId, userId) => fetchGAS('submitCycle', {}, { cycleId, versionId, userId }),
  decideApproval: (approvalId, decision, comment) => fetchGAS('decideApproval', {}, { approvalId, decision, comment })
};
