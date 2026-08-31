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
  },

  /**
   * GT2 không phải một đơn vị kinh doanh mà là MỌI kênh dùng nhà máy 0200.
   * File "GT2" tháng 7 có 302 SKU = 6 của GT2 + 296 của Online, tất cả mang
   * chung KH_GT2 — xuất riêng đơn vị GT2 sẽ ra 6 dòng thay vì 302.
   */
  GT2: {
    plan: 'KH_GT2',
    plant: '0200',
    dateRule: 'wednesdayOfNextWeek',
    excludeBUs: ['XK', 'OEM'],
    fixedRequirementsType: 'VSF',   // kênh 0200 luôn VSF, không xét mã đầu 1
    weekColumns: 4,                 // W1..W4 lấy từ bảng chia tuần
    spreadOffsets: [1, 2],          // hai tháng sau, mỗi tháng chia đều 4 cột
    spreadDivisor: 4
  }
};

/** W3, W7, W11 là cột thứ 3, 7, 11 trong khối W1..W12 (đếm từ 1). */
const QUANTITY_WEEK_SLOTS = [3, 7, 11];
const WEEK_COUNT = 12;

/**
 * Làm tròn nửa-về-chẵn, không phải Math.round.
 *
 * File thật do script Python sinh ra, mà round() của Python làm tròn .5 về
 * số chẵn: 650/4 = 162,5 → 162, trong khi Math.round của JS cho 163. Đối
 * chiếu trên tập SKU phân biệt được: cách này khớp 19/19.
 */
export function roundHalfEven(x) {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

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
  if (cfg && cfg.dateRule === 'firstWednesdayOfMonthAfterBase') {
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
  const cfg = SAP_CHANNELS[channel];
  if (cfg?.fixedRequirementsType) return cfg.fixedRequirementsType;
  const fixed = String(override || '').trim().toUpperCase();
  if (fixed === 'VSE' || fixed === 'VSF') return fixed;
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

/** Tổng sản lượng của MỌI kênh cho một SKU trong một tháng. */
function companyTotal(row, month) {
  const byBu = row.monthly?.[month];
  if (!byBu) return 0;
  return Object.keys(byBu).reduce((s, bu) => s + (Number(byBu[bu]) || 0), 0);
}

/**
 * Kênh 0200: W1..W4 lấy từ bảng chia tuần của tháng gốc (đã cộng MB+MN),
 * tám cột sau chia đều sản lượng hai tháng tiếp theo.
 *
 * Phần chia đều dùng TỔNG CẢ CÔNG TY chứ không riêng kênh 0200 — đo trên
 * 19 SKU mà XK/OEM cũng có số (tức hai cách cho kết quả khác nhau): tổng cả
 * công ty khớp 19/19, riêng kênh 0200 khớp 0/19.
 *
 * Tuần thứ 5: bố cục 4+4+4 chỉ có bốn cột tuần, nên sản lượng tuần 5 (và 6)
 * được DỒN vào W4 thay vì bỏ đi — bỏ đi là mất sản lượng đã lên kế hoạch mà
 * không ai thấy. Tháng 7/2026 có tuần thứ 5 thật: 13 SKU, 2.861 cái.
 */
function buildPlant0200Rows(cfg, channel, baseMonth, rows, weekly, dateStr, year) {
  const spreadMonths = cfg.spreadOffsets.map((off) => addMonths(baseMonth, off));
  const out = [];
  const folded = [];

  rows.forEach((r) => {
    const bu = String(r.default_channel || '');
    if (cfg.excludeBUs.indexOf(bu) >= 0) return;

    const byWeek = (weekly && weekly[r.sku_code]) || {};
    const weeks = new Array(WEEK_COUNT).fill(0);
    let over = 0;
    Object.keys(byWeek).forEach((w) => {
      const n = Number(w);
      const qty = Number(byWeek[w]) || 0;
      if (!qty) return;
      if (n >= 1 && n <= cfg.weekColumns) weeks[n - 1] += qty;
      else if (n > cfg.weekColumns) { weeks[cfg.weekColumns - 1] += qty; over += qty; }
    });
    if (over) folded.push({ sku_code: r.sku_code, quantity: over });

    // spreadDivisor có thể là một số (mọi tháng chia như nhau) hoặc một mảng
    // (mỗi tháng một số cột) — file tháng 7 dùng 4 rồi 3.
    let at = cfg.weekColumns;
    spreadMonths.forEach((m, i) => {
      const n = Array.isArray(cfg.spreadDivisor) ? cfg.spreadDivisor[i] : cfg.spreadDivisor;
      const per = roundHalfEven(companyTotal(r, m) / n);
      for (let k = 0; k < n; k++) weeks[at + k] = per;
      at += n;
    });

    if (!weeks.some((q) => q !== 0)) return;

    out.push([
      cfg.plan,
      materialValue(r.sku_code),
      cfg.plant,
      cfg.plant,
      requirementsTypeOf(channel, r.sku_code, r.requirements_type),
      '00',
      'X',
      year,
      dateStr,
      ...weeks
    ]);
  });

  out.foldedWeeks = folded;
  return out;
}

/**
 * Dựng các dòng A..U cho một kênh.
 *
 * @param {object} p
 * @param {'XK'|'OEM'|'GT2'} p.channel
 * @param {string} p.baseMonth  tháng gốc chu kỳ, dạng YYYY-MM-01
 * @param {Array}  p.rows       [{ sku_code, default_channel, requirements_type,
 *                                monthly: { [month]: { [bu]: qty } } }]
 * @param {object} [p.weekly]   chỉ kênh 0200 cần: { [sku]: { [số tuần]: qty đã cộng MB+MN } }
 * @param {Date}   [p.exportedAt] thời điểm xuất — quyết định cột Năm và ngày của OEM/GT2
 * @returns {Array<Array>} mỗi dòng 21 phần tử đúng thứ tự cột A..U. Riêng kênh 0200
 *     còn gắn thêm thuộc tính `foldedWeeks` liệt kê SKU bị dồn tuần 5 vào W4.
 */
export function buildSapRows({ channel, baseMonth, rows, weekly, exportedAt = new Date(), config }) {
  // `config` cho phép truyền bố cục khác với mặc định. Dùng ở
  // tools/verify-sap-export.mjs để dựng lại bố cục 5+4+3 của file thật tháng 7
  // và chứng minh phần tính toán đúng, trong khi app xuất 4+4+4 theo yêu cầu.
  const cfg = config || SAP_CHANNELS[channel];
  if (!cfg) throw new Error(`Chưa có cấu hình SAP cho kênh ${channel}.`);

  const dateStr = uploadDateFor(channel, baseMonth, exportedAt);
  const year = exportedAt.getFullYear();

  if (cfg.weekColumns) {
    return buildPlant0200Rows(cfg, channel, baseMonth, rows, weekly, dateStr, year);
  }

  const months = cfg.monthOffsets.map((off) => addMonths(baseMonth, off));

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
