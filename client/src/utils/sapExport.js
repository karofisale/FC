/**
 * Sinh dòng dữ liệu cho form upload SAP ZPP702.
 *
 * Mọi quy tắc dưới đây được ĐỐI CHIẾU với hai file thật đã upload của kỳ
 * tháng 7/2026 (ZPP702_Upload_KHKD_0400_OEM.xlsx và _XK.xlsx) chứ không
 * lấy theo mô tả — xem tools/verify-sap-export.mjs, nó dựng lại đúng hai
 * file đó từ dữ liệu FC gốc rồi so từng ô.
 *
 * Bố cục sheet "ZPP702" trong template:
 *   dòng 1  tiêu đề
 *   dòng 2  diễn giải + công thức =SUMIF($E:$E,"VSE",J:J) cộng riêng máy
 *   dòng 3+ dữ liệu
 *   cột A..U = 21 cột, trong đó J..U là W1..W12
 */

/** Cột trong sheet ZPP702, đúng thứ tự A..U. */
export const ZPP702_COLUMNS = [
  'Requirements Plan', 'Material', 'Plant', 'MRP Area', 'Requirements Type',
  'Version', 'Version Active', 'Năm', 'Ngày up kế hoạch',
  'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'
];

/** Dữ liệu bắt đầu ở dòng 3 (1-based), tức chỉ số 2 khi đếm từ 0. */
export const ZPP702_FIRST_DATA_ROW = 3;
export const ZPP702_SHEET_NAME = 'ZPP702';

/**
 * Cấu hình từng kênh.
 *
 * monthOffsets: ba tháng đưa vào W3/W7/W11, đếm từ THÁNG GỐC của chu kỳ.
 * Đây là chỗ dễ sai nhất và không thể suy ra từ tên gọi: OEM lấy chính
 * tháng gốc và hai tháng sau, còn XK bỏ tháng gốc, lấy ba tháng kế tiếp.
 * Khớp 165/165 dòng OEM và 756/756 dòng XK của kỳ tháng 7.
 */
export const SAP_CHANNELS = {
  XK: {
    plan: 'KH_XK',
    plant: '0400',
    monthOffsets: [1, 2, 3],
    dateRule: 'firstWednesdayOfMonthAfterBase'
  },
  OEM: {
    plan: 'KH_OEM',
    plant: '0400',
    monthOffsets: [0, 1, 2],
    dateRule: 'wednesdayOfNextWeek'
  }
};

/** W3, W7, W11 là cột thứ 3, 7, 11 trong khối W1..W12 (đếm từ 1). */
const QUANTITY_WEEK_SLOTS = [3, 7, 11];
const WEEK_COUNT = 12;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateStr(d) {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

/** Thứ Tư đầu tiên của một tháng, dạng chuỗi YYYYMMDD (SAP nhận chuỗi, không phải kiểu ngày). */
export function firstWednesdayOfMonth(year, month) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay: CN=0..T7=6 → số ngày phải cộng thêm để tới thứ Tư gần nhất về sau
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7));
  return toDateStr(d);
}

/**
 * Thứ Tư của TUẦN KẾ TIẾP tuần chứa ngày `from` (tuần bắt đầu từ thứ Hai).
 * Ngày này phụ thuộc lúc bấm xuất, không phụ thuộc chu kỳ — xuất lại cùng
 * một chu kỳ vào tuần khác sẽ ra ngày khác, đúng như cách làm tay hiện nay.
 */
export function wednesdayOfNextWeek(from) {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const dow = d.getUTCDay();             // CN=0..T7=6
  const daysSinceMonday = (dow + 6) % 7; // T2=0..CN=6
  d.setUTCDate(d.getUTCDate() - daysSinceMonday + 7 + 2); // về thứ Hai, sang tuần sau, tới thứ Tư
  return toDateStr(d);
}

