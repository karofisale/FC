import React, { useState } from 'react';
import { X, Loader2, AlertTriangle, ArrowDownToLine, CheckCircle2, Info, Upload } from 'lucide-react';
import { api } from '../services/api';
import { parseExcelFile } from '../utils/importParsing';
import { parseZsd450, MOI_KHACH } from '../utils/zsd450';
import { monthLabel } from '../utils/period';

/**
 * Nhập sản lượng thực hiện từ báo cáo ZSD450 của SAP.
 *
 * Luồng hai bước: chọn file là ĐỌC THỬ (chỉ tính, chưa ghi gì), người dùng
 * đọc con số rồi mới bấm ghi. Một mã có nhiều dòng trong tháng nên bộ đọc
 * cộng lại theo mã.
 *
 * Bốn chỗ từ chối thay vì đoán, vì mỗi chỗ đều cho ra một bảng trông hoàn
 * toàn bình thường nếu để nó chạy tiếp:
 *   - đơn vị chưa khai mã khách SAP → không biết lấy dòng nào;
 *   - file không có dòng nào của mã khách đó → nhiều khả năng xuất nhầm bộ
 *     lọc, và kết quả sẽ là "ghi 0 dòng" chứ không phải một lỗi;
 *   - tháng đang chọn không có trong file;
 *   - mã hàng không có trong danh mục FC → liệt kê ra, không ghi lặng lẽ.
 */
