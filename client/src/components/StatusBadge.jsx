import React from 'react';

export default function StatusBadge({ status }) {
  const map = {
    draft: { label: 'Bản thảo', bg: 'bg-slate-100 text-slate-700 border-slate-300' },
    submitted: { label: 'Chờ duyệt', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
    approved: { label: 'Đã duyệt', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    rejected: { label: 'Từ chối', bg: 'bg-rose-100 text-rose-800 border-rose-300' },
    locked: { label: 'Đã khóa', bg: 'bg-purple-100 text-purple-800 border-purple-300' },
    // Trạng thái của YÊU CẦU duyệt (màn Phê duyệt). 'superseded' = bị thay bởi lượt gửi mới, hoặc tự rút
    // khi người lập sửa số / tạo bản tuần mới lúc đang chờ duyệt (09/10/2026) — trước đây hiện chữ tiếng Anh.
    pending: { label: 'Chờ duyệt', bg: 'bg-amber-100 text-amber-800 border-amber-300' },
    superseded: { label: 'Đã rút / thay thế', bg: 'bg-slate-100 text-slate-500 border-slate-300' },
    revision_requested: { label: 'Yêu cầu sửa', bg: 'bg-orange-100 text-orange-800 border-orange-300' }
  };

  const current = map[status] || { label: status || 'N/A', bg: 'bg-gray-100 text-gray-700 border-gray-300' };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${current.bg}`}>
      {current.label}
    </span>
  );
}
