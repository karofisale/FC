/**
 * productPaste.js — đọc dữ liệu người dùng dán từ Excel vào ô nhập hàng loạt.
 *
 * Hai việc, tách riêng để test được từng cái:
 *   parseGiaNhap()  — chuỗi tiền tệ  -> số
 *   parseDanBang()  — khối TSV       -> mảng dòng đã gắn tên cột
 *
 * VÌ SAO CẨN THẬN Ở ĐÂY: avg_price nuôi thẳng total_revenue của dự báo, và
 * đường ống này đã có một lần hỏng im lặng — Sheets API trả "3.156.787",
 * Number() ra NaN, `|| 0` biến thành 0, doanh thu OEM tụt từ 8,9 tỷ xuống 0,3
 * tỷ mà không có gì báo. Nên ở đây KHÔNG có `|| 0`: đọc không ra thì trả lỗi
 * cho người dán nhìn thấy, trước khi ghi.
 */

/**
 * Khoang trang (ke ca non-breaking space — Excel chen rat nhieu) va ky hieu
 * tien te o hai dau. Bo khoang trang TRUOC roi moi bo tien te, vi "1.234 đ"
 * chi con ky hieu o cuoi sau khi khoang trang da bien mat.
 */
const KHOANG_TRANG = /[\s ]/g;
const TIEN_TE = /^(?:VN[DĐ]|₫)|(?:VN[DĐ]|₫|Đ|đ|D|d)$/gi;

/**
 * Đọc một ô giá.
 *
 * @returns {{so: number|null, loi: string|null}}
 *
 * Chỗ khó là dấu phân cách. Excel tiếng Việt cho "1.234.567", tiếng Anh cho
 * "1,234,567" — cùng một con số, hai cách viết, và người dùng dán cả hai.
 * Quy tắc:
 *   - Có CẢ hai dấu  -> dấu XUẤT HIỆN SAU là dấu thập phân, dấu kia là nghìn.
 *   - Chỉ một loại dấu, xuất hiện nhiều lần -> phân cách nghìn.
 *   - Chỉ một dấu, đúng 3 chữ số phía sau -> phân cách NGHÌN. Nhập nhằng thật
 *     ("1.234" có thể là 1,234 kiểu Anh) nhưng giá bán lẻ 1,234 VNĐ không tồn
 *     tại, còn 1.234 VNĐ thì có; chọn nghĩa dùng được.
 *   - Chỉ một dấu, 1-2 chữ số phía sau -> dấu thập phân.
 */
export function parseGiaNhap(raw) {
  if (raw === null || raw === undefined) return { so: 0, loi: null };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return { so: null, loi: 'Giá không hợp lệ: ' + raw };
    return { so: raw, loi: null };
  }

  let s = String(raw).replace(KHOANG_TRANG, '').replace(TIEN_TE, '').trim();
  if (s === '') return { so: 0, loi: null };

  const am = s.startsWith('-');
  if (am) return { so: null, loi: 'Giá âm: ' + raw };

  const viTriCham = s.lastIndexOf('.');
  const viTriPhay = s.lastIndexOf(',');

  let thapPhan = '';
  if (viTriCham >= 0 && viTriPhay >= 0) {
    thapPhan = viTriCham > viTriPhay ? '.' : ',';
  } else if (viTriCham >= 0 || viTriPhay >= 0) {
    const dau = viTriCham >= 0 ? '.' : ',';
    const soLan = s.split(dau).length - 1;
    const duoi = s.slice(s.lastIndexOf(dau) + 1).length;
    thapPhan = (soLan === 1 && duoi > 0 && duoi < 3) ? dau : '';
  }

  if (thapPhan) {
    const nghin = thapPhan === '.' ? ',' : '.';
    s = s.split(nghin).join('').replace(thapPhan, '.');
  } else {
    s = s.split('.').join('').split(',').join('');
  }

  if (!/^\d+(\.\d+)?$/.test(s)) {
    return { so: null, loi: 'Không đọc được giá: ' + JSON.stringify(String(raw)) };
  }
  const so = Number(s);
  if (!Number.isFinite(so)) return { so: null, loi: 'Không đọc được giá: ' + JSON.stringify(String(raw)) };
  return { so, loi: null };
}

/**
 * Thứ tự cột mặc định khi khối dán KHÔNG có dòng tiêu đề. Hiện đúng thứ tự
 * này trên giao diện để người dùng sắp cột trong Excel cho khớp.
 */
export const COT_MAC_DINH = [
  'skuCode', 'name', 'shortName', 'productGroupCode', 'technology', 'defaultChannel', 'avgPrice'
];

