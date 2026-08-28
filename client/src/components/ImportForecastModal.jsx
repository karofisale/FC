import React, { useState } from 'react';
import {
  X, Upload, Sheet, Loader2, AlertCircle, ArrowLeft, ArrowRight,
  CheckCircle2, FileSpreadsheet, PackagePlus
} from 'lucide-react';
import { api } from '../services/api';
import { parsePastedNumber } from '../utils/useGridEditing';
import { parseExcelFile, extractSpreadsheetId } from '../utils/importParsing';

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
 *   kỳ. Chỉ cần chọn MỘT cột bắt đầu và tuần mà cột đó ứng với (mặc định
 *   tuần đầu tiên), vì file nguồn thường xếp các miền liền nhau trong
 *   từng tuần rồi mới sang tuần kế (VD: Tuần1-MB, Tuần1-MN, Tuần2-MB,
 *   Tuần2-MN, ...) — các cột sau được suy ra liên tiếp theo đúng thứ tự
 *   miền (regionCodes) lặp lại cho mỗi tuần. Tuần trước tuần bắt đầu
 *   (hoặc vượt quá số cột file có) sẽ ghi 0 (không giữ nguyên số cũ) để
 *   tổng tuần luôn khớp với dữ liệu vừa nhập.
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
  const [weekStartWeek, setWeekStartWeek] = useState(weekColumns?.[0] ?? 1);
  const [weekStartCol, setWeekStartCol] = useState(NONE);

  const canImportWeekly = weekColumns?.length > 0 && regionCodes.length > 0;
  const hasMonthMapping = monthStartCol !== NONE;
  const hasWeekMapping = canImportWeekly && weekStartCol !== NONE;

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

  // ---- Bước 2: gán cột ----

  const canProceedMapping = skuColIdx !== NONE && (hasMonthMapping || hasWeekMapping);

  const handleParseMapping = async () => {
    setError(null);
    const rows = rawRows.slice(dataStartRowNum - 1);
    const parsed = [];
    rows.forEach((row) => {
      const sku = String(row[skuColIdx] ?? '').trim();
      if (!sku) return;

      const values = {};
      if (hasMonthMapping) {
        monthColumns.forEach((col, i) => {
          values[colKey(col)] = parsePastedNumber(row[monthStartCol + i]);
        });
      }

      // Tuần trước tuần bắt đầu (hoặc cột vượt quá số cột file có) vẫn ghi 0
      // (không bỏ qua) để tổng tuần luôn khớp với dữ liệu vừa nhập, không
      // lẫn số cũ còn sót lại ở ô thiếu.
      let weekValues;
      if (hasWeekMapping) {
        const baseIdx = weekColumns.indexOf(weekStartWeek);
        weekValues = {};
        weekColumns.forEach((w, wi) => {
          const offset = wi - baseIdx;
          weekValues[w] = {};
          regionCodes.forEach((region, ri) => {
            weekValues[w][region] = offset < 0 ? 0 : parsePastedNumber(row[weekStartCol + offset * regionCodes.length + ri]);
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

    if (!parsed.length) {
      setError('Không tìm thấy dòng dữ liệu hợp lệ nào (thiếu mã SKU hoặc số lượng).');
      return;
    }

    setBusy(true);
    try {
      const allProducts = await api.getProducts({});
      const known = new Set(allProducts.map((p) => p.sku_code));
      const missingMap = new Map();
      parsed.forEach((r) => {
        if (!known.has(r.skuCode) && !missingMap.has(r.skuCode)) {
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
  };

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

              {canImportWeekly && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Cột bắt đầu cho dữ liệu tuần (áp cho {weekBaseMonthLabel}):
                  </p>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Chọn tuần mà cột bắt đầu ứng với, rồi chọn cột đó. Các cột sau được lấy liên tiếp
                    theo đúng thứ tự miền ({regionCodes.join(', ')}) lặp lại cho mỗi tuần tiếp theo — đúng
                    với cấu trúc file thường gặp: Tuần 1 {regionCodes[0]}, Tuần 1 {regionCodes[1]}, Tuần 2 {regionCodes[0]}, ...
                    Tuần trước tuần bắt đầu sẽ ghi 0.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">Cột bắt đầu ứng với tuần</label>
                      <select
                        value={weekStartWeek}
                        onChange={(e) => setWeekStartWeek(Number(e.target.value))}
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
                      >
                        {weekColumns.map((w) => <option key={w} value={w}>Tuần {w}</option>)}
                      </select>
                    </div>
                    <ColumnSelect label="Cột bắt đầu" value={weekStartCol} onChange={setWeekStartCol} options={colOptions} allowNone />
                  </div>
                  {hasWeekMapping && (
                    <div className="text-[11px] text-slate-500 mt-2 space-y-0.5">
                      {weekColumns.slice(weekColumns.indexOf(weekStartWeek)).map((w, i) => (
                        <div key={w}>
                          Tuần {w} → {regionCodes.map((region, ri) => {
                            const idx = weekStartCol + i * regionCodes.length + ri;
                            const label = idx < colCount ? (colOptions[idx]?.label || `Cột ${idx + 1}`) : `Cột ${idx + 1} (không có trong file, sẽ ghi 0)`;
                            return `${region}: ${label}`;
                          }).join(' · ')}
                        </div>
                      ))}
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
