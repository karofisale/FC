import { parsePastedNumber } from './useGridEditing.js';

/**
 * Đếm trước số ô sẽ bị GHI ĐÈ khi một thao tác hàng loạt (Copy tháng, điền xuống cả cột) áp lên lưới
 * (Rà soát 4 app, Đợt 3 — Bảng 0 / Bảng 1 / Thực hiện).
 *
 * Một ô "bị ghi đè" khi nó ĐANG có số khác 0 và số mới KHÁC số đó. Ô đang 0 (trống) thì điền vào không mất gì;
 * ô đang đúng bằng số mới thì không đổi — hai loại này không đáng làm người dùng phải dừng lại đọc.
 *
 * @param {{rowKey: string, col: any, value: any}[]} updates cùng dạng với onCellsChange của useGridEditing
 * @param {(rowKey: string, col: any) => number} layGiaTriCu đọc số đang có (từ state thật, không từ DOM)
 */
export function demGhiDe(updates, layGiaTriCu) {
  let ghiDe = 0;
  let thayDoi = 0;
  let tongCu = 0;
  (updates || []).forEach(({ rowKey, col, value }) => {
    const moi = parsePastedNumber(value);
    const cu = Number(layGiaTriCu(rowKey, col)) || 0;
    if (cu !== moi) thayDoi += 1;
    if (cu !== 0 && cu !== moi) { ghiDe += 1; tongCu += cu; }
  });
  return { tong: (updates || []).length, ghiDe, thayDoi, tongCu };
}

/** Câu hỏi xác nhận cho hộp thoại; '' nếu không có ô nào bị ghi đè (khỏi hỏi). */
export function cauHoiGhiDe({ ghiDe, tongCu }, moTa) {
  if (!ghiDe) return '';
  return `${moTa}\n\n${ghiDe.toLocaleString('vi-VN')} ô đang có số (tổng ${tongCu.toLocaleString('vi-VN')}) sẽ bị ghi đè. `
    + 'Chưa lưu cho tới khi bấm "Lưu bản thảo", nhưng các số cũ đó sẽ không lấy lại được trên màn hình.';
}
