import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export default function ValidationAlert({ validationResult }) {
  if (!validationResult) return null;

  const { isValid, mismatchesCount, mismatches = [] } = validationResult;

  if (isValid) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center space-x-3 mb-4 text-emerald-800 text-xs">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <span className="font-bold text-sm block">Đã kiểm tra điều kiện ràng buộc: KHỚP SỐ THÀNH CÔNG!</span>
          <span>Tổng số dư tất cả SKU ở Bảng 1 (Tuần/Miền) khớp hoàn toàn với Bảng 0 (Forecast Tháng 1). Bạn có thể gửi duyệt.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-4 text-rose-900 text-xs">
      <div className="flex items-center space-x-3 mb-2">
        <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
        <span className="font-bold text-sm">CẢNH BÁO LỆCH SỐ: Phát hiện {mismatchesCount} SKU có tổng tuần/miền chưa khớp với tháng 1!</span>
      </div>
      <p className="text-rose-700 mb-2">
        Quy tắc nghiệp vụ Karofi yêu cầu: <code className="bg-rose-100 px-1 py-0.5 rounded font-mono font-bold">SUM(Số tuần W1..W5 x Miền MB/MN) = Số Forecast Tháng 1 (Bảng 0)</code>.
      </p>
      
      {mismatches.length > 0 && (
        <div className="max-h-40 overflow-y-auto bg-white border border-rose-200 rounded p-2 text-slate-700 space-y-1 font-mono text-[11px]">
          {mismatches.map(m => (
            <div key={m.sku_code} className="flex justify-between items-center py-0.5 border-b border-slate-100 last:border-0">
              <span className="font-bold text-slate-800">{m.sku_code} ({m.product_name}):</span>
              <span className="text-rose-600">
                Tháng 1: <strong>{m.month_qty}</strong> | Tuần+Miền: <strong>{m.week_sum}</strong> | Lệch: <strong>{m.variance > 0 ? `+${m.variance}` : m.variance}</strong>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
