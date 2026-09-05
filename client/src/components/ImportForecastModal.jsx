import React, { useState, useMemo } from 'react';
import {
  X, Upload, Sheet, Loader2, AlertCircle, ArrowLeft, ArrowRight,
  CheckCircle2, FileSpreadsheet, PackagePlus
} from 'lucide-react';
import { api } from '../services/api';
import { parsePastedNumber } from '../utils/useGridEditing';
import { parseExcelFile, extractSpreadsheetId } from '../utils/importParsing';
import {
  aggregateRegionBlocks, detectStackedBlocks, findTotalsRow, readTotalsRow, guessRegionSheets
} from '../utils/importAggregate';

const NONE = '__none__';

/**
 * Nhập forecast hàng loạt từ file Excel tải lên hoặc một tab Google
 * Sheet ngoài. Luồng: chọn nguồn -> (nếu nhiều tab, chọn tab) -> gán cột
 * (mã SKU + từng tháng, và tuỳ chọn từng tuần) -> phát hiện SKU chưa có
 * trong danh mục, cho điền nhanh rồi ghi hàng loạt -> lưu thẳng lên server.
 *
 * File nguồn không cố định dòng nào là tiêu đề/bắt đầu dữ liệu (một số
 * file xuất có vài dòng tiêu đề/ghi chú phía trên bảng thật), nên người
 * dùng tự chọn dòng tiêu đề và dòng bắt đầu dữ liệu thay vì mặc định dòng 1.
 *
 * monthColumns/monthColumnLabel: cột tháng đích (Bảng 0) — chỉ cần chọn
 *   MỘT cột bắt đầu (ứng với monthColumns[0]), các cột sau lấy liên tiếp
 *   ngay bên phải, vì file nguồn luôn xếp các tháng liền nhau theo thứ tự.
 * weekColumns/regionCodes/weekBaseMonthLabel: cột tuần đích (Bảng 1), chỉ
 *   hiện khi được truyền vào — vì Bảng 1 chỉ chia tuần cho tháng đầu chu
 *   kỳ. Có 2 cách gán, chọn MỘT trong hai:
 *   - Cột bắt đầu: chọn 1 cột ứng với Tuần 1 của miền đầu tiên, các cột
 *     sau được suy ra liên tiếp theo đúng thứ tự miền (regionCodes) lặp
 *     lại cho mỗi tuần kế tiếp (VD: Tuần1-MB, Tuần1-MN, Tuần2-MB, ...) —
 *     khớp với cấu trúc file thường gặp.
 *   - Nếu không chọn cột bắt đầu: gán riêng từng ô (tuần, miền) cụ thể
 *     vào một cột bất kỳ — dùng khi file không xếp cột liên tục theo
 *     đúng thứ tự trên.
 *   Tuần/miền không được gán (qua cả hai cách) hoặc vượt quá số cột file
 *   có sẽ ghi 0 (không giữ nguyên số cũ) để tổng tuần luôn khớp với dữ
 *   liệu vừa nhập.
 * onImported({ monthlyUpdates, weeklyUpdates }): gọi (và được await) sau
 *   khi người dùng xác nhận — updates dạng [{ rowKey: skuCode, col, value }].
 *   Trang cha tự lưu thẳng lên server (saveMonthlyLines/saveWeeklySplits)
 *   và tải lại dữ liệu, vì bảng còn lại có thể không đang mở để tô ô chờ lưu.
 * onProductsAdded(products): gọi khi có SKU mới vừa được ghi vào danh
 *   mục — trang cha cần đẩy ngay vào state `products` của mình (giống
 *   AddProductModal.onAdded), nếu không SKU mới không hiện lên lưới và
 *   không được tính vào tổng cho tới khi tải lại trang.
 */
