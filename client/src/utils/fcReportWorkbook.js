/**
 * Form báo cáo FC — một file, mười tab, khớp bố cục cột của file
 * "XK_OEM_GT2_Online_Sales FC" mà Tác nghiệp Kinh doanh vẫn làm tay.
 *
 * Mười tab: B0.SUM + bốn tab kênh theo tháng, B1.SUM + bốn tab kênh theo
 * tuần. Thay cho hai file rời B0.SUM và B1.SUM trước đây — nhà máy nhận
 * MỘT file, và hai tab tổng hợp không còn khả năng lấy số của hai bản chốt
 * khác nhau vì cả mười tab dựng từ đúng một lượt đọc.
 *
 * ===== VÌ SAO THỨ TỰ CỘT PHẢI CỐ ĐỊNH =====
 * File này được đọc bằng công thức trỏ thẳng vào ô (các bảng kế hoạch sản
 * xuất bên nhà máy liên kết sang). Chèn hay bỏ một cột là mọi công thức
 * trỏ sai mà không có lỗi nào hiện ra. Nên:
 *   - Khối cột giữ nguyên vị trí kể cả khi kênh đó không có số: MT, MLT,
 *     Retail đang tắt vẫn có cột, giá trị 0.
 *   - Kênh mới phải được thêm vào REPORT_CHANNELS đúng chỗ, không nối đuôi.
 *
 * ===== KÊNH BÁO CÁO KHÁC KÊNH SAP =====
 * 3T và NSKX lên SAP ở nhà máy 0200 chung với GT2, nhưng trong báo cáo
 * chúng nhập vào kênh Online. Bản đồ lấy từ cột report_channel của
 * BusinessUnits (backend trả về trong `reportChannels`), không suy từ
 * sap_channel.
 */
import * as XLSX from 'xlsx';
import { monthLabel, weekIsoLabel, weeksOfMonth } from './period.js';

/**
 * Bảy cột kênh của B0.SUM và của mỗi khối tuần trong B1.SUM, ĐÚNG THỨ TỰ
 * trong file gốc. MT / MLT / Retail hiện đang tắt nhưng vẫn giữ cột.
 */
export const REPORT_CHANNELS = ['MT', 'XK', 'MLT', 'GT2', 'OEM', 'Retail', 'Online'];

/** Bốn kênh có tab riêng, kèm số hiệu bảng và tên tab đúng như file gốc. */
export const CHANNEL_TABS = [
  { channel: 'XK',     so: '3', b0: 'B0.3.XK',     b1: 'B1.3.XK',     ten: 'KÊNH XUẤT KHẨU' },
  { channel: 'OEM',    so: '4', b0: 'B0.4.OEM',    b1: 'B1.4.OEM',    ten: 'KÊNH OEM' },
  { channel: 'GT2',    so: '5', b0: 'B0.5.GT2',    b1: 'B1.5.GT2',    ten: 'KÊNH GT2' },
  { channel: 'Online', so: '8', b0: 'B0.8.Online', b1: 'B1.8.Online', ten: 'KÊNH ONLINE' }
];

export const TAB_B0_SUM = 'B0.SUM (tuần 0)';
export const TAB_B1_SUM = 'B1.SUM (tuần 4)';

/** Tám cột đầu (A..H) giống nhau ở mọi tab. */
const PROD_COLS = 8;
/** Sáu cột "Số FC Tuần 0..Tuần 5" của các tab B1 (I..N). */
const SO_VONG = 6;

export function channelOfBU(bu, reportChannels) {
  return String((reportChannels || {})[bu] || '').trim() || 'GT2';
}

/** Các đơn vị kinh doanh thuộc một kênh báo cáo, giữ thứ tự backend trả về. */
export function busOfChannel(channel, businessUnits, reportChannels) {
  return (businessUnits || []).filter((bu) => channelOfBU(bu, reportChannels) === channel);
}

// ---------------------------------------------------------------- cộng số

const congTheoBU = (byBu, bus) =>
  bus.reduce((s, bu) => s + (Number((byBu || {})[bu]) || 0), 0);

