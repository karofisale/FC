import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import CycleBar from '../components/CycleBar';
import ValidationAlert from '../components/ValidationAlert';
import { Save, Send, Search, CheckCircle2, AlertCircle, Loader2, Wand2 } from 'lucide-react';
import { monthsOfCycle, weeksOfMonth, weekLabel, monthLabel, normalizeMonth } from '../utils/period';
import { setDirty } from '../services/dirtyState';

export default function WeeklyForecast({ currentBU, user }) {
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [products, setProducts] = useState([]);
  const [regions, setRegions] = useState([]);
  const [monthlyMap, setMonthlyMap] = useState({});
  const [weeklyMap, setWeeklyMap] = useState({});
  const [dirtyKeys, setDirtyKeys] = useState(() => new Set());

  // Chặn đổi tab/đổi đơn vị làm mất ô chưa lưu mà không hỏi lại
  useEffect(() => {
    setDirty(dirtyKeys.size > 0, `Bảng Forecast tuần/miền còn ${dirtyKeys.size} ô chưa lưu.`);
    return () => setDirty(false);
  }, [dirtyKeys]);
  const [validationResult, setValidationResult] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const baseMonth = normalizeMonth(selectedCycle?.base_month) || monthsOfCycle(selectedCycle)[0] || '';
  const weeks = baseMonth ? weeksOfMonth(baseMonth) : [];
  const regionCodes = regions.map((r) => r.code);

  const isEditor = user?.role === 'bu_editor' || user?.role === 'central_admin';
  const cycleLocked = selectedCycle?.status === 'approved' || selectedCycle?.status === 'locked';
  const canWrite = isEditor && !!selectedVersion && !cycleLocked;

  const loadForecasts = useCallback(async (versionId, month) => {
    const [mLines, wSplits, valRes] = await Promise.all([
      api.getMonthlyLines(versionId),
      api.getWeeklySplits(versionId),
      api.validateWeeklySplits(versionId)
    ]);

    const mMap = {};
    mLines.forEach((l) => {
      if (normalizeMonth(l.forecast_month) === month) {
        mMap[l.sku_code] = Number(l.quantity) || 0;
      }
    });
    setMonthlyMap(mMap);

    const wMap = {};
    wSplits.forEach((s) => {
      wMap[`${s.sku_code}_${s.week_number}_${s.region_code}`] = Number(s.quantity) || 0;
    });
    setWeeklyMap(wMap);
    setValidationResult(valRes);
    setDirtyKeys(new Set());
  }, []);

  const loadVersions = useCallback(async (cycle, preferVersionId) => {
    const list = await api.getCycleVersions(cycle.id);
    setVersions(list);
    const chosen =
      list.find((v) => v.id === preferVersionId) ||
      list.find((v) => String(v.is_final) === '1') ||
      list[list.length - 1] ||
      null;
    setSelectedVersion(chosen);
    if (chosen) await loadForecasts(chosen.id, normalizeMonth(cycle.base_month));
    else { setWeeklyMap({}); setMonthlyMap({}); setValidationResult(null); }
  }, [loadForecasts]);

  const loadAll = useCallback(async (preferCycleId, preferVersionId) => {
    setLoading(true);
    setMessage(null);
    try {
      const [cycleList, productList, regionList] = await Promise.all([
        api.getCycles({ bu: currentBU }),
        api.getProducts({ bu: currentBU }),
        api.getRegions()
      ]);

      setCycles(cycleList);
      setProducts(productList);
      setRegions(regionList);

      const cycle = cycleList.find((c) => c.id === preferCycleId) || cycleList[0] || null;
      setSelectedCycle(cycle);

      if (cycle) {
        await loadVersions(cycle, preferVersionId);
      } else {
        setVersions([]);
        setSelectedVersion(null);
        setWeeklyMap({});
        setMonthlyMap({});
        setValidationResult(null);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [currentBU, loadVersions]);

  useEffect(() => {
    if (currentBU) loadAll();
  }, [currentBU, loadAll]);

  const handleSelectCycle = async (cycle) => {
    if (!cycle) return;
    setSelectedCycle(cycle);
    setLoading(true);
    try {
      await loadVersions(cycle);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVersion = async (version) => {
    if (!version || !selectedCycle) return;
    setSelectedVersion(version);
    setLoading(true);
    try {
      await loadForecasts(version.id, normalizeMonth(selectedCycle.base_month));
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const setCell = (key, qty) => {
    setWeeklyMap((prev) => ({ ...prev, [key]: qty }));
    setDirtyKeys((prev) => new Set(prev).add(key));
  };

  const handleCellChange = (skuCode, week, region, value) => {
    const parsed = value === '' ? 0 : Number(value);
    setCell(`${skuCode}_${week}_${region}`, Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
  };

  /** Rải đều số tháng 1 của một SKU ra các ô tuần × miền, phần dư dồn vào ô cuối. */
  const distributeEvenly = (skuCode) => {
    const total = monthlyMap[skuCode] || 0;
    const cells = weeks.flatMap((w) => regionCodes.map((r) => `${skuCode}_${w}_${r}`));
    if (!cells.length) return;

    const per = Math.floor(total / cells.length);
    const remainder = total - per * cells.length;

    cells.forEach((key, i) => {
      setCell(key, i === cells.length - 1 ? per + remainder : per);
    });
  };

  const saveChanges = async () => {
    if (!selectedVersion) throw new Error('Chưa chọn bản cập nhật để lưu.');
    if (dirtyKeys.size === 0) return { skipped: true };

    const splits = [...dirtyKeys].map((key) => {
      const parts = key.split('_');
      const regionCode = parts.pop();
      const weekNumber = Number(parts.pop());
      return {
        skuCode: parts.join('_'),
        weekNumber,
        regionCode,
        quantity: weeklyMap[key] || 0
      };
    });

    const res = await api.saveWeeklySplits(selectedVersion.id, splits);
    setDirtyKeys(new Set());
    return res;
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveChanges();
      const valRes = await api.validateWeeklySplits(selectedVersion.id);
      setValidationResult(valRes);
      setMessage({
        type: 'success',
        text: res.skipped ? 'Không có thay đổi nào để lưu.' : res.message
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCycle || !selectedVersion) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveChanges();

      const valRes = await api.validateWeeklySplits(selectedVersion.id);
      setValidationResult(valRes);
      if (!valRes.isValid) {
        setMessage({
          type: 'error',
          text: `Không thể gửi duyệt: còn ${valRes.mismatchesCount} SKU có tổng tuần/miền chưa khớp kế hoạch tháng 1.`
        });
        return;
      }

      const res = await api.submitCycle(selectedCycle.id, selectedVersion.id);
      setMessage({ type: 'success', text: res.message });
      await loadAll(selectedCycle.id, selectedVersion.id);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const getSkuWeeklySum = (skuCode) =>
    weeks.reduce((sum, w) => sum + regionCodes.reduce(
      (s, r) => s + (weeklyMap[`${skuCode}_${w}_${r}`] || 0), 0
    ), 0);

  const filteredProducts = products.filter((p) => {
    const s = search.trim().toLowerCase();
    return !s
      || String(p.sku_code).toLowerCase().includes(s)
      || String(p.name).toLowerCase().includes(s);
  });

  const columnCount = 3 + weeks.length * regionCodes.length + 2;

  return (
    <div className="space-y-4">

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">BẢNG 1: FORECAST TUẦN &amp; MIỀN</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Đơn vị: <strong className="text-slate-800">{currentBU}</strong>
            {baseMonth && <> · Tháng chia tuần: <strong className="text-slate-800">{monthLabel(baseMonth)}</strong> ({weeks.length} tuần)</>}
            {dirtyKeys.size > 0 && (
              <span className="ml-2 text-amber-700 font-semibold">• {dirtyKeys.size} ô chưa lưu</span>
            )}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSave}
            disabled={saving || !canWrite || dirtyKeys.size === 0}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Đang lưu...' : 'Lưu bản thảo'}</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={saving || !canWrite}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>Kiểm tra &amp; gửi duyệt</span>
          </button>
        </div>
      </div>

      <CycleBar
        currentBU={currentBU}
        cycles={cycles}
        selectedCycle={selectedCycle}
        onSelectCycle={handleSelectCycle}
        versions={versions}
        selectedVersion={selectedVersion}
        onSelectVersion={handleSelectVersion}
        canEdit={isEditor}
        onChanged={(cycleId, versionId) => loadAll(cycleId, versionId)}
      />

      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-start space-x-2 ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {message.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      <ValidationAlert validationResult={validationResult} />

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white font-semibold sticky top-0 z-20">
              <tr>
                <th rowSpan="2" className="py-2 px-3 border-r border-slate-700 w-28">Mã SKU</th>
                <th rowSpan="2" className="py-2 px-3 border-r border-slate-700 min-w-[180px]">Tên sản phẩm</th>
                <th rowSpan="2" className="py-2 px-3 border-r border-slate-700 text-right w-24 bg-blue-900/60">FC tháng 1</th>
                {weeks.map((w) => (
                  <th
                    key={w}
                    colSpan={regionCodes.length}
                    className="py-2 px-3 border-r border-slate-700 text-center bg-slate-900/60 whitespace-nowrap"
                  >
                    {weekLabel(baseMonth, w)}
                  </th>
                ))}
                <th rowSpan="2" className="py-2 px-3 border-r border-slate-700 text-right w-24 bg-cyan-900/60">Tổng tuần</th>
                <th rowSpan="2" className="py-2 px-3 text-right w-24">Lệch</th>
              </tr>
              <tr>
                {weeks.map((w) =>
                  regionCodes.map((r) => (
                    <th key={`${w}-${r}`} className="py-1.5 px-2 border-r border-slate-700 text-right text-[10px] font-mono bg-slate-900/40">
                      {r}
                    </th>
                  ))
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={columnCount} className="py-8 text-center text-slate-400 font-sans">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : !selectedVersion ? (
                <tr>
                  <td colSpan={columnCount} className="py-8 text-center text-slate-400 font-sans">
                    Chưa có chu kỳ nào cho đơn vị này. Mở chu kỳ ở thanh phía trên trước.
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-8 text-center text-slate-400 font-sans">
                    Không tìm thấy SKU phù hợp
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const monthQty = monthlyMap[p.sku_code] || 0;
                  const weekSum = getSkuWeeklySum(p.sku_code);
                  const diff = weekSum - monthQty;

                  return (
                    <tr key={p.sku_code} className="hover:bg-blue-50/50 transition">
                      <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-800">{p.sku_code}</td>
                      <td className="py-2 px-3 border-r border-slate-200 font-sans font-medium text-slate-900 truncate max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{p.name}</span>
                          {canWrite && monthQty > 0 && (
                            <button
                              onClick={() => distributeEvenly(p.sku_code)}
                              title="Rải đều số tháng 1 ra các ô tuần/miền"
                              className="flex-shrink-0 p-1 rounded hover:bg-blue-100 text-blue-600"
                            >
                              <Wand2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200 text-right font-bold text-blue-800 bg-blue-50/40">
                        {monthQty.toLocaleString('vi-VN')}
                      </td>

                      {weeks.map((w) =>
                        regionCodes.map((r) => {
                          const key = `${p.sku_code}_${w}_${r}`;
                          const isDirty = dirtyKeys.has(key);
                          return (
                            <td key={key} className="p-1 border-r border-slate-200 text-right">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                disabled={!canWrite}
                                value={weeklyMap[key] ?? 0}
                                onChange={(e) => handleCellChange(p.sku_code, w, r, e.target.value)}
                                className={`w-16 text-right px-1.5 py-1 rounded font-semibold outline-none transition disabled:text-slate-500 disabled:cursor-not-allowed ${
                                  isDirty
                                    ? 'bg-amber-50 ring-1 ring-amber-300 text-amber-900'
                                    : 'bg-transparent hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500 text-slate-900'
                                }`}
                              />
                            </td>
                          );
                        })
                      )}

                      <td className="py-2 px-3 border-r border-slate-200 text-right font-bold text-slate-800 bg-slate-50">
                        {weekSum.toLocaleString('vi-VN')}
                      </td>
                      <td className={`py-2 px-3 text-right font-bold ${
                        diff === 0 ? 'text-emerald-600' : 'text-rose-600 bg-rose-50'
                      }`}>
                        {diff === 0 ? '✓' : diff > 0 ? `+${diff.toLocaleString('vi-VN')}` : diff.toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
