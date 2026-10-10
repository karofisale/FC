import React from 'react';
import { statusLabel, statusTone } from '../utils/glossary';

/**
 * Huy hiệu trạng thái — nhãn và màu nằm ở utils/glossary.js (một bảng cho cả app).
 * Không bao giờ hiện mã thô: mã lạ hiện "Chưa xác định" (mã gốc nằm trong tooltip để dò lỗi).
 */
export default function StatusBadge({ status }) {
  const nhan = statusLabel(status);
  return (
    <span
      title={nhan === 'Chưa xác định' ? 'Mã trạng thái: ' + status : undefined}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusTone(status)}`}
    >
      {nhan}
    </span>
  );
}