const soThang = (row, month, bus) => congTheoBU(row.monthly?.[month], bus);
const soTuan = (row, week, region, bus) => congTheoBU(row.weekly?.[week]?.[region], bus);
const soVong = (row, uw, bus) => congTheoBU(row.byUpdateWeek?.[uw], bus);

/** Tổng bốn tháng của một dòng, trong phạm vi các đơn vị đã cho. */
const tongThang = (row, months, bus) =>
  months.reduce((s, m) => s + soThang(row, m, bus), 0);

/**
 * Đơn vị nào ĐỘC QUYỀN mã này — cột "Đ.quyền" của file gốc.
 *
 * Đúng một đơn vị có số thì ghi tên đơn vị đó; từ hai trở lên để trống, vì
 * khi ấy mã không còn là hàng riêng của ai.
 */
function donViDocQuyen(row, months, bus) {
  const co = bus.filter((bu) => months.some((m) => Number(row.monthly?.[m]?.[bu]) || 0)
    || Object.keys(row.weekly || {}).some((w) =>
      Object.keys(row.weekly[w]).some((r) => Number(row.weekly[w][r][bu]) || 0)));
  return co.length === 1 ? co[0] : '';
}

/**
 * Dòng có số ở BẤT KỲ đâu trong phạm vi này không.
 *
 * Xét cả ba nguồn — bốn tháng, chia tuần, và các lần cập nhật trước. Chỉ
 * xét bốn tháng thì một mã bị rút về 0 ở bản chốt sẽ biến mất khỏi file,
 * đúng lúc người đọc cần thấy nó tụt từ đâu về 0.
 */
function coSo(row, months, bus) {
  if (tongThang(row, months, bus)) return true;
  if (Object.keys(row.weekly || {}).some((w) =>
    Object.keys(row.weekly[w]).some((r) => congTheoBU(row.weekly[w][r], bus)))) return true;
  return Object.keys(row.byUpdateWeek || {}).some((uw) => congTheoBU(row.byUpdateWeek[uw], bus));
}

const sapXep = (rows) =>
  rows.slice().sort((a, b) => String(a.sku_code).localeCompare(String(b.sku_code)));

/** Ghi vào một ô của mảng thưa, tự nới dài mảng. */
function dat(arr, i, v) {
  while (arr.length < i) arr.push(null);
  arr[i] = v;
  return arr;
}

/** Gom các dòng theo mã nhóm hàng. */
function gomNhom(rows) {
  const out = {};
  rows.forEach((r) => {
    const g = r.product_group_code || 'KHAC';
    if (!out[g]) out[g] = [];
    out[g].push(r);
  });
  return out;
}

/** Tám ô đầu của một dòng dữ liệu. */
const oSanPham = (row, kenh, docQuyen) => [
  row.sku_code, row.name, row.short_name,
  row.product_group_name || row.product_group_code,
  row.technology, kenh, docQuyen, row.avg_price
];

/** Sản lượng một miền của THÁNG GỐC = cộng mọi tuần của bảng chia tuần. */
const tongMienThangGoc = (row, regionCode, weeks, bus) =>
  weeks.reduce((s, w) => s + soTuan(row, w, regionCode, bus), 0);

// ---------------------------------------------------------------- tab B0 kênh

/**
 * Tab B0.<n>.<Kênh> — sản lượng bốn tháng, kèm một khối cho mỗi miền.
 *
 * Bố cục cột (khớp file gốc):
 *   A..H  mã, tên, model, nhóm, công nghệ, kênh, độc quyền, giá
 *   I     Tổng FC          J..M  bốn tháng
 *   N     (trống)
 *   O     Tổng FC miền 1   P..S  bốn tháng
 *   T     (trống)
 *   U     Tổng FC miền 2   V..Y  bốn tháng
 *
 * KHỐI MIỀN CHỈ CÓ THÁNG GỐC. App chỉ tách miền ở bảng chia tuần, mà bảng
 * đó chỉ tồn tại cho tháng gốc của chu kỳ — ba tháng sau không có căn cứ
 * nào để chia. Ô của ba tháng đó để TRỐNG chứ không ghi 0: 0 là khẳng định
 * "miền này không bán gì", còn trống là "app không biết", và hai điều đó
 * dẫn tới hai quyết định sản xuất khác nhau.
 */
