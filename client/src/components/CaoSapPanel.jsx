import React, { useState, useRef, useEffect } from 'react';
import { Zap, Loader2, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { api } from '../services/api';
import { monthLabel } from '../utils/period';

/**
 * Nút "Cào thẳng từ SAP" — chạy bộ script trên máy có SAP, không phải mở terminal.
 *
 * CÁCH NÓ CHẠY ĐƯỢC: một trang web KHÔNG khởi chạy được tiến trình trên máy
 * người dùng — trình duyệt nào cũng chặn, và chặn có chủ đích. Cầu ở đây là một
 * GIAO THỨC RIÊNG đã đăng ký trong registry:
 *
 *   nút → karofi-fc://thuc-hien?bu=3T&month=YYYY-MM
 *       → wscript chay.vbs (lọc chuỗi bằng danh sách cho phép)
 *       → dieu-phoi.ps1 → dt-fc/export_zsd450.py → tools/sap-push.mjs → bảng Actuals
 *
 * Cài bằng `Scripts/karofi-fc-protocol/cai-dat.ps1`, chỉ trên máy có SAP.
 *
 * ĐƯỜNG VỀ LÀ NHỊP TIM, KHÔNG PHẢI HTTP. Giao thức riêng là MỘT CHIỀU: trình
 * duyệt giao URL cho Windows rồi quên luôn — không có chỗ nào để trả kết quả,
 * cũng không có cách nào biết giao thức đã cài hay chưa (trình duyệt cố tình
 * không cho biết). Nên bộ điều phối ghi trạng thái vào dòng nhịp tim
 * `fc.thuc-hien.nut.<đơn vị>`, và màn này hỏi vòng dòng đó.
 *
 * SO MỐC VỚI CHÍNH NÓ, KHÔNG SO VỚI ĐỒNG HỒ MÁY. `lanCuoi` do máy chủ Google
 * ghi, còn `Date.now()` là đồng hồ trình duyệt — hai đồng hồ khác nhau, lệch
 * vài phút là chuyện thường. Nên trước khi bấm ta chụp lại mốc hiện tại rồi chờ
 * nó ĐỔI. Phép so một giá trị với chính nó thì không phụ thuộc đồng hồ nào.
 */

const NHIP_MS = 5000;
// Chưa thấy nhịp nào nhúc nhích sau ngần này thì gần như chắc chắn là chưa cài
// giao thức (hoặc trình duyệt chặn). Bộ điều phối ghi nhịp "đang chạy" ngay
// dòng đầu, trước cả khi gọi SAP, nên 25 giây là rất rộng rãi.
const CHO_KHOI_DONG_MS = 25000;
// Cào SAP một tháng mất khoảng một phút. 6 phút là để dành cho tháng nhiều dòng
// và mạng chậm — quá đó thì có gì đó đã chết, và bảo người dùng đi xem nhật ký
// thì đúng hơn là quay vòng mãi.
const CHO_TOI_DA_MS = 6 * 60 * 1000;

const tim = (ds, job) => (ds || []).find((n) => n.job === job) || null;

export default function CaoSapPanel({ businessUnitCode, month, isEditor, onImported }) {
  const [pha, setPha] = useState('nghi');   // nghi | choKhoiDong | dangChay | xong | loi | khongCai
  const [loi, setLoi] = useState('');
  const [ketQua, setKetQua] = useState('');
  const dungRef = useRef(false);

  // Vòng hỏi phải dừng khi rời màn — không thì nó chạy tiếp trong nền và gọi
  // setState trên một component đã gỡ.
  useEffect(() => () => { dungRef.current = true; }, []);
  // Đổi đơn vị hoặc đổi tháng thì kết quả cũ không còn nói về cái đang xem.
  useEffect(() => { setPha('nghi'); setLoi(''); setKetQua(''); }, [businessUnitCode, month]);

  const bu = String(businessUnitCode || '');
  const thang = String(month || '').slice(0, 7);
  const JOB_NUT = `fc.thuc-hien.nut.${bu.toLowerCase()}`;
  const JOB_DATA = `fc.thuc-hien.${bu.toLowerCase()}`;
  const dangBan = pha === 'choKhoiDong' || pha === 'dangChay';

  const doNhip = async () => (await api.getNhipTim()).nhipTim || [];

  const chay = async () => {
    setLoi(''); setKetQua(''); dungRef.current = false;

    // 1. Chụp mốc TRƯỚC khi bấm.
    let mocNut = null, mocData = null;
    try {
      const ds = await doNhip();
      mocNut = (tim(ds, JOB_NUT) || {}).lanCuoi || '';
      mocData = (tim(ds, JOB_DATA) || {}).lanCuoi || '';
    } catch (e) {
      setPha('loi');
      setLoi('Không đọc được nhịp tim để theo dõi lượt chạy: ' + e.message);
      return;
    }

    // 2. Gọi giao thức. Không có phản hồi nào từ bước này, kể cả khi thất bại.
    setPha('choKhoiDong');
    window.location.href = `karofi-fc://thuc-hien?bu=${bu}&month=${thang}`;

    // 3. Hỏi vòng. Vòng lặp tuần tự chứ không setInterval: một nhịp chậm thì
    //    nhịp sau chờ, không chồng lên nhau.
    const batDau = Date.now();
    let daKhoiDong = false;

    while (!dungRef.current) {
      await new Promise((r) => setTimeout(r, NHIP_MS));
      if (dungRef.current) return;

      let ds;
      try {
        ds = await doNhip();
      } catch {
        continue;   // một nhịp hỏng thì nhịp sau hỏi lại
      }

      const nut = tim(ds, JOB_NUT);
      const nutDoi = nut && (nut.lanCuoi || '') !== mocNut;
      if (!daKhoiDong && nutDoi) { daKhoiDong = true; setPha('dangChay'); }

      if (!daKhoiDong && Date.now() - batDau > CHO_KHOI_DONG_MS) {
        setPha('khongCai');
        return;
      }

      // 'dang-chay' là hợp đồng với dieu-phoi.ps1 — xem chú thích đầu file.
      if (daKhoiDong && nut && nut.trangThai !== 'dang-chay') {
        if (nut.trangThai === 'loi') {
          setPha('loi');
          setLoi(nut.ghiChu || 'Lượt chạy báo lỗi nhưng không kèm lý do.');
          return;
        }
        setPha('xong');
        setKetQua(nut.ghiChu || 'Xong.');
        // Chỉ tải lại khi dòng DỮ LIỆU cũng đổi. Có ca chạy xong mà không ghi
        // gì (SAP chưa có chứng từ tháng này) — tải lại lúc đó là bắt người
        // dùng chờ một lượt đọc vô ích.
        const data = tim(ds, JOB_DATA);
        if (data && (data.lanCuoi || '') !== mocData && onImported) onImported();
        return;
      }

      if (Date.now() - batDau > CHO_TOI_DA_MS) {
        setPha('loi');
        setLoi('Lượt chạy quá 6 phút mà chưa báo xong. Xem '
          + 'Scripts\\karofi-fc-protocol\\nhat-ky.log trên máy có SAP.');
        return;
      }
    }
  };

  if (!isEditor) return null;

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-amber-700" />
        </div>
        <div className="flex-1 min-w-[240px]">
          <h3 className="text-sm font-bold text-slate-900">Cào thẳng từ SAP</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Chạy bộ script trên máy có SAP: xuất ZSD450 của <strong>{bu}</strong> tháng{' '}
            <strong>{monthLabel(month)}</strong> rồi ghi vào bảng thực hiện — không phải mở terminal,
            không phải chọn file. Chỉ dùng được trên <strong>máy đã cài trình chạy</strong> và{' '}
            <strong>đã đăng nhập SAP</strong>.
          </p>
        </div>
        <button
          onClick={chay}
          disabled={dangBan}
          className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
        >
          {dangBan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {pha === 'choKhoiDong' ? 'Đang khởi động...'
            : pha === 'dangChay' ? 'Đang cào...'
              : 'Cào tháng này'}
        </button>
      </div>

      {pha === 'xong' && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ketQua}</span>
        </div>
      )}

      {pha === 'loi' && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loi}</span>
        </div>
      )}

      {pha === 'khongCai' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Bấm xong 25 giây mà máy không nhúc nhích. Gần như chắc chắn là{' '}
            <strong>máy này chưa cài trình chạy</strong> — trình duyệt cố tình không cho trang web
            biết một giao thức đã cài hay chưa, nên đây là cách duy nhất để phát hiện.
            <div className="mt-1.5">
              Trên máy có SAP, mở PowerShell:
              <code className="block mt-1 font-mono bg-white/60 rounded px-2 py-1">
                cd D:\Operation\Claude\Scripts\karofi-fc-protocol<br />.\cai-dat.ps1
              </code>
            </div>
            <div className="mt-1.5">
              Cũng có thể anh đã bấm "Huỷ" ở hộp thoại xác nhận của trình duyệt.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
