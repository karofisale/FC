/**
 * Sinh mốc tháng và mốc tuần từ chu kỳ, thay cho các mảng hardcode
 * ['2026-07-01', ...] và [1, 2, 3, 4] của bản cũ.
 */

/** '2026-7-1' | Date | '2026-07-01T00:00:00Z' -> '2026-07-01' */
export function normalizeMonth(value) {
  if (!value) return '';

  // SỐ SERIAL của Google Sheets (số ngày kể từ 1899-12-30). Backend đã chuẩn
  // hoá base_month trước khi gửi, nên bình thường không gặp ở đây — nhưng nếu
  // một trường ngày khác lọt ra dạng số thì `new Date(46265)` là 46 GIÂY sau
  // mốc 1970, cho ra tháng 1970-01 và mọi khoá sku_tháng trượt sạch. Bảng rỗng
  // mà không có lỗi nào. Đọc đúng số đó ở đây rẻ hơn nhiều so với đi tìm lại.
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    const d0 = new Date(Math.round((value - 25569) * 86400000));
    return `${d0.getUTCFullYear()}-${String(d0.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  const s = typeof value === 'string' ? value : new Date(value).toISOString();
  const m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-01`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Danh sách tháng của chu kỳ: base_month + horizon_months. */
export function monthsOfCycle(cycle) {
  const base = normalizeMonth(cycle?.base_month);
  if (!base) return [];
  const horizon = Math.max(1, Math.min(12, Number(cycle?.horizon_months) || 4));
  const [year, month] = base.split('-').map(Number);

  return Array.from({ length: horizon }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  });
}

export function monthLabel(month) {
  const [year, m] = normalizeMonth(month).split('-');
  return `Tháng ${Number(m)}/${String(year).slice(2)}`;
}

/**
 * Số tuần bán hàng của một tháng, tính theo tuần bắt đầu từ thứ Hai.
 * Tháng có thể trải 4–6 tuần, nên bảng tuần phải co giãn theo tháng thật
 * thay vì cố định 4 cột như bản cũ.
 */
export function weeksOfMonth(month) {
  const base = normalizeMonth(month);
  if (!base) return [1, 2, 3, 4, 5];

  const [year, m] = base.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();

  // getUTCDay: CN = 0 -> quy về thứ Hai = 0
  const offset = (first.getUTCDay() + 6) % 7;
  const count = Math.min(6, Math.ceil((daysInMonth + offset) / 7));

  return Array.from({ length: count }, (_, i) => i + 1);
}

/** Nhãn tuần kèm khoảng ngày, để người nhập biết tuần đó là những ngày nào. */
export function weekLabel(month, weekNumber) {
  const base = normalizeMonth(month);
  if (!base) return `Tuần ${weekNumber}`;

  const [year, m] = base.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;

  const startDay = Math.max(1, (weekNumber - 1) * 7 + 1 - offset);
  const endDay = Math.min(daysInMonth, weekNumber * 7 - offset);

  return `Tuần ${weekNumber} (${startDay}–${endDay}/${m})`;
}

/**
 * Nhãn tuần ISO của tuần thứ N trong tháng — 'W37', 'W38'...
 *
 * Form báo cáo FC đặt tên các khối tuần theo tuần ISO chứ không theo số thứ
 * tự trong tháng, vì nhà máy xếp lịch sản xuất theo lịch ISO. Tuần 1 của
 * tháng thường bắt đầu từ thứ Hai của THÁNG TRƯỚC, nên phải tính từ ngày
 * thật rồi mới lấy tuần ISO, không suy ra được từ số thứ tự.
 *
 * Tính hoàn toàn bằng UTC: dựng ngày bằng giờ địa phương rồi đọc bằng UTC
 * (hay ngược lại) sẽ lệch một ngày ở múi giờ +07, và một ngày lệch quanh
 * thứ Hai là lệch hẳn một số tuần.
 */
export function weekIsoLabel(month, weekNumber) {
  const base = normalizeMonth(month);
  if (!base) return `W${weekNumber}`;

  const [year, m] = base.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;          // thứ Hai = 0
  const d = new Date(Date.UTC(year, m - 1, (weekNumber - 1) * 7 + 1 - offset));

  // Tuần ISO: tuần chứa thứ Năm quyết định năm và số tuần.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return `W${Math.ceil(((t - yearStart) / 86400000 + 1) / 7)}`;
}

/**
 * NGÀY / THÁNG THEO GIỜ VIỆT NAM (UTC+7), không theo múi giờ của máy.
 *
 * Mọi chỗ cần "hôm nay / tháng này" (tháng mặc định, năm kế hoạch, nhãn tuần ISO)
 * đi qua đây. Bản cũ dùng new Date().getMonth() hoặc toISOString().slice(0, 7):
 *  - toISOString() là UTC, nên từ 0h đến 7h sáng ngày mùng 1 (giờ VN) vẫn ra THÁNG TRƯỚC;
 *  - getMonth() là giờ của máy: máy đặt sai múi giờ (hoặc người đi công tác) thì lệch cả ngày.
 * Cố định +7 (Việt Nam không có giờ mùa hè) rồi đọc bằng getUTC* — không phụ thuộc máy.
 *
 * `now` nhận một Date (hoặc số ms) để kiểm thử mô phỏng "00:30 mùng 1 giờ VN".
 */
const VN_OFFSET_MS = 7 * 3600 * 1000;

export function vnParts(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const d = new Date(t + VN_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

const p2 = (n) => String(n).padStart(2, '0');

/** Hôm nay (giờ VN) dạng YYYY-MM-DD. */
export function vnToday(now = new Date()) {
  const { y, m, d } = vnParts(now);
  return `${y}-${p2(m)}-${p2(d)}`;
}

/** Tháng này (giờ VN) dạng YYYY-MM-01. */
export function vnMonth(now = new Date()) {
  const { y, m } = vnParts(now);
  return `${y}-${p2(m)}-01`;
}

/** Năm hiện tại theo giờ VN. */
export function vnYear(now = new Date()) {
  return vnParts(now).y;
}

/** Tháng TRƯỚC (giờ VN) dạng YYYY-MM-01 — mặc định của màn Sản lượng thực hiện. */
export function vnPrevMonth(now = new Date()) {
  const { y, m } = vnParts(now);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-01`;
}

/** Tuần ISO của một ngày (giờ VN), dùng đặt nhãn cho bản cập nhật tuần. */
export function isoWeekLabel(date = new Date()) {
  const { y, m, d: day } = vnParts(date);
  const d = new Date(Date.UTC(y, m - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `W${weekNo}`;
}

/** Hôm nay dạng YYYY-MM-DD theo giờ VN (tên cũ, giữ cho nơi đã gọi). */
export function todayISO(now = new Date()) {
  return vnToday(now);
}

/** Tháng hiện tại dạng YYYY-MM-01, dùng làm mặc định khi mở chu kỳ mới (giờ VN). */
export function currentMonth(now = new Date()) {
  return vnMonth(now);
}