export function buildB0ChannelSheet(data, tab) {
  const { months, productGroups, reportChannels, businessUnits, updatedAt, weeks } = data;
  const bus = busOfChannel(tab.channel, businessUnits, reportChannels);
  const regions = data.regions || [];
  const rows = sapXep((data.rows || []).filter((r) => coSo(r, months, bus)));

  const iTong = PROD_COLS;                                        // I
  const iMien = (k) => PROD_COLS + (k + 1) * (months.length + 2); // O, U, ...

  const tenKenh = tab.channel === 'Online' && bus.length
    ? `${tab.ten} (${bus.join('+')})`
    : tab.ten;

  // --- dòng 1: tiêu đề + nhãn các khối ------------------------------------
  const r1 = [];
  dat(r1, 0, `BẢNG 0.${tab.so}: `);
  dat(r1, 1, `SALES FORECAST - ${tenKenh}`);
  dat(r1, iTong, 'Tổng cộng');
  regions.forEach((rg, k) => dat(r1, iMien(k), rg.name || rg.code));

  // --- dòng 2: nhãn tháng của khối tổng ------------------------------------
  const r2 = [];
  dat(r2, iTong, 'TỔNG');
  months.forEach((m, i) => dat(r2, iTong + 1 + i, monthLabel(m)));
  // Nói ngay trên sheet vì sao hai khối miền chỉ có một tháng.
  regions.forEach((rg, k) =>
    dat(r2, iMien(k), 'TỔNG (chỉ tháng gốc — app chỉ tách miền ở bảng chia tuần)'));

  // --- các dòng nhóm hàng --------------------------------------------------
  const theoNhom = gomNhom(rows);
  const dongNhom = (productGroups || []).map((g, i) => {
    const line = [];
    dat(line, 6, `NHÓM ${i + 1}`);
    dat(line, 7, g.name);
    const cua = theoNhom[g.code] || [];
    dat(line, iTong, cua.reduce((s, r) => s + tongThang(r, months, bus), 0));
    months.forEach((m, k) =>
      dat(line, iTong + 1 + k, cua.reduce((s, r) => s + soThang(r, m, bus), 0)));
    return line;
  });

  // --- dòng doanh thu ------------------------------------------------------
  const rDt = [];
  dat(rDt, 0, 'Ngày update');
  dat(rDt, 1, updatedAt || '');
  dat(rDt, 7, 'Doanh thu theo FC');
  months.forEach((m, k) => dat(rDt, iTong + 1 + k,
    rows.reduce((s, r) => s + soThang(r, m, bus) * (Number(r.avg_price) || 0), 0)));

  // --- dòng tổng cộng ------------------------------------------------------
  const rTong = [];
  dat(rTong, iTong, rows.reduce((s, r) => s + tongThang(r, months, bus), 0));
  months.forEach((m, k) => dat(rTong, iTong + 1 + k,
    rows.reduce((s, r) => s + soThang(r, m, bus), 0)));
  regions.forEach((rg, k) => {
    const tong = rows.reduce((s, r) => s + tongMienThangGoc(r, rg.code, weeks, bus), 0);
    dat(rTong, iMien(k), tong);
    dat(rTong, iMien(k) + 1, tong);
  });

  // --- dòng tiêu đề cột ----------------------------------------------------
  const rHdr = ['Mã sản phẩm', 'Tên sản phẩm', 'Model\n(tên gọi tắt)', 'Nhóm',
    'Công nghệ chính', 'Channel', 'Độc quyền', 'Giá ghi nhận doanh thu'];
  dat(rHdr, iTong, 'Tổng FC');
  months.forEach((m, k) => dat(rHdr, iTong + 1 + k, monthLabel(m)));
  regions.forEach((rg, k) => {
    dat(rHdr, iMien(k), 'Tổng FC');
    months.forEach((m, i) => dat(rHdr, iMien(k) + 1 + i, monthLabel(m)));
  });

  const aoa = [r1, r2, ...dongNhom, rDt, rTong, rHdr];

  rows.forEach((r) => {
    const line = oSanPham(r, tab.channel, donViDocQuyen(r, months, bus));
    dat(line, iTong, tongThang(r, months, bus));
    months.forEach((m, k) => dat(line, iTong + 1 + k, soThang(r, m, bus)));
    regions.forEach((rg, k) => {
      const q = tongMienThangGoc(r, rg.code, weeks, bus);
      dat(line, iMien(k), q);
      dat(line, iMien(k) + 1, q);
      // Ba tháng sau để TRỐNG, không phải 0 — xem chú thích đầu hàm.
      for (let i = 1; i < months.length; i++) dat(line, iMien(k) + 1 + i, null);
    });
    aoa.push(line);
  });

  return aoa;
}

