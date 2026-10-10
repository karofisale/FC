import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { allowedBUs } from '../../services/auth';
import { gomKeHoachNamChoDuyet } from '../../utils/annualPending';
import { NHAN_LOAI_KE_HOACH, ngayVN } from '../../utils/glossary';

const KHONG_CO = { items: [], loi: [], daTai: false };

/**
 * Hook gom MỌI kế hoạch năm đang chờ duyệt (đơn vị × năm) cho người duyệt — Rà soát 4 app, Đợt 3 mục 6.
 * Dùng ở App (đếm cho badge menu) rồi chuyền xuống màn Kế hoạch năm / Phê duyệt, nên chỉ gọi mạng một lần.
 * `batDau` = false (người không có quyền duyệt) thì không gọi gì. `layDonVi` ghi đè được nguồn danh sách đơn vị (trang thử cục bộ).
 */
export function useChoDuyetNam(batDau, layDonVi) {
  const [kq, setKq] = useState(KHONG_CO);
  const nap = useCallback(async () => {
    if (!batDau) { setKq(KHONG_CO); return; }
    try {
      const dsDonVi = layDonVi ? await layDonVi() : allowedBUs(await api.getBUs());
      const r = await gomKeHoachNamChoDuyet(api.listAnnualPlans, dsDonVi);
      setKq({ ...r, daTai: true });
    } catch {
      // Hộp chờ duyệt / badge chỉ là phần phụ: không đọc được thì để trống, đừng làm hỏng cả app.
      setKq({ items: [], loi: [], daTai: true });
    }
  }, [batDau, layDonVi]);
  useEffect(() => { nap(); }, [nap]);
  return { ...kq, nap };
}

/**
 * Hộp "Chờ duyệt" của màn Kế hoạch năm: liệt kê mọi (đơn vị × năm) đang chờ, bấm "Mở" để nhảy tới đúng đơn vị + năm đó
 * (không phải tự chọn từng đơn vị rồi từng năm). Chỉ người duyệt thấy; không có gì chờ thì không hiện.
 */
export default function HopChoDuyet({ items = [], loi = [], dangMo, onMo, className = '' }) {
  if (!items.length && !loi.length) return null;
  return (
    <section aria-label="Kế hoạch năm chờ duyệt" className={`bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 ${className}`}>
      <h2 className="font-bold flex items-center gap-1.5">
        <ClipboardCheck className="w-4 h-4 text-amber-700" aria-hidden="true" />
        Chờ duyệt ({items.length})
      </h2>
      {items.length > 0 && (
        <ul className="mt-2 divide-y divide-amber-200">
          {items.map((x) => {
            const dangXem = dangMo && dangMo.bu === x.bu && dangMo.nam === x.nam;
            return (
              <li key={x.id} className="py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold min-w-0">{x.bu}{x.tenDonVi && x.tenDonVi !== x.bu ? ' — ' + x.tenDonVi : ''}</span>
                <span>Năm {x.nam}</span>
                <span className="text-amber-800">{NHAN_LOAI_KE_HOACH[x.loai] || 'Kế hoạch'} #{x.lanSua}</span>
                {x.guiLuc && <span className="text-amber-800">gửi {ngayVN(x.guiLuc)}</span>}
                <button
                  type="button"
                  onClick={() => onMo(x)}
                  disabled={dangXem}
                  className="ml-auto inline-flex items-center gap-1 border border-amber-400 bg-white hover:bg-amber-100 disabled:opacity-60 text-amber-900 font-semibold px-2.5 py-1 rounded-lg"
                >
                  {dangXem ? 'Đang xem' : <>Mở <ArrowRight className="w-3 h-3" aria-hidden="true" /></>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {loi.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-amber-800">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          Chưa đọc được {loi.length} đơn vị ({loi.slice(0, 4).map((l) => l.bu).join(', ')}{loi.length > 4 ? '…' : ''}) — danh sách trên có thể chưa đủ.
        </p>
      )}
    </section>
  );
}
