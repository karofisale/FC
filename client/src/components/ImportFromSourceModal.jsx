import React, { useCallback, useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, ArrowDownToLine, CheckCircle2, Info } from 'lucide-react';
import { api } from '../services/api';

/**
 * Nhập kế hoạch tháng thẳng từ app nguồn — khác hẳn "Nhập từ file": ở đây
 * không có bước gán cột, vì máy chủ đọc thẳng nguồn gốc và tự cộng.
 *
 *   OEM → tab SOP_Plan, các dòng đã duyệt của đúng kỳ
 *   XK  → đơn đã có (Ship Qty theo ngày giao) + PI chưa giao (theo Expected Load)
 *
 * Luồng hai bước, cố ý: mở modal là XEM TRƯỚC (máy chủ chỉ tính, không ghi),
 * người dùng đọc con số rồi mới bấm nhập. Nhập xong tạo một BẢN CẬP NHẬT MỚI
 * chưa gửi — số vào bảng, người lập kế hoạch vẫn là người bấm gửi duyệt.
 */
export default function ImportFromSourceModal({ businessUnitCode, defaultBaseMonth, onClose, onImported }) {
  const [baseMonth, setBaseMonth] = useState(defaultBaseMonth || '');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const nguon = businessUnitCode === 'OEM'
    ? 'app OEM — kế hoạch đã duyệt trong tab SOP_Plan'
    : 'app Xuất khẩu — đơn đã có và PI chưa giao';

  const xemTruoc = useCallback(async (thang) => {
    if (!thang) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      setPreview(await api.importSopFromSource(businessUnitCode, `${thang}-01`, true));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [businessUnitCode]);

  useEffect(() => { xemTruoc(baseMonth); }, [xemTruoc, baseMonth]);

  async function nhap() {
    setImporting(true);
    setError('');
    try {
      const res = await api.importSopFromSource(businessUnitCode, `${baseMonth}-01`, false);
      setDone(res);
      await onImported?.(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  const coSo = preview && preview.skuCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Nhập dữ liệu từ app nguồn</h3>
            <p className="mt-0.5 text-xs text-slate-500">{nguon}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {!done && (
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Tháng đầu kỳ</span>
              <input
                type="month"
                value={baseMonth}
                onChange={(e) => setBaseMonth(e.target.value)}
                className="mt-1 w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <span className="ml-2 text-xs text-slate-500">lấy 4 tháng liên tiếp từ tháng này</span>
            </label>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang đọc dữ liệu nguồn…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {preview && !loading && (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">Tháng</th>
                      {preview.months.map((m) => (
                        <th key={m} className="px-3 py-2 text-right font-medium">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-200">
                      <td className="px-3 py-2 text-slate-600">Số lượng</td>
                      {preview.monthTotals.map((v, i) => (
                        <td key={i} className="px-3 py-2 text-right font-mono tabular-nums text-slate-800">
                          {v.toLocaleString('vi-VN')}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-slate-600">
                <strong className="text-slate-800">{preview.skuCount.toLocaleString('vi-VN')}</strong> mã hàng
                {' · '}chia tuần: cả tháng đầu kỳ dồn vào <strong>tuần 3 miền Bắc</strong>, các tuần khác để trống.
              </p>

              {preview.unknownSkus?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <strong>{preview.unknownSkus.length} mã chưa có trong danh mục — số của chúng sẽ không được nhập.</strong>
                      <div className="mt-1 font-mono text-xs break-all">
                        {preview.unknownSkus.slice(0, 20).join(', ')}
                        {preview.unknownSkus.length > 20 && ` … và ${preview.unknownSkus.length - 20} mã nữa`}
                      </div>
                      <div className="mt-1 text-xs">Thêm chúng vào danh mục rồi nhập lại thì số mới đủ.</div>
                    </div>
                  </div>
                </div>
              )}

              {preview.nonStandardCodes?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <strong>Ô mã không hợp lệ ở nguồn, đã bỏ qua:</strong>{' '}
                      <span className="font-mono text-xs">{preview.nonStandardCodes.join(', ')}</span>
                      <div className="mt-1 text-xs">Sửa ô mã ở file nguồn thành mã thật thì số của chúng mới vào được.</div>
                    </div>
                  </div>
                </div>
              )}

              {preview.notes?.map((n, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{n}</span>
                </div>
              ))}
            </>
          )}

          {done && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>Đã nhập vào một bản cập nhật mới.</strong>
                <div className="mt-1">
                  Số đã vào bảng nhưng <strong>chưa gửi duyệt</strong> — xem lại rồi bấm Gửi duyệt như bình thường.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            {done ? 'Đóng' : 'Huỷ'}
          </button>
          {!done && (
            <button
              onClick={nhap}
              disabled={!coSo || importing || loading}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              {importing ? 'Đang nhập…' : 'Nhập vào bản mới'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
