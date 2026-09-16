import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../services/api';
import {
  Save, Search, AlertCircle, CheckCircle2, Loader2, TrendingUp, TrendingDown, Minus, FileDown
} from 'lucide-react';
import { monthLabel } from '../utils/period';
import { setDirty } from '../services/dirtyState';
import CaoSapPanel from '../components/CaoSapPanel';

const ImportActualsModal = React.lazy(() => import('../components/ImportActualsModal'));

const ROW_HEIGHT_PX = 37;

function previousMonthISO() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function Actuals({ currentBU, user }) {
  const [month, setMonth] = useState(previousMonthISO());
  const [products, setProducts] = useState([]);
  // Mien de GHI (TQ), va cac mien cu con giu so cua thang nay. Luc luu phai
  // dat 0 cho cac mien cu, neu khong tong se khac han so vua go.
  const [regionCode, setRegionCode] = useState('');
  const [legacyRegions, setLegacyRegions] = useState([]);
  const [actualsMap, setActualsMap] = useState({});
  const [dirtyKeys, setDirtyKeys] = useState(() => new Set());
  const [search, setSearch] = useState('');

  // Chặn đổi tab/đổi đơn vị làm mất ô chưa lưu mà không hỏi lại
  useEffect(() => {
    setDirty(dirtyKeys.size > 0, `Bảng Sản lượng thực hiện còn ${dirtyKeys.size} ô chưa lưu.`);
    return () => setDirty(false);
  }, [dirtyKeys]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [sapSoldTo, setSapSoldTo] = useState('');
  const [fallbackMonths, setFallbackMonths] = useState([]);
  const [sapLoc, setSapLoc] = useState({ vkorg: '', vtweg: '' });
  const [showImport, setShowImport] = useState(false);

  const isEditor = user?.role === 'bu_editor' || user?.role === 'central_admin';
  const tongTatCa = products.reduce((s, p) => s + (actualsMap[p.sku_code] || 0), 0);

  /**
   * Một lượt gọi thay cho getProducts + getRegions + getActuals +
   * getFcVsActual. Bốn lượt này trước đây chạy ở hai effect riêng, tưởng là
   * song song nhưng Apps Script xử lý tuần tự nên chúng vẫn cộng dồn.
   */
  const loadGrid = useCallback(async () => {
    setLoading(true);
    setComparisonLoading(true);
    setMessage(null);
    try {
      const ws = await api.getActualsWorkspace({ bu: currentBU, month });
      setProducts(ws.products || []);
      setRegionCode(ws.regionCode || '');
      setLegacyRegions(ws.legacyRegions || []);
      setFallbackMonths(ws.fallbackMonths || []);
      setSapSoldTo(ws.sapSoldTo || '');
      setSapLoc({ vkorg: ws.sapVkorg || '', vtweg: ws.sapVtweg || '' });

      // May chu da cong san tong cua moi mien theo tung ma — luoi chi co mot
      // cot nen khong can biet so nam o mien nao.
      setActualsMap({ ...(ws.totals || {}) });
      setDirtyKeys(new Set());
      setComparison(ws.comparison || null);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      setComparison(null);
    } finally {
      setLoading(false);
      setComparisonLoading(false);
    }
  }, [currentBU, month]);

  const loadComparison = useCallback(async () => {
    setComparisonLoading(true);
    try {
      const res = await api.getFcVsActual(currentBU, month);
      setComparison(res);
    } catch {
      setComparison(null);
    } finally {
      setComparisonLoading(false);
    }
  }, [currentBU, month]);

  useEffect(() => {
    if (currentBU) loadGrid();
  }, [currentBU, loadGrid]);

  // Không còn effect riêng cho phần so sánh — loadGrid đã lấy sẵn trong cùng
  // lượt gọi. loadComparison chỉ dùng để làm mới sau khi lưu.

  const handleCellChange = (skuCode, value) => {
    const parsed = value === '' ? 0 : Number(value);
    const qty = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setActualsMap((prev) => ({ ...prev, [skuCode]: qty }));
    setDirtyKeys((prev) => new Set(prev).add(skuCode));
  };

  const handleSave = async () => {
    if (dirtyKeys.size === 0) {
      setMessage({ type: 'success', text: 'Không có thay đổi nào để lưu.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      // Ghi toan bo so vao mien TQ. Ma nao con so cu o MB/MN thi dat 0 cho
      // chung — khong lam vay thi tong se la (so vua go + so cu), tuc bang
      // duoi hien mot dang con phan doi chieu cong ra mot dang khac.
      const rows = [];
      [...dirtyKeys].forEach((sku) => {
        rows.push({
          businessUnitCode: currentBU,
          skuCode: sku,
          regionCode,
          actualMonth: month,
          quantity: actualsMap[sku] || 0
        });
        legacyRegions.forEach((r) => {
          rows.push({
            businessUnitCode: currentBU, skuCode: sku, regionCode: r,
            actualMonth: month, quantity: 0
          });
        });
      });
      const res = await api.saveActuals(rows);
      setDirtyKeys(new Set());
      setMessage({ type: 'success', text: res.message });
      loadComparison();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const s = search.trim().toLowerCase();
    return !s
      || String(p.sku_code).toLowerCase().includes(s)
      || String(p.name).toLowerCase().includes(s);
  });

  const knownSkus = new Set(products.map((p) => String(p.sku_code).trim()));

  const scrollParentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredProducts.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPad = virtualRows.length ? virtualRows[0].start : 0;
  const bottomPad = virtualRows.length ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div className="space-y-4">

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">SẢN LƯỢNG THỰC HIỆN</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Đơn vị: <strong className="text-slate-800">{currentBU}</strong> · Tháng:{' '}
            <strong className="text-slate-800">{monthLabel(month)}</strong>
            {dirtyKeys.size > 0 && <span className="ml-2 text-amber-700 font-semibold">• {dirtyKeys.size} ô chưa lưu</span>}
          </p>
          {/* Lưới chỉ hiện mã CÓ số thực hiện hoặc CÓ trong kế hoạch — nói ra để
              không ai tưởng danh mục bị mất mã. */}
          <p className="text-[11px] text-slate-500 mt-1">
            {products.length} mã (có thực hiện hoặc có trong kế hoạch)
            {' · tổng '}<strong className="text-slate-800 font-mono">{tongTatCa.toLocaleString('vi-VN')}</strong>
            {fallbackMonths.length > 0 && (
              <span className="text-amber-700">
                {' · '}tháng này chưa có kế hoạch, lấy danh sách mã theo kế hoạch{' '}
                {fallbackMonths.map(monthLabel).join(', ')}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(`${e.target.value}-01`)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500"
          />
          {/* Miền dành cho sản lượng thực hiện (scope = 'actual'): ZSD450 không tách
              miền nên số từ SAP vào đúng một miền này, không chia bừa vào MB/MN. */}
          <button
            onClick={() => setShowImport(true)}
            disabled={!isEditor || !regionCode}
            title={regionCode
              ? `Đọc file ZSD450 và ghi vào miền ${regionCode}`
              : 'Chưa có miền dành cho sản lượng thực hiện — chạy setupDatabase() để thêm miền TQ'}
            className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            Nhập từ ZSD450
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isEditor || dirtyKeys.size === 0}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Đang lưu...' : 'Lưu thực hiện'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
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

      {!isEditor && (
        <div className="bg-slate-100 border border-slate-300 text-slate-700 text-xs rounded-lg p-3">
          Vai trò <strong>{user?.role}</strong> chỉ được xem, không nhập được sản lượng thực hiện.
        </div>
      )}

      {/* So sánh FC vs Thực hiện */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-xs font-bold uppercase text-slate-700 mb-1">So sánh Forecast và Thực hiện</h3>
        {/* Con số lệch chỉ đọc được khi biết đang so với kế hoạch nào: lập đầu
            chính tháng đó hay dự báo từ ba tháng trước, đã duyệt hay chưa. */}
        {comparison?.cycleFound && (
          <p className="text-[11px] text-slate-500 mb-3">
            {comparison.leadMonths === 0
              ? 'Kế hoạch lập đầu chính tháng này'
              : `Kế hoạch lập từ chu kỳ ${monthLabel(comparison.cycleBaseMonth)} (trước ${comparison.leadMonths} tháng)`}
            {' · '}
            {comparison.versionBasis === 'approved'
              ? <span className="text-emerald-700 font-semibold">bản đã duyệt</span>
              : comparison.versionBasis === 'final'
                ? <span className="text-amber-700 font-semibold">bản mới nhất — CHƯA DUYỆT</span>
                : <span className="text-rose-700 font-semibold">chưa có bản kế hoạch nào</span>}
          </p>
        )}
        {comparisonLoading ? (
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tính toán...
          </div>
        ) : !comparison || !comparison.cycleFound ? (
          <div className="text-xs text-slate-500">
            Không có chu kỳ nào của {currentBU} lập kế hoạch cho {monthLabel(month)} — chưa so sánh được.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Forecast</div>
                <div className="text-lg font-black font-mono text-slate-900">{comparison.totalForecast.toLocaleString('vi-VN')}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Thực hiện</div>
                <div className="text-lg font-black font-mono text-blue-700">{comparison.totalActual.toLocaleString('vi-VN')}</div>
              </div>
              <div className={`rounded-lg p-3 ${comparison.totalVariance === 0 ? 'bg-slate-50' : comparison.totalVariance > 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Chênh lệch</div>
                <div className={`text-lg font-black font-mono flex items-center justify-center gap-1 ${
                  comparison.totalVariance === 0 ? 'text-slate-700' : comparison.totalVariance > 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  {comparison.totalVariance > 0 ? <TrendingUp className="w-4 h-4" /> : comparison.totalVariance < 0 ? <TrendingDown className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                  {comparison.totalVariance > 0 ? '+' : ''}{comparison.totalVariance.toLocaleString('vi-VN')}
                  {comparison.totalVariancePct !== null && ` (${comparison.totalVariancePct > 0 ? '+' : ''}${comparison.totalVariancePct}%)`}
                </div>
              </div>
            </div>

            {comparison.rows.length > 0 && (
              <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-lg">
                <table className="w-full text-[11px] font-mono">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left py-1.5 px-2 font-sans font-semibold">SKU</th>
                      <th className="text-right py-1.5 px-2 font-sans font-semibold">FC</th>
                      <th className="text-right py-1.5 px-2 font-sans font-semibold">Thực hiện</th>
                      <th className="text-right py-1.5 px-2 font-sans font-semibold">Lệch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {comparison.rows.slice(0, 50).map((r) => (
                      <tr key={r.sku_code}>
                        <td className="py-1 px-2 font-bold text-slate-800">{r.sku_code}</td>
                        <td className="py-1 px-2 text-right text-slate-700">{r.forecast_qty.toLocaleString('vi-VN')}</td>
                        <td className="py-1 px-2 text-right text-blue-700">{r.actual_qty.toLocaleString('vi-VN')}</td>
                        <td className={`py-1 px-2 text-right font-bold ${r.variance_qty > 0 ? 'text-emerald-600' : r.variance_qty < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {r.variance_qty > 0 ? '+' : ''}{r.variance_qty.toLocaleString('vi-VN')}
                          {r.variance_pct !== null && <span className="text-slate-400 font-sans"> ({r.variance_pct > 0 ? '+' : ''}{r.variance_pct}%)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {comparison.rows.length > 50 && (
                  <div className="text-[10px] text-slate-400 text-center py-1.5 font-sans">
                    Hiện 50/{comparison.rows.length} SKU lệch nhiều nhất
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <CaoSapPanel
        businessUnitCode={currentBU}
        month={month}
        isEditor={isEditor}
        onImported={loadGrid}
      />

      {/* Lưới nhập sản lượng thực hiện */}
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
        <div ref={scrollParentRef} className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white font-semibold sticky top-0 z-20">
              <tr>
                <th className="py-2.5 px-3 border-r border-slate-700 w-28">Mã SKU</th>
                <th className="py-2.5 px-3 border-r border-slate-700 min-w-[200px]">Tên sản phẩm</th>
                {/* MỘT cột. Sản lượng thực hiện không tách miền: nguồn ZSD450 không
                    có cột miền, và phần đối chiếu cũng chỉ so tổng. */}
                <th className="py-2.5 px-3 text-right w-32 bg-cyan-900/60">Tổng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {loading ? (
                <tr><td colSpan={3} className="py-8 text-center text-slate-400 font-sans">Đang tải dữ liệu...</td></tr>
              ) : filteredProducts.length === 0 ? (
                <tr><td colSpan={3} className="py-8 text-center text-slate-400 font-sans">Không tìm thấy SKU phù hợp</td></tr>
              ) : (
                <>
                  {topPad > 0 && <tr style={{ height: topPad }} aria-hidden="true" />}
                  {virtualRows.map((vRow) => {
                    const p = filteredProducts[vRow.index];
                    return (
                      <tr key={p.sku_code} className="hover:bg-blue-50/50 transition">
                        <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-800">{p.sku_code}</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-sans font-medium text-slate-900 truncate max-w-xs">{p.name}</td>
                        <td className="p-1 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            disabled={!isEditor}
                            value={actualsMap[p.sku_code] ?? 0}
                            onChange={(e) => handleCellChange(p.sku_code, e.target.value)}
                            className={`w-full text-right px-2 py-1 rounded font-semibold outline-none transition disabled:text-slate-500 disabled:cursor-not-allowed ${
                              dirtyKeys.has(p.sku_code)
                                ? 'bg-amber-50 ring-1 ring-amber-300 text-amber-900'
                                : 'bg-transparent hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500 text-slate-900'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {bottomPad > 0 && <tr style={{ height: bottomPad }} aria-hidden="true" />}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImport && (
        <React.Suspense fallback={null}>
          <ImportActualsModal
            businessUnitCode={currentBU}
            sapSoldTo={sapSoldTo}
            sapVkorg={sapLoc.vkorg}
            sapVtweg={sapLoc.vtweg}
            month={month}
            regionCode={regionCode}
            knownSkus={knownSkus}
            onClose={() => setShowImport(false)}
            onImported={loadGrid}
          />
        </React.Suspense>
      )}

    </div>
  );
}
