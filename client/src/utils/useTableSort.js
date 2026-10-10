import { useState, useMemo, useRef, useEffect } from 'react';
import { nextSpec, orderFrom, applyOrder } from './tableSortCore';

/**
 * Sắp xếp theo cột cho một bảng — xem tableSortCore.js cho các quy tắc.
 *
 * Thứ tự được CHỐT lúc bấm tiêu đề cột rồi giữ nguyên cho tới lần bấm kế tiếp, nên bảng có ô nhập
 * (Forecast tháng/tuần, Thực hiện) không bị nhảy dòng khi đang gõ, và sắp xếp không bao giờ làm
 * mất dữ liệu đang sửa: dữ liệu vẫn nằm ở state của trang, hook chỉ trả một bản xem đã đảo thứ tự.
 *
 * @param {Array} rows dòng hiện có (đã lọc)
 * @param {Record<string, {type: 'number'|'text'|'date', get: (row) => any}>} columns
 * @param {(row) => string} getKey khoá duy nhất của dòng (mã SKU...)
 * @returns {{rows: Array, spec: object|null, toggle: (key: string) => void, order: Map|null}}
 *   `order` = thứ tự đã chốt (Map khoá dòng -> vị trí), để áp cùng thứ tự cho danh sách lồng nhau (applyOrder).
 */
export function useTableSort(rows, columns, getKey) {
  // getKey được chốt cùng thứ tự (state.getKey) để lúc vẽ không phải đọc ref.
  const [state, setState] = useState({ spec: null, order: null, getKey });
  const latest = useRef({ rows, columns, getKey });
  useEffect(() => { latest.current = { rows, columns, getKey }; });

  const toggle = (key) => {
    setState((prev) => {
      const spec = nextSpec(prev.spec, key);
      const cur = latest.current;
      return { spec, order: orderFrom(cur.rows, spec, cur.columns, cur.getKey), getKey: cur.getKey };
    });
  };

  const sorted = useMemo(
    () => applyOrder(rows, state.order, state.getKey),
    [rows, state.order, state.getKey]
  );
  return { rows: sorted, spec: state.spec, toggle, order: state.order };
}
