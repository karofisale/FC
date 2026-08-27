import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import ValidationAlert from '../components/ValidationAlert';
import { Save, Send, Search, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function WeeklyForecast({ currentBU, currentUser }) {
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [products, setProducts] = useState([]);
  const [monthlyMap, setMonthlyMap] = useState({}); // { sku_code: month1Qty }
  const [weeklyMap, setWeeklyMap] = useState({}); // { `${sku}_${week}_${region}`: qty }
  const [validationResult, setValidationResult] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const weeks = [1, 2, 3, 4];
  const regions = ['MB', 'MN'];

  useEffect(() => {
    loadCycleData();
  }, [currentBU]);

  const loadCycleData = async () => {
    try {
      setLoading(true);
      const [cycs, prods] = await Promise.all([
        api.getCycles({ bu: currentBU }),
        api.getProducts({ bu: currentBU })
      ]);

      setProducts(prods);
      setCycles(cycs);

      if (cycs.length > 0) {
        const activeCycle = cycs[0];
        setSelectedCycle(activeCycle);
        loadVersionData(activeCycle);
      } else {
        setSelectedCycle(null);
        setWeeklyMap({});
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const loadVersionData = async (cycle) => {
    try {
      const vers = await api.getCycleVersions(cycle.id);
      setVersions(vers);
      if (vers.length > 0) {
        const finalVers = vers.find(v => v.is_final) || vers[vers.length - 1];
        setSelectedVersion(finalVers);
        loadForecasts(finalVers.id, cycle.base_month);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadForecasts = async (versionId, baseMonth) => {
    try {
      const [mLines, wSplits, valRes] = await Promise.all([
        api.getMonthlyLines(versionId),
        api.getWeeklySplits(versionId),
        api.validateWeeklySplits(versionId)
      ]);

      // Map monthly target for Month 1
      const mMap = {};
      mLines.forEach(l => {
        if (l.forecast_month === baseMonth) {
          mMap[l.sku_code] = l.quantity;
        }
      });
      setMonthlyMap(mMap);

      // Map weekly splits
      const wMap = {};
      wSplits.forEach(s => {
        wMap[`${s.sku_code}_${s.week_number}_${s.region_code}`] = s.quantity;
      });
      setWeeklyMap(wMap);
      setValidationResult(valRes);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCellChange = (skuCode, weekNum, regionCode, value) => {
    const val = parseFloat(value) || 0;
    setWeeklyMap(prev => ({
      ...prev,
      [`${skuCode}_${weekNum}_${regionCode}`]: val
    }));
  };

  const handleSave = async () => {
    if (!selectedVersion) return;
    try {
      setSaving(true);
      setMessage(null);
      const splitsToSave = [];
      products.forEach(p => {
        weeks.forEach(w => {
          regions.forEach(r => {
            const qty = weeklyMap[`${p.sku_code}_${w}_${r}`] || 0;
            splitsToSave.push({
              skuCode: p.sku_code,
              weekNumber: w,
              regionCode: r,
              quantity: qty
            });
          });
        });
      });

      await api.saveWeeklySplits(selectedVersion.id, splitsToSave);
      const valRes = await api.validateWeeklySplits(selectedVersion.id);
      setValidationResult(valRes);
      setMessage({ type: 'success', text: 'Đã lưu bản ghi Forecast Tuần & Miền thành công!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCycle || !selectedVersion) return;
    try {
      setSaving(true);
      await handleSave(); // Save first
      
      const valRes = await api.validateWeeklySplits(selectedVersion.id);
      if (!valRes.isValid) {
        setMessage({ type: 'error', text: `Không thể gửi duyệt: Còn ${valRes.mismatchesCount} SKU chưa khớp giữa tổng tuần/miền và kế hoạch Tháng 1!` });
        setSaving(false);
        return;
      }

      await api.submitCycle(selectedCycle.id, selectedVersion.id, currentUser ? currentUser.id : null);
      setMessage({ type: 'success', text: 'Đã kiểm tra khớp số & gửi bản Forecast Tuần/Miền lên Cấp thẩm định!' });
      loadCycleData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const getSkuWeeklySum = (skuCode) => {
    let sum = 0;
    weeks.forEach(w => {
      regions.forEach(r => {
        sum += (weeklyMap[`${skuCode}_${w}_${r}`] || 0);
      });
    });
    return sum;
  };

  const filteredProducts = products.filter(p => 
    search === '' || 
    p.sku_code.toLowerCase().includes(search.toLowerCase()) || 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      
      {/* Header Context Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-slate-900">BẢNG 1: FORECAST TUẦN & MIỀN (THÁNG 1 CHU KỲ)</h2>
            {selectedCycle && <StatusBadge status={selectedCycle.status} />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Đơn vị: <strong className="text-slate-800">{currentBU}</strong> | Tháng 1 dự báo: <strong className="text-slate-800">{selectedCycle ? selectedCycle.base_month : 'N/A'}</strong> | Version: <strong className="text-slate-800">{selectedVersion ? selectedVersion.iso_week_label || `Tuần ${selectedVersion.update_week}` : 'N/A'}</strong>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSave}
            disabled={saving || !selectedVersion}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Đang lưu...' : 'Lưu Bản Thảo'}</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={saving || !selectedVersion || (selectedCycle && selectedCycle.status === 'approved')}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>Gửi Phê Duyệt</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Validation Alert */}
      <ValidationAlert validationResult={validationResult} />

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm kiếm SKU hoặc sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white font-semibold sticky top-0 z-20">
              <tr>
                <th rowSpan="2" className="py-2.5 px-3 border-r border-slate-700 w-28">Mã SKU</th>
                <th rowSpan="2" className="py-2.5 px-3 border-r border-slate-700 min-w-[180px]">Tên sản phẩm</th>
                
                {weeks.map(w => (
                  <th key={w} colSpan="2" className="py-1 px-2 border-r border-slate-700 text-center bg-blue-900/60">
                    Tuần {w}
                  </th>
                ))}

                <th rowSpan="2" className="py-2.5 px-3 border-r border-slate-700 text-right w-24 bg-cyan-900/60">TỔNG TUẦN+MIỀN</th>
                <th rowSpan="2" className="py-2.5 px-3 border-r border-slate-700 text-right w-24 bg-purple-900/60">MỤC TIÊU THÁNG 1</th>
                <th rowSpan="2" className="py-2.5 px-3 text-right w-24 bg-slate-900">CHÊNH LỆCH</th>
              </tr>
              <tr className="bg-slate-700 text-[11px]">
                {weeks.map(w => (
                  <React.Fragment key={w}>
                    <th className="py-1 px-1 text-center border-r border-slate-600 w-14">MB</th>
                    <th className="py-1 px-1 text-center border-r border-slate-600 w-14">MN</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
              {filteredProducts.map(p => {
                const wSum = getSkuWeeklySum(p.sku_code);
                const targetMonth1 = monthlyMap[p.sku_code] || 0;
                const diff = wSum - targetMonth1;
                const isMismatch = diff !== 0;

                return (
                  <tr key={p.sku_code} className={`hover:bg-blue-50/50 transition ${isMismatch ? 'bg-rose-50/40' : ''}`}>
                    <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-800">{p.sku_code}</td>
                    <td className="py-2 px-3 border-r border-slate-200 font-sans font-medium text-slate-900 truncate max-w-xs">{p.name}</td>
                    
                    {weeks.map(w => (
                      <React.Fragment key={w}>
                        {regions.map(r => {
                          const key = `${p.sku_code}_${w}_${r}`;
                          const qty = weeklyMap[key] !== undefined ? weeklyMap[key] : 0;
                          return (
                            <td key={r} className="p-1 border-r border-slate-200 text-right">
                              <input
                                type="number"
                                min="0"
                                value={qty}
                                onChange={(e) => handleCellChange(p.sku_code, w, r, e.target.value)}
                                className="w-full text-right px-1 py-0.5 bg-transparent hover:bg-white focus:bg-white focus:ring-1 focus:ring-blue-500 rounded font-semibold text-slate-900 outline-none"
                              />
                            </td>
                          );
                        })}
                      </React.Fragment>
                    ))}

                    <td className="py-2 px-3 text-right font-bold text-blue-800 bg-slate-50 border-r border-slate-200">
                      {wSum.toLocaleString('vi-VN')}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-purple-900 bg-purple-50/40 border-r border-slate-200">
                      {targetMonth1.toLocaleString('vi-VN')}
                    </td>
                    <td className={`py-2 px-3 text-right font-bold border-r border-slate-200 ${isMismatch ? 'text-rose-600 bg-rose-100/60' : 'text-emerald-600'}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