// ---------------------------------------------------------------- tab B0.SUM

/**
 * Tab B0.SUM — một dòng mỗi mã, bốn khối tháng, mỗi khối là
 * [Tổng, MT, XK, MLT, GT2, OEM, Retail, Online] đúng thứ tự file gốc.
 *
 * Cột "Tổng" của mỗi khối cộng đúng BẢY cột kênh bên cạnh, không cộng thẳng
 * mọi đơn vị. Nếu có đơn vị nào khai report_channel lạ thì nó không có cột
 * nào để hiện — cộng nó vào Tổng sẽ cho ra một file mà Tổng ≠ tổng các cột
 * và không ai lần ra phần chênh nằm ở đâu. Thay vào đó buildFcReport trả về
 * danh sách đơn vị đó để màn hình báo ra.
 */
export function buildB0SumSheet(data) {
  const { months, productGroups, reportChannels, businessUnits, updatedAt } = data;
  const khoi = 1 + REPORT_CHANNELS.length;
  const iThang = (k) => PROD_COLS + k * khoi;
  const iLuuY = PROD_COLS + months.length * khoi;

  const buTheoKenh = {};
  REPORT_CHANNELS.forEach((c) => { buTheoKenh[c] = busOfChannel(c, businessUnits, reportChannels); });
  const moiBU = REPORT_CHANNELS.reduce((a, c) => a.concat(buTheoKenh[c]), []);

  const rows = sapXep((data.rows || []).filter((r) => coSo(r, months, moiBU)));

  const r1 = [];
  dat(r1, 0, 'BẢNG 1: ');
  dat(r1, 1, `SALES FC - NGÀNH 1 (${monthLabel(months[0]).toUpperCase()})`);
  months.forEach((m, k) => dat(r1, iThang(k), `${monthLabel(m)} - Sales FC`));

  const r2 = [];
  months.forEach((m, k) => {
    dat(r2, iThang(k), 'TỔNG');
    REPORT_CHANNELS.forEach((c, i) => dat(r2, iThang(k) + 1 + i, c));
  });

  /** Điền bốn khối tháng; cột Tổng của mỗi khối = tổng bảy cột kênh của nó. */
  const oKhoi = (line, tinh) => {
    months.forEach((m, k) => {
      let tong = 0;
      REPORT_CHANNELS.forEach((c, i) => {
        const q = tinh(m, buTheoKenh[c]);
        tong += q;
        dat(line, iThang(k) + 1 + i, q);
      });
      dat(line, iThang(k), tong);
    });
    return line;
  };

  const theoNhom = gomNhom(rows);
  const dongNhom = (productGroups || []).map((g, i) => {
    const line = [];
    dat(line, 6, `NHÓM ${i + 1}`);
    dat(line, 7, g.name);
    const cua = theoNhom[g.code] || [];
    return oKhoi(line, (m, bus) => cua.reduce((s, r) => s + soThang(r, m, bus), 0));
  });
  // Hai dòng nhóm đầu mang thêm ngày cập nhật và nhãn chu kỳ, đúng như file gốc.
  if (dongNhom.length) {
    dat(dongNhom[0], 0, 'Ngày update:');
    dat(dongNhom[0], 1, updatedAt || '');
  }
  if (dongNhom.length > 1) dat(dongNhom[1], 0, `(Tuần 0 - ${monthLabel(months[0])})`);

  const rDt = oKhoi([], (m, bus) =>
    rows.reduce((s, r) => s + soThang(r, m, bus) * (Number(r.avg_price) || 0), 0));

  const rHdr = ['Mã sp', 'Tên sp', 'Tên gọi tắt', 'Nhóm', 'Công nghệ ', 'Kênh', 'Đ.quyền', 'Giá bán BQ'];
  months.forEach((m, k) => {
    dat(rHdr, iThang(k), 'Tổng');
    REPORT_CHANNELS.forEach((c, i) => dat(rHdr, iThang(k) + 1 + i, c));
  });
  dat(rHdr, iLuuY, 'LƯU Ý');

  const rTong = oKhoi([], (m, bus) => rows.reduce((s, r) => s + soThang(r, m, bus), 0));

  const aoa = [r1, r2, ...dongNhom, rDt, rHdr, rTong];

  rows.forEach((r) => {
    const line = oSanPham(r, r.default_channel, donViDocQuyen(r, months, moiBU));
    oKhoi(line, (m, bus) => soThang(r, m, bus));
    aoa.push(line);
  });

  return aoa;
}

