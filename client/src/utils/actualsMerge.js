/**
 * Hợp nhất số đang sửa dở với số server vừa trả (màn Sản lượng thực hiện) — Rà soát 4 app, Đợt 3 mục 4.
 *
 * Cào SAP / nhập ZSD450 ghi số mới lên server rồi màn tải lại lưới. Trước đây tải lại là THAY CẢ LƯỚI nên mọi ô người dùng
 * đang sửa dở (chưa Lưu) mất sạch. Giờ hợp nhất:
 *  - ô đang sửa dở mà server KHÔNG đổi so với lần tải trước -> giữ số người dùng đang gõ, vẫn "chưa lưu";
 *  - ô đang sửa dở mà server vừa có số KHÁC (và khác số đang gõ) -> XUNG ĐỘT: nơi gọi hỏi người dùng;
 *  - ô không sửa -> lấy số server.
 *
 * Thuần (không React) để test được.
 */

/** Các ô đang sửa dở mà server vừa đổi sang một số khác số đang gõ. */
export function timXungDot({ totals, goc, dirty, map }) {
  return [...dirty].filter((k) => (totals[k] || 0) !== (goc[k] || 0) && (totals[k] || 0) !== (map[k] || 0));
}

/**
 * @param {object} p
 * @param {Record<string, number>} p.totals số server vừa trả
 * @param {Set<string>} p.dirty ô đang sửa dở
 * @param {Record<string, number>} p.map số đang hiển thị (gồm cả số đang gõ)
 * @param {string[]} p.xungDot kết quả timXungDot
 * @param {boolean} p.layTuServer true = với các ô XUNG ĐỘT lấy số server (bỏ số đang gõ); false = giữ số đang gõ
 * @returns {{map: Record<string, number>, dirty: Set<string>}} lưới mới + các ô còn "chưa lưu"
 */
export function gopSo({ totals, dirty, map, xungDot, layTuServer }) {
  const conLai = new Set();
  const gop = { ...totals };
  const xung = new Set(xungDot);
  dirty.forEach((k) => {
    if (xung.has(k) && layTuServer) return;            // lấy số server, ô hết "chưa lưu"
    gop[k] = map[k] || 0;
    if ((totals[k] || 0) !== (map[k] || 0)) conLai.add(k);   // trùng số server rồi thì không còn gì để lưu
  });
  return { map: gop, dirty: conLai };
}
