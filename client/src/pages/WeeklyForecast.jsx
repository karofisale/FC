import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../services/api';
import CycleBar from '../components/CycleBar';
import ValidationAlert from '../components/ValidationAlert';
import AddProductModal from '../components/AddProductModal';
// Tải lười — kéo theo thư viện xlsx (~290KB) chỉ để đọc file Excel, đa số
// người dùng không bấm "Nhập từ file" mỗi lần vào trang này.
const ImportForecastModal = React.lazy(() => import('../components/ImportForecastModal'));
import { Save, Send, Search, Loader2, Wand2, ArrowDownToLine, PackagePlus, FileSpreadsheet, ListChecks } from 'lucide-react';
import { monthsOfCycle, weeksOfMonth, weekLabel, monthLabel, monthLabelFull, normalizeMonth } from '../utils/period';
import { setDirty } from '../services/dirtyState';
import { appConfirm } from '../services/dialogService';
import { thongBao } from '../services/toastService';
import { loadPref, savePref } from '../services/prefs';
import { usePersistedState } from '../utils/usePersistedState';
import { useTableSort } from '../utils/useTableSort';
import { SortTh, StateRow } from '../components/TableStates';
import MoreMenu from '../components/MoreMenu';
import { useGridEditing, parsePastedNumber, CHAN_LAN_CHUOT } from '../utils/useGridEditing';
import { demGhiDe, cauHoiGhiDe } from '../utils/gridOverwrite';
import { capNhatRaiDeu, laDongLech, tapSkuLech, tinhRaiDeuTatCa } from '../utils/weeklyDistribute';
import { MAN_HINH } from '../utils/glossary';

// Bảng này nặng nhất trong app — kênh XK 756 SKU × (số tuần × số miền)
// ô input, có thể tới ~6000 ô nếu render hết cùng lúc. Chỉ dựng DOM cho
// dòng đang lọt khung nhìn.
const ROW_HEIGHT_PX = 37;

// Thông báo kết quả đi qua toast xếp hàng (Đợt 2 mục 2): thành công tự tắt ~4 giây, lỗi nằm lại tới khi bấm ×.
const setMessage = thongBao;
const laChuoi = (v) => typeof v === 'string';
const maSku = (p) => p.sku_code;
// Nút chính (xanh) và nút phụ (trắng viền): mỗi màn chỉ MỘT nút chính (Đợt 2 mục 4).
const NUT_CHINH = 'flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50';
const NUT_PHU = 'flex items-center space-x-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50';

