import React from 'react';
import { Loader2, AlertCircle, Inbox, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { ariaSort } from '../utils/tableSortCore';

/**
 * Các mảnh dùng chung của MẪU BẢNG (Rà soát 4 app, Đợt 2 mục 3):
 *  - StateRow / StateBlock: trạng thái đang tải / lỗi (kèm nút "Thử lại") / rỗng — một kiểu duy nhất.
 *    Lỗi tải LUÔN hiện lỗi + Thử lại, không bao giờ kẹt ở "Đang tải…" hay im lặng thành bảng rỗng.
 *  - SortTh: ô tiêu đề bấm để sắp xếp (mũi tên tăng/giảm, aria-sort). Dùng cùng useTableSort.
 */

function NoiDung({ kind, text, onRetry }) {
  if (kind === 'loading') {
    return (
      <span className="inline-flex items-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {text || 'Đang tải dữ liệu...'}
      </span>
    );
  }
  if (kind === 'error') {
    return (
      <span className="inline-flex flex-col items-center gap-2 text-rose-800" role="alert">
        <span className="inline-flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {text || 'Không tải được dữ liệu.'}
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            Thử lại
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-slate-500">
      <Inbox className="w-4 h-4" aria-hidden="true" /> {text || 'Không có dữ liệu.'}
    </span>
  );
}

/** Một dòng trạng thái trong <tbody>. kind: 'loading' | 'error' | 'empty'. */
export function StateRow({ colSpan, kind, text, onRetry }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-xs font-sans">
        <NoiDung kind={kind} text={text} onRetry={onRetry} />
      </td>
    </tr>
  );
}

/** Cùng trạng thái đó nhưng ngoài bảng (thẻ / danh sách). */
export function StateBlock({ kind, text, onRetry, className = '' }) {
  return (
    <div className={`p-6 text-center text-xs ${className}`}>
      <NoiDung kind={kind} text={text} onRetry={onRetry} />
    </div>
  );
}

/**
 * Ô tiêu đề sắp xếp được. `spec` / `onSort` lấy từ useTableSort ({spec, toggle}).
 * Màu chữ kế thừa từ hàng tiêu đề nên dùng được trên cả nền tối lẫn nền sáng.
 * `hint` = giải thích ngắn của cột (hiện ở tooltip). `children` hiện sau nút sắp xếp (nút điền cột, chọn tháng nguồn...).
 */
/** Mũi tên sắp xếp rời — cho ô tiêu đề có nội dung riêng (nút điền cột...) nên không dùng được SortTh. */
export function SortIcon({ spec, sortKey }) {
  const dang = spec && spec.key === sortKey;
  const Icon = !dang ? ChevronsUpDown : spec.dir === 'asc' ? ArrowUp : ArrowDown;
  return <Icon className={`w-3 h-3 flex-shrink-0 ${dang ? '' : 'opacity-60'}`} aria-hidden="true" />;
}

export function SortTh({ label, sortKey, spec, onSort, className = '', hint, children, ...rest }) {
  const dang = spec && spec.key === sortKey;
  const Icon = !dang ? ChevronsUpDown : spec.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={ariaSort(spec, sortKey)} className={className} {...rest}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={(hint ? hint + ' — ' : '') + 'bấm để sắp xếp theo ' + String(label).toLowerCase()}
        className="inline-flex items-center gap-1 [text-transform:inherit] hover:underline focus-visible:underline"
      >
        {label}
        <Icon className={`w-3 h-3 flex-shrink-0 ${dang ? '' : 'opacity-60'}`} aria-hidden="true" />
      </button>
      {children}
    </th>
  );
}
