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

// ---------------------------------------------------------------------
// SAP ZPP702 — logic port từ skill upload-fc-sap (scripts/generate_upload_forms.py)
// ---------------------------------------------------------------------

/** (year, month 1-12) + n tháng -> {year, month} mới. */
export function addMonths(year, month, n) {
  const total = year * 12 + (month - 1) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** Thứ Tư đầu tiên của một tháng, trả về chuỗi YYYYMMDD (SAP cần dạng chuỗi, không phải kiểu ngày). */
export function firstWednesdayStr(year, month) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const jsWeekday = d.getUTCDay(); // CN=0..T7=6
  const pyWeekday = (jsWeekday + 6) % 7; // T2=0..CN=6, khớp Python date.weekday()
  const offset = (2 - pyWeekday + 7) % 7; // 2 = Thứ Tư trong hệ Python
  d.setUTCDate(d.getUTCDate() + offset);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Mã vật tư bắt đầu bằng "1" -> VSE, còn lại -> VSF (quy tắc gốc trong skill). */
export function vseVsf(skuCode) {
  return String(skuCode).trim().startsWith('1') ? 'VSE' : 'VSF';
}

// Cột A-I giống nhau ở cả 3 kênh (theo logic skill upload-fc-sap). Tên cột
// dưới đây là DIỄN GIẢI theo skill, KHÔNG PHẢI tiêu đề thật trong file
// template ZPP702 gốc — file này không có sẵn để đối chiếu khi viết code.
// Dán dữ liệu (từ dòng 3) vào đúng cột A-U của template thật, không dùng
// trực tiếp file .xlsx này làm file upload SAP.
const ZPP702_FIXED_HEADER = [
  'A: Nhóm kế hoạch', 'B: Mã vật tư', 'C: Nhà máy nguồn', 'D: Nhà máy đích',
  'E: Đơn vị (VSE/VSF)', 'F: Phiên bản', 'G: Chỉ báo', 'H: Năm', 'I: Ngày (YYYYMMDD)'
];

/** Header J-U khác nhau theo từng kênh — mô tả đúng ý nghĩa 12 cột J..U. */
function zpp702Header(monthCols) {
  return [...ZPP702_FIXED_HEADER, ...monthCols.map((label, i) => `${String.fromCharCode(74 + i)}: ${label}`)];
}

/**
 * XK: bỏ qua tháng 1 (base_month), điền tháng 2 vào cột L, tháng 3 vào
 * P, tháng 4 vào T. Ngày upload = thứ Tư đầu tiên của tháng 2.
 */
export function buildXkRows(b0Export) {
  const { months, rows } = b0Export;
  if (months.length < 4) return [];
  const m2 = addMonths(...months[0].split('-').slice(0, 2).map(Number), 1);
  const dateStr = firstWednesdayStr(m2.year, m2.month);
  const year = new Date().getFullYear();

  return rows
    .filter((r) => r.default_channel === 'XK' || (r.monthly[months[1]]?.XK ?? r.monthly[months[2]]?.XK ?? r.monthly[months[3]]?.XK) !== undefined)
    .map((r) => {
      const q2 = r.monthly[months[1]]?.XK || 0;
      const q3 = r.monthly[months[2]]?.XK || 0;
      const q4 = r.monthly[months[3]]?.XK || 0;
      return [
        'KH_XK', Number(r.sku_code) || r.sku_code, '0400', '0400', vseVsf(r.sku_code),
        '00', 'X', year, dateStr,
        0, 0, q2, 0, 0, 0, q3, 0, 0, 0, q4, 0
      ];
    });
}

/**
 * OEM: dùng tháng 1,2,3 (không bỏ tháng đầu như XK). Ngày upload = thứ
 * Tư đầu tiên của tháng 1 (base_month).
 */
export function buildOemRows(b0Export) {
  const { months, rows } = b0Export;
  if (months.length < 3) return [];
  const [y1, m1] = months[0].split('-').slice(0, 2).map(Number);
  const dateStr = firstWednesdayStr(y1, m1);
  const year = new Date().getFullYear();

  return rows
    .filter((r) => r.default_channel === 'OEM' || [months[0], months[1], months[2]].some((m) => r.monthly[m]?.OEM !== undefined))
    .map((r) => {
      const q1 = r.monthly[months[0]]?.OEM || 0;
      const q2 = r.monthly[months[1]]?.OEM || 0;
      const q3 = r.monthly[months[2]]?.OEM || 0;
      return [
        'KH_OEM', Number(r.sku_code) || r.sku_code, '0400', '0400', vseVsf(r.sku_code),
        '00', 'X', year, dateStr,
        0, 0, q1, 0, 0, 0, q2, 0, 0, 0, q3, 0
      ];
    });
}

/**
 * GT2: cột tuần (J-N) lấy từ tổng sản lượng tuần thật của GT2 (không
 * phải rải đều), cột tháng sau (O-U) lấy trung bình tháng 2/tháng 3 của
 * chính kênh GT2 chia đều cho số tuần — cách này ĐƠN GIẢN HOÁ so với bản
 * gốc (bản gốc dùng tổng CẢ CÔNG TY chia đều, không phải riêng GT2; xem
 * ghi chú trong Exports.jsx — cần đối chiếu số thật trước khi tin dùng).
 */
export function buildGt2Rows(b0Export, weeklyExport) {
  const { months, rows } = b0Export;
  if (months.length < 3) return [];
  const [y1, m1] = months[0].split('-').slice(0, 2).map(Number);
  const dateStr = firstWednesdayStr(y1, m1);
  const year = new Date().getFullYear();

  const weeklyBySku = {};
  (weeklyExport?.rows || []).forEach((r) => { weeklyBySku[r.sku_code] = r.weeks || {}; });

  return rows
    .filter((r) => r.default_channel === 'GT2' || r.default_channel === 'Online' || weeklyBySku[r.sku_code])
    .map((r) => {
      const w = weeklyBySku[r.sku_code] || {};
      const weekly = [1, 2, 3, 4, 5].map((wk) => w[wk] || 0);

      const m2Total = r.monthly[months[1]]?.GT2 || 0;
      const m3Total = r.monthly[months[2]]?.GT2 || 0;
      const m2Weekly = Math.round(m2Total / 4);
      const m3Weekly = Math.round(m3Total / 3);

      return [
        'KH_GT2', Number(r.sku_code) || r.sku_code, '0200', '0200', 'VSF',
        '00', 'X', year, dateStr,
        weekly[0], weekly[1], weekly[2], weekly[3], weekly[4],
        m2Weekly, m2Weekly, m2Weekly, m2Weekly, m3Weekly, m3Weekly, m3Weekly
      ];
    });
}

export function buildXkSheet(b0Export) {
  const { months } = b0Export;
  const m2 = months[1] ? monthLabel(months[1]) : 'T2';
  const m3 = months[2] ? monthLabel(months[2]) : 'T3';
  const m4 = months[3] ? monthLabel(months[3]) : 'T4';
  const header = zpp702Header(['0', '0', m2, '0', '0', '0', m3, '0', '0', '0', m4, '0']);
  return [header, ...buildXkRows(b0Export)];
}

export function buildOemSheet(b0Export) {
  const { months } = b0Export;
  const m1 = months[0] ? monthLabel(months[0]) : 'T1';
  const m2 = months[1] ? monthLabel(months[1]) : 'T2';
  const m3 = months[2] ? monthLabel(months[2]) : 'T3';
  const header = zpp702Header(['0', '0', m1, '0', '0', '0', m2, '0', '0', '0', m3, '0']);
  return [header, ...buildOemRows(b0Export)];
}

export function buildGt2Sheet(b0Export, weeklyExport) {
  const { months } = b0Export;
  const m2 = months[1] ? `TB ${monthLabel(months[1])}/4` : 'TB T2/4';
  const m3 = months[2] ? `TB ${monthLabel(months[2])}/3` : 'TB T3/3';
  const header = zpp702Header(['W1', 'W2', 'W3', 'W4', 'W5', m2, m2, m2, m2, m3, m3, m3]);
  return [header, ...buildGt2Rows(b0Export, weeklyExport)];
}
