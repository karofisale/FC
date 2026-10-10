import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

/**
 * Nút "⋯ Thêm": gom các thao tác ÍT DÙNG để màn hình chỉ còn đúng một nút chính
 * (Rà soát 4 app, Đợt 2 mục 4). Thao tác phá dữ liệu (xoá, ghi đè) đặt `danger: true`
 * để chữ đỏ và nằm riêng ở cuối menu.
 *
 * items: [{ label, icon, onClick, danger, disabled, title, hidden }]
 */
export default function MoreMenu({ items, label = 'Thêm', disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const hop = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const ngoai = (e) => { if (hop.current && !hop.current.contains(e.target)) setOpen(false); };
    const phim = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', ngoai);
    document.addEventListener('keydown', phim, true);
    return () => {
      document.removeEventListener('mousedown', ngoai);
      document.removeEventListener('keydown', phim, true);
    };
  }, [open]);

  const dsHien = (items || []).filter((i) => i && !i.hidden);
  if (!dsHien.length) return null;
  // Thao tác nguy hiểm xuống cuối, tách bằng đường kẻ.
  const thuong = dsHien.filter((i) => !i.danger);
  const nguyHiem = dsHien.filter((i) => i.danger);

  const muc = (i) => {
    const Icon = i.icon;
    return (
      <button
        key={i.label}
        type="button"
        role="menuitem"
        disabled={i.disabled}
        title={i.title}
        onClick={() => { setOpen(false); i.onClick?.(); }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left disabled:opacity-50 disabled:cursor-not-allowed ${
          i.danger ? 'text-rose-700 hover:bg-rose-50 font-semibold' : 'text-slate-700 hover:bg-slate-50'
        }`}
      >
        {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />}
        {i.label}
      </button>
    );
  };

  return (
    <div className={`relative inline-block ${className}`} ref={hop}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg"
      >
        <MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 min-w-56 bg-white rounded-lg shadow-2xl border border-slate-200 py-1 z-40 text-slate-800"
        >
          {thuong.map(muc)}
          {thuong.length > 0 && nguyHiem.length > 0 && <div className="my-1 border-t border-slate-200" role="separator" />}
          {nguyHiem.map(muc)}
        </div>
      )}
    </div>
  );
}