// ---------------------------------------------------------------- tab B1 kênh

/**
 * Tab B1.<n>.<Kênh> — chia tuần × miền của tháng gốc.
 *
 * Bố cục cột (khớp file gốc):
 *   A..H  như tab B0
 *   I..N  Số FC Tuần 0..Tuần 5 — sản lượng tháng gốc của TỪNG LẦN cập nhật
 *   O     Chênh lệch (lần cập nhật cuối so với Tuần 0)
 *   P     (trống)
 *   Q     Tổng FC <kênh>, rồi mỗi tuần hai cột MB / MN
 *
 * Kênh gồm nhiều đơn vị thì sau khối tổng có thêm một khối cho từng đơn vị
 * (Online: khối NSKX rồi khối 3T, đúng như file gốc). Các khối thêm nằm bên
 * PHẢI khối tổng nên không đẩy lệch các cột cố định phía trước.
 */
export function buildB1ChannelSheet(data, tab) {
  const { months, productGroups, reportChannels, businessUnits, updatedAt, weeks, regions } = data;
  const bus = busOfChannel(tab.channel, businessUnits, reportChannels);
  const rows = sapXep((data.rows || []).filter((r) => coSo(r, months, bus)));

  const iVong = PROD_COLS;                   // I..N
  const iChenh = PROD_COLS + SO_VONG;        // O
  const iKhoi0 = iChenh + 2;                 // Q (P để trống)
  const rong = 1 + weeks.length * regions.length;
  const iKhoi = (k) => iKhoi0 + k * (rong + 1);

  // Khối tổng, rồi một khối cho mỗi đơn vị khi kênh có từ hai đơn vị trở lên.
  const khoi = [{ ten: `Tổng FC ${tab.channel}`, bus }];
  if (bus.length > 1) bus.forEach((bu) => khoi.push({ ten: bu, bus: [bu] }));

  const vongCuoi = (data.updateWeeks || []).length ? Math.max(...data.updateWeeks) : 0;

  const tenKenh = tab.channel === 'Online' && bus.length
    ? `${tab.ten} (${bus.join('+')})`
    : tab.ten;

  const r1 = [`BẢNG 1.${tab.so}: `, `SALES FORECAST TUẦN - ${tenKenh}`];
  const r2 = ['Ngày update:', updatedAt || ''];
  const r3 = ['Tuần', weeks.length ? weekIsoLabel(months[0], weeks[0]) : ''];

  // --- dòng 4: nhãn khối + nhãn tuần ---------------------------------------
  const r4 = [];
  dat(r4, 0, `(Tuần 0 - ${monthLabel(months[0])})`);
  khoi.forEach((kh, k) => {
    dat(r4, iKhoi(k), 'Tổng');
    weeks.forEach((w, i) =>
      dat(r4, iKhoi(k) + 1 + i * regions.length, weekIsoLabel(months[0], w)));
  });

  // --- dòng 5: nhãn cột vòng cập nhật + nhãn miền --------------------------
  const nhanVong = (v) => `Số FC\nTuần ${v} - ${monthLabel(months[0])}`;
  const r5 = [];
  for (let v = 0; v < SO_VONG; v++) dat(r5, iVong + v, nhanVong(v));
  dat(r5, iChenh, `Chênh lệch\n(FC tuần ${vongCuoi} vs.\nFC tuần 0)`);
  khoi.forEach((kh, k) => weeks.forEach((w, i) => regions.forEach((rg, j) =>
    dat(r5, iKhoi(k) + 1 + i * regions.length + j, rg.code))));

  /** Điền mọi khối tuần của dòng. */
  const oTuan = (line, danh) => {
    khoi.forEach((kh, k) => {
      let tong = 0;
      weeks.forEach((w, i) => regions.forEach((rg, j) => {
        const q = danh(w, rg.code, kh.bus);
        tong += q;
        dat(line, iKhoi(k) + 1 + i * regions.length + j, q);
      }));
      dat(line, iKhoi(k), tong);
    });
    return line;
  };

  const theoNhom = gomNhom(rows);
  const dongNhom = (productGroups || []).map((g, i) => {
    const line = [];
    dat(line, 6, `NHÓM ${i + 1}`);
    dat(line, 7, g.name);
    const cua = theoNhom[g.code] || [];
    for (let v = 0; v < SO_VONG; v++)
      dat(line, iVong + v, cua.reduce((s, r) => s + soVong(r, v, bus), 0));
    dat(line, iChenh, cua.reduce((s, r) => s + soVong(r, vongCuoi, bus) - soVong(r, 0, bus), 0));
    return oTuan(line, (w, rg, b) => cua.reduce((s, r) => s + soTuan(r, w, rg, b), 0));
  });

  const rTong = [];
  for (let v = 0; v < SO_VONG; v++)
    dat(rTong, iVong + v, rows.reduce((s, r) => s + soVong(r, v, bus), 0));
  dat(rTong, iChenh, rows.reduce((s, r) => s + soVong(r, vongCuoi, bus) - soVong(r, 0, bus), 0));
  oTuan(rTong, (w, rg, b) => rows.reduce((s, r) => s + soTuan(r, w, rg, b), 0));

  const rHdr = ['Mã sản phẩm', 'Tên sản phẩm', 'Model\n(tên gọi tắt)', 'Nhóm SP',
    'Công nghệ chính', 'Channel', 'Độc quyền', 'Giá bán bình quân'];
  for (let v = 0; v < SO_VONG; v++) dat(rHdr, iVong + v, nhanVong(v));
  dat(rHdr, iChenh, `Chênh lệch\n(FC tuần ${vongCuoi} vs. FC tuần 0)`);
  khoi.forEach((kh, k) => dat(rHdr, iKhoi(k), kh.ten));

  const aoa = [r1, r2, r3, r4, r5, ...dongNhom, rTong, rHdr];

  rows.forEach((r) => {
    const line = oSanPham(r, tab.channel, donViDocQuyen(r, months, bus));
    for (let v = 0; v < SO_VONG; v++) dat(line, iVong + v, soVong(r, v, bus));
    dat(line, iChenh, soVong(r, vongCuoi, bus) - soVong(r, 0, bus));
    oTuan(line, (w, rg, b) => soTuan(r, w, rg, b));
    aoa.push(line);
  });

  return aoa;
}

