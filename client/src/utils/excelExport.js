import * as XLSX from 'xlsx';
import { monthLabel } from './period';

/** Tải một workbook gồm nhiều sheet, mỗi phần tử là [tênSheet, aoa]. */
export function downloadWorkbook(sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(([name, aoa]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel giới hạn 31 ký tự/tên sheet
  });
  XLSX.writeFile(wb, filename);
}

/**
 * Bảng B0.SUM — một dòng mỗi SKU, cột theo (đơn vị kinh doanh × tháng),
 * khớp bố cục cột của file "XK_OEM_GT2_Online Sales FC" gốc (Mã sp, Tên
 * sp, Tên gọi tắt, Nhóm, Công nghệ, Kênh, Giá bán BQ, rồi khối 4 tháng ×
 * [Tổng, <từng BU>]).
 */
export function buildB0SumSheet(data) {
  const { months, businessUnits, rows } = data;

  const header1 = ['Mã sp', 'Tên sp', 'Tên gọi tắt', 'Nhóm', 'Công nghệ', 'Kênh', 'Giá bán BQ'];
  const header2 = ['', '', '', '', '', '', ''];
  months.forEach((m) => {
    header1.push(monthLabel(m), ...businessUnits.map(() => ''));
    header2.push('Tổng', ...businessUnits);
  });

  const aoa = [header1, header2];

  rows.forEach((r) => {
    const line = [r.sku_code, r.name, r.short_name, r.product_group_name || r.product_group_code, r.technology, r.default_channel, r.avg_price];
    months.forEach((m) => {
      const byBu = r.monthly?.[m] || {};
      const total = businessUnits.reduce((s, bu) => s + (byBu[bu] || 0), 0);
      line.push(total, ...businessUnits.map((bu) => byBu[bu] || 0));
    });
    aoa.push(line);
  });

  return aoa;
}

/**
 * Bảng B1.SUM bản gọn — tổng theo Nhóm hàng × (Tuần × Miền), gộp tất cả
 * đơn vị kinh doanh (không tách theo BU như bản gốc, không có các cột
 * chênh lệch giữa các lần cập nhật — xem ghi chú phạm vi trong Exports.jsx).
 */
export function buildB1SumSheet(rows, weeks, regions) {
  const header1 = ['Nhóm hàng'];
  const header2 = [''];
  weeks.forEach((w) => {
    // Nhãn tuần gộp trên regions.length cột — chỉ cần (regions.length-1)
    // ô trống lấp thêm bên cạnh, khớp đúng số cột với header2 bên dưới.
    header1.push(`Tuần ${w}`, ...Array(Math.max(0, regions.length - 1)).fill(''));
    header2.push(...regions);
  });

  const byGroup = {};
  rows.forEach((r) => {
    const key = r.product_group_code || 'KHAC';
    if (!byGroup[key]) byGroup[key] = { name: r.product_group_name || key, cells: {} };
    const cellKey = `${r.week_number}_${r.region_code}`;
    byGroup[key].cells[cellKey] = (byGroup[key].cells[cellKey] || 0) + (Number(r.total_quantity) || 0);
  });

  const aoa = [header1, header2];
  Object.values(byGroup).forEach((g) => {
    const line = [g.name];
    weeks.forEach((w) => regions.forEach((r) => line.push(g.cells[`${w}_${r}`] || 0)));
    aoa.push(line);
  });

  return aoa;
}
