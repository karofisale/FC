import * as XLSX from 'xlsx';

/** Đọc file .xlsx/.xls thành { sheetNames, sheets: { [tên]: aoa } }. */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheets = {};
        wb.SheetNames.forEach((name) => {
          // raw:true = lấy GIÁ TRỊ THẬT của ô, không phải chuỗi đã định dạng.
          //
          // Trước đây dùng raw:false nên ô 1000 hiện thành "1,000", rồi
          // parsePastedNumber hiểu dấu phẩy là dấu thập phân và trả về 1 — sai
          // gấp nghìn lần, không báo lỗi ở đâu cả. File 3T định dạng kiểu này nên
          // toàn bộ số từ 1.000 trở lên đều bị thu nhỏ khi nhập.
          //
          // Giá trị thô cũng đồng bộ với đường Google Sheet (API vốn trả số),
          // nên hai nguồn nhập không còn cho ra hai kết quả khác nhau.
          sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
        });
        resolve({ sheetNames: wb.SheetNames, sheets });
      } catch (err) {
        reject(new Error('Không đọc được file Excel: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Không đọc được file.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Lấy ID spreadsheet từ URL đầy đủ hoặc chuỗi ID thô. */
export function extractSpreadsheetId(input) {
  const trimmed = String(input || '').trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

/** Chuẩn hoá số dán từ Excel (dấu chấm/phẩy ngăn cách) — dùng chung với useGridEditing. */
export { parsePastedNumber } from './useGridEditing';
