/**
 * "Chung kênh" (26/10/2026): SKU được dự báo ở NHIỀU kênh thì để Kênh mặc định TRỐNG — danh mục của mọi đơn vị (getProducts_, workspace)
 * đều lấy mã có kênh trống nên mã hiện ở OEM, XK, GT2, 3T… cùng lúc, không còn dòng "ngoài danh mục".
 * Server (updateProduct) chỉ cho quản trị viên trung tâm sửa SKU đang dùng chung hoặc đổi kênh sang kênh khác ngoài đơn vị của mình.
 */
export const KENH_CHUNG = '';
export const NHAN_KENH_CHUNG = 'Chung (mọi kênh)';

/** Người này đặt được kênh = chung hay không (khớp mutations.js: assertProductEditable / updateProduct). */
export const duocDatKenhChung = (user) => user?.role === 'central_admin';

/** Nhãn hiển thị của kênh mặc định: trống = "Chung". */
export const nhanKenh = (kenh) => (String(kenh === null || kenh === undefined ? '' : kenh).trim() || NHAN_KENH_CHUNG);

/**
 * Đặt Kênh mặc định = chung cho nhiều mã, lần lượt từng mã (mỗi mã một lượt ghi, lỗi một mã không làm hỏng các mã khác).
 * @param {(p: {skuCode: string, defaultChannel: string}) => Promise<any>} capNhat  thường là api.updateProduct
 * @returns {Promise<{ xong: string[], loi: {ma: string, ly: string}[] }>}
 */
export async function datKenhChungChoCacMa(maList, capNhat) {
  const xong = [];
  const loi = [];
  for (const ma of maList) {
    try {
      await capNhat({ skuCode: ma, defaultChannel: KENH_CHUNG });
      xong.push(ma);
    } catch (e) {
      loi.push({ ma, ly: String((e && e.message) || e) });
    }
  }
  return { xong, loi };
}
