/**
 * CÀI ĐẶT HỆ THỐNG (14/10/2026) — phần THUẦN của màn "Cài đặt hệ thống" (pages/SystemSettings.jsx): đổi qua lại phần trăm,
 * kiểm hợp lệ, dựng payload setSystemSetting, câu xác nhận, nhóm theo `nhom`, bản ghi đang hiệu lực. Không React, không window.
 *
 * Màn hình vẽ TỔNG QUÁT từ phản hồi getSystemSettings (mỗi cài đặt tự mô tả: nhãn, kiểu, min/max, đơn vị, định dạng) nên thêm
 * cài đặt mới ở máy chủ KHÔNG phải sửa client. Máy chủ là nơi quyết định cuối cùng — kiểm ở đây chỉ để báo sớm, không thay thế.
 *
 * Giá trị LƯU / TRUYỀN luôn ở dạng gốc của máy chủ (vd 0.05); riêng `fmt === 'percent'` thì hiển thị / nhập là phần trăm (5) và
 * đổi lại khi gửi.
 */
import { vnParts } from '../utils/period.js';

const EPS = 1e-9;
const lamTron = (x, n) => Math.round(x * 10 ** n) / 10 ** n;
const p2 = (n) => String(n).padStart(2, '0');

export const GHI_CHU_TOI_DA = 300;
export const NHOM_KHAC = 'Khác';

export const laPhanTram = (s) => s?.fmt === 'percent';

/** Giá trị gốc -> số hiển thị / nhập (phần trăm thì nhân 100, làm tròn để không ra 7.000000000000001). */
export function hienThiSo(s, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return laPhanTram(s) ? lamTron(v * 100, 6) : v;
}

/** Số hiển thị / nhập -> giá trị gốc (phần trăm thì chia 100). */
export function veGiaTriGoc(s, x) {
  return laPhanTram(s) ? lamTron(x / 100, 8) : x;
}

/** Số -> chuỗi kiểu Việt (dấu phẩy thập phân). */
export const soVN = (n) => String(n).replace('.', ',');

/** Đơn vị hiển thị cạnh ô nhập: phần trăm mà máy chủ không nêu đơn vị thì là "%". */
export function donViHienThi(s) {
  return s?.donVi || (laPhanTram(s) ? '%' : '');
}

/** "4 tháng", "5%", "—". */
export function chuoiGiaTri(s, v) {
  const x = hienThiSo(s, v);
  if (x === null) return '—';
  const dv = donViHienThi(s);
  if (!dv) return soVN(x);
  return dv === '%' ? `${soVN(x)}%` : `${soVN(x)} ${dv}`;
}

