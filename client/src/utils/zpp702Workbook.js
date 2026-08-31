import * as XLSX from 'xlsx';
// Ghi ro duoi .js de tools/ chay duoc file nay trong Node; Vite chap nhan ca hai.
import { ZPP702_SHEET_NAME } from './sapExport.js';

/**
 * Dựng file upload SAP ZPP702.
 *
 * Sheet được TẠO MỚI theo đúng khuôn của form thật, thay vì nạp file mẫu
 * rồi điền vào. Hai lý do, cả hai đều là vấn đề thật đã kiểm chứng:
 *
 * 1. Thư viện xlsx ĐỌC SAI công thức dùng chung của form gốc: J2 đọc đúng
 *    là SUMIF(...,J:J) nhưng L2 tới U2 đều ra SUMIF(...,K:K). Nạp form rồi
 *    ghi lại sẽ làm hỏng đúng dòng tổng mà người dùng dựa vào để tự kiểm,
 *    mà nhìn file thì không thấy gì bất thường.
 * 2. Thư mục public/ của app được phục vụ công khai trên GitHub Pages, nên
 *    đính kèm file form (kèm các sheet tài liệu thiết kế SAP nội bộ) đồng
 *    nghĩa với công khai chúng.
 *
 * Đánh đổi: file sinh ra chỉ có sheet ZPP702, không kèm 6 sheet tài liệu và
 * không có định dạng màu/viền của form gốc. SAP đọc thẳng giá trị ô nên
 * không ảnh hưởng — nhưng nếu sau này cần nộp đúng bản có đủ sheet thì phải
 * đổi cách làm.
 */

const HEADER_ROW = [
  'Requirements Plan', 'Material', 'Plant ', 'MRP Area ', 'Requirements Type ',
  'Version', 'Version Active', 'Năm ', 'Ngày up kế hoạch ',
  'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'
];

// Chín ô đầu của dòng 2 là diễn giải, chép nguyên văn từ form thật.
const NOTE_ROW = [
  'Tên kế hoạch\nDigit: 10',
  'Mã vật tư',
  'Công ty',
  'MRP Area',
  'MTS: VSF\nMTO: VSE',
  'Phiên bản KHSX\nDefault: 00',
  'Default: X',
  'Năm up kế hoạch',
  'Định dạng: Nămthángngày\nLưu ý: Điền ngày thứ 4 của tuần đầu tiên up kế hoạch'
];

const FIRST_WEEK_COL = 9;  // cột J, đếm từ 0
const WEEK_COUNT = 12;

/**
 * Dùng dạng cột nguyên ($E:$E) như form OEM, không dùng dạng chặn dòng
 * ($E3:$E1253) như form XK — dạng chặn dòng sẽ bỏ sót nếu danh sách dài
 * hơn 1251 dòng, mà số dòng thì thay đổi theo từng kỳ.
 */
function sumifFormula(colLetter) {
  return `SUMIF($E:$E,"VSE",${colLetter}:${colLetter})`;
}

export function buildZpp702Workbook(rows) {
  const ws = XLSX.utils.aoa_to_sheet([HEADER_ROW, NOTE_ROW]);

  for (let i = 0; i < WEEK_COUNT; i++) {
    const col = FIRST_WEEK_COL + i;
    const letter = XLSX.utils.encode_col(col);
    ws[XLSX.utils.encode_cell({ r: 1, c: col })] = {
      t: 'n',
      v: 0,                          // Excel tính lại khi mở; giá trị này chỉ là chỗ giữ
      f: sumifFormula(letter)
    };
  }

  if (rows.length) XLSX.utils.sheet_add_aoa(ws, rows, { origin: 'A3' });

  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(1, rows.length + 1), c: HEADER_ROW.length - 1 }
  });
  ws['!cols'] = HEADER_ROW.map((h, i) => ({ wch: i < 9 ? Math.max(12, h.length + 2) : 7 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ZPP702_SHEET_NAME);
  return wb;
}

export function downloadZpp702(rows, filename) {
  XLSX.writeFile(buildZpp702Workbook(rows), filename);
}
