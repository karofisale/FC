import { zipSync } from 'fflate';

/**
 * Gộp nhiều file thành MỘT .zip để tải một lần (Rà soát 4 app, Đợt 3 — Xuất báo cáo).
 *
 * Lý do (bài học của Export, 29/09/2026): trình duyệt chỉ chấp nhận cái tải đầu tiên sau một thao tác của người dùng;
 * các file tải liên tiếp sau đó (nhất là sau một lượt chờ máy chủ) bị chặn im lặng hoặc rơi sang thư mục khác, trong khi
 * app vẫn báo "đã tải". Một file .zip thì chỉ có một lần tải.
 *
 * fflate (thư viện zip thuần JS, ~8KB) chạy được cả trong Node nên test được. File .xlsx vốn là zip rồi nên không nén thêm (level 0)
 * — nhanh hơn và không phình file.
 *
 * @param {{name: string, data: Uint8Array}[]} files
 * @returns {Uint8Array}
 */
export function taoZip(files) {
  const dung = new Set();
  const goi = {};
  (files || []).forEach((f) => {
    let ten = String(f.name || 'file').replace(/[\\/:*?"<>|]/g, '_');
    // Trùng tên thì thêm hậu tố -2, -3 (zip không có hai mục cùng tên).
    if (dung.has(ten)) {
      const dot = ten.lastIndexOf('.');
      const goc = dot > 0 ? ten.slice(0, dot) : ten;
      const duoi = dot > 0 ? ten.slice(dot) : '';
      let i = 2;
      while (dung.has(`${goc}-${i}${duoi}`)) i += 1;
      ten = `${goc}-${i}${duoi}`;
    }
    dung.add(ten);
    goi[ten] = [f.data, { level: 0 }];
  });
  return zipSync(goi);
}

/** Tải một khối dữ liệu về máy (chỉ chạy trong trình duyệt). */
export function taiVe(data, tenFile, mime = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = tenFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Thu hồi chậm một nhịp: thu hồi ngay có thể huỷ lượt tải ở vài trình duyệt.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Một file thì tải thẳng; từ hai file trở lên thì gộp .zip. Trả về 'zip' | 'le' để nơi gọi nói đúng với người dùng.
 */
export function taiVeNhieuFile(files, tenZip) {
  if (files.length === 1) {
    taiVe(files[0].data, files[0].name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return 'le';
  }
  taiVe(taoZip(files), tenZip, 'application/zip');
  return 'zip';
}