export default function WeeklyForecast({ currentBU, user }) {
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [products, setProducts] = useState([]);
  const [regions, setRegions] = useState([]);
  const [groups, setGroups] = useState([]);
  const [bus, setBus] = useState([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
  // Nhớ ô "chỉ hiện SKU có số lượng" giữa các lần mở (Đợt 2 mục 9).
  const [onlyNonZero, setOnlyNonZero] = usePersistedState('weeklyOnlyNonZero', true, (v) => typeof v === 'boolean');
  const [nonZeroSkus, setNonZeroSkus] = useState(() => new Set());
  // Lọc "chỉ dòng lệch" (tổng tuần/miền khác FC tháng 1). Danh sách lệch được CHỐT lúc tải / lúc bật lọc, không tính lại theo từng phím gõ —
  // cùng lý do với nonZeroSkus: sửa cho một dòng hết lệch mà nó biến mất ngay dưới con trỏ thì không gõ tiếp được.
  const [chiLech, setChiLech] = useState(false);
  const [lechSkus, setLechSkus] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loiTai, setLoiTai] = useState(null);

  const baseMonth = normalizeMonth(selectedCycle?.base_month) || monthsOfCycle(selectedCycle)[0] || '';
  // Memo hoá để mảng giữ nguyên định danh giữa các lần render, nếu không mọi
  // useMemo phụ thuộc vào chúng đều bị tính lại sau từng phím gõ.
  const weeks = useMemo(() => (baseMonth ? weeksOfMonth(baseMonth) : []), [baseMonth]);
  const regionCodes = useMemo(() => regions.map((r) => r.code), [regions]);

  /** Tập SKU có số ở bảng tháng HOẶC ở bất kỳ ô tuần/miền nào. */
  const computeNonZero = useCallback((mMap, wMap) => {
    const s = new Set();
    Object.keys(mMap).forEach((sku) => { if ((mMap[sku] || 0) > 0) s.add(sku); });
    Object.keys(wMap).forEach((k) => {
      if (!(wMap[k] || 0)) return;
      // Khoá dạng `${sku}_${tuần}_${miền}` — bỏ đúng hai hậu tố cuối, vì
      // bản thân mã SKU có thể chứa dấu gạch dưới.
      const lastUnd = k.lastIndexOf('_');
      const secondLast = k.lastIndexOf('_', lastUnd - 1);
      if (secondLast > 0) s.add(k.slice(0, secondLast));
    });
    return s;
  }, []);

  const isEditor = user?.role === 'bu_editor' || user?.role === 'central_admin';
  // Rút lại phê duyệt là quyền của người thẩm định, không phải người lập kế hoạch
  const canReopen = user?.role === 'bu_approver' || user?.role === 'central_admin';
  const cycleLocked = selectedCycle?.status === 'approved' || selectedCycle?.status === 'locked';
  const canWrite = isEditor && !!selectedVersion && !cycleLocked;
  // Đang chờ duyệt: lưu là server rút yêu cầu duyệt (xem MonthlyForecast).
  const choDuyet = selectedCycle?.status === 'submitted';

  /** Áp dữ liệu đã có sẵn (từ action gộp) vào state, không gọi mạng thêm. */
  // Danh sách SKU / tuần / miền hiện hành, cho phần chốt danh sách "lệch" khi dữ liệu vừa tải (state chưa kịp cập nhật);
  // loadAll truyền thẳng giá trị mới vào `nho` vì lúc đó products/regions vừa được set trong cùng lượt.
  const ctxRef = useRef({ products: [], weeks: [], regionCodes: [] });
  useEffect(() => { ctxRef.current = { products, weeks, regionCodes }; }, [products, weeks, regionCodes]);

  const applyForecasts = useCallback((monthlyQuantities, splits, valRes, nho) => {
    const mMap = monthlyQuantities || {};
    setMonthlyMap(mMap);

    const wMap = {};
    (splits || []).forEach((s) => {
      wMap[`${s.sku_code}_${s.week_number}_${s.region_code}`] = Number(s.quantity) || 0;
    });
    setWeeklyMap(wMap);
    setNonZeroSkus(computeNonZero(mMap, wMap));
    const c = nho || ctxRef.current;
    setLechSkus(tapSkuLech(c.products, mMap, wMap, c.weeks, c.regionCodes));
    setValidationResult(valRes || null);
    setDirtyKeys(new Set());
  }, [computeNonZero]);

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
    applyForecasts(mMap, wSplits, valRes);
  }, [applyForecasts]);

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

  /**
   * Một lượt gọi thay cho chuỗi getCycles -> getVersions -> (getMonthlyLines
   * + getWeeklySplits + validateWeekly): 3 chặng nối tiếp, tổng 5 lượt gọi
   * mạng. Phần kiểm tra khớp số được backend tính ngay từ dữ liệu vừa đọc.
   * getRegions/getGroups/getBUs lấy từ bootstrap đã cache, không tốn lượt gọi.
   */
  const loadAll = useCallback(async (preferCycleId, preferVersionId) => {
    setLoading(true);
    setLoiTai(null);
    try {
      const [ws, regionList, groupList, buList] = await Promise.all([
        api.getWeeklyWorkspace({ bu: currentBU, cycleId: preferCycleId, versionId: preferVersionId }),
        api.getRegions(),
        api.getGroups(),
        api.getBUs()
      ]);

      setCycles(ws.cycles || []);
      setProducts(ws.products || []);
      setRegions(ws.regions?.length ? ws.regions : regionList);
      setGroups(groupList);
      setBus(buList);

      setSelectedCycle(ws.cycle || null);
      setVersions(ws.versions || []);
      setSelectedVersion(ws.version || null);
      const regionsMoi = ws.regions?.length ? ws.regions : regionList;
      const thangGoc = normalizeMonth(ws.cycle?.base_month) || monthsOfCycle(ws.cycle)[0] || '';
      applyForecasts(ws.monthlyQuantities, ws.splits, ws.validation, {
        products: ws.products || [], weeks: thangGoc ? weeksOfMonth(thangGoc) : [], regionCodes: regionsMoi.map((r) => r.code)
      });
      // Nhớ chu kỳ đang xem (theo đơn vị; dùng chung với Bảng 0) — Đợt 2 mục 9.
      if (ws.cycle?.id) savePref('cycle:' + currentBU, ws.cycle.id);
    } catch (err) {
      // Lỗi tải: bảng hiện lỗi + "Thử lại" (không im lặng thành bảng rỗng).
      setLoiTai(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentBU, applyForecasts]);

  // Lần mở đầu: vào lại đúng chu kỳ lần trước (server rơi về chu kỳ mới nhất nếu mã đó không còn).
  useEffect(() => {
    if (currentBU) loadAll(loadPref('cycle:' + currentBU, undefined, laChuoi));
  }, [currentBU, loadAll]);

  const handleSelectCycle = async (cycle) => {
    if (!cycle) return;
    savePref('cycle:' + currentBU, cycle.id);
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

  /** Áp nhiều ô cùng lúc (dán khối từ Excel, fill-down, Ctrl+D) trong 1 lần cập nhật. */
  const handleCellsChange = (updates) => {
    setWeeklyMap((prev) => {
      const next = { ...prev };
      updates.forEach(({ rowKey, col, value }) => {
        next[`${rowKey}_${col.week}_${col.region}`] = parsePastedNumber(value);
      });
      return next;
    });
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      updates.forEach(({ rowKey, col }) => next.add(`${rowKey}_${col.week}_${col.region}`));
      return next;
    });
  };

  /** Rải đều số tháng 1 của một SKU ra các ô tuần × miền, phần dư dồn vào ô cuối (tính ở utils/weeklyDistribute.js). */
  const distributeEvenly = (skuCode) => {
    const updates = capNhatRaiDeu(skuCode, monthlyMap[skuCode] || 0, weeks, regionCodes);
    if (updates.length) handleCellsChange(updates);
  };

  /**
   * "Rải đều tất cả dòng lệch": cùng cách tính với nút rải đều từng dòng, áp cho mọi SKU đang lệch trong danh sách đang hiển thị.
   * Có xem trước (bao nhiêu dòng, bao nhiêu ô đang có số sẽ bị thay) và hỏi xác nhận; chưa lưu cho tới khi bấm "Lưu bản thảo".
   */
  const raiDeuTatCaLech = async () => {
    const kq = tinhRaiDeuTatCa({ danhSach: filteredProducts, monthlyMap, weeklyMap, tuan: weeks, mien: regionCodes });
    if (!kq.dong) {
      setMessage({ type: 'error', text: kq.boQua
        ? `Không có dòng nào rải đều được: ${kq.boQua} SKU lệch nhưng số tháng 1 bằng 0 (rải đều chỉ là xoá số tuần/miền — hãy tự kiểm tra các dòng đó).`
        : 'Không có dòng nào đang lệch.' });
      return;
    }
    const phamVi = search.trim() !== '' ? ' trong các dòng khớp ô tìm kiếm' : '';
    if (!(await appConfirm(
      `Rải đều số tháng 1 ra ${weeks.length} tuần × ${regionCodes.length} miền cho ${kq.dong.toLocaleString('vi-VN')} SKU đang lệch${phamVi}.\n\n`
      + `Số tuần/miền đang nhập của các SKU này sẽ bị thay bằng số chia đều${kq.oGhiDe ? ` (${kq.oGhiDe.toLocaleString('vi-VN')} ô đang có số sẽ đổi)` : ''}; phần dư dồn vào ô cuối. `
      + (kq.boQua ? `${kq.boQua.toLocaleString('vi-VN')} SKU lệch nhưng có số tháng 1 bằng 0 sẽ KHÔNG bị đụng tới. ` : '')
      + 'Chưa lưu cho tới khi bấm "Lưu bản thảo".',
      { title: 'Rải đều tất cả dòng lệch?', okLabel: `Rải đều ${kq.dong.toLocaleString('vi-VN')} dòng`, danger: true }
    ))) return;
    handleCellsChange(kq.updates);
    setMessage({ type: 'success', text: `Đã rải đều ${kq.dong.toLocaleString('vi-VN')} SKU — bấm "Lưu bản thảo" để lưu.` });
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
    if (choDuyet && dirtyKeys.size > 0
      && !(await appConfirm('Bản đang chờ duyệt — lưu sẽ rút yêu cầu duyệt, cần gửi lại. Vẫn lưu?', {
        title: 'Lưu sẽ rút yêu cầu duyệt', okLabel: 'Lưu và rút yêu cầu duyệt'
      }))) return;
    setSaving(true);
    try {
      const res = await saveChanges();
      // Server vừa đưa chu kỳ về nháp: nạp lại cả màn để trạng thái đúng với server
      // (loadAll tính lại cả phần kiểm tra khớp số).
      if (res.approvalWithdrawn) await loadAll(selectedCycle.id, selectedVersion.id);
      else setValidationResult(await api.validateWeeklySplits(selectedVersion.id));
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
    // Gửi duyệt hỏi lại, nói rõ gửi cái gì (đơn vị, chu kỳ, bản, tổng) — xem MonthlyForecast.
    const nhanBan = selectedVersion.iso_week_label || (selectedVersion.update_week ? `Tuần ${selectedVersion.update_week}` : 'bản đang chọn');
    if (!(await appConfirm(
      `Kiểm tra và gửi kế hoạch Forecast của đơn vị ${currentBU} — chu kỳ ${monthLabelFull(selectedCycle.base_month)}, bản ${nhanBan} — để thẩm định?\n\n`
      + `Bảng tuần/miền: tổng ${tongCuoi.tuan.toLocaleString('vi-VN')} chiếc so với FC tháng 1 là ${tongCuoi.thang.toLocaleString('vi-VN')} chiếc.`
      + (dirtyKeys.size ? ` ${dirtyKeys.size} ô chưa lưu sẽ được lưu trước khi gửi.` : '')
      + (choDuyet ? ' Bản đang chờ duyệt: gửi lại sẽ thay yêu cầu cũ.' : ''),
      { title: 'Kiểm tra và gửi phê duyệt?', okLabel: 'Gửi phê duyệt' }
    ))) return;
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

  /** Bật lại bộ lọc thì chốt lại danh sách theo số hiện tại (kể cả số chưa lưu). */
  const handleToggleNonZero = (checked) => {
    setOnlyNonZero(checked);
    if (checked) setNonZeroSkus(computeNonZero(monthlyMap, weeklyMap));
  };

  const handleToggleLech = (checked) => {
    setChiLech(checked);
    if (checked) setLechSkus(tapSkuLech(products, monthlyMap, weeklyMap, weeks, regionCodes));
  };

  const getSkuWeeklySum = (skuCode) =>
    weeks.reduce((sum, w) => sum + regionCodes.reduce(
      (s, r) => s + (weeklyMap[`${skuCode}_${w}_${r}`] || 0), 0
    ), 0);

  /**
   * Chốt danh sách hiển thị theo từng lần TẢI dữ liệu, không tính lại theo
   * từng phím gõ. Bản cũ duyệt 750 SKU x số tuần x số miền cho MỖI lần
   * render, và vì đọc thẳng weeklyMap đang sửa nên xoá ô cuối cùng của một
   * dòng là dòng đó biến mất ngay dưới con trỏ.
   */
  const filteredProducts = useMemo(() => {
    const s = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchSearch = !s
        || String(p.sku_code).toLowerCase().includes(s)
        || String(p.name).toLowerCase().includes(s);
      // String() hai ben: nonZeroSkus dung tu khoa cua forecastMap nen luon la
      // CHUOI, con p.sku_code co the la SO — Sheets bien "2013050022" thanh so
      // ngay khi mot lenh setValues ghi lai o do. Set.has so theo kieu, nen
      // thieu String() la KHONG mot ma nao khop va bo loc quet sach bang.
      const matchNonZero = !onlyNonZero || nonZeroSkus.has(String(p.sku_code));
      const matchLech = !chiLech || lechSkus.has(String(p.sku_code));
      return matchSearch && matchNonZero && matchLech;
    });
  }, [products, search, onlyNonZero, nonZeroSkus, chiLech, lechSkus]);

  // Số dòng đang lệch NGAY LÚC NÀY (chỉ để hiện con số trên nút — danh sách lọc dùng bản đã chốt ở trên).
  const soDongLech = useMemo(
    () => products.filter((p) => laDongLech(p.sku_code, monthlyMap, weeklyMap, weeks, regionCodes)).length,
    [products, monthlyMap, weeklyMap, weeks, regionCodes]
  );

  const columnCount = 3 + weeks.length * regionCodes.length + 2;

  // Sắp xếp theo cột. Thứ tự CHỐT lúc bấm tiêu đề (xem useTableSort): gõ số không làm dòng nhảy chỗ,
  // và sắp xếp không đụng tới dữ liệu đang sửa — chỉ đảo thứ tự hiển thị.
  const cotLuoi = {
    sku: { type: 'text', get: (p) => p.sku_code },
    ten: { type: 'text', get: (p) => p.name },
    fc: { type: 'number', get: (p) => monthlyMap[p.sku_code] || 0 },
    tuan: { type: 'number', get: (p) => getSkuWeeklySum(p.sku_code) },
    lech: { type: 'number', get: (p) => getSkuWeeklySum(p.sku_code) - (monthlyMap[p.sku_code] || 0) }
  };
  const { rows: sapXep, spec: sortLuoi, toggle: doiSapXep } = useTableSort(filteredProducts, cotLuoi, maSku);

  // Dòng tổng ở chân bảng: FC tháng 1, từng ô tuần/miền, tổng tuần, lệch — cộng trên TOÀN BỘ danh mục
  // (không theo ô tìm kiếm / ô "chỉ hiện SKU có số lượng"), cùng quy ước với Bảng 0.
  const tongCuoi = useMemo(() => {
    const cot = {};
    let thang = 0;
    let tuan = 0;
    products.forEach((p) => {
      thang += monthlyMap[p.sku_code] || 0;
      weeks.forEach((w) => regionCodes.forEach((r) => {
        const q = weeklyMap[`${p.sku_code}_${w}_${r}`] || 0;
        if (!q) return;
        cot[`${w}_${r}`] = (cot[`${w}_${r}`] || 0) + q;
        tuan += q;
      }));
    });
    return { cot, thang, tuan };
  }, [products, monthlyMap, weeklyMap, weeks, regionCodes]);

  const scrollParentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: sapXep.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPad = virtualRows.length ? virtualRows[0].start : 0;
  const bottomPad = virtualRows.length ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  // Cột = từng tổ hợp (tuần, miền) theo đúng thứ tự hiển thị trái→phải
  const weeklyColumns = weeks.flatMap((w) => regionCodes.map((r) => ({ week: w, region: r })));
  const grid = useGridEditing({
    columns: weeklyColumns,
    rows: sapXep,
    getRowKey: (p) => p.sku_code,
    buildCellId: (sku, col) => `${sku}_${col.week}_${col.region}`,
    getCellValue: (sku, col) => weeklyMap[`${sku}_${col.week}_${col.region}`] || 0,
    onCellsChange: handleCellsChange,
    scrollToRow: (idx) => rowVirtualizer.scrollToIndex(idx, { align: 'auto' }),
    // "Điền xuống cả cột" chỉ chạm các dòng ĐANG HIỂN THỊ; có số cũ bị đè thì hỏi trước.
    xacNhanDienCot: async (updates, colIdx, value) => {
      const col = weeklyColumns[colIdx];
      const dem = demGhiDe(updates, (sku, c) => weeklyMap[`${sku}_${c.week}_${c.region}`] || 0);
      const cauHoi = cauHoiGhiDe(dem, `Điền ${Number(value).toLocaleString('vi-VN')} (số của dòng đầu) xuống ${updates.length.toLocaleString('vi-VN')} dòng đang hiển thị của cột ${weekLabel(baseMonth, col.week)} · ${col.region}.`);
      if (!cauHoi) return true;
      return appConfirm(cauHoi, { title: 'Điền xuống cả cột?', okLabel: `Ghi đè ${dem.ghiDe.toLocaleString('vi-VN')} ô`, danger: true });
    }
  });

  return (
    <div className="space-y-4">

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{MAN_HINH.weekly.tieuDe} <span className="text-sm font-semibold text-slate-500" title={MAN_HINH.weekly.mota}>(Bảng 1)</span></h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Đơn vị: <strong className="text-slate-800">{currentBU}</strong>
            {baseMonth && <> · Tháng chia tuần: <strong className="text-slate-800">{monthLabel(baseMonth)}</strong> ({weeks.length} tuần)</>}
            {dirtyKeys.size > 0 && (
              <span className="ml-2 text-amber-700 font-semibold">• {dirtyKeys.size} ô chưa lưu</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Một nút chính theo "bước tiếp theo": còn ô chưa lưu thì Lưu là nút chính, hết thì Kiểm tra & gửi duyệt. */}
          <button
            onClick={handleSave}
            disabled={saving || !canWrite || dirtyKeys.size === 0}
            className={dirtyKeys.size > 0 ? NUT_CHINH : NUT_PHU}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{saving ? 'Đang lưu...' : 'Lưu bản thảo'}</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={saving || !canWrite}
            className={dirtyKeys.size > 0 ? NUT_PHU : NUT_CHINH}
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
        canReopen={canReopen}
        onChanged={(cycleId, versionId) => loadAll(cycleId, versionId)}
      />

      <ValidationAlert validationResult={validationResult} />

      {choDuyet && isEditor && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-lg p-3">
          Bản đang chờ duyệt — lưu thay đổi sẽ rút yêu cầu duyệt, cần gửi lại.
        </div>
      )}

      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
          <input type="checkbox" checked={onlyNonZero} onChange={(e) => handleToggleNonZero(e.target.checked)} />
          Chỉ hiện SKU có số lượng
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap" title="Chỉ hiện SKU có tổng tuần/miền khác FC tháng 1 (cột Lệch khác ✓)">
          <input type="checkbox" checked={chiLech} onChange={(e) => handleToggleLech(e.target.checked)} />
          Chỉ dòng lệch ({soDongLech.toLocaleString('vi-VN')})
        </label>
        {canWrite && (
          <button
            type="button"
            onClick={raiDeuTatCaLech}
            disabled={soDongLech === 0}
            title="Chia đều số tháng 1 ra các ô tuần × miền cho mọi SKU đang lệch (có xem trước và hỏi xác nhận)"
            className="flex items-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
          >
            <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
            Rải đều tất cả dòng lệch
          </button>
        )}
        {isEditor && (
          <>
            <button
              onClick={() => setShowImport(true)}
              disabled={!canWrite}
              className="flex items-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Nhập từ file
            </button>
            {/* Thao tác ít dùng gom vào "⋯ Thêm" để màn chỉ còn một nút chính. */}
            <MoreMenu items={[
              { label: 'Thêm SKU vào danh mục', icon: PackagePlus, onClick: () => setShowAddProduct(true) }
            ]} />
          </>
        )}
      </div>

      {showImport && (
        <React.Suspense fallback={null}>
          <ImportForecastModal
            currentBU={currentBU}
            groups={groups}
            bus={bus}
            monthColumns={monthsOfCycle(selectedCycle)}
            monthColumnLabel={monthLabel}
            weekColumns={weeks}
            weekBaseMonthLabel={baseMonth ? monthLabel(baseMonth) : ''}
            regionCodes={regionCodes}
            versionId={selectedVersion?.id}
            unsavedCount={dirtyKeys.size}
            cycleStatus={selectedCycle?.status}
            onClose={() => setShowImport(false)}
            onProductsAdded={(newProducts) => {
              setProducts((prev) => [...prev, ...newProducts]);
            }}
            onImported={async ({ monthlyUpdates, weeklyUpdates }) => {
              const parts = [];
              let daRut = false;
              if (monthlyUpdates.length) {
                const lines = monthlyUpdates.map(({ rowKey, col, value }) => ({
                  skuCode: rowKey, forecastMonth: col, quantity: value
                }));
                // Nhập lại = ghi đè trọn bản kế hoạch này: SKU không còn trong file
                // phải biến mất, không được nằm lại cộng vào tổng.
                const r = await api.saveMonthlyLines(selectedVersion.id, lines, true);
                daRut = daRut || !!r.approvalWithdrawn;
                parts.push(`${lines.length} ô Bảng tháng`);
              }
              if (weeklyUpdates.length) {
                const splits = weeklyUpdates.map(({ rowKey, col, value }) => ({
                  skuCode: rowKey, weekNumber: col.week, regionCode: col.region, quantity: value
                }));
                const r = await api.saveWeeklySplits(selectedVersion.id, splits, true);
                daRut = daRut || !!r.approvalWithdrawn;
                parts.push(`${splits.length} ô Bảng tuần/miền`);
              }
              // Rút duyệt -> trạng thái chu kỳ đổi, nạp lại cả màn.
              if (daRut) await loadAll(selectedCycle.id, selectedVersion.id);
              else await loadForecasts(selectedVersion.id, normalizeMonth(selectedCycle.base_month));
              setMessage({
                type: 'success',
                text: (parts.length ? `Đã lưu ${parts.join(' và ')}.` : 'Không có ô nào được cập nhật.')
                  + (daRut ? ' Bản đang chờ duyệt đã được rút về nháp — cần gửi duyệt lại.' : '')
              });
            }}
          />
        </React.Suspense>
      )}

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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div ref={scrollParentRef} className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white font-semibold sticky top-0 z-20">
              <tr>
                <SortTh rowSpan="2" label="Mã SKU" sortKey="sku" spec={sortLuoi} onSort={doiSapXep} className="sticky left-0 z-30 bg-slate-800 shadow-[inset_-1px_0_0_#475569] py-2 px-3 border-r border-slate-700 w-28 min-w-28" />
                <SortTh rowSpan="2" label="Tên sản phẩm" sortKey="ten" spec={sortLuoi} onSort={doiSapXep} className="py-2 px-3 border-r border-slate-700 min-w-[180px]" />
                <SortTh rowSpan="2" label="FC tháng 1" sortKey="fc" spec={sortLuoi} onSort={doiSapXep} className="py-2 px-3 border-r border-slate-700 text-right w-24 bg-blue-900/60" />
                {weeks.map((w) => (
                  <th
                    key={w}
                    colSpan={regionCodes.length}
                    className="py-2 px-3 border-r border-slate-700 text-center bg-slate-900/60 whitespace-nowrap"
                  >
                    {weekLabel(baseMonth, w)}
                  </th>
                ))}
                <SortTh rowSpan="2" label="Tổng tuần" sortKey="tuan" spec={sortLuoi} onSort={doiSapXep} className="py-2 px-3 border-r border-slate-700 text-right w-24 bg-cyan-900/60" />
                <SortTh rowSpan="2" label="Lệch" sortKey="lech" spec={sortLuoi} onSort={doiSapXep} className="py-2 px-3 text-right w-24" />
              </tr>
              <tr>
                {weeklyColumns.map((col, colIdx) => (
                  <th key={`${col.week}-${col.region}`} className="py-1.5 px-2 border-r border-slate-700 text-right text-[10px] font-mono bg-slate-900/40">
                    <div className="flex items-center justify-end gap-1">
                      {col.region}
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => grid.fillColumnDown(colIdx)}
                          title="Điền giá trị dòng đầu xuống toàn bộ cột này"
                          className="p-0.5 rounded hover:bg-slate-700"
                        >
                          <ArrowDownToLine className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 font-mono">
              {loading ? (
                <StateRow colSpan={columnCount} kind="loading" />
              ) : loiTai ? (
                <StateRow colSpan={columnCount} kind="error" text={loiTai} onRetry={() => loadAll(selectedCycle?.id, selectedVersion?.id)} />
              ) : !selectedVersion ? (
                <StateRow colSpan={columnCount} kind="empty" text="Chưa có chu kỳ nào cho đơn vị này. Mở chu kỳ ở thanh phía trên trước." />
              ) : filteredProducts.length === 0 ? (
                <StateRow colSpan={columnCount} kind="empty" text="Không tìm thấy SKU phù hợp" />
              ) : (
                <>
                  {topPad > 0 && <tr style={{ height: topPad }} aria-hidden="true" />}
                  {virtualRows.map((vRow) => {
                  const p = sapXep[vRow.index];
                  const monthQty = monthlyMap[p.sku_code] || 0;
                  const weekSum = getSkuWeeklySum(p.sku_code);
                  const diff = weekSum - monthQty;

                  return (
                    <tr key={p.sku_code} className="hover:bg-blue-50/50 transition">
                      <td className="sticky left-0 z-10 bg-white shadow-[inset_-1px_0_0_#e2e8f0] py-2 px-3 border-r border-slate-200 font-bold text-slate-800">{p.sku_code}</td>
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

                      {weeklyColumns.map((col, colIdx) => {
                        const key = `${p.sku_code}_${col.week}_${col.region}`;
                        const isDirty = dirtyKeys.has(key);
                        return (
                          <td key={key} className="p-1 border-r border-slate-200 text-right">
                            <input
                              ref={grid.registerRef(key)}
                              type="number"
                              min="0"
                              step="1"
                              disabled={!canWrite}
                              value={weeklyMap[key] ?? 0}
                              {...CHAN_LAN_CHUOT}
                              onChange={(e) => handleCellChange(p.sku_code, col.week, col.region, e.target.value)}
                              onKeyDown={(e) => canWrite && grid.handleKeyDown(e, vRow.index, colIdx)}
                              onPaste={(e) => canWrite && grid.handlePaste(e, vRow.index, colIdx)}
                              className={`w-16 text-right px-1.5 py-1 rounded font-semibold outline-none transition disabled:text-slate-500 disabled:cursor-not-allowed ${
                                isDirty
                                  ? 'bg-amber-50 ring-1 ring-amber-300 text-amber-900'
                                  : 'bg-transparent hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500 text-slate-900'
                              }`}
                            />
                          </td>
                        );
                      })}

                      <td className="py-2 px-3 border-r border-slate-200 text-right font-bold text-slate-800 bg-slate-50">
                        {weekSum.toLocaleString('vi-VN')}
                      </td>
                      <td className={`py-2 px-3 text-right font-bold ${
                        diff === 0 ? 'text-emerald-700' : 'text-rose-700 bg-rose-50'
                      }`}>
                        {diff === 0 ? '✓' : diff > 0 ? `+${diff.toLocaleString('vi-VN')}` : diff.toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  );
                  })}
                  {bottomPad > 0 && <tr style={{ height: bottomPad }} aria-hidden="true" />}
                </>
              )}
            </tbody>

            {!loading && !loiTai && selectedVersion && products.length > 0 && (
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900 sticky bottom-0 z-10">
                <tr>
                  <td className="sticky left-0 z-10 bg-slate-100 shadow-[inset_-1px_0_0_#cbd5e1] py-2.5 px-3 uppercase text-slate-700 text-xs">Tổng</td>
                  <td className="py-2.5 px-3 uppercase text-slate-700 text-right text-xs">
                    Tổng cộng (chiếc):
                    {(search.trim() !== '' || onlyNonZero) && (
                      <span className="ml-2 normal-case font-normal text-[11px] text-slate-600">cả danh mục — không theo bộ lọc đang bật</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-blue-900">{tongCuoi.thang.toLocaleString('vi-VN')}</td>
                  {weeklyColumns.map((col) => (
                    <td key={`${col.week}-${col.region}`} className="py-2.5 px-2 text-right font-mono text-[11px]">
                      {(tongCuoi.cot[`${col.week}_${col.region}`] || 0).toLocaleString('vi-VN')}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 text-right font-mono text-cyan-900">{tongCuoi.tuan.toLocaleString('vi-VN')}</td>
                  <td className={`py-2.5 px-3 text-right font-mono ${tongCuoi.tuan === tongCuoi.thang ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {tongCuoi.tuan === tongCuoi.thang ? '✓' : (tongCuoi.tuan > tongCuoi.thang ? '+' : '') + (tongCuoi.tuan - tongCuoi.thang).toLocaleString('vi-VN')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}