// ---------------------------------------------------------------- tab B1.SUM

/**
 * Tab B1.SUM — chia tuần của cả công ty.
 *
 * Bố cục cột (khớp file gốc):
 *   A..H  như trên
 *   I..N  Số FC Tuần 0..Tuần 5
 *   O..R  bốn cột chênh lệch giữa các lần cập nhật
 *   S..   mỗi tuần một khối: [Tổng, MB, MN, rồi 7 kênh × (MB, MN)] = 17 cột
 */
export function buildB1SumSheet(data) {
  const { months, productGroups, reportChannels, businessUnits, updatedAt, weeks, regions } = data;
  const nMien = regions.length;
  const iVong = PROD_COLS;
  const iChenh = PROD_COLS + SO_VONG;                      // O..R
  const CHENH = [[2, 1], [4, 1], [4, 2], [4, 3]];          // (FC tuần a vs. FC tuần b)
  const iKhoi0 = iChenh + CHENH.length;                    // S
  const rong = 1 + nMien + REPORT_CHANNELS.length * nMien;
  const iKhoi = (k) => iKhoi0 + k * (rong + 1);
  /** Ô của kênh thứ i, miền thứ j trong khối tuần thứ k. */
  const iKenh = (k, i, j) => iKhoi(k) + 1 + nMien + i * nMien + j;

  const buTheoKenh = {};
  REPORT_CHANNELS.forEach((c) => { buTheoKenh[c] = busOfChannel(c, businessUnits, reportChannels); });
  const moiBU = REPORT_CHANNELS.reduce((a, c) => a.concat(buTheoKenh[c]), []);
  const rows = sapXep((data.rows || []).filter((r) => coSo(r, months, moiBU)));

  const nhanVong = (v) => `Số FC\nTuần ${v} - ${monthLabel(months[0])}`;

  const r1 = [];
  dat(r1, 0, 'BẢNG 1');
  dat(r1, 1, 'TỔNG HỢP SẢN LƯỢNG SALES FORECAST');
  dat(r1, PROD_COLS, monthLabel(months[0]));
  CHENH.forEach((c, i) => dat(r1, iChenh + i, `Chênh lệch\n(FC tuần ${c[0]} vs.\nFC tuần ${c[1]})`));
  weeks.forEach((w, k) => dat(r1, iKhoi(k), weekIsoLabel(months[0], w)));

  const r2 = [];
  dat(r2, 0, 'Ngày update:');
  dat(r2, 1, updatedAt || '');
  for (let v = 0; v < SO_VONG; v++) dat(r2, iVong + v, 'Số FC');
  weeks.forEach((w, k) => {
    dat(r2, iKhoi(k), 'Tổng FC');
    REPORT_CHANNELS.forEach((c, i) => dat(r2, iKenh(k, i, 0), c));
  });

  const r3 = [];
  dat(r3, 0, 'Tuần');
  dat(r3, 1, weeks.length ? weekIsoLabel(months[0], weeks[0]) : '');
  for (let v = 0; v < SO_VONG; v++) dat(r3, iVong + v, `(Tuần ${v})`);
  weeks.forEach((w, k) => {
    dat(r3, iKhoi(k), 'Tổng');
    regions.forEach((rg, j) => dat(r3, iKhoi(k) + 1 + j, rg.code));
    REPORT_CHANNELS.forEach((c, i) => regions.forEach((rg, j) => dat(r3, iKenh(k, i, j), rg.code)));
  });

  const oTuan = (line, danh) => {
    weeks.forEach((w, k) => {
      let tong = 0;
      regions.forEach((rg, j) => {
        const q = danh(w, rg.code, moiBU);
        tong += q;
        dat(line, iKhoi(k) + 1 + j, q);
      });
      dat(line, iKhoi(k), tong);
      REPORT_CHANNELS.forEach((c, i) => regions.forEach((rg, j) =>
        dat(line, iKenh(k, i, j), danh(w, rg.code, buTheoKenh[c]))));
    });
    return line;
  };

  const theoNhom = gomNhom(rows);
  const dongNhom = (productGroups || []).map((g, i) => {
    const line = [];
    dat(line, 6, `NHÓM ${i + 1}`);
    dat(line, 7, g.name);
    const cua = theoNhom[g.code] || [];
    for (let v = 0; v < SO_VONG; v++)
      dat(line, iVong + v, cua.reduce((s, r) => s + soVong(r, v, moiBU), 0));
    CHENH.forEach((c, k) => dat(line, iChenh + k,
      cua.reduce((s, r) => s + soVong(r, c[0], moiBU) - soVong(r, c[1], moiBU), 0)));
    return oTuan(line, (w, rg, b) => cua.reduce((s, r) => s + soTuan(r, w, rg, b), 0));
  });
  if (dongNhom.length) dat(dongNhom[0], 0, `(Tuần 0 - ${monthLabel(months[0])})`);

  const rTong = [];
  for (let v = 0; v < SO_VONG; v++)
    dat(rTong, iVong + v, rows.reduce((s, r) => s + soVong(r, v, moiBU), 0));
  CHENH.forEach((c, k) => dat(rTong, iChenh + k,
    rows.reduce((s, r) => s + soVong(r, c[0], moiBU) - soVong(r, c[1], moiBU), 0)));
  oTuan(rTong, (w, rg, b) => rows.reduce((s, r) => s + soTuan(r, w, rg, b), 0));

  const rHdr = ['Mã sản phẩm', 'Tên sản phẩm', 'Model\n(tên gọi tắt)', 'Nhóm SP',
    'Công nghệ chính', 'Channel', 'Độc quyền', 'Giá bán bình quân'];
  for (let v = 0; v < SO_VONG; v++) dat(rHdr, iVong + v, nhanVong(v));
  CHENH.forEach((c, i) => dat(rHdr, iChenh + i, `Chênh lệch\n(FC tuần ${c[0]} vs.\nFC tuần ${c[1]})`));
  weeks.forEach((w, k) => dat(rHdr, iKhoi(k), weekIsoLabel(months[0], w)));

  const aoa = [r1, r2, r3, ...dongNhom, rTong, rHdr];

  rows.forEach((r) => {
    const line = oSanPham(r, r.default_channel, donViDocQuyen(r, months, moiBU));
    for (let v = 0; v < SO_VONG; v++) dat(line, iVong + v, soVong(r, v, moiBU));
    CHENH.forEach((c, k) => dat(line, iChenh + k, soVong(r, c[0], moiBU) - soVong(r, c[1], moiBU)));
    oTuan(line, (w, rg, b) => soTuan(r, w, rg, b));
    aoa.push(line);
  });

  return aoa;
}

