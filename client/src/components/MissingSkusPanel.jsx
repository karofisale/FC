import React from 'react';
import { ArrowLeft, Loader2, PackagePlus } from 'lucide-react';

/**
 * Bảng điền nhanh thông tin cho các SKU chưa có trong danh mục Products, dùng
 * chung cho "Nhập từ file" (ImportForecastModal) và "Nhập từ app nguồn"
 * (ImportFromSourceModal) — cùng một việc (một loạt mã lạ cần Tên/Nhóm/Kênh
 * trước khi ghi vào danh mục), khác nhau chỉ ở nơi gọi và việc xảy ra sau khi
 * lưu. Tách ra một chỗ để hai nơi luôn hỏi đúng những câu giống nhau, và sửa
 * một lần là cả hai luồng cùng đổi.
 *
 * rows: [{ skuCode, name, productGroupCode, defaultChannel, avgPrice }]
 * onUpdateRow(skuCode, field, value)
 * onApplyBulk() — áp bulkGroup/bulkChannel hiện tại cho mọi dòng
 * onBack — bỏ qua (ẩn nút Quay lại) khi không có bước trước để lùi về
 */
export default function MissingSkusPanel({
  rows, groups, bus,
  bulkGroup, setBulkGroup, bulkChannel, setBulkChannel, onApplyBulk,
  onUpdateRow, onConfirm, onBack, onCancel, busy, confirmLabel, intro
}) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
        <PackagePlus className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{intro}</span>
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
        <button onClick={onApplyBulk} className="border border-slate-300 hover:bg-slate-100 px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap">
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
            {rows.map((p) => (
              <tr key={p.skuCode}>
                <td className="p-2 font-bold font-mono">{p.skuCode}</td>
                <td className="p-1.5">
                  <input value={p.name} onChange={(e) => onUpdateRow(p.skuCode, 'name', e.target.value)}
                    className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs" placeholder="Bắt buộc" />
                </td>
                <td className="p-1.5">
                  <select value={p.productGroupCode} onChange={(e) => onUpdateRow(p.skuCode, 'productGroupCode', e.target.value)}
                    className="w-full px-1 py-1 border border-slate-200 rounded text-xs">
                    {groups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
                  </select>
                </td>
                <td className="p-1.5">
                  <select value={p.defaultChannel} onChange={(e) => onUpdateRow(p.skuCode, 'defaultChannel', e.target.value)}
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
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-3.5 h-3.5" /> Quay lại
          </button>
        ) : onCancel ? (
          <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700">Huỷ</button>
        ) : <span />}
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-semibold"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackagePlus className="w-3.5 h-3.5" />}
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
