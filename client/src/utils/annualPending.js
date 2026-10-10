/**
 * Gom các kế hoạch năm ĐANG CHỜ DUYỆT của nhiều đơn vị bằng API sẵn có (Rà soát 4 app, Đợt 3 — Kế hoạch năm).
 *
 * Server chưa có action "liệt kê mọi kế hoạch chờ duyệt" nên gom ở client: với mỗi đơn vị gọi
 * listAnnualPlans({ bu }) (không truyền năm = mọi năm của đơn vị đó, một lượt gọi) rồi lọc trạng thái 'submitted'.
 * Quyền do server giữ: người duyệt của đơn vị chỉ đọc được đơn vị mình (đơn vị khác báo FORBIDDEN -> bỏ qua, không làm hỏng cả hộp);
 * quản trị đọc được mọi đơn vị. Gọi song song, một đơn vị lỗi thì ghi lại rồi đi tiếp.
 *
 * Cần thêm ở server để bỏ N lượt gọi này: một action trả thẳng mọi bản 'submitted' (xem báo cáo Đợt 3).
 *
 * @param {(params: {bu: string}) => Promise<{plans: object[]}>} liet kê listAnnualPlans
 * @param {{code: string, name?: string}[]} donVi các đơn vị cần quét
 * @returns {Promise<{items: object[], loi: {bu: string, text: string}[]}>}
 */
export async function gomKeHoachNamChoDuyet(liet, donVi) {
  const loi = [];
  const kq = await Promise.all((donVi || []).map(async (b) => {
    try {
      const r = await liet({ bu: b.code });
      return ((r && r.plans) || [])
        .filter((p) => p.status === 'submitted')
        .map((p) => ({
          id: p.id, bu: b.code, tenDonVi: b.name || b.code, nam: Number(p.year), loai: p.kind, lanSua: p.revisionNo,
          guiLuc: p.submittedAt || p.updatedAt || '', nguoiTao: p.createdBy || ''
        }));
    } catch (e) {
      loi.push({ bu: b.code, text: e && e.message ? e.message : String(e) });
      return [];
    }
  }));
  const items = kq.flat().sort((a, b) => (a.nam - b.nam) || String(a.bu).localeCompare(String(b.bu)) || String(a.loai).localeCompare(String(b.loai)));
  return { items, loi };
}
