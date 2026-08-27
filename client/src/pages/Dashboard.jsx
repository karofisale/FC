import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { Package, TrendingUp, Layers, AlertCircle } from 'lucide-react';
import { monthsOfCycle, monthLabel } from '../utils/period';

const COLORS = ['#0284c7', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

export default function Dashboard({ currentBU }) {
  const [b0Summary, setB0Summary] = useState([]);
  const [productsCount, setProductsCount] = useState(0);
  const [cycle, setCycle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Chu kỳ và mốc tháng lấy từ dữ liệu thật, không gán cứng như bản cũ
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cycles, prods] = await Promise.all([
        api.getCycles({ bu: currentBU }),
        api.getProducts({ bu: currentBU })
      ]);
      setProductsCount(prods.length);

      const latest = cycles[0] || null;
      setCycle(latest);
      setB0Summary(latest ? await api.getB0Summary(latest.base_month, currentBU) : []);
    } catch (err) {
      setError(err.message);
      setB0Summary([]);
    } finally {
      setLoading(false);
    }
  }, [currentBU]);

  useEffect(() => {
    if (currentBU) loadData();
  }, [currentBU, loadData]);

  const cycleMonths = monthsOfCycle(cycle);

  // Group by BU for chart
  const buTotals = b0Summary.reduce((acc, item) => {
    const bu = item.business_unit_code;
    if (!acc[bu]) acc[bu] = 0;
    acc[bu] += item.total_quantity;
    return acc;
  }, {});

  const chartDataBU = Object.keys(buTotals).map(bu => ({
    name: bu,
    sản_lượng: buTotals[bu]
  }));

  // Group by Product Group
  const groupTotals = b0Summary.reduce((acc, item) => {
    const gName = item.product_group_name || item.product_group_code;
    if (!acc[gName]) acc[gName] = 0;
    acc[gName] += item.total_quantity;
    return acc;
  }, {});

  const chartDataGroup = Object.keys(groupTotals).map(g => ({
    name: g,
    value: groupTotals[g]
  }));

  const grandTotalQty = b0Summary.reduce((sum, item) => sum + item.total_quantity, 0);

  return (
    <div className="space-y-6">

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng SKU Danh mục</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{productsCount} <span className="text-xs font-normal text-slate-500">mã</span></h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng sản lượng FC 4 Tháng</p>
            <h3 className="text-2xl font-bold text-blue-700 mt-1">{grandTotalQty.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">chiếc</span></h3>
          </div>
          <div className="p-3 bg-cyan-50 text-cyan-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chu kỳ Forecast</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {cycle ? monthLabel(cycle.base_month) : '—'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {cycleMonths.length
                ? `Khung ${cycleMonths.length} tháng: ${monthLabel(cycleMonths[0])} → ${monthLabel(cycleMonths[cycleMonths.length - 1])}`
                : `Chưa có chu kỳ cho ${currentBU}`}
            </p>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Trạng thái chu kỳ</p>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              {cycle ? cycle.status : '—'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {loading ? 'Đang tải...' : `${b0Summary.length} dòng tổng hợp`}
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Bar chart by Business Unit */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>SẢN LƯỢNG KẾ HOẠCH THEO ĐƠN VỊ KINH DOANH</span>
            <span className="text-xs text-slate-400 font-normal">Bảng 0.SUM (T7-T10/2026)</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDataBU}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(val) => Number(val).toLocaleString('vi-VN')} />
                <Bar dataKey="sản_lượng" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Pie chart by Product Group */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>CƠ CẤU SẢN LƯỢNG THEO NHÓM HÀNG</span>
            <span className="text-xs text-slate-400 font-normal">Tỷ trọng %</span>
          </h3>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartDataGroup}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {chartDataGroup.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => Number(val).toLocaleString('vi-VN')} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Aggregated B0.SUM Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900">BẢNG TỔNG HỢP FORECAST (B0.SUM - SẢN LƯỢNG THEO ĐƠN VỊ & NHÓM HÀNG)</h3>
          <span className="text-xs font-medium text-slate-500">Chu kỳ Tháng 07/2026</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Đơn vị kinh doanh</th>
                <th className="py-3 px-4">Nhóm sản phẩm</th>
                <th className="py-3 px-4 text-right">Tháng dự báo</th>
                <th className="py-3 px-4 text-right">Sản lượng (Chiếc)</th>
                <th className="py-3 px-4 text-right">Doanh thu dự kiến (VNĐ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {b0Summary.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-6 text-center text-slate-400">Chưa có dữ liệu tổng hợp forecast cho chu kỳ này</td>
                </tr>
              ) : (
                b0Summary.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 font-mono">
                    <td className="py-2.5 px-4 font-sans font-semibold text-blue-900">{item.business_unit_code} - {item.business_unit_name}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-800">{item.product_group_name}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{item.forecast_month}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">{item.total_quantity.toLocaleString('vi-VN')}</td>
                    <td className="py-2.5 px-4 text-right text-slate-600">{(item.total_revenue || 0).toLocaleString('vi-VN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
