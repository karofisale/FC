/**
 * BẢNG THUẬT NGỮ — một nơi duy nhất cho nhãn hiển thị cho người dùng.
 *
 * Quy ước (Rà soát 4 app, Đợt 2 mục 6):
 *  - Giữ tiếng Anh cho thuật ngữ nghiệp vụ người dùng vẫn nói hằng ngày: PI, SO, FOB,
 *    ETD/ETA, Forecast, SKU. Các thuật ngữ riêng của kế hoạch năm (Target, Apply, Fix, Final,
 *    Preview) cũng giữ vì chúng là tên thao tác trong quy trình và được giải thích ngay trên màn.
 *  - Mọi động từ và nhãn còn lại dùng tiếng Việt.
 *  - Trạng thái LUÔN hiện qua nhãn ở đây (StatusBadge), không bao giờ hiện mã thô
 *    (draft, pending_approval, 2026-10-01...).
 */

// Mã trạng thái -> nhãn tiếng Việt + tông màu. Tông màu là chuỗi lớp Tailwind đầy đủ
// (viết nguyên văn để Tailwind quét được). Cặp chữ/nền đều đạt >= 4,5:1 (xem tools/check-contrast.mjs).
export const STATUS = {
  draft: { label: 'Bản thảo', tone: 'bg-slate-100 text-slate-700 border-slate-300' },
  drafted: { label: 'Bản thảo', tone: 'bg-slate-100 text-slate-700 border-slate-300' },
  submitted: { label: 'Chờ duyệt', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  pending: { label: 'Chờ duyệt', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  pending_approval: { label: 'Chờ duyệt', tone: 'bg-amber-100 text-amber-900 border-amber-300' },
  approved: { label: 'Đã duyệt', tone: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  rejected: { label: 'Bị từ chối', tone: 'bg-rose-100 text-rose-800 border-rose-300' },
  locked: { label: 'Đã khóa', tone: 'bg-purple-100 text-purple-800 border-purple-300' },
  // 'superseded' = bị thay bởi lượt gửi mới, hoặc tự rút khi người lập sửa số / tạo bản tuần mới
  // lúc đang chờ duyệt (09/10/2026) — trước đây hiện chữ tiếng Anh.
  superseded: { label: 'Đã thay thế', tone: 'bg-slate-100 text-slate-600 border-slate-300' },
  revision_requested: { label: 'Yêu cầu sửa', tone: 'bg-orange-100 text-orange-900 border-orange-300' }
};

const TONE_LA = 'bg-gray-100 text-gray-700 border-gray-300';

/** Nhãn tiếng Việt của một mã trạng thái; mã lạ KHÔNG hiện thô mà rơi về "Chưa xác định". */
export function statusLabel(status) {
  if (status === null || status === undefined || status === '') return '—';
  const s = STATUS[String(status).trim().toLowerCase()];
  return s ? s.label : 'Chưa xác định';
}

export function statusTone(status) {
  const s = STATUS[String(status ?? '').trim().toLowerCase()];
  return s ? s.tone : TONE_LA;
}

/**
 * TÊN MÀN HÌNH — một nơi cho menu, tiêu đề trang và tooltip (Rà soát 4 app, Đợt 3 mục 9).
 *
 * "Bảng 0 / Bảng 1 / Bảng 5" là tên theo file Excel làm tay (B0.SUM, B1.SUM, B5.Quy trình), người mới vào không
 * đoán được màn nào làm gì. Đặt theo VIỆC THẬT của màn, giữ "(Bảng n)" ở phần mô tả để người quen file Excel vẫn
 * đối chiếu được. Giữ tiếng Anh cho "Forecast" (thuật ngữ nghiệp vụ, xem quy ước ở đầu file).
 */
export const MAN_HINH = {
  monthly: {
    ten: 'Forecast 4 tháng',
    tieuDe: 'FORECAST 4 THÁNG',
    mota: 'Lập số lượng forecast từng SKU cho 4 tháng của chu kỳ (Bảng 0 — tương ứng B0.SUM trong file Excel).'
  },
  weekly: {
    ten: 'Chia tuần & miền',
    tieuDe: 'CHIA FORECAST THEO TUẦN & MIỀN',
    mota: 'Chia số của tháng đầu chu kỳ ra từng tuần × từng miền (Bảng 1 — tương ứng B1.SUM trong file Excel); tổng tuần/miền phải khớp số tháng.'
  },
  guide: {
    ten: 'Lịch & quy trình lập FC',
    tieuDe: 'LỊCH & QUY TRÌNH LẬP SALES FORECAST',
    mota: 'Các bước, ngày chốt và bộ phận phụ trách trong quy trình lập — thẩm định — chốt Sales Forecast (Bảng 5 / B5 trong file Excel).'
  }
};

// Loại bản kế hoạch năm.
export const NHAN_LOAI_KE_HOACH = { base: 'Bản gốc', adjust: 'Điều chỉnh', final: 'Final' };

// Vai trò người dùng.
export const ROLE_LABELS = {
  central_admin: 'Quản trị hệ thống',
  bu_editor: 'Lập kế hoạch',
  bu_approver: 'Thẩm định / Phê duyệt',
  viewer: 'Chỉ xem'
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Vai trò khác';
}

const p2 = (n) => String(n).padStart(2, '0');
const VN_OFFSET_MS = 7 * 3600 * 1000;

function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // 'YYYY-MM-DD' trần là NGÀY của lịch, không phải một thời điểm: đọc như UTC nửa đêm rồi cộng +7
  // vẫn ra đúng ngày đó (07:00 giờ VN), không lệch.
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** '2026-10-01' | Date | ISO -> '01/10/2026' (giờ VN). Không đọc được thì trả '—', không trả chuỗi thô. */
export function ngayVN(value) {
  const d = toDate(value);
  if (!d) return '—';
  const v = new Date(d.getTime() + VN_OFFSET_MS);
  return `${p2(v.getUTCDate())}/${p2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
}

/** ISO | Date -> '14:30 01/10/2026' (giờ VN). */
export function ngayGioVN(value) {
  const d = toDate(value);
  if (!d) return '—';
  const v = new Date(d.getTime() + VN_OFFSET_MS);
  return `${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())} ${p2(v.getUTCDate())}/${p2(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
}