/**
 * Tên cột người dùng có thể gõ ở dòng tiêu đề. Nhận cả tiếng Việt lẫn tên cột
 * kỹ thuật, vì người ta hay xuất thẳng từ tab Products của bảng tính ra.
 */
const TU_DONG_NGHIA = {
  skuCode: ['ma sku', 'ma', 'sku', 'sku_code', 'skucode', 'ma hang', 'item code', 'code'],
  name: ['ten san pham', 'ten', 'name', 'product name', 'mo ta'],
  shortName: ['ten goi tat', 'goi tat', 'short_name', 'shortname', 'model', 'ten tat'],
  productGroupCode: ['nhom san pham', 'nhom', 'product_group_code', 'productgroupcode', 'group', 'ma nhom'],
  technology: ['cong nghe', 'technology', 'tech'],
  defaultChannel: ['kenh mac dinh', 'kenh', 'default_channel', 'defaultchannel', 'channel', 'don vi', 'bu'],
  avgPrice: ['gia', 'gia ban', 'gia ban binh quan', 'avg_price', 'avgprice', 'gia ghi nhan dt', 'don gia', 'price']
};

/** Bỏ dấu tiếng Việt + hạ chữ thường, để so tiêu đề cột không phụ thuộc cách gõ. */
function khongDau(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function nhanDienTieuDe(cells) {
  const map = cells.map((c) => {
    const k = khongDau(c);
    if (!k) return null;
    for (const truong of Object.keys(TU_DONG_NGHIA)) {
      if (TU_DONG_NGHIA[truong].indexOf(k) >= 0) return truong;
    }
    return null;
  });
  // Coi là dòng tiêu đề khi nhận ra được cột mã VÀ ít nhất một cột nữa —
  // một dòng dữ liệu thật gần như không thể khớp được hai tên cột.
  return (map.indexOf('skuCode') >= 0 && map.filter(Boolean).length >= 2) ? map : null;
}

/**
 * Đọc khối văn bản dán từ Excel.
 *
 * @param {string} text  Nội dung dán (TSV — Excel dùng Tab giữa các ô).
 * @returns {{rows: Array, coTieuDe: boolean, cotDaDung: Array}}
 *
 * Mỗi phần tử rows là { skuCode, name, ..., avgPrice: number|null, loi: string[] }.
 * Dòng có `loi` không rỗng thì giao diện chặn lại, không gửi lên server.
 */
export function parseDanBang(text, { cot = COT_MAC_DINH } = {}) {
  const dong = String(text || '')
    .split(/\r\n|\r|\n/)
    .filter((d) => d.trim() !== '');
  if (!dong.length) return { rows: [], coTieuDe: false, cotDaDung: cot };

  // Tab là chuẩn khi dán từ Excel. Chấp nhận cả dấu ; và nhiều khoảng trắng
  // cho trường hợp người dùng dán từ nguồn khác — nhưng KHÔNG tách theo dấu
  // phẩy: giá "1,234,567" sẽ vỡ thành ba ô.
  const tach = (d) => (d.indexOf('\t') >= 0 ? d.split('\t') : d.split(/\s*;\s*|\s{2,}/)).map((c) => c.trim());

  const dauTien = tach(dong[0]);
  const tuTieuDe = nhanDienTieuDe(dauTien);
  const cotDaDung = tuTieuDe || cot;
  const batDau = tuTieuDe ? 1 : 0;

  const rows = [];
  for (let i = batDau; i < dong.length; i++) {
    const cells = tach(dong[i]);
    const r = { loi: [], _dong: i + 1 };
    cotDaDung.forEach((truong, j) => {
      if (!truong) return;
      const v = cells[j] === undefined ? '' : cells[j];
      if (truong === 'avgPrice') {
        // O TRONG (hoac thieu han cot) nghia la "khong dong toi gia", KHONG
        // phai "gia bang 0". Khac biet nay quan trong o che do ghi de: tra ve
        // 0 la moi dong dan thieu cot gia se xoa sach gia dang co.
        if (String(v).trim() === '') {
          r.avgPrice = null;
        } else {
          const { so, loi } = parseGiaNhap(v);
          r.avgPrice = so;
          if (loi) r.loi.push(loi);
        }
      } else {
        r[truong] = String(v).trim();
      }
    });

    r.skuCode = String(r.skuCode || '').trim();
    if (!r.skuCode) continue;             // dòng trắng giữa bảng: bỏ, không báo lỗi
    if (!r.name) r.loi.push('Thiếu tên sản phẩm');
    if (r.avgPrice === undefined) r.avgPrice = null;

    rows.push(r);
  }

  return { rows, coTieuDe: !!tuTieuDe, cotDaDung };
}
