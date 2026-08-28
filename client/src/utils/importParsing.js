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
          sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
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
