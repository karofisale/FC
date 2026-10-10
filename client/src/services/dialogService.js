/**
 * HỘP THOẠI DÙNG CHUNG — thay window.confirm / window.alert (Rà soát 4 app, Đợt 2 mục 1).
 *
 * Hộp của trình duyệt luôn hiện dòng "An embedded page says…", không đóng được bằng Esc theo
 * cách của app, nút xác nhận luôn là "OK" kể cả khi xoá. appDialog trả Promise nên nơi gọi viết
 *   if (!(await appConfirm('Xoá SKU này?', { okLabel: 'Xoá SKU', danger: true }))) return;
 * — chỉ khác window.confirm ở chữ `await` (hàm gọi phải là async).
 *
 * File này THUẦN (không React) để test được; <DialogHost> (components/DialogHost.jsx) là nơi
 * đăng ký vẽ hộp. Chưa có host (đầu phiên, hoặc kiểm thử) thì yêu cầu xếp hàng chờ chứ KHÔNG rơi
 * về window.confirm — rơi về hộp trình duyệt chính là điều đợt này loại bỏ.
 *
 * Tuỳ chọn của appDialog:
 *   title        tiêu đề (mặc định 'Xác nhận')
 *   message      nội dung, giữ xuống dòng
 *   okLabel      nhãn nút đồng ý — phải ghi ĐÚNG hành động ('Xoá SKU', 'Gửi duyệt'), không 'OK'
 *   cancelLabel  nhãn nút huỷ (mặc định 'Hủy')
 *   danger       nút đồng ý màu đỏ (xoá, ghi đè, bỏ thay đổi)
 *   hideCancel   chỉ một nút (thông báo)
 *   run          hàm async chạy khi bấm đồng ý: hộp giữ nguyên + quay vòng trong lúc chạy, xong mới
 *                đóng; ném lỗi thì hiện lỗi trong hộp và cho thử lại
 * Trả về: true nếu đồng ý, false nếu huỷ / Esc / bấm nền.
 */
let host = null;
const choDoi = [];

/** <DialogHost> gọi lúc mount; trả hàm gỡ đăng ký. */
export function registerDialogHost(fn) {
  host = fn;
  while (choDoi.length) fn(choDoi.shift());
  return () => { if (host === fn) host = null; };
}

export function appDialog(opts = {}) {
  return new Promise((resolve) => {
    const req = { ...opts, resolve };
    if (host) host(req);
    else choDoi.push(req);
  });
}

/** Hỏi đồng ý / huỷ. */
export function appConfirm(message, opts = {}) {
  return appDialog({ message, ...opts });
}

/** Thông báo một nút (thay window.alert). */
export function appAlert(message, opts = {}) {
  return appDialog({ message, hideCancel: true, okLabel: 'Đã hiểu', title: 'Thông báo', ...opts }).then(() => undefined);
}
