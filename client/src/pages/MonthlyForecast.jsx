import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../services/api';
import CycleBar from '../components/CycleBar';
import AddProductModal from '../components/AddProductModal';
// Tải lười — kéo theo thư viện xlsx (~290KB) chỉ để đọc file Excel, đa số
// người dùng không bấm "Nhập từ file" mỗi lần vào trang này.
const ImportForecastModal = React.lazy(() => import('../components/ImportForecastModal'));
import { Save, Send, Search, Filter, AlertCircle, CheckCircle2, Loader2, ArrowDownToLine, PackagePlus, FileSpreadsheet } from 'lucide-react';
import { monthsOfCycle, monthLabel, weeksOfMonth } from '../utils/period';
import { setDirty } from '../services/dirtyState';
import { useGridEditing, parsePastedNumber } from '../utils/useGridEditing';

// Chỉ dựng DOM cho các dòng đang lọt vào khung nhìn — kênh XK có 756 SKU,
// render đủ cả 756 dòng × N ô input cùng lúc từng làm giật khi gõ/cuộn.
const ROW_HEIGHT_PX = 37;

export default function MonthlyForecast({ currentBU, user }) {
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [products, setProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [bus, setBus] = useState([]);
  const [regions, setRegions] = useState([]);
  const [forecastMap, setForecastMap] = useState({});
  const [dirtyKeys, setDirtyKeys] = useState(() => new Set());

  // Chặn đổi tab/đổi đơn vị làm mất ô chưa lưu mà không hỏi lại
  useEffect(() => {
    setDirty(dirtyKeys.size > 0, `Bảng Forecast tháng còn ${dirtyKeys.size} ô chưa lưu.`);
    return () => setDirty(false);
  }, [dirtyKeys]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [onlyNonZero, setOnlyNonZero] = useState(true);
  const [nonZeroSkus, setNonZeroSkus] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Memo hoá để mảng không đổi định danh mỗi lần render — nếu không thì mọi
  // useMemo phụ thuộc vào `months` đều bị tính lại sau từng phím gõ.
  const months = useMemo(() => monthsOfCycle(selectedCycle), [selectedCycle]);
  const isEditor = user?.role === 'bu_editor' || user?.role === 'central_admin';
  // Rút lại phê duyệt là quyền của người thẩm định, không phải người lập kế hoạch
  const canReopen = user?.role === 'bu_approver' || user?.role === 'central_admin';
  const cycleLocked = selectedCycle?.status === 'approved' || selectedCycle?.status === 'locked';
  const canWrite = isEditor && !!selectedVersion && !cycleLocked;

  /** Tập SKU có ít nhất một tháng > 0, tính từ một map số lượng. */
  const computeNonZero = useCallback((map) => {
    const s = new Set();
    Object.keys(map).forEach((k) => {
      if ((map[k] || 0) > 0) s.add(k.slice(0, k.lastIndexOf('_')));
    });
    return s;
  }, []);

  const applyLines = useCallback((lines) => {
    const map = {};
    lines.forEach((l) => {
      map[`${l.sku_code}_${l.forecast_month}`] = Number(l.quantity) || 0;
    });
    setForecastMap(map);
    setNonZeroSkus(computeNonZero(map));
    setDirtyKeys(new Set());
  }, [computeNonZero]);

  const loadLines = useCallback(async (versionId) => {
    applyLines(await api.getMonthlyLines(versionId));
  }, [applyLines]);

  const loadVersions = useCallback(async (cycleId, preferVersionId) => {
    const list = await api.getCycleVersions(cycleId);
    setVersions(list);
    const chosen =
      list.find((v) => v.id === preferVersionId) ||
      list.find((v) => String(v.is_final) === '1') ||
      list[list.length - 1] ||
      null;
    setSelectedVersion(chosen);
    if (chosen) await loadLines(chosen.id);
    else setForecastMap({});
  }, [loadLines]);

  /**
   * Một lượt gọi duy nhất thay cho chuỗi getCycles -> getVersions ->
   * getMonthlyLines (3 chặng nối tiếp, mỗi chặng 1-5 giây vì Apps Script
   * xử lý tuần tự). getBUs/getRegions/getGroups đều lấy từ bootstrap đã
   * cache nên không tốn thêm lượt gọi mạng nào.
   */
  const loadAll = useCallback(async (preferCycleId, preferVersionId) => {
    setLoading(true);
    setMessage(null);
    try {
      const [ws, buList, regionList, groupList] = await Promise.all([
        api.getMonthlyWorkspace({ bu: currentBU, cycleId: preferCycleId, versionId: preferVersionId }),
        api.getBUs(),
        api.getRegions(),
        api.getGroups()
      ]);

      setCycles(ws.cycles || []);
      setProducts(ws.products || []);
      setGroups(groupList);
      setBus(buList);
      setRegions(regionList);

      setSelectedCycle(ws.cycle || null);
      setVersions(ws.versions || []);
      setSelectedVersion(ws.version || null);
      applyLines(ws.lines || []);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [currentBU, applyLines]);

  useEffect(() => {
    if (currentBU) loadAll();
  }, [currentBU, loadAll]);

  const handleSelectCycle = async (cycle) => {
    if (!cycle) return;
    setSelectedCycle(cycle);
    setLoading(true);
    try {
      await loadVersions(cycle.id);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVersion = async (version) => {
    if (!version) return;
    setSelectedVersion(version);
    setLoading(true);
    try {
      await loadLines(version.id);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCellChange = (skuCode, month, value) => {
    const key = `${skuCode}_${month}`;
    const parsed = value === '' ? 0 : Number(value);
    const qty = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setForecastMap((prev) => ({ ...prev, [key]: qty }));
    setDirtyKeys((prev) => new Set(prev).add(key));
  };

  /** Áp nhiều ô cùng lúc (dán khối từ Excel, fill-down, Ctrl+D) trong 1 lần cập nhật. */
  const handleCellsChange = (updates) => {
    setForecastMap((prev) => {
      const next = { ...prev };
      updates.forEach(({ rowKey, col, value }) => {
        next[`${rowKey}_${col}`] = parsePastedNumber(value);
      });
      return next;
    });
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      updates.forEach(({ rowKey, col }) => next.add(`${rowKey}_${col}`));
      return next;
    });
  };

  /** Chỉ gửi ô đã sửa. Ném lỗi ra ngoài để nút Gửi duyệt biết mà dừng lại. */
  const saveChanges = async () => {
    if (!selectedVersion) throw new Error('Chưa chọn bản cập nhật để lưu.');
    if (dirtyKeys.size === 0) return { skipped: true };

    const lines = [...dirtyKeys].map((key) => {
      const at = key.lastIndexOf('_');
      return {
        skuCode: key.slice(0, at),
        forecastMonth: key.slice(at + 1),
        quantity: forecastMap[key] || 0
      };
    });

    const res = await api.saveMonthlyLines(selectedVersion.id, lines);
    setDirtyKeys(new Set());
    return res;
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveChanges();
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
      const res = await api.submitCycle(selectedCycle.id, selectedVersion.id);
      setMessage({ type: 'success', text: res.message });
      await loadAll(selectedCycle.id, selectedVersion.id);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Danh sách SKU hiển thị được chốt theo TỪNG LẦN TẢI DỮ LIỆU, không tính
   * lại theo từng phím gõ. Bản cũ đọc thẳng forecastMap đang chỉnh sửa, nên
   * khi người dùng xoá giá trị cuối cùng còn khác 0 của một dòng thì dòng đó
   * rớt khỏi danh sách ngay lập tức — ô input đang nhập bị gỡ, mất con trỏ,
   * và các dòng bên dưới nhảy vị trí. Bộ lọc chỉ được áp lại khi người dùng
   * chủ động bật lại ô tick hoặc khi tải lại dữ liệu.
   */
  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchSearch = !s
        || String(p.sku_code).toLowerCase().includes(s)
        || String(p.name).toLowerCase().includes(s);
      const matchGroup = selectedGroup === 'ALL' || p.product_group_code === selectedGroup;
      const matchNonZero = !onlyNonZero || nonZeroSkus.has(p.sku_code);
      return matchSearch && matchGroup && matchNonZero;
    });
  }, [products, search, selectedGroup, onlyNonZero, nonZeroSkus]);

  /**
   * Bật lại bộ lọc thì chốt lại danh sách theo số hiện tại (kể cả số vừa gõ
   * chưa lưu) — đây là thời điểm DUY NHẤT bộ lọc được tính lại ngoài lúc tải
   * dữ liệu, và vì do người dùng chủ động bấm nên dòng biến mất không gây bất ngờ.
   */
  const handleToggleNonZero = (checked) => {
    setOnlyNonZero(checked);
    if (checked) setNonZeroSkus(computeNonZero(forecastMap));
  };

  const getSkuTotal = (sku) => months.reduce((sum, m) => sum + (forecastMap[`${sku}_${m}`] || 0), 0);

  // Gộp tổng theo tháng và tổng chu kỳ vào một lượt duyệt. Bản cũ tính
  // getMonthTotal hai lần cho mỗi tháng (một lần cho grandTotal, một lần khi
  // vẽ hàng tổng), tức quét filteredProducts gấp đôi số cần thiết.
  const { monthTotals, grandTotal } = useMemo(() => {
    const per = {};
    months.forEach((m) => { per[m] = 0; });
    filteredProducts.forEach((p) => {
      months.forEach((m) => { per[m] += forecastMap[`${p.sku_code}_${m}`] || 0; });
    });
    return { monthTotals: per, grandTotal: months.reduce((sum, m) => sum + per[m], 0) };
  }, [filteredProducts, forecastMap, months]);

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

  const grid = useGridEditing({
    columns: months,
    rows: filteredProducts,
    getRowKey: (p) => p.sku_code,
    buildCellId: (sku, month) => `${sku}_${month}`,
    getCellValue: (sku, month) => forecastMap[`${sku}_${month}`] || 0,
    onCellsChange: handleCellsChange,
    scrollToRow: (idx) => rowVirtualizer.scrollToIndex(idx, { align: 'auto' })
  });

  return (
    <div className="space-y-4">

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">BẢNG 0: SALES FORECAST 4 THÁNG</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Đơn vị: <strong className="text-slate-800">{currentBU}</strong>
            {dirtyKeys.size > 0 && (
              <span className="ml-2 text-amber-700 font-semibold">
                • {dirtyKeys.size} ô chưa lưu
              </span>
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
            <span>Gửi phê duyệt</span>
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
        canReopen={canReopen}
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

      {cycleLocked && (
        <div className="bg-slate-100 border border-slate-300 text-slate-700 text-xs rounded-lg p-3">
          Chu kỳ đã được duyệt/khoá — bảng ở chế độ chỉ xem.
        </div>
      )}

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 outline-none"
          >
            <option value="ALL">Tất cả nhóm hàng</option>
            {groups.map((g) => (
              <option key={g.code} value={g.code}>{g.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
            <input type="checkbox" checked={onlyNonZero} onChange={(e) => handleToggleNonZero(e.target.checked)} />
            Chỉ hiện SKU có số lượng
          </label>
          {isEditor && (
            <>
              <button
                onClick={() => setShowAddProduct(true)}
                className="flex items-center gap-1.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                Thêm SKU
              </button>
              <button
                onClick={() => setShowImport(true)}
                disabled={!canWrite}
                className="flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Nhập từ file
              </button>
            </>
          )}
        </div>
      </div>

      {showAddProduct && (
        <AddProductModal
          groups={groups}
          bus={bus}
          defaultChannel={currentBU}
          onClose={() => setShowAddProduct(false)}
          onAdded={(product) => {
            setProducts((prev) => [...prev, product]);
            setShowAddProduct(false);
            setMessage({ type: 'success', text: `Đã thêm SKU ${product.sku_code} vào danh mục.` });
          }}
        />
      )}

      {showImport && (
        <React.Suspense fallback={null}>
          <ImportForecastModal
            currentBU={currentBU}
            groups={groups}
            bus={bus}
            monthColumns={months}
            monthColumnLabel={monthLabel}
            weekColumns={months[0] ? weeksOfMonth(months[0]) : []}
            weekBaseMonthLabel={months[0] ? monthLabel(months[0]) : ''}
            regionCodes={regions.map((r) => r.code)}
            onClose={() => setShowImport(false)}
            onProductsAdded={(newProducts) => {
              setProducts((prev) => [...prev, ...newProducts]);
            }}
            onImported={async ({ monthlyUpdates, weeklyUpdates }) => {
              const parts = [];
              if (monthlyUpdates.length) {
                const lines = monthlyUpdates.map(({ rowKey, col, value }) => ({
                  skuCode: rowKey, forecastMonth: col, quantity: value
                }));
                await api.saveMonthlyLines(selectedVersion.id, lines);
                parts.push(`${lines.length} ô Bảng tháng`);
              }
              if (weeklyUpdates.length) {
                const splits = weeklyUpdates.map(({ rowKey, col, value }) => ({
                  skuCode: rowKey, weekNumber: col.week, regionCode: col.region, quantity: value
                }));
                await api.saveWeeklySplits(selectedVersion.id, splits);
                parts.push(`${splits.length} ô Bảng tuần/miền`);
              }
              if (monthlyUpdates.length) await loadLines(selectedVersion.id);
              setMessage({ type: 'success', text: parts.length ? `Đã lưu ${parts.join(' và ')}.` : 'Không có ô nào được cập nhật.' });
            }}
          />
        </React.Suspense>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div ref={scrollParentRef} className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white font-semibold sticky top-0 z-20">
              <tr>
                <th className="py-2.5 px-3 border-r border-slate-700 w-28">Mã SKU</th>
                <th className="py-2.5 px-3 border-r border-slate-700 min-w-[200px]">Tên sản phẩm</th>
                <th className="py-2.5 px-3 border-r border-slate-700 w-28">Nhóm SP</th>
                {months.map((m, colIdx) => (
                  <th key={m} className="py-2.5 px-3 border-r border-slate-700 text-right w-28 bg-blue-900/60">
                    <div className="flex items-center justify-end gap-1.5">
                      {monthLabel(m)}
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => grid.fillColumnDown(colIdx)}
                          title="Điền giá trị dòng đầu xuống toàn bộ cột này"
                          className="p-0.5 rounded hover:bg-blue-800/60"
                        >
                          <ArrowDownToLine className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right w-32 bg-cyan-900/60">TỔNG CHU KỲ</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={4 + months.length} className="py-8 text-center text-slate-400 font-sans">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : !selectedVersion ? (
                <tr>
                  <td colSpan={4 + months.length} className="py-8 text-center text-slate-400 font-sans">
                    Chưa có chu kỳ nào cho đơn vị này. Dùng nút “Mở chu kỳ” ở trên để bắt đầu.
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={4 + months.length} className="py-8 text-center text-slate-400 font-sans">
                    Không tìm thấy SKU phù hợp
                  </td>
                </tr>
              ) : (
                <>
                  {topPad > 0 && <tr style={{ height: topPad }} aria-hidden="true" />}
                  {virtualRows.map((vRow) => {
                    const p = filteredProducts[vRow.index];
                    return (
                      <tr key={p.sku_code} className="hover:bg-blue-50/50 transition">
                        <td className="py-2 px-3 border-r border-slate-200 font-bold text-slate-800">{p.sku_code}</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-sans font-medium text-slate-900 truncate max-w-xs">{p.name}</td>
                        <td className="py-2 px-3 border-r border-slate-200 font-sans text-slate-600 text-[11px]">
                          {p.product_group_name || p.product_group_code}
                        </td>

                        {months.map((m, colIdx) => {
                          const key = `${p.sku_code}_${m}`;
                          const isDirty = dirtyKeys.has(key);
                          return (
                            <td key={m} className="p-1 border-r border-slate-200 text-right">
                              <input
                                ref={grid.registerRef(key)}
                                type="number"
                                min="0"
                                step="1"
                                disabled={!canWrite}
                                value={forecastMap[key] ?? 0}
                                onChange={(e) => handleCellChange(p.sku_code, m, e.target.value)}
                                onKeyDown={(e) => canWrite && grid.handleKeyDown(e, vRow.index, colIdx)}
                                onPaste={(e) => canWrite && grid.handlePaste(e, vRow.index, colIdx)}
                                className={`w-full text-right px-2 py-1 rounded font-semibold outline-none transition disabled:text-slate-500 disabled:cursor-not-allowed ${
                                  isDirty
                                    ? 'bg-amber-50 ring-1 ring-amber-300 text-amber-900'
                                    : 'bg-transparent hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500 text-slate-900'
                                }`}
                              />
                            </td>
                          );
                        })}

                        <td className="py-2 px-3 text-right font-bold text-blue-700 bg-slate-50">
                          {getSkuTotal(p.sku_code).toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    );
                  })}
                  {bottomPad > 0 && <tr style={{ height: bottomPad }} aria-hidden="true" />}
                </>
              )}
            </tbody>

            <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900 sticky bottom-0 z-10">
              <tr>
                <td colSpan="3" className="py-3 px-3 uppercase text-slate-700 text-right">
                  Tổng cộng sản lượng (chiếc):
                </td>
                {months.map((m) => (
                  <td key={m} className="py-3 px-3 text-right font-mono text-blue-900 font-black">
                    {(monthTotals[m] || 0).toLocaleString('vi-VN')}
                  </td>
                ))}
                <td className="py-3 px-3 text-right font-mono text-cyan-900 font-black text-sm bg-cyan-100/50">
                  {grandTotal.toLocaleString('vi-VN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
}
