/**
 * Cache theo khoá, giữ PROMISE (nhiều nơi gọi cùng lúc chỉ bắn một request) và có HẠN (Đợt 4).
 *
 * - Cùng khoá còn hạn -> trả lại đúng promise cũ (kể cả khi request còn đang chạy).
 * - Hết hạn -> lượt đọc kế tiếp nạp mới. Hạn tính từ lúc BẮT ĐẦU nạp.
 * - Nạp lỗi -> bỏ khỏi cache ngay (không cache lỗi), cho phép thử lại; chỉ bỏ đúng lượt nạp đó, không đụng lượt nạp mới hơn cùng khoá.
 * - `xoa()` = vô hiệu hoá toàn bộ (mọi lần GHI làm dữ liệu đổi, đăng nhập / đăng xuất / hết phiên).
 *
 * @param {number} hanMs thời gian sống
 * @param {() => number} [dongHo] đồng hồ (ms), thay được khi thử
 */
export function taoCacheCoHan(hanMs, dongHo = Date.now) {
  const kho = new Map();   // khoá -> { p, luc }
  return {
    lay(khoa, nap) {
      const cu = kho.get(khoa);
      if (cu && dongHo() - cu.luc < hanMs) return cu.p;
      const muc = { p: null, luc: dongHo() };
      muc.p = Promise.resolve().then(nap).catch((err) => {
        if (kho.get(khoa) === muc) kho.delete(khoa);
        throw err;
      });
      kho.set(khoa, muc);
      return muc.p;
    },
    xoa() { kho.clear(); },
    get kichThuoc() { return kho.size; }
  };
}
