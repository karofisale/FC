import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { Package, TrendingUp, Layers, Activity, Trash2, Loader2 } from 'lucide-react';
import { monthsOfCycle, monthLabel, normalizeMonth, vnYear } from '../utils/period';
import StatusBadge from '../components/StatusBadge';
import { statusLabel } from '../utils/glossary';
import { appConfirm } from '../services/dialogService';
import { thongBao } from '../services/toastService';
import { loadPref, savePref } from '../services/prefs';
import { useTableSort } from '../utils/useTableSort';
import { SortTh, StateRow } from '../components/TableStates';

const laChuoi = (v) => typeof v === 'string';
const maDong = (r) => r.key;

const COLORS = ['#0284c7', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

/**
 * Chu kỳ xoá được hay không — BẢN SAO của `chuKyXoaDuoc` ở fc-api/mutations.js (server mới là nơi quyết định; đây chỉ để ẩn/hiện nút):
 * chu kỳ đang NHÁP (mọi năm), hoặc chu kỳ của các NĂM CŨ (trước năm hiện tại) ở mọi trạng thái.
 */
function chuKyXoaDuoc(cycle, namHienTai = vnYear()) {
  if (!cycle) return false;
  if (cycle.status === 'draft') return true;
  const nam = Number(normalizeMonth(cycle.base_month).slice(0, 4));
  return !!nam && nam < namHienTai;
}

export default function Dashboard({ currentBU, user }) {
  const [b0Summary, setB0Summary] = useState([]);
  const [productsCount, setProductsCount] = useState(0);
  const [cycle, setCycle] = useState(null);
  const [cycles, setCycles] = useState([]);          // mọi Kỳ của đơn vị — nguồn cho ô chọn Kỳ
  const [selectedCycleId, setSelectedCycleId] = useState(''); // '' = để server chọn Kỳ mới nhất
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user?.role === 'central_admin';

  // Chu kỳ và mốc tháng lấy từ dữ liệu thật, không gán cứng như bản cũ
  const loadData = useCallback(async (cycleId = '') => {
    setLoading(true);
    setError(null);
    try {
      // Một lượt gọi thay cho (getCycles ‖ getProducts) rồi mới getB0Summary —
      // hai chặng nối tiếp, mà Apps Script xử lý tuần tự nên chúng cộng dồn.
      const ws = await api.getDashboardWorkspace({ bu: currentBU, ...(cycleId ? { cycleId } : {}) });
      setProductsCount(ws.productCount || 0);
      setCycle(ws.cycle || null);
      setCycles(ws.cycles || []);
      setSelectedCycleId(ws.cycle?.id || '');
      setB0Summary(ws.b0Summary || []);
      // Nhớ Kỳ đang xem (theo đơn vị) — Đợt 2 mục 9.
      if (ws.cycle?.id) savePref('dashCycle:' + currentBU, ws.cycle.id);
    } catch (err) {
      setError(err.message);
      setB0Summary([]);
    } finally {
      setLoading(false);
    }
  }, [currentBU]);

  // Mở lại / đổi đơn vị -> vào lại Kỳ đã xem lần trước của đơn vị đó (server rơi về Kỳ mới nhất nếu Kỳ ấy không còn).
  useEffect(() => {
    if (currentBU) loadData(loadPref('dashCycle:' + currentBU, '', laChuoi));
  }, [currentBU, loadData]);

  // Xoá Kỳ đang xem (admin). Server kiểm lại quyền + luật; nút chỉ hiện khi Kỳ thuộc loại xoá được.
  const xoaKy = async () => {
    if (!cycle || deleting) return;
    const nhan = `${cycle.business_unit_code} · ${monthLabel(cycle.base_month)} (${cycle.status === 'draft' ? 'nháp' : 'năm cũ'})`;
    if (!(await appConfirm(
      `Xoá hẳn Kỳ ${nhan}?\n\nSẽ xoá luôn mọi bản cập nhật tuần, số liệu tháng, số tuần/miền và yêu cầu duyệt của Kỳ này. Không hoàn tác được.`,
      { title: 'Xoá hẳn Kỳ này?', okLabel: 'Xoá Kỳ này', danger: true }
    ))) return;
    setDeleting(true);
    try {
      const res = await api.deleteCycle(cycle.id);
      thongBao({ type: 'success', text: res?.message || `Đã xoá Kỳ ${nhan}.` });
      await loadData('');
    } catch (err) {
      thongBao({ type: 'error', text: err.message });
    } finally {
      setDeleting(false);
    }
  };

  // Memo hoá: monthsOfCycle trả mảng mới mỗi lần render, mà bảng pivot bên dưới
  // phụ thuộc vào nó — không memo thì pivot tính lại sau mọi lần render.
  const cycleMonths = useMemo(() => monthsOfCycle(cycle), [cycle]);

  /**
   * B0.SUM dạng pivot: mỗi dòng là một (đơn vị × nhóm hàng), mỗi tháng một cột.
   *
   * Cột tháng lấy theo khung chu kỳ, nhưng tháng nào CÓ SỐ mà nằm ngoài khung
   * vẫn được thêm vào cuối — bảng cũ liệt kê mọi dòng nên bản pivot cũng không
   * được làm biến mất sản lượng nào mà không ai thấy.
   */
  const { monthCols, pivotRows, monthTotals, grandQty } = useMemo(() => {
    const cols = [...cycleMonths];
    b0Summary.forEach((it) => {
      const m = normalizeMonth(it.forecast_month);
      if (m && !cols.includes(m)) cols.push(m);
    });
    cols.sort();

    const map = new Map();
    const totals = {};
    let grand = 0;

    b0Summary.forEach((it) => {
      const m = normalizeMonth(it.forecast_month);
      const key = `${it.business_unit_code}|${it.product_group_code}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          bu: it.business_unit_code,
          buName: it.business_unit_name,
          group: it.product_group_name || it.product_group_code,
          qty: {},
          total: 0
        });
      }
      const row = map.get(key);
      const q = Number(it.total_quantity) || 0;
      row.qty[m] = (row.qty[m] || 0) + q;
      row.total += q;

      if (!totals[m]) totals[m] = { qty: 0, revenue: 0 };
      totals[m].qty += q;
      totals[m].revenue += Number(it.total_revenue) || 0;
      grand += q;
    });

    const rows = [...map.values()].sort(
      (a, b) => String(a.bu).localeCompare(String(b.bu)) || String(a.group).localeCompare(String(b.group))
    );
    return { monthCols: cols, pivotRows: rows, monthTotals: totals, grandQty: grand };
  }, [b0Summary, cycleMonths]);

  // Sắp xếp bảng B0.SUM theo cột (đơn vị / nhóm: chữ; tháng và tổng: số).
  const cotPivot = {
    bu: { type: 'text', get: (r) => r.bu },
    nhom: { type: 'text', get: (r) => r.group },
    tong: { type: 'number', get: (r) => r.total }
  };
  monthCols.forEach((m) => { cotPivot['t:' + m] = { type: 'number', get: (r) => r.qty[m] || 0 }; });
  const { rows: pivotXep, spec: sortPivot, toggle: doiSapXep } = useTableSort(pivotRows, cotPivot, maDong);

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

      {/* Chọn Kỳ để xem Tổng quan; admin xoá được Kỳ nháp hoặc Kỳ năm cũ */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500 whitespace-nowrap">Kỳ:</span>
        {cycles.length > 0 ? (
          <select
            value={selectedCycleId}
            onChange={(e) => { savePref('dashCycle:' + currentBU, e.target.value); loadData(e.target.value); }}
            disabled={loading || deleting}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:opacity-60"
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_unit_code} · {monthLabel(c.base_month)} · {String(c.base_month).slice(0, 4)}
                {c.status === 'draft' ? ' (nháp)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-slate-500 italic">Chưa có Kỳ nào cho {currentBU}</span>
        )}
        {cycle && <StatusBadge status={cycle.status} />}
        {cycles.length > 0 && (
          <span className="text-[11px] text-slate-500">{cycles.length} Kỳ</span>
        )}

        {isAdmin && cycle && chuKyXoaDuoc(cycle) && (
          <button
            onClick={xoaKy}
            disabled={loading || deleting}
            title="Chỉ xoá được Kỳ đang nháp hoặc Kỳ của các năm trước. Xoá luôn bản cập nhật, số liệu và yêu cầu duyệt của Kỳ."
            className="ml-auto flex items-center gap-1.5 border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Xoá Kỳ này
          </button>
        )}
      </div>
      
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng SKU Danh mục</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{productsCount} <span className="text-xs font-normal text-slate-500">mã</span></h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng sản lượng FC 4 Tháng</p>
            <h3 className="text-2xl font-bold text-blue-700 mt-1">{grandTotalQty.toLocaleString('vi-VN')} <span className="text-xs font-normal text-slate-500">chiếc</span></h3>
          </div>
          <div className="p-3 bg-cyan-50 text-cyan-700 rounded-xl">
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
              {cycle ? statusLabel(cycle.status) : '—'}
            </h3>
            <p className="text-[11px] text-slate-500">
              {loading ? 'Đang tải...' : `${b0Summary.length} dòng tổng hợp`}
            </p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Visual Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Bar chart by Business Unit */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
            <span>SẢN LƯỢNG KẾ HOẠCH THEO ĐƠN VỊ KINH DOANH</span>
            <span className="text-xs text-slate-500 font-normal">
              {cycleMonths.length
                ? `Bảng 0.SUM (${monthLabel(cycleMonths[0])} → ${monthLabel(cycleMonths[cycleMonths.length - 1])})`
                : 'Bảng 0.SUM'}
            </span>
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
            <span className="text-xs text-slate-500 font-normal">Tỷ trọng %</span>
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
          <span className="text-xs font-medium text-slate-500">
            {cycle
              ? `Chu kỳ ${monthLabel(cycle.base_month)}${cycleMonths.length > 1 ? ` — ${cycleMonths.length} tháng` : ''}`
              : `Chưa có chu kỳ cho ${currentBU}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-200">
              <tr>
                <SortTh rowSpan={2} label="Đơn vị kinh doanh" sortKey="bu" spec={sortPivot} onSort={doiSapXep} className="py-2 px-4 font-bold uppercase tracking-wider align-bottom" />
                <SortTh rowSpan={2} label="Nhóm sản phẩm" sortKey="nhom" spec={sortPivot} onSort={doiSapXep} className="py-2 px-4 font-bold uppercase tracking-wider align-bottom" />
                {monthCols.map((m) => (
                  <SortTh key={m} label={monthLabel(m)} sortKey={'t:' + m} spec={sortPivot} onSort={doiSapXep} className="py-2 px-4 text-right font-bold uppercase tracking-wider" />
                ))}
                <SortTh rowSpan={2} label="Tổng" sortKey="tong" spec={sortPivot} onSort={doiSapXep} className="py-2 px-4 text-right font-bold uppercase tracking-wider align-bottom" />
              </tr>
              {/* Doanh thu chỉ hiện MỘT số tổng cho mỗi tháng ở đầu cột, không tách theo nhóm */}
              <tr className="border-b border-slate-200">
                {monthCols.map((m) => (
                  <th key={m} className="pb-2 px-4 text-right font-normal text-[11px] text-slate-500 font-mono">
                    {(monthTotals[m]?.revenue || 0).toLocaleString('vi-VN')} đ
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <StateRow colSpan={monthCols.length + 3} kind="loading" />
              ) : error ? (
                <StateRow colSpan={monthCols.length + 3} kind="error" text={error} onRetry={() => loadData(selectedCycleId)} />
              ) : pivotRows.length === 0 ? (
                <StateRow colSpan={monthCols.length + 3} kind="empty" text="Chưa có dữ liệu tổng hợp forecast cho chu kỳ này" />
              ) : (
                pivotXep.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-50 font-mono">
                    <td className="py-2.5 px-4 font-sans font-semibold text-blue-900">
                      {row.bu}{row.buName && row.buName !== row.bu ? ` - ${row.buName}` : ''}
                    </td>
                    <td className="py-2.5 px-4 font-sans text-slate-800">{row.group}</td>
                    {monthCols.map((m) => (
                      <td key={m} className="py-2.5 px-4 text-right text-slate-700">
                        {(row.qty[m] || 0).toLocaleString('vi-VN')}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                      {row.total.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {pivotRows.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-mono">
                <tr>
                  <td colSpan={2} className="py-2.5 px-4 font-sans font-bold text-slate-800 uppercase text-[11px] tracking-wider">
                    Tổng cộng
                  </td>
                  {monthCols.map((m) => (
                    <td key={m} className="py-2.5 px-4 text-right font-bold text-slate-900">
                      {(monthTotals[m]?.qty || 0).toLocaleString('vi-VN')}
                    </td>
                  ))}
                  <td className="py-2.5 px-4 text-right font-bold text-blue-800">
                    {grandQty.toLocaleString('vi-VN')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="px-6 py-2 text-[11px] text-slate-500 border-t border-slate-100">
          Số trong ô là sản lượng (chiếc). Dòng nhạt dưới tên tháng là doanh thu dự kiến của cả tháng (VNĐ).
        </p>
      </div>

    </div>
  );
}
