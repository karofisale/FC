// Chuyển sang app khác (Portal / OEM / Xuất khẩu) là TẢI LẠI CẢ TRANG: trang đích
// mất 1–6 giây (Xuất khẩu ~800KB) trong lúc màn hình cũ đứng im, nên người dùng tưởng nút
// không ăn và bấm tiếp. lamNongTrang: rê chuột / chạm vào nút là tải sẵn trang đích vào bộ nhớ
// đệm của trình duyệt (phần "Đang chuyển…" nằm ở Header, cạnh chỗ quyết định có đi hay không).

const daNong = new Set();

/** Gợi ý trình duyệt tải sẵn trang đích. Mỗi địa chỉ chỉ làm một lần; lỗi thì bỏ qua. */
export function lamNongTrang(href) {
  try {
    if (!href || daNong.has(href) || typeof document === 'undefined') return;
    daNong.add(href);
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = href;
    document.head.appendChild(l);
  } catch {
    // prefetch chỉ là gợi ý — không tải sẵn được thì lần bấm vẫn đi bình thường
  }
}