/** (YYYY-MM-01) + n tháng → chuỗi YYYY-MM-01. */
export function addMonths(month, n) {
  const [y, m] = String(month).split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}-01`;
}

export function uploadDateFor(channel, baseMonth, exportedAt) {
  const cfg = SAP_CHANNELS[channel];
  if (cfg?.dateRule === 'firstWednesdayOfMonthAfterBase') {
    const [y, m] = addMonths(baseMonth, 1).split('-').map(Number);
    return firstWednesdayOfMonth(y, m);
  }
  return wednesdayOfNextWeek(exportedAt);
}

/**
 * VSE hay VSF.
 *
 * Cột này thực chất là chiến lược lập kế hoạch của vật tư trong SAP
 * (chú thích trong template: MTS→VSF, MTO→VSE), còn "mã bắt đầu bằng 1"
 * chỉ là suy đoán gần đúng: đúng 165/165 dòng OEM nhưng SAI 6 dòng XK —
 * sáu mã Lõi/Màng đầu 2 vẫn phải là VSE. Vì vậy giá trị ghi sẵn ở danh
 * mục Products (cột requirements_type) luôn được ưu tiên, quy tắc đầu-1
 * chỉ dùng khi danh mục để trống.
 */
export function requirementsTypeOf(channel, skuCode, override) {
  const fixed = String(override || '').trim().toUpperCase();
  if (fixed === 'VSE' || fixed === 'VSF') return fixed;
  if (channel !== 'XK' && channel !== 'OEM') return 'VSF';
  return String(skuCode).trim().startsWith('1') ? 'VSE' : 'VSF';
}

/**
 * Material phải là SỐ trong file thật (kiểm chứng: kiểu ô là numeric).
 * Mã không thuần số thì giữ nguyên chuỗi thay vì biến thành NaN.
 */
function materialValue(skuCode) {
  const n = Number(String(skuCode).trim());
  return Number.isFinite(n) ? n : String(skuCode).trim();
}

/**
 * Dựng các dòng A..U cho một kênh.
 *
 * @param {object} p
 * @param {'XK'|'OEM'} p.channel
 * @param {string}  p.baseMonth      tháng gốc chu kỳ, dạng YYYY-MM-01
 * @param {Array}   p.rows           [{ sku_code, requirements_type, monthly: { [month]: { [bu]: qty } } }]
 * @param {Date}    p.exportedAt     thời điểm xuất — quyết định cột Năm và ngày của OEM
 * @returns {Array<Array>} mảng dòng, mỗi dòng 21 phần tử đúng thứ tự cột A..U
 */
export function buildSapRows({ channel, baseMonth, rows, exportedAt = new Date() }) {
  const cfg = SAP_CHANNELS[channel];
  if (!cfg) throw new Error(`Chưa có cấu hình SAP cho kênh ${channel}.`);

  const months = cfg.monthOffsets.map((off) => addMonths(baseMonth, off));
  const dateStr = uploadDateFor(channel, baseMonth, exportedAt);
  const year = exportedAt.getFullYear();

  const out = [];
  rows.forEach((r) => {
    const quantities = months.map((m) => Number(r.monthly?.[m]?.[channel]) || 0);
    // Chỉ xuất SKU thực sự có số. Danh mục đầy đủ kèm dòng 0 là cách làm
    // tay trước đây; app không lưu dòng số lượng 0 nên cũng không dựng lại
    // được chúng từ kế hoạch.
    if (!quantities.some((q) => q !== 0)) return;

    const weeks = new Array(WEEK_COUNT).fill(0);
    QUANTITY_WEEK_SLOTS.forEach((slot, i) => { weeks[slot - 1] = quantities[i]; });

    out.push([
      cfg.plan,
      materialValue(r.sku_code),
      cfg.plant,
      cfg.plant,                                   // MRP Area luôn bằng Plant
      requirementsTypeOf(channel, r.sku_code, r.requirements_type),
      '00',
      'X',
      year,
      dateStr,
      ...weeks
    ]);
  });

  return out;
}
