/**
 * Gom các kế hoạch năm ĐANG CHỜ DUYỆT của nhiều đơn vị bằng API sẵn có (Rà soát 4 app, Đợt 3 — Kế hoạch năm).
 *
 * Server chưa có action "liệt kê mọi kế hoạch chờ duyệt" nên gom ở client: với mỗi đơn vị gọi
 * listAnnualPlans({ bu }) (không truyền năm = mọi năm của đơn vị đó, một lượt gọi) rồi lọc trạng thái 'submitted'.
 * Quyền do server giữ: người duyệt của đơn vị chỉ đọc được đơn vị mình (đơn vị khác báo FORBIDDEN -> bỏ qua, không làm hỏng cả hộp);
 * quản trị đọc được mọi đơn vị. Gọi song song, một đơn vị lỗi thì ghi lại rồi đi tiếp.
 *
 * Đợt 4: server đã có action `listPendingAnnualPlans` (một lượt, phạm vi theo quyền người gọi) — dùng `gomChoDuyet` bên dưới, hàm này chỉ còn làm
 * ĐƯỜNG DỰ PHÒNG khi server chưa có action đó (client mới chạy với server cũ).
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

/** Lỗi "server chưa có action này" (server cũ chưa deploy): router trả 'Action chưa được cài đặt: <tên>'. Chỉ lỗi này mới cho phép dự phòng. */
export function laLoiChuaCoHam(e) {
  const m = e && e.message ? String(e.message) : '';
  return /Action chưa được cài đặt|unknown action|not implemented/i.test(m);
}

/** Một dòng của action mới -> mục của hộp "Chờ duyệt" (cùng hình dạng với gomKeHoachNamChoDuyet). */
function mucTuMayChu(p) {
  const bu = p.businessUnitCode || '';
  return {
    id: p.id, bu, tenDonVi: p.unitName || bu, nam: Number(p.year), loai: p.kind, lanSua: p.revisionNo,
    guiLuc: p.submittedAt || p.updatedAt || '', nguoiTao: p.createdBy || '', nguoiGui: p.submittedBy || p.createdBy || '',
    tong: Number.isFinite(Number(p.totalRevenueVnd)) ? Number(p.totalRevenueVnd) : null
  };
}

/**
 * Gom kế hoạch năm chờ duyệt bằng MỘT lượt gọi `listPendingAnnualPlans` (Đợt 4). Server cũ chưa có action đó -> tự rơi về cách cũ
 * (listAnnualPlans từng đơn vị, `layDonVi` chỉ gọi lúc đó). Lỗi KHÁC (không đủ quyền, mất mạng...) ném ra cho nơi gọi xử lý, không dự phòng:
 * dự phòng cũng sẽ lỗi tương tự và chỉ nhân thêm số lượt gọi.
 *
 * @param {{motLuot: () => Promise<{plans: object[]}>, liet: Function, layDonVi: () => Promise<object[]>}} nguon
 * @returns {Promise<{items: object[], loi: object[], dungDuPhong: boolean}>}
 */
export async function gomChoDuyet({ motLuot, liet, layDonVi }) {
  try {
    const r = await motLuot();
    const items = ((r && r.plans) || []).map(mucTuMayChu)
      .sort((a, b) => (a.nam - b.nam) || String(a.bu).localeCompare(String(b.bu)) || String(a.loai).localeCompare(String(b.loai)));
    return { items, loi: [], dungDuPhong: false };
  } catch (e) {
    if (!laLoiChuaCoHam(e)) throw e;
    const kq = await gomKeHoachNamChoDuyet(liet, await layDonVi());
    return { ...kq, dungDuPhong: true };
  }
}

/**
 * Số yêu cầu duyệt đang chờ trong phạm vi người gọi: dùng action đếm nhẹ `countPendingApprovals`; server cũ chưa có thì rơi về
 * `getApprovals({status:'pending'})` rồi đếm. Lỗi khác ném ra.
 * @param {(action: string, payload?: object) => Promise<any>} goi gọi một action (đã gắn token)
 */
export async function demYeuCauChoDuyet(goi) {
  try {
    const r = await goi('countPendingApprovals');
    return Number(r && r.count) || 0;
  } catch (e) {
    if (!laLoiChuaCoHam(e)) throw e;
    const ds = await goi('getApprovals', { status: 'pending' });
    return Array.isArray(ds) ? ds.length : 0;
  }
}
