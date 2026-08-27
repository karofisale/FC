import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { Save, Send, Search, RefreshCw, Filter, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function MonthlyForecast({ currentBU, currentUser }) {
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [products, setProducts] = useState([]);
  const [forecastMap, setForecastMap] = useState({}); // { `${sku}_${month}`: qty }
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const months = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'];
  const monthLabels = ['Tháng 7/26', 'Tháng 8/26', 'Tháng 9/26', 'Tháng 10/26'];

  useEffect(() => {
    loadCycleData();
  }, [currentBU]);

  const loadCycleData = async () => {
    try {
      setLoading(true);
      const [cycs, grps, prods] = await Promise.all([
        api.getCycles({ bu: currentBU }),
        api.getGroups(),
        api.getProducts({ bu: currentBU })
      ]);

      setGroups(grps);
      setProducts(prods);
      setCycles(cycs);

      if (cycs.length > 0) {
        const activeCycle = cycs[0];
        setSelectedCycle(activeCycle);
        loadVersionData(activeCycle.id);
      } else {
        setSelectedCycle(null);
        setForecastMap({});
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const loadVersionData = async (cycleId) => {
    try {
      const vers = await api.getCycleVersions(cycleId);
      setVersions(vers);
      if (vers.length > 0) {
        const finalVers = vers.find(v => v.is_final) || vers[vers.length - 1];
        setSelectedVersion(finalVers);
        loadLines(finalVers.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadLines = async (versionId) => {
    try {
      const lines = await api.getMonthlyLines(versionId);
      const map = {};
      lines.forEach(l => {
        map[`${l.sku_code}_${l.forecast_month}`] = l.quantity;
      });
      setForecastMap(map);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCellChange = (skuCode, month, value) => {
    const val = parseFloat(value) || 0;
    setForecastMap(prev => ({
      ...prev,
      [`${skuCode}_${month}`]: val
    }));
  };

  const handleSave = async () => {
    if (!selectedVersion) return;
    try {
      setSaving(true);
      setMessage(null);
      const linesToSave = [];
      products.forEach(p => {
        months.forEach(m => {
          const qty = forecastMap[`${p.sku_code}_${m}`] || 0;
          linesToSave.push({
            skuCode: p.sku_code,
            forecastMonth: m,
            quantity: qty
          });
        });
      });

      await api.saveMonthlyLines(selectedVersion.id, linesToSave);
      setMessage({ type: 'success', text: 'Đã lưu bản ghi Forecast 4 tháng thành công!' });
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
      await api.submitCycle(selectedCycle.id, selectedVersion.id, currentUser ? currentUser.id : null);
      setMessage({ type: 'success', text: 'Đã gửi bản Forecast 4 tháng lên Cấp thẩm định phê duyệt!' });
      loadCycleData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchSearch = search === '' || 
      p.sku_code.toLowerCase().includes(search.toLowerCase()) || 
      p.name.toLowerCase().includes(search.toLowerCase());
    const matchGroup = selectedGroup === 'ALL' || p.product_group_code === selectedGroup;
    return matchSearch && matchGroup;
  });

  // Calculate totals
  const getSkuTotal = (skuCode) => {
    return months.reduce((sum, m) => sum + (forecastMap[`${skuCode}_${m}`] || 0), 0);
  };

  const getMonthTotal = (month) => {
    return filteredProducts.reduce((sum, p) => sum + (forecastMap[`${p.sku_code}_${month}`] || 0), 0);
  };

  const getGrandTotal = () => {
    return months.reduce((sum, m) => sum + getMonthTotal(m), 0);
  };

  return (
    <div className="space-y-4">
      
      {/* Header Actions & Context Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-slate-900">BẢNG 0: SALES FORECAST 4 THÁNG</h2>
            {selectedCycle && <StatusBadge status={selectedCycle.status} />}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Đơn vị: <strong className="text-slate-800">{currentBU}</strong> | Chu kỳ: <strong className="text-slate-800">{selectedCycle ? selectedCycle.base_month : 'N/A'}</strong> | Version: <strong className="text-slate-800">{selectedVersion ? selectedVersion.iso_week_label || `Tuần ${selectedVersion.update_week}` : 'N/A'}</strong>
          </p>
        </div>

        {/* Action Buttons */}
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

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm kiếm theo Mã SKU hoặc Tên sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
          />
        </div>

        {/* Group Filter */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 outline-none"
          >
            <option value="ALL">Tất cả Nhóm hàng</option>
            {groups.map(g => (
              <option key={g.code} value={g.code}>{g.name}</option>
            ))}
          </select>
        </div>

      </div>

      {/* Spreadsheet Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white font-semibold sticky top-0 z-20">
              <tr>
                <th className="py-2.5 px-3 border-r border-slate-700 w-28">Mã SKU</th>
                <th className="py-2.5 px-3 border-r border-slate-700 min-w-[200px]">Tên sản phẩm</th>
                <th className="py-2.5 px-3 border-r border-slate-700 w-28">Nhóm SP</th>
                <th className="py-2.5 px-3 border-r border-slate-700 w-28">Công nghệ</th>
                {monthLabels.map((lbl, idx) => (
                  <th key={idx} className="py-2.5 px-3 border-r border-slate-700 text-right w-28 bg-blue-900/60">
                    {lbl}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right w-32 bg-cyan-900/60">TỔNG FC 4 THÁNG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5 + months.length} className="py-8 text-center text-slate-400 font-sans">
                    Không tìm thấy SKU phù hợp
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const skuTotal = getSkuTotal(p.sku_code);
                  return (
                    <tr key={p.sku_code} className="hover:bg-blue-50/50 transition">
                      <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-800">{p.sku_code}</td>
                      <td className="py-2 px-3 border-r border-slate-200 font-sans font-medium text-slate-900 truncate max-w-xs">{p.name}</td>
                      <td className="py-2 px-3 border-r border-slate-200 font-sans text-slate-600 text-[11px]">{p.product_group_name || p.product_group_code}</td>
                      <td className="py-2 px-3 border-r border-slate-200 font-sans text-slate-500 text-[11px]">{p.technology || '-'}</td>
                      
                      {months.map(m => {
                        const key = `${p.sku_code}_${m}`;
                        const qty = forecastMap[key] !== undefined ? forecastMap[key] : 0;
                        return (
                          <td key={m} className="p-1 border-r border-slate-200 text-right">
                            <input
                              type="number"
                              min="0"
                              value={qty}
                              onChange={(e) => handleCellChange(p.sku_code, m, e.target.value)}
                              className="w-full text-right px-2 py-1 bg-transparent hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500 rounded font-semibold text-slate-900 outline-none"
                            />
                          </td>
                        );
                      })}

                      <td className="py-2 px-3 text-right font-bold text-blue-700 bg-slate-50">
                        {skuTotal.toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Footer Row */}
            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900 sticky bottom-0 z-10">
              <tr>
                <td colSpan="4" className="py-3 px-3 uppercase text-slate-700 text-right">
                  TỔNG CỘNG SẢN LƯỢNG (CHIẾC):
                </td>
                {months.map(m => (
                  <td key={m} className="py-3 px-3 text-right font-mono text-blue-900 font-black">
                    {getMonthTotal(m).toLocaleString('vi-VN')}
                  </td>
                ))}
                <td className="py-3 px-3 text-right font-mono text-cyan-900 font-black text-sm bg-cyan-100/50">
                  {getGrandTotal().toLocaleString('vi-VN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
}