// ---------------------------------------------------------------- cả file

/**
 * Dựng cả mười tab.
 *
 * Trả về kèm `canhBao` — những chỗ mà bản thân file KHÔNG nói ra được:
 *   - đơn vị có số nhưng report_channel không ứng với cột nào,
 *   - đơn vị chưa khai report_channel (đang tạm rơi về kênh SAP),
 *   - lần cập nhật thứ 6 trở đi, vì form chỉ có sáu cột Tuần 0..5.
 * Cả ba đều cho ra một file trông hoàn toàn bình thường.
 */
export function buildFcReport(data) {
  // Hợp số tuần theo lịch với số tuần CÓ SỐ THẬT: tháng 5 tuần mà bảng chia
  // chỉ ghi tới tuần 4 thì cột tuần 5 vẫn phải có, còn số lỡ ghi ở tuần 6
  // thì vẫn phải hiện chứ không biến mất khỏi file.
  const weeks = [...new Set([
    ...weeksOfMonth(data.baseMonth),
    ...(data.weekNumbers || [])
  ])].sort((a, b) => a - b);

  const day = { ...data, weeks, regions: data.regions || [] };

  const canhBao = [];
  const coCot = {};
  REPORT_CHANNELS.forEach((c) => { coCot[c] = true; });
  const lac = (data.businessUnits || []).filter((bu) => !coCot[channelOfBU(bu, data.reportChannels)]);
  if (lac.length) {
    canhBao.push(`${lac.join(', ')} khai report_channel không ứng với cột nào của form `
      + `(${lac.map((b) => channelOfBU(b, data.reportChannels)).join(', ')}) — `
      + 'sản lượng của các đơn vị này KHÔNG có trong file.');
  }
  if ((data.undeclaredReportChannel || []).length) {
    canhBao.push(`${data.undeclaredReportChannel.join(', ')} chưa khai report_channel — `
      + 'đang tạm xếp theo kênh SAP. Chạy setupDatabase() rồi xuất lại.');
  }
  const duVong = (data.updateWeeks || []).filter((v) => v >= SO_VONG);
  if (duVong.length) {
    canhBao.push(`Chu kỳ có lần cập nhật Tuần ${duVong.join(', ')} — form chỉ có sáu cột `
      + 'Tuần 0..5 nên các lần này không hiện.');
  }

  const sheets = [[TAB_B0_SUM, buildB0SumSheet(day)]];
  CHANNEL_TABS.forEach((tab) => sheets.push([tab.b0, buildB0ChannelSheet(day, tab)]));
  sheets.push([TAB_B1_SUM, buildB1SumSheet(day)]);
  CHANNEL_TABS.forEach((tab) => sheets.push([tab.b1, buildB1ChannelSheet(day, tab)]));

  return { sheets, weeks, canhBao };
}

/** Tải một workbook gồm nhiều sheet, mỗi phần tử là [tênSheet, aoa]. */
export function downloadWorkbook(sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(([name, aoa]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel giới hạn 31 ký tự/tên sheet
  });
  XLSX.writeFile(wb, filename);
}