export default function ImportForecastModal({
  currentBU, groups, bus,
  monthColumns, monthColumnLabel,
  weekColumns, regionCodes = [], weekBaseMonthLabel,
  onClose, onImported, onProductsAdded
}) {
  const [step, setStep] = useState('source'); // source | sheetPicker | mapping | missing | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [sheets, setSheets] = useState(null); // { [name]: aoa }
  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');

  const [sheetIdInput, setSheetIdInput] = useState('');
  const [tabNameInput, setTabNameInput] = useState('');

  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [headerRowNum, setHeaderRowNum] = useState(1);
  const [dataStartRowNum, setDataStartRowNum] = useState(2);
  const [skuColIdx, setSkuColIdx] = useState(NONE);
  const [nameColIdx, setNameColIdx] = useState(NONE);
  const [monthStartCol, setMonthStartCol] = useState(NONE);
  const [weekStartCol, setWeekStartCol] = useState(NONE);
  const [weekCellMap, setWeekCellMap] = useState({}); // { "week_region": colIdx } — dùng khi không chọn cột bắt đầu
  const [weekCellPickKey, setWeekCellPickKey] = useState(weekColumns?.[0] !== undefined ? `${weekColumns[0]}_${regionCodes[0]}` : '');
  const [weekCellPickCol, setWeekCellPickCol] = useState(NONE);

  // Bố cục miền của file nguồn:
  //   'single'   một bảng, các cột tuần xen kẽ theo miền (như cũ)
  //   'perSheet' mỗi miền một sheet, cột tuần trong sheet chỉ của miền đó
  const [regionLayout, setRegionLayout] = useState('single');
  const [regionSheetMap, setRegionSheetMap] = useState({});
  // File không có cột tuần (NSKX) — chia từ sản lượng tháng đầu
  const [deriveWeeks, setDeriveWeeks] = useState(false);

  const canImportWeekly = weekColumns?.length > 0 && regionCodes.length > 0;
  const hasMonthMapping = monthStartCol !== NONE;
  const perSheet = regionLayout === 'perSheet';
  const stacked = regionLayout === 'stacked';
  const regionMode = perSheet || stacked;
  const hasWeekMapping = regionMode
    ? (weekStartCol !== NONE || (deriveWeeks && canImportWeekly))
    : canImportWeekly && (weekStartCol !== NONE || Object.keys(weekCellMap).length > 0);

  const [parsedRows, setParsedRows] = useState([]); // [{ skuCode, name, values: {col: qty}, weekValues?: {week: {region: qty}} }]
  const [missingSkus, setMissingSkus] = useState([]); // [{ skuCode, name, productGroupCode, defaultChannel, avgPrice }]
  const [bulkGroup, setBulkGroup] = useState(groups[0]?.code || '');
  const [bulkChannel, setBulkChannel] = useState(currentBU || bus[0]?.code || '');
  const [result, setResult] = useState(null);
  const [resultCounts, setResultCounts] = useState({ monthly: 0, weekly: 0 });

  const aoa = activeSheet && sheets ? sheets[activeSheet] : null;
  const rawRows = aoa || [];
  const colCount = rawRows.reduce((max, r) => Math.max(max, r.length), 0);
  const headerRow = hasHeaderRow ? rawRows[headerRowNum - 1] : null;

  const colOptions = Array.from({ length: colCount }, (_, i) => ({
    value: i,
    label: headerRow?.[i] ? `${headerRow[i]} (cột ${i + 1})` : `Cột ${i + 1}`
  }));

  /** Nhãn các cột sẽ được lấy liên tiếp từ `startIdx`, để người dùng xác nhận trước khi đọc dữ liệu. */
  function sequentialColsPreview(startIdx, count) {
    if (startIdx === NONE || startIdx === undefined) return null;
    const labels = Array.from({ length: count }, (_, i) => {
      const idx = startIdx + i;
      return idx < colCount ? (colOptions[idx]?.label || `Cột ${idx + 1}`) : `Cột ${idx + 1} (không có trong file, sẽ ghi 0)`;
    });
    return labels.join(' · ');
  }

  /** Gán ngay khi chọn cột (không cần nút "Thêm" riêng) rồi trả ô chọn cột về rỗng
   * để sẵn sàng gán tiếp ô tuần/miền khác — tránh trường hợp người dùng chọn xong
   * tưởng đã gán nhưng quên bấm nút xác nhận, dẫn đến bảng tuần không có dữ liệu. */
  function pickWeekCellColumn(colIdx) {
    if (colIdx === NONE) return;
    setWeekCellMap((prev) => ({ ...prev, [weekCellPickKey]: colIdx }));
    setWeekCellPickCol(NONE);
  }

  function removeWeekCellMapping(key) {
    setWeekCellMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // ---- Bước 1: chọn nguồn ----

  const handleFileChosen = async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { sheetNames: names, sheets: parsed } = await parseExcelFile(file);
      setSheets(parsed);
      setSheetNames(names);
      setActiveSheet(names[0]);
      setSourceLabel(file.name);
      setStep(names.length > 1 ? 'sheetPicker' : 'mapping');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFetchGoogleSheet = async () => {
    const id = extractSpreadsheetId(sheetIdInput);
    if (!id) {
      setError('Nhập ID hoặc URL Google Sheet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.readExternalSheet(id, tabNameInput.trim() || undefined);
      setSheets({ [res.sheetName]: res.values });
      setSheetNames(res.availableSheets);
      setActiveSheet(res.sheetName);
      setSourceLabel(`${res.spreadsheetName} — ${res.sheetName}`);
      setStep(res.availableSheets.length > 1 ? 'sheetPicker' : 'mapping');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchTab = async (name) => {
    if (sheets[name]) {
      setActiveSheet(name);
      return;
    }
    // Tab chưa có sẵn (trường hợp Google Sheet — mới chỉ tải 1 tab) -> tải thêm
    setBusy(true);
    setError(null);
    try {
      const id = extractSpreadsheetId(sheetIdInput);
      const res = await api.readExternalSheet(id, name);
      setSheets((prev) => ({ ...prev, [name]: res.values }));
      setActiveSheet(name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Đổi sang bố cục "mỗi miền một sheet": đoán sẵn sheet cho từng miền và chuyển
   * bản xem trước sang sheet của miền đầu, vì các ô chọn cột lấy theo sheet đang xem.
   * Chỉ đoán khi chưa chọn gì, không đè lên lựa chọn của người dùng.
   */
  const switchRegionLayout = (mode) => {
    setRegionLayout(mode);
    if (mode !== 'perSheet' || !sheets) return;   // chồng dọc chỉ dùng một sheet, không cần đoán
    setRegionSheetMap((prev) => {
      if (Object.keys(prev).length) return prev;
      const guess = guessRegionSheets(sheetNames, regionCodes, monthColumns[0]);
      const first = regionCodes.find((c) => guess[c]);
      if (first) setActiveSheet(guess[first]);
      return guess;
    });
  };

  const pickRegionSheet = (region, name) => {
    setRegionSheetMap((prev) => ({ ...prev, [region]: name }));
    if (regionCodes[0] === region) setActiveSheet(name);
  };

  // ---- Bước 2: gán cột ----

  /** Mỗi miền một khối dòng, đã cắt đúng vùng dữ liệu. */
  const regionBlocks = useMemo(() => {
    if (stacked) return detectStackedBlocks(rawRows, dataStartRowNum - 1, skuColIdx === NONE ? -1 : skuColIdx, regionCodes);
    if (!perSheet || !sheets) return [];
    return regionCodes
      .filter((code) => regionSheetMap[code] && sheets[regionSheetMap[code]])
      .map((code) => ({ region: code, rows: sheets[regionSheetMap[code]].slice(dataStartRowNum - 1) }));
  }, [stacked, rawRows, skuColIdx, perSheet, sheets, regionCodes, regionSheetMap, dataStartRowNum]);

  /**
   * Đối chiếu tổng app cộng được với DÒNG TỔNG có sẵn trong file.
   *
   * File 3T để dòng tổng ngay trên vùng dữ liệu và nó khớp tuyệt đối, nên đây
   * là chốt chặn rẻ nhất cho việc gán nhầm cột: gán lệch một cột là số lệch ngay,
   * thấy được trước khi ghi thay vì sau khi đã vào kế hoạch.
   */
  const regionCheck = useMemo(() => {
    if (!regionMode || !hasMonthMapping || !regionBlocks.length) return null;
    const agg = aggregateRegionBlocks({
      blocks: regionBlocks,
      skuColIdx: skuColIdx === NONE ? -1 : skuColIdx,
      nameColIdx: nameColIdx === NONE ? -1 : nameColIdx,
      monthStartCol,
      monthCount: monthColumns.length,
      weekStartCol: weekStartCol === NONE ? undefined : weekStartCol,
      weekCount: canImportWeekly ? weekColumns.length : 0,
      deriveWeeks, deriveStep: 10
    });
    const perRegion = regionBlocks.map((block) => {
      const { region } = block;
      // Bố cục chồng dọc: tổng của miền nằm ngay trên DÒNG PHÂN CÁCH.
      // Bố cục mỗi miền một sheet: dòng tổng nằm trên vùng dữ liệu của sheet đó.
      let fromFile = null;
      let totalsRowNum = null;
      if (stacked) {
        fromFile = readTotalsRow(block.markerRow, monthStartCol, monthColumns.length);
        totalsRowNum = block.markerRowIdx + 1;
      } else {
        const raw = sheets[regionSheetMap[region]] || [];
        const idx = findTotalsRow(raw, dataStartRowNum - 1, skuColIdx, monthStartCol, monthColumns.length);
        if (idx >= 0) {
          fromFile = readTotalsRow(raw[idx], monthStartCol, monthColumns.length);
          totalsRowNum = idx + 1;
        }
      }
      return {
        region,
        sheet: stacked ? `dòng ${block.markerRowIdx + 2}–${block.markerRowIdx + 1 + block.rows.length}` : regionSheetMap[region],
        computed: agg.totalsByRegion[region],
        fromFile,
        totalsRowNum,
        weekTotal: agg.weekTotalByRegion[region]
      };
    });
    return { agg, perRegion };
  }, [regionMode, stacked, hasMonthMapping, regionBlocks, skuColIdx, nameColIdx, monthStartCol,
      monthColumns, weekStartCol, weekColumns, canImportWeekly, deriveWeeks,
      sheets, regionSheetMap, dataStartRowNum]);

  const canProceedMapping = skuColIdx !== NONE
    && (hasMonthMapping || hasWeekMapping)
    && (!regionMode || regionBlocks.length === regionCodes.length);

  const handleParseMapping = async () => {
    setError(null);
    const parsed = [];

    // Đường mỗi miền một sheet: cộng tháng của các miền, tuần về đúng miền của
    // sheet, và cộng luôn các dòng trùng mã trong cùng một sheet.
    if (regionMode) {
      const agg = aggregateRegionBlocks({
        blocks: regionBlocks,
        skuColIdx, nameColIdx: nameColIdx === NONE ? -1 : nameColIdx,
        monthStartCol: hasMonthMapping ? monthStartCol : -1,
        monthCount: hasMonthMapping ? monthColumns.length : 0,
        weekStartCol: weekStartCol === NONE ? undefined : weekStartCol,
        weekCount: hasWeekMapping ? weekColumns.length : 0,
        deriveWeeks, deriveStep: 10
      });
      agg.rows.forEach((r) => {
        const values = {};
        if (hasMonthMapping) {
          monthColumns.forEach((col, i) => { values[colKey(col)] = r.months[i]; });
        }
        let weekValues;
        if (hasWeekMapping) {
          weekValues = {};
          weekColumns.forEach((w) => {
            weekValues[w] = {};
            // Miền không có số phải ghi 0 chứ không bỏ trống, để dòng cũ của miền
            // đó không còn sót lại sau khi nhập — giống quy tắc của bố cục một bảng.
            regionCodes.forEach((region) => {
              weekValues[w][region] = (r.weeks[w] && r.weeks[w][region]) || 0;
            });
          });
        }
        parsed.push({ skuCode: r.skuCode, name: r.name, values, weekValues });
      });
      await finishParse(parsed);
      return;
    }

    const rows = rawRows.slice(dataStartRowNum - 1);
    rows.forEach((row) => {
      const sku = String(row[skuColIdx] ?? '').trim();
      if (!sku) return;

      const values = {};
      if (hasMonthMapping) {
        monthColumns.forEach((col, i) => {
          values[colKey(col)] = parsePastedNumber(row[monthStartCol + i]);
        });
      }

      // Tuần/miền không được gán (qua cả 2 cách) hoặc cột vượt quá số cột
      // file có vẫn ghi 0 (không bỏ qua) để tổng tuần luôn khớp với dữ
      // liệu vừa nhập, không lẫn số cũ còn sót lại ở ô thiếu.
      let weekValues;
      if (hasWeekMapping) {
        weekValues = {};
        weekColumns.forEach((w, wi) => {
          weekValues[w] = {};
          regionCodes.forEach((region, ri) => {
            let colIdx;
            if (weekStartCol !== NONE) {
              colIdx = weekStartCol + wi * regionCodes.length + ri;
            } else {
              colIdx = weekCellMap[`${w}_${region}`];
            }
            weekValues[w][region] = colIdx === undefined || colIdx === NONE ? 0 : parsePastedNumber(row[colIdx]);
          });
        });
      }

      if (!Object.keys(values).length && !weekValues) return;
      parsed.push({
        skuCode: sku,
        name: nameColIdx !== NONE ? String(row[nameColIdx] ?? '').trim() : '',
        values,
        weekValues
      });
    });

    await finishParse(parsed);
  };

  /** Phần chung sau khi đã dựng được danh sách dòng, dùng cho cả hai bố cục. */
  async function finishParse(parsed) {
    if (!parsed.length) {
      setError('Không tìm thấy dòng dữ liệu hợp lệ nào (thiếu mã SKU hoặc số lượng).');
      return;
    }

    setBusy(true);
    try {
      const allProducts = await api.getProducts({});
      // String() bat buoc: p.sku_code co the la SO (Sheets doi kieu ngay khi mot
      // lenh setValues ghi lai o do), con r.skuCode luon la CHUOI vi den tu van
      // ban dan vao. Set.has so ca kieu, nen thieu String() la MOI ma deu bi coi
      // la "chua co trong danh muc" — va man hinh se moi nguoi dung them lai ca
      // tram ma da ton tai.
      const known = new Set(allProducts.map((p) => String(p.sku_code).trim()));
      const missingMap = new Map();
      parsed.forEach((r) => {
        if (!known.has(String(r.skuCode).trim()) && !missingMap.has(r.skuCode)) {
          missingMap.set(r.skuCode, { skuCode: r.skuCode, name: r.name || '', productGroupCode: bulkGroup, defaultChannel: bulkChannel, avgPrice: '' });
        }
      });

      setParsedRows(parsed);
      const missing = Array.from(missingMap.values());
      if (missing.length) {
        setMissingSkus(missing);
        setStep('missing');
      } else {
        await applyImport(parsed);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // ---- Bước 3 (nếu có): thêm SKU thiếu hàng loạt ----

  const applyBulkToAllMissing = () => {
    setMissingSkus((prev) => prev.map((p) => ({ ...p, productGroupCode: bulkGroup, defaultChannel: bulkChannel })));
  };

  const updateMissingRow = (skuCode, field, value) => {
    setMissingSkus((prev) => prev.map((p) => (p.skuCode === skuCode ? { ...p, [field]: value } : p)));
  };

  const handleConfirmMissing = async () => {
    const incomplete = missingSkus.filter((p) => !p.name.trim());
    if (incomplete.length) {
      setError(`Còn ${incomplete.length} SKU chưa nhập tên: ${incomplete.map((p) => p.skuCode).slice(0, 5).join(', ')}${incomplete.length > 5 ? '...' : ''}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const group = groups.find((g) => g.code === bulkGroup);
      const res = await api.addProducts(missingSkus.map((p) => ({
        skuCode: p.skuCode,
        name: p.name.trim(),
        productGroupCode: p.productGroupCode,
        productGroupName: groups.find((g) => g.code === p.productGroupCode)?.name || group?.name || '',
        defaultChannel: p.defaultChannel,
        avgPrice: p.avgPrice
      })));
      setResult(res);
      if (res.products?.length) onProductsAdded?.(res.products);
      await applyImport(parsedRows);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Hoàn tất: lưu thẳng lên server ----

  async function applyImport(rows) {
    const monthlyUpdates = [];
    rows.forEach((r) => {
      Object.entries(r.values).forEach(([col, value]) => {
        monthlyUpdates.push({ rowKey: r.skuCode, col: columnByKey(monthColumns, col), value });
      });
    });

    const weeklyUpdates = [];
    rows.forEach((r) => {
      if (!r.weekValues) return;
      Object.entries(r.weekValues).forEach(([week, byRegion]) => {
        Object.entries(byRegion).forEach(([region, value]) => {
          weeklyUpdates.push({ rowKey: r.skuCode, col: { week: Number(week), region }, value });
        });
      });
    });

    await onImported({ monthlyUpdates, weeklyUpdates });
    setResultCounts({ monthly: monthlyUpdates.length, weekly: weeklyUpdates.length });
    setStep('done');
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto text-slate-900">

        <div className="flex items-start justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-sm">Nhập forecast từ file</h3>
              <p className="text-[11px] text-slate-500">{sourceLabel || 'Tải Excel hoặc lấy từ một tab Google Sheet'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="w-4 h-4 text-slate-500" /></button>
        </div>

        <div className="p-5 space-y-4">

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'source' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer text-center">
                <Upload className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-semibold">Tải file Excel</span>
                <span className="text-[11px] text-slate-500">.xlsx, .xls</span>
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => handleFileChosen(e.target.files?.[0])} />
              </label>

              <div className="border-2 border-slate-200 rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sheet className="w-5 h-5 text-emerald-600" /> Google Sheet
                </div>
                <input
                  type="text"
                  placeholder="Dán URL hoặc ID Sheet"
                  value={sheetIdInput}
                  onChange={(e) => setSheetIdInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="Tên tab (để trống = tab đầu tiên)"
                  value={tabNameInput}
                  onChange={(e) => setTabNameInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-400">Sheet phải được chia sẻ cho tài khoản Google đang chạy hệ thống.</p>
                <button
                  onClick={handleFetchGoogleSheet}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-1.5 rounded-lg text-xs font-semibold"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Lấy dữ liệu
                </button>
              </div>
            </div>
          )}

          {step === 'sheetPicker' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">File có nhiều tab — chọn tab chứa dữ liệu forecast:</p>
              <div className="flex flex-wrap gap-2">
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => handleSwitchTab(name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                      activeSheet === name ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <PreviewTable rows={rawRows} hasHeaderRow={hasHeaderRow} headerRowNum={headerRowNum} dataStartRowNum={dataStartRowNum} />
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep('source')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                  <ArrowLeft className="w-3.5 h-3.5" /> Quay lại
                </button>
                <button onClick={() => setStep('mapping')} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold">
                  Tiếp tục <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <PreviewTable rows={rawRows} hasHeaderRow={hasHeaderRow} headerRowNum={headerRowNum} dataStartRowNum={dataStartRowNum} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 mb-1.5">
                    <input type="checkbox" checked={hasHeaderRow} onChange={(e) => setHasHeaderRow(e.target.checked)} />
                    File có dòng tiêu đề cột
                  </label>
                  {hasHeaderRow && (
                    <NumberField label="Dòng tiêu đề là dòng số" value={headerRowNum} onChange={setHeaderRowNum} />
                  )}
                </div>
                <NumberField label="Bắt đầu lấy dữ liệu từ dòng số" value={dataStartRowNum} onChange={setDataStartRowNum} />
              </div>

              {canImportWeekly && (
                <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">File tách miền thế nào?</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['single', 'Một bảng, cột tuần xen kẽ miền'],
                      ['perSheet', `Mỗi miền một sheet (${regionCodes.join(' / ')})`],
                      ['stacked', 'Hai bảng xếp chồng trong một sheet']
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => switchRegionLayout(mode)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                          regionLayout === mode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {stacked && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] text-slate-500">
                        Tự tìm dòng phân cách mang tên miền ở cột mã SKU (ví dụ “Miền Nam”, “Miền Bắc”);
                        các dòng bên dưới thuộc về miền đó cho tới dòng phân cách tiếp theo.
                      </p>
                      {regionBlocks.length ? (
                        <div className="space-y-1">
                          {regionBlocks.map((b) => (
                            <div key={b.region} className="text-[11px] text-slate-700">
                              <span className="font-semibold">{b.region}</span> — dòng phân cách {b.markerRowIdx + 1},{' '}
                              {b.rows.filter((r) => String(r?.[skuColIdx] ?? '').trim()).length} mã
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-rose-600">
                          Chưa tìm thấy dòng phân cách nào — kiểm lại cột mã SKU và dòng bắt đầu dữ liệu.
                        </p>
                      )}
                    </div>
                  )}

                  {perSheet && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] text-slate-500">
                        Sản lượng tháng của các miền sẽ được CỘNG lại (Bảng 0 không tách miền);
                        cột tuần của mỗi sheet vào đúng miền của sheet đó. Giữ nguyên một lần nhập
                        cho cả hai miền — nhập làm hai lượt thì lượt sau đè lượt trước.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {regionCodes.map((code) => (
                          <label key={code} className="block">
                            <span className="text-[11px] font-semibold text-slate-600">Sheet của miền {code} *</span>
                            <select
                              value={regionSheetMap[code] || ''}
                              onChange={(e) => pickRegionSheet(code, e.target.value)}
                              className="mt-0.5 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"
                            >
                              <option value="">— chọn sheet —</option>
                              {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ColumnSelect label="Cột mã SKU *" value={skuColIdx} onChange={setSkuColIdx} options={colOptions} />
                <ColumnSelect label="Cột tên sản phẩm (nếu có)" value={nameColIdx} onChange={setNameColIdx} options={colOptions} allowNone />
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Cột bắt đầu cho dữ liệu tháng ({monthColumns.length} tháng liên tiếp kể từ cột này, ứng với {monthColumnLabel(monthColumns[0])} → {monthColumnLabel(monthColumns[monthColumns.length - 1])}):
                </p>
                <ColumnSelect label="Cột bắt đầu" value={monthStartCol} onChange={setMonthStartCol} options={colOptions} allowNone />
                {hasMonthMapping && (
                  <p className="text-[11px] text-slate-500 mt-1">→ {sequentialColsPreview(monthStartCol, monthColumns.length)}</p>
                )}
              </div>

              {canImportWeekly && regionMode && (
                <div className="border-t border-slate-100 pt-3">
                  <label className="flex items-start gap-2 text-xs text-slate-700 mb-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={deriveWeeks}
                      onChange={(e) => { setDeriveWeeks(e.target.checked); if (e.target.checked) setWeekStartCol(NONE); }}
                    />
                    <span>
                      File không có cột tuần — chia từ sản lượng {weekBaseMonthLabel}
                      <span className="block text-[11px] text-slate-500">
                        Mỗi tuần một số chẵn chục bằng nhau, phần lẻ cộng vào tuần đầu
                        (100 → 40/20/20/20, 10 → 10/0/0/0). Chia riêng cho từng miền nên tổng luôn khớp.
                      </span>
                    </span>
                  </label>
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Cột bắt đầu cho dữ liệu tuần (áp cho {weekBaseMonthLabel}):
                  </p>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Trong bố cục này mỗi sheet chỉ chứa tuần của miền nó, nên {weekColumns.length} cột
                    được lấy liên tiếp: Tuần 1, Tuần 2, ... Miền lấy theo sheet, không theo cột.
                  </p>
                  {!deriveWeeks && (
                    <>
                      <ColumnSelect label="Cột Tuần 1" value={weekStartCol} onChange={setWeekStartCol} options={colOptions} allowNone />
                      {weekStartCol !== NONE && (
                        <p className="text-[11px] text-slate-500 mt-1">→ {sequentialColsPreview(weekStartCol, weekColumns.length)}</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {regionCheck && (
                <div className="border border-emerald-200 bg-emerald-50/60 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-900">Đối chiếu trước khi ghi</p>
                  {regionCheck.perRegion.map((r) => {
                    const match = r.fromFile && JSON.stringify(r.computed) === JSON.stringify(r.fromFile);
                    return (
                      <div key={r.region} className="text-[11px] space-y-0.5">
                        <div className="font-semibold text-slate-700">{r.region} — {r.sheet}</div>
                        <div className="font-mono text-slate-600">app cộng: {r.computed.join(' · ')}</div>
                        {r.fromFile ? (
                          <div className={`font-mono ${match ? 'text-emerald-700' : 'text-rose-700 font-bold'}`}>
                            dòng {r.totalsRowNum} của file: {r.fromFile.join(' · ')} {match ? '— khớp' : '— LỆCH, kiểm lại cột đã gán'}
                          </div>
                        ) : (
                          <div className="text-slate-500">file không có dòng tổng để đối chiếu</div>
                        )}
                        {hasWeekMapping && (
                          <div className={r.weekTotal === r.computed[0] ? 'text-slate-600' : 'text-amber-700 font-semibold'}>
                            tổng tuần {r.weekTotal.toLocaleString('vi-VN')} / tháng gốc {r.computed[0].toLocaleString('vi-VN')}
                            {r.weekTotal === r.computed[0] ? ' — khớp' : ' — lệch, Bảng 1 sẽ báo chưa khớp'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {regionCheck.agg.duplicates.length > 0 && (
                    <p className="text-[11px] text-slate-600">
                      {regionCheck.agg.duplicates.length} mã nằm trên nhiều dòng trong cùng sheet — đã cộng lại:{' '}
                      {regionCheck.agg.duplicates.slice(0, 6).map((d) => d.skuCode).join(', ')}
                      {regionCheck.agg.duplicates.length > 6 ? '…' : ''}
                    </p>
                  )}
                </div>
              )}

              {canImportWeekly && !perSheet && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Cột bắt đầu cho dữ liệu tuần (áp cho {weekBaseMonthLabel}):
                  </p>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Chọn 1 cột ứng với Tuần 1 - {regionCodes[0]}, {weekColumns.length * regionCodes.length - 1} cột
                    sau được lấy liên tiếp theo đúng thứ tự miền ({regionCodes.join(', ')}) lặp lại cho mỗi tuần —
                    đúng với cấu trúc file thường gặp: Tuần 1 {regionCodes[0]}, Tuần 1 {regionCodes[1]}, Tuần 2 {regionCodes[0]}, ...
                  </p>
                  <ColumnSelect label="Cột bắt đầu" value={weekStartCol} onChange={setWeekStartCol} options={colOptions} allowNone />
                  {weekStartCol !== NONE && (
                    <div className="text-[11px] text-slate-500 mt-2 space-y-0.5">
                      {weekColumns.map((w, wi) => (
                        <div key={w}>
                          Tuần {w} → {regionCodes.map((region, ri) => {
                            const idx = weekStartCol + wi * regionCodes.length + ri;
                            const label = idx < colCount ? (colOptions[idx]?.label || `Cột ${idx + 1}`) : `Cột ${idx + 1} (không có trong file, sẽ ghi 0)`;
                            return `${region}: ${label}`;
                          }).join(' · ')}
                        </div>
                      ))}
                    </div>
                  )}

                  {weekStartCol === NONE && (
                    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <p className="text-[11px] text-slate-600 mb-2">
                        Không chọn cột bắt đầu — gán riêng từng ô tuần/miền cụ thể: chọn tuần/miền rồi chọn cột,
                        gán ngay lập tức (không cần bấm nút xác nhận nào khác) và hiện trong danh sách bên dưới.
                      </p>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-[11px] font-semibold text-slate-600 block mb-1">Tuần/Miền cụ thể</label>
                          <select
                            value={weekCellPickKey}
                            onChange={(e) => setWeekCellPickKey(e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
                          >
                            {weekColumns.flatMap((w) => regionCodes.map((region) => (
                              <option key={`${w}_${region}`} value={`${w}_${region}`}>Tuần {w} - {region}</option>
                            )))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <ColumnSelect label="Cột dữ liệu" value={weekCellPickCol} onChange={pickWeekCellColumn} options={colOptions} allowNone />
                        </div>
                      </div>
                      {Object.keys(weekCellMap).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {Object.entries(weekCellMap).map(([key, colIdx]) => {
                            const [w, region] = key.split('_');
                            return (
                              <div key={key} className="flex items-center justify-between text-[11px] bg-white border border-slate-200 rounded px-2 py-1">
                                <span>Tuần {w} - {region} → {colOptions[colIdx]?.label || `Cột ${colIdx + 1}`}</span>
                                <button type="button" onClick={() => removeWeekCellMapping(key)} className="text-rose-600 hover:text-rose-800 font-semibold">
                                  Xoá
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(sheetNames.length > 1 ? 'sheetPicker' : 'source')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                  <ArrowLeft className="w-3.5 h-3.5" /> Quay lại
                </button>
                <button
                  onClick={handleParseMapping}
                  disabled={!canProceedMapping || busy}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-semibold"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Đọc dữ liệu
                </button>
              </div>
            </div>
          )}

          {step === 'missing' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
                <PackagePlus className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Phát hiện <strong>{missingSkus.length} mã SKU</strong> chưa có trong danh mục Products.
                  Điền đủ thông tin bên dưới để thêm hàng loạt trước khi áp số lượng.
                </span>
              </div>

              <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Nhóm hàng áp cho tất cả</label>
                  <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs">
                    {groups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Kênh áp cho tất cả</label>
                  <select value={bulkChannel} onChange={(e) => setBulkChannel(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs">
                    {bus.map((b) => <option key={b.code} value={b.code}>{b.code}</option>)}
                  </select>
                </div>
                <button onClick={applyBulkToAllMissing} className="border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap">
                  Áp cho tất cả
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-semibold text-slate-600">Mã SKU</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Tên sản phẩm *</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Nhóm</th>
                      <th className="text-left p-2 font-semibold text-slate-600">Kênh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {missingSkus.map((p) => (
                      <tr key={p.skuCode}>
                        <td className="p-2 font-bold font-mono">{p.skuCode}</td>
                        <td className="p-1.5">
                          <input value={p.name} onChange={(e) => updateMissingRow(p.skuCode, 'name', e.target.value)}
                            className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs" placeholder="Bắt buộc" />
                        </td>
                        <td className="p-1.5">
                          <select value={p.productGroupCode} onChange={(e) => updateMissingRow(p.skuCode, 'productGroupCode', e.target.value)}
                            className="w-full px-1 py-1 border border-slate-200 rounded text-xs">
                            {groups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <select value={p.defaultChannel} onChange={(e) => updateMissingRow(p.skuCode, 'defaultChannel', e.target.value)}
                            className="w-full px-1 py-1 border border-slate-200 rounded text-xs">
                            {bus.map((b) => <option key={b.code} value={b.code}>{b.code}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep('mapping')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                  <ArrowLeft className="w-3.5 h-3.5" /> Quay lại
                </button>
                <button
                  onClick={handleConfirmMissing}
                  disabled={busy}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-semibold"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackagePlus className="w-3.5 h-3.5" />}
                  Thêm {missingSkus.length} SKU &amp; áp số liệu
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-6 space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">
                {doneMessage(resultCounts)}
              </p>
              {result && (
                <p className="text-xs text-slate-500">
                  {result.inserted} SKU mới đã thêm vào danh mục{result.skippedExisting?.length ? `, bỏ qua ${result.skippedExisting.length} SKU đã tồn tại` : ''}.
                </p>
              )}
              <div className="pt-2">
                <button onClick={onClose} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-semibold">
                  Đóng
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function doneMessage(counts) {
  const parts = [];
  if (counts.monthly > 0) parts.push(`${counts.monthly} ô Bảng tháng`);
  if (counts.weekly > 0) parts.push(`${counts.weekly} ô Bảng tuần/miền`);
  return parts.length ? `Đã lưu ${parts.join(' và ')}.` : 'Không có ô nào được cập nhật.';
}

function colKey(col) {
  return typeof col === 'object' ? JSON.stringify(col) : String(col);
}

function columnByKey(columns, key) {
  return columns.find((c) => colKey(c) === key);
}

function ColumnSelect({ label, value, onChange, options, allowNone }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-600 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value === NONE ? NONE : Number(e.target.value))}
        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
      >
        {allowNone && <option value={NONE}>— Không nhập —</option>}
        {!allowNone && <option value={NONE} disabled>— Chọn cột —</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-600 block mb-1">{label}</label>
      <input
        type="number"
        min="1"
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
      />
    </div>
  );
}

/** Xem trước kèm số thứ tự dòng thật của file, để chọn đúng dòng tiêu đề/bắt đầu dữ liệu. */
function PreviewTable({ rows, hasHeaderRow, headerRowNum, dataStartRowNum }) {
  const preview = rows.slice(0, 10);
  if (!preview.length) return null;
  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-48">
      <table className="text-[10px] font-mono w-full">
        <tbody>
          {preview.map((row, i) => {
            const rowNum = i + 1;
            const isHeader = hasHeaderRow && rowNum === headerRowNum;
            const isDataStart = rowNum === dataStartRowNum;
            return (
              <tr key={i} className={isHeader ? 'bg-blue-100 font-bold' : isDataStart ? 'bg-emerald-50' : 'odd:bg-white even:bg-slate-50'}>
                <td className="px-2 py-1 border-r border-slate-200 text-slate-400 text-right whitespace-nowrap">
                  {rowNum}{isHeader ? ' (tiêu đề)' : isDataStart ? ' (bắt đầu)' : ''}
                </td>
                {row.map((cell, j) => <td key={j} className="px-2 py-1 border-r border-slate-100 whitespace-nowrap">{String(cell)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
