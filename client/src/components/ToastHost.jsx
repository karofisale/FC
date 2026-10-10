import React, { useSyncExternalStore } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { subscribeToasts, getToastSnapshot, dismissToast } from '../services/toastService';

/**
 * Vùng hiện toast (services/toastService.js). Đặt MỘT lần ở App.jsx.
 * Xếp chồng góc dưới bên phải; lỗi không tự tắt nên luôn có nút ×. Mọi toast đều đóng tay được.
 * z-[60] để nằm TRÊN hộp thoại (z-50 / z-[55]) — lỗi báo ra khi hộp đang mở vẫn thấy.
 */
const KIEU = {
  success: { khung: 'bg-emerald-50 border-emerald-300 text-emerald-900', icon: CheckCircle2, mauIcon: 'text-emerald-700' },
  error: { khung: 'bg-rose-50 border-rose-300 text-rose-900', icon: AlertCircle, mauIcon: 'text-rose-700' },
  warning: { khung: 'bg-amber-50 border-amber-300 text-amber-900', icon: AlertTriangle, mauIcon: 'text-amber-700' },
  info: { khung: 'bg-white border-slate-300 text-slate-800', icon: Info, mauIcon: 'text-blue-700' }
};

export default function ToastHost() {
  const { visible, waiting } = useSyncExternalStore(subscribeToasts, getToastSnapshot, getToastSnapshot);
  if (!visible.length) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]"
      aria-live="polite"
    >
      {visible.map((t) => {
        const k = KIEU[t.type] || KIEU.info;
        const Icon = k.icon;
        return (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`border rounded-lg shadow-lg px-3 py-2.5 text-xs flex items-start gap-2 ${k.khung}`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${k.mauIcon}`} aria-hidden="true" />
            <span className="flex-1 min-w-0 break-words leading-relaxed">
              {t.text}
              {t.count > 1 && <span className="ml-1.5 font-bold">×{t.count}</span>}
            </span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Đóng thông báo"
              className="p-0.5 rounded hover:bg-black/10 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      {waiting > 0 && (
        <div className="text-[11px] text-slate-700 bg-white/90 border border-slate-300 rounded-full px-3 py-1 self-end shadow">
          còn {waiting} thông báo đang chờ
        </div>
      )}
    </div>
  );
}
