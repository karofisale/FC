import { useRef, useCallback } from 'react';

/**
 * Chuyển text dán từ Excel thành số — Excel/Sheets Việt Nam thường dùng
 * dấu chấm ngăn cách nghìn và dấu phẩy cho phần thập phân khi hiển thị,
 * nhưng khi copy ra clipboard thường là số thô không định dạng. Xử lý cả
 * hai kiểu cho chắc, và bỏ mọi ký tự không phải số/dấu.
 */
export function parsePastedNumber(raw) {
  const cleaned = String(raw ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  let normalized;
  if (lastDot === -1 && lastComma === -1) normalized = cleaned;
  else if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else normalized = cleaned.replace(/,/g, '');

  const n = parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Điều hướng bàn phím (Tab/Enter/mũi tên), dán khối nhiều dòng×cột từ
 * Excel, và fill-down cho lưới đã ảo hoá (@tanstack/react-virtual).
 *
 * Vì lưới ảo hoá không mount hết mọi dòng, không thể dựa vào DOM để lấy
 * "giá trị ô phía trên" hay điều hướng bằng nextSibling — mọi thao tác ở
 * đây làm việc trên toạ độ (rowIndex, colIndex) và state thật (qua
 * getCellValue), chỉ dùng DOM để FOCUS sau khi đã cuộn dòng đích vào
 * khung nhìn (scrollToRow), không dùng DOM để ĐỌC dữ liệu.
 *
 * @param {Array} columns - cột theo đúng thứ tự hiển thị trái→phải (có
 *   thể là chuỗi hoặc object tuỳ lưới, truyền nguyên vẹn cho các callback).
 * @param {Array} rows - hàng theo đúng thứ tự hiển thị trên→dưới
 *   (thường là filteredProducts).
 * @param {(row) => string} getRowKey - khoá duy nhất của 1 hàng (sku_code).
 * @param {(rowKey, col) => string} buildCellId - ghép thành id để tra cellRefs.
 * @param {(rowKey, col) => number} getCellValue - đọc giá trị hiện tại từ
 *   state thật (không phải DOM) để Ctrl+D / fill-down luôn đúng dù ô
 *   nguồn đang không được mount.
 * @param {(updates: {rowKey, col, value}[]) => void} onCellsChange - áp
 *   dụng nhiều ô cùng lúc (dán khối, fill-down) trong đúng 1 lần cập nhật.
 * @param {(rowIndex: number) => void} scrollToRow - gọi rowVirtualizer.scrollToIndex.
 */
export function useGridEditing({ columns, rows, getRowKey, buildCellId, getCellValue, onCellsChange, scrollToRow }) {
  const cellRefs = useRef(new Map());

  const registerRef = useCallback((cellId) => (el) => {
    if (el) cellRefs.current.set(cellId, el);
    else cellRefs.current.delete(cellId);
  }, []);

  const focusCell = useCallback((rowIdx, colIdx) => {
    if (!rows.length || !columns.length) return;
    const r = Math.max(0, Math.min(rows.length - 1, rowIdx));
    const c = Math.max(0, Math.min(columns.length - 1, colIdx));
    const row = rows[r];
    if (!row) return;

    const cellId = buildCellId(getRowKey(row), columns[c]);

    // Trường hợp phổ biến: ô đích đang hiển thị sẵn (điều hướng trong
    // cùng khung nhìn) -> focus ngay, không cần đợi khung hình nào.
    const existing = cellRefs.current.get(cellId);
    if (existing) {
      existing.focus();
      if (typeof existing.select === 'function') existing.select();
      return;
    }

    // Ô đích ngoài khung nhìn (chưa mount) — cuộn tới rồi đợi virtualizer
    // render xong mới tìm ref mà focus.
    scrollToRow(r);
    requestAnimationFrame(() => {
      const el = cellRefs.current.get(cellId);
      if (el) {
        el.focus();
        if (typeof el.select === 'function') el.select();
      }
    });
  }, [rows, columns, getRowKey, buildCellId, scrollToRow]);

  const handleKeyDown = useCallback((e, rowIdx, colIdx) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (rowIdx === 0) return;
      const aboveRow = rows[rowIdx - 1];
      const curRow = rows[rowIdx];
      if (!aboveRow || !curRow) return;
      const value = getCellValue(getRowKey(aboveRow), columns[colIdx]);
      onCellsChange([{ rowKey: getRowKey(curRow), col: columns[colIdx], value }]);
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        focusCell(rowIdx - 1, colIdx);
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusCell(rowIdx + 1, colIdx);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusCell(rowIdx, colIdx - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        focusCell(rowIdx, colIdx + 1);
        break;
      case 'Enter':
        e.preventDefault();
        focusCell(rowIdx + 1, colIdx);
        break;
      case 'Tab':
        e.preventDefault();
        focusCell(rowIdx, e.shiftKey ? colIdx - 1 : colIdx + 1);
        break;
      default:
        break;
    }
  }, [focusCell, rows, columns, getRowKey, getCellValue, onCellsChange]);

  /** Dán khối nhiều dòng×cột (tab-separated, newline-separated) từ Excel. */
  const handlePaste = useCallback((e, rowIdx, colIdx) => {
    const text = e.clipboardData?.getData('text');
    if (!text) return;

    const lines = text.replace(/\r/g, '').split('\n');
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    // Dán 1 ô đơn (không tab, chỉ 1 dòng) -> để trình duyệt xử lý mặc định
    if (lines.length <= 1 && !lines[0]?.includes('\t')) return;

    e.preventDefault();
    const updates = [];
    lines.forEach((line, rOffset) => {
      const cells = line.split('\t');
      cells.forEach((raw, cOffset) => {
        const r = rowIdx + rOffset;
        const c = colIdx + cOffset;
        if (r >= rows.length || c >= columns.length) return;
        updates.push({ rowKey: getRowKey(rows[r]), col: columns[c], value: raw });
      });
    });
    if (updates.length) onCellsChange(updates);
  }, [rows, columns, getRowKey, onCellsChange]);

  /** Lấy giá trị ô đầu cột (hàng đầu tiên đang hiển thị) rải xuống hết cột. */
  const fillColumnDown = useCallback((colIdx) => {
    if (rows.length < 2) return;
    const value = getCellValue(getRowKey(rows[0]), columns[colIdx]);
    const updates = rows.slice(1).map((row) => ({ rowKey: getRowKey(row), col: columns[colIdx], value }));
    onCellsChange(updates);
  }, [rows, columns, getRowKey, getCellValue, onCellsChange]);

  return { registerRef, handleKeyDown, handlePaste, fillColumnDown };
}