export default function ImportActualsModal({
  businessUnitCode, sapSoldTo, sapVkorg, sapVtweg, month, regionCode,
  knownSkus, onClose, onImported
}) {
  // '*' = đơn vị cố ý không lọc theo mã khách (XK chỉ lọc VKORG 0401 +
  // VTWEG 02). Khác hẳn với để trống = chưa khai: gộp hai thứ này thì hoặc
  // chặn nhầm một đơn vị hợp lệ, hoặc nhận cả file của đơn vị khác.
  const khongLocKhach = sapSoldTo === MOI_KHACH;
  const daKhai = !!sapSoldTo;
  const boLoc = [sapVkorg && `VKORG ${sapVkorg}`, sapVtweg && `VTWEG ${sapVtweg}`,
    khongLocKhach ? 'mọi khách' : (sapSoldTo && `khách ${sapSoldTo}`)].filter(Boolean).join(' · ');
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ket, setKet] = useState(null);
  const [done, setDone] = useState(null);

  const chonFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setKet(null);
    setDone(null);
    setReading(true);
    try {
      const wb = await parseExcelFile(file);
      const rows = wb.sheets[wb.sheetNames[0]];
      const r = parseZsd450(rows, { soldTo: sapSoldTo, month });
      if (r.missingColumns.length) {
        throw new Error(
          `File không có các cột của báo cáo ZSD450: ${r.missingColumns.join(', ')}. `
          + 'Chọn đúng file xuất từ ZSD450, hoặc báo lại nếu SAP vừa đổi tên cột.'
        );
      }
      const la = Object.keys(r.bySku).filter((s) => !knownSkus.has(String(s).trim()));
      setKet({ ...r, unknownSkus: la });
    } catch (err) {
      setError(err.message);
    } finally {
      setReading(false);
      e.target.value = '';   // chọn lại đúng file đó vẫn kích hoạt onChange
    }
  };

  const ghi = async () => {
    setSaving(true);
    setError('');
    try {
      const rows = Object.keys(ket.bySku)
        .filter((sku) => knownSkus.has(String(sku).trim()))
        .map((sku) => ({
          businessUnitCode,
          skuCode: sku,
          regionCode,
          actualMonth: month,
          quantity: ket.bySku[sku],
          sourceSystem: 'ZSD450'
        }));
      if (!rows.length) throw new Error('Không có mã nào ghi được (mọi mã đều không có trong danh mục).');
      const res = await api.saveActuals(rows);
      setDone(res.message);
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const tong = ket ? Object.values(ket.bySku).reduce((s, q) => s + q, 0) : 0;
  const ghiDuoc = ket ? Object.keys(ket.bySku).filter((s) => knownSkus.has(String(s).trim())).length : 0;
  const thangCoTrongFile = ket ? ket.monthsSeen.includes(month) : false;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 sticky top-0 bg-white">
          <div>
            <h3 className="font-bold text-slate-900">Nhập thực hiện từ ZSD450</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {businessUnitCode} · {monthLabel(month)} · ghi vào miền <strong>{regionCode}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">

          {!daKhai ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Đơn vị <strong>{businessUnitCode}</strong> chưa khai mã khách SAP nên không biết lấy
                dòng nào trong file.
                <div className="mt-1 text-xs">
                  Điền cột <code className="font-mono">sap_sold_to</code> cho đơn vị này ở sheet
                  BusinessUnits rồi mở lại.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                File phải xuất từ ZSD450 với bộ lọc{' '}
                <strong className="font-mono text-slate-900">{boLoc || '(chưa khai)'}</strong>.
                {khongLocKhach
                  ? ' Đơn vị này không lọc theo mã khách nên MỌI dòng trong file sẽ được lấy — chọn đúng file.'
                  : ' App lọc lại theo mã khách này như một lớp chặn nầm file.'}
                {' '}Một mã hàng có nhiều dòng trong tháng sẽ được cộng lại.
              </div>

              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg px-4 py-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition">
                <Upload className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-600">
                  {fileName || 'Chọn file ZSD450 (.xlsx)'}
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={chonFile} />
              </label>
            </>
          )}

          {reading && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc file...
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {ket && !done && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Dòng khớp</div>
                  <div className="text-lg font-black font-mono text-slate-900">{ket.rowsMatched.toLocaleString('vi-VN')}</div>
                  <div className="text-[10px] text-slate-400">trên {ket.rowsRead.toLocaleString('vi-VN')} dòng cả file</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Mã hàng</div>
                  <div className="text-lg font-black font-mono text-slate-900">{Object.keys(ket.bySku).length}</div>
                  <div className="text-[10px] text-slate-400">{ghiDuoc} mã ghi được</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">Tổng sản lượng</div>
                  <div className="text-lg font-black font-mono text-blue-700">{tong.toLocaleString('vi-VN')}</div>
                </div>
              </div>

              {!thangCoTrongFile && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    File không có dòng nào của {monthLabel(month)}.
                    {ket.monthsSeen.length
                      ? <> Tháng có trong file: <strong>{ket.monthsSeen.map(monthLabel).join(', ')}</strong>. Đổi tháng ở màn hình rồi đọc lại.</>
                      : ' Không đọc được tháng nào từ cột Tháng_Năm.'}
                  </span>
                </div>
              )}

              {khongLocKhach && ket.rowsMatched > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    Không lọc theo mã khách, nên hãy đối chiếu file đúng đơn vị:
                    {ket.channelsSeen.length > 0 && (
                      <> kênh bán hàng trong file là{' '}
                        <strong className="font-mono">{ket.channelsSeen.join(', ')}</strong>;</>
                    )}
                    {' '}{ket.soldToSeen.length} mã khách
                    {ket.soldToSeen.length > 0 && (
                      <> (<span className="font-mono">
                        {ket.soldToSeen.slice(0, 5).map((s) => s.code).join(', ')}
                        {ket.soldToSeen.length > 5 && '…'}
                      </span>)</>
                    )}.
                  </div>
                </div>
              )}

              {ket.rowsMatched === 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    {khongLocKhach
                      ? 'File không có dòng dữ liệu nào đọc được — nhiều khả năng xuất nhầm bộ lọc hoặc nhầm kỳ.'
                      : <>Không có dòng nào của mã khách <strong className="font-mono">{sapSoldTo}</strong> —
                        nhiều khả năng file xuất nhầm bộ lọc.</>}
                    {ket.soldToSeen.length > 0 && (
                      <div className="mt-1">
                        Mã khách có trong file:{' '}
                        <span className="font-mono">
                          {ket.soldToSeen.slice(0, 8).map((s) => `${s.code}${s.name ? ` (${s.name})` : ''}`).join(', ')}
                          {ket.soldToSeen.length > 8 && ` … và ${ket.soldToSeen.length - 8} mã nữa`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {ket.unknownSkus.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>{ket.unknownSkus.length} mã không có trong danh mục FC — sẽ KHÔNG được ghi:</strong>
                    <div className="font-mono mt-1 break-all">
                      {ket.unknownSkus.slice(0, 20).join(', ')}
                      {ket.unknownSkus.length > 20 && ` … và ${ket.unknownSkus.length - 20} mã nữa`}
                    </div>
                    <div className="mt-1">Thêm mã vào danh mục rồi nhập lại thì số của chúng mới vào được.</div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Ghi đè theo (đơn vị, mã, tháng, miền) — nhập lại cùng kỳ là ghi đè, không cộng dồn.
                </span>
              </div>
            </div>
          )}

          {done && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{done}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">
            {done ? 'Đóng' : 'Huỷ'}
          </button>
          {!done && (
            <button
              onClick={ghi}
              disabled={!ket || saving || ghiDuoc === 0}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
              {saving ? 'Đang ghi...' : `Ghi ${ghiDuoc} mã vào ${monthLabel(month)}`}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