/** Giá trị người dùng nhập ở ô: nhận "7", "7,5", "7.5". Trả số hoặc null nếu không phải số. */
export function docSoNhap(text) {
  const t = String(text ?? '').trim();
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Kiểm ô giá trị của MỘT cài đặt: bắt buộc, là số, nguyên nếu kiểu 'integer', trong [min, max].
 * @returns {{ ok: boolean, value?: number, error?: string }} value ở dạng GỐC (đã đổi lại từ phần trăm).
 */
export function kiemGiaTri(s, text) {
  if (String(text ?? '').trim() === '') return { ok: false, error: 'Nhập giá trị.' };
  const n = docSoNhap(text);
  if (n === null) return { ok: false, error: 'Giá trị phải là một số.' };
  const goc = veGiaTriGoc(s, n);
  if (s?.kieu === 'integer' && !Number.isInteger(goc)) return { ok: false, error: 'Giá trị phải là số nguyên.' };
  const coMin = typeof s?.min === 'number', coMax = typeof s?.max === 'number';
  if ((coMin && goc < s.min - EPS) || (coMax && goc > s.max + EPS)) {
    const dv = donViHienThi(s);
    const gh = (x) => (dv === '%' ? `${soVN(hienThiSo(s, x))}%` : `${soVN(hienThiSo(s, x))}${dv ? ' ' + dv : ''}`);
    const kq = coMin && coMax ? `từ ${gh(s.min)} đến ${gh(s.max)}` : coMin ? `không nhỏ hơn ${gh(s.min)}` : `không lớn hơn ${gh(s.max)}`;
    return { ok: false, error: `Giá trị phải ${kq}.` };
  }
  return { ok: true, value: goc };
}

// ---------- ngày ----------

const laNgayThat = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

/** Ngày xa nhất được chọn: hôm nay + 1 năm (ngày 29/2 thì lùi về 28/2 — luôn nằm trong giới hạn của máy chủ). */
export function ngayToiDa(today) {
  if (!laNgayThat(today)) return '';
  const [y, m, d] = today.split('-').map(Number);
  const cuoiThang = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${p2(m)}-${p2(Math.min(d, cuoiThang))}`;
}

/**
 * Kiểm "Hiệu lực từ": để trống = hôm nay; không trước hôm nay; tối đa +1 năm. So sánh chuỗi ISO là đủ vì cùng khuôn YYYY-MM-DD.
 * @returns {{ ok: boolean, value?: string, error?: string }}
 */
export function kiemNgay(ngay, today) {
  const n = String(ngay ?? '').trim();
  if (n === '') return { ok: true, value: today };
  if (!laNgayThat(n)) return { ok: false, error: 'Ngày hiệu lực không hợp lệ.' };
  if (laNgayThat(today) && n < today) return { ok: false, error: 'Ngày hiệu lực không được trước hôm nay.' };
  const max = ngayToiDa(today);
  if (max && n > max) return { ok: false, error: 'Ngày hiệu lực không được quá 1 năm kể từ hôm nay.' };
  return { ok: true, value: n };
}

/** 'YYYY-MM-DD' -> 'dd/mm/yyyy'. */
export function ngayVN(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ? String(iso) : '—');
}

/** Mốc thời gian (ISO / ms) -> 'dd/mm/yyyy HH:MM' giờ VN; không đọc được thì trả nguyên văn. */
export function lucVN(ts) {
  if (ts === null || ts === undefined || ts === '') return '—';
  const t = new Date(ts);
  if (Number.isNaN(t.getTime())) return String(ts);
  const { y, m, d } = vnParts(t);
  const v = new Date(t.getTime() + 7 * 3600e3);
  return `${p2(d)}/${p2(m)}/${y} ${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}`;
}

// ---------- form ----------

/**
 * Kiểm cả form của một dòng cài đặt và dựng payload setSystemSetting.
 * `reset` = true: về mặc định (giaTri null), bỏ qua ô giá trị.
 * hieuLucTu chỉ gửi khi KHÁC hôm nay (mặc định của máy chủ là hôm nay); ghiChu chỉ gửi khi có chữ.
 * @returns {{ ok: boolean, errGiaTri?: string, errNgay?: string, errGhiChu?: string, payload?: object, giaTri?: number|null, ngay?: string }}
 */
export function kiemForm(s, { text, ngay, ghiChu, reset = false }, today) {
  const kqNgay = kiemNgay(ngay, today);
  let kqGt = { ok: true, value: null };
  if (!reset) kqGt = kiemGiaTri(s, text);
  const gc = String(ghiChu ?? '').trim();
  const errGhiChu = gc.length > GHI_CHU_TOI_DA ? `Ghi chú tối đa ${GHI_CHU_TOI_DA} ký tự.` : undefined;
  if (!kqGt.ok || !kqNgay.ok || errGhiChu) {
    return { ok: false, errGiaTri: kqGt.ok ? undefined : kqGt.error, errNgay: kqNgay.ok ? undefined : kqNgay.error, errGhiChu };
  }
  const payload = { khoa: s.khoa, giaTri: reset ? null : kqGt.value };
  if (kqNgay.value !== today) payload.hieuLucTu = kqNgay.value;
  if (gc) payload.ghiChu = gc;
  return { ok: true, payload, giaTri: payload.giaTri, ngay: kqNgay.value };
}

/** Giá trị mới trùng giá trị đang dùng và có hiệu lực ngay -> không có gì để lưu. */
export function khongDoi(s, giaTriMoi, ngay, today) {
  if (giaTriMoi === null || giaTriMoi === undefined) return false;
  return Math.abs(giaTriMoi - s.giaTri) < EPS && (!ngay || ngay <= today);
}

/** Câu hỏi xác nhận trước khi lưu. `giaTriMoi` null = về mặc định. */
export function cauXacNhan(s, giaTriMoi, ngay) {
  const moi = giaTriMoi === null || giaTriMoi === undefined ? `${chuoiGiaTri(s, s.macDinh)} (mặc định)` : chuoiGiaTri(s, giaTriMoi);
  return `Đổi ${s.nhan} từ ${chuoiGiaTri(s, s.giaTri)} sang ${moi}, hiệu lực từ ${ngayVN(ngay)}? Chu kỳ đã tạo giữ nguyên.`;
}

// ---------- hiển thị danh sách ----------

/** Nhóm các cài đặt theo `nhom`, giữ thứ tự xuất hiện đầu tiên của nhóm và thứ tự các dòng trong nhóm. */
export function nhomCaiDat(settings) {
  const out = [];
  const idx = new Map();
  for (const s of Array.isArray(settings) ? settings : []) {
    if (!s || typeof s.khoa !== 'string') continue;
    const ten = String(s.nhom || '').trim() || NHOM_KHAC;
    if (!idx.has(ten)) { idx.set(ten, out.length); out.push({ nhom: ten, items: [] }); }
    out[idx.get(ten)].items.push(s);
  }
  return out;
}

const cmpMoi = (a, b) => (String(b.hieuLucTu || '') < String(a.hieuLucTu || '') ? -1 : String(b.hieuLucTu || '') > String(a.hieuLucTu || '') ? 1
  : String(b.lucSua || '') < String(a.lucSua || '') ? -1 : String(b.lucSua || '') > String(a.lucSua || '') ? 1 : 0);

/** Bản ghi lịch sử đang có hiệu lực hôm nay: hiệu lực từ <= hôm nay, mới nhất (hiệu lực rồi tới lúc sửa). Không có -> null. */
export function banGhiHienHanh(s, today) {
  const ds = (Array.isArray(s?.lichSu) ? s.lichSu : []).filter((x) => x && String(x.hieuLucTu || '') <= today);
  ds.sort(cmpMoi);
  return ds[0] || null;
}

/** Lịch sử xếp mới nhất lên đầu (theo lúc sửa, rồi hiệu lực). */
export function lichSuMoiNhat(s) {
  const ds = [...(Array.isArray(s?.lichSu) ? s.lichSu : [])].filter(Boolean);
  ds.sort((a, b) => (String(b.lucSua || '') < String(a.lucSua || '') ? -1 : String(b.lucSua || '') > String(a.lucSua || '') ? 1 : cmpMoi(a, b)));
  return ds;
}

/** Dòng trạng thái: "Đang dùng mặc định (4 tháng)" hoặc "Đã đặt bởi X ngày dd/mm/yyyy". */
export function dongTrangThai(s, today) {
  if (!s.daDat) return `Đang dùng mặc định (${chuoiGiaTri(s, s.macDinh)})`;
  const b = banGhiHienHanh(s, today);
  const ai = b?.nguoiSua ? ` bởi ${b.nguoiSua}` : '';
  const ngay = b?.lucSua ? ` ngày ${lucVN(b.lucSua).slice(0, 10)}` : (s.hieuLucTu ? ` (hiệu lực từ ${ngayVN(s.hieuLucTu)})` : '');
  return `Đã đặt${ai}${ngay}`;
}

/** Phản hồi getSystemSettings hợp lệ? Trả bản đã chuẩn hoá hoặc null. */
export function chuanHoaCaiDat(res) {
  if (!res || typeof res !== 'object' || !Array.isArray(res.settings)) return null;
  return {
    app: String(res.app || ''),
    canEdit: res.canEdit === true,
    today: /^\d{4}-\d{2}-\d{2}$/.test(String(res.today || '')) ? res.today : '',
    tableMissing: res.tableMissing === true,
    settings: res.settings.filter((s) => s && typeof s.khoa === 'string')
  };
}
