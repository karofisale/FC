import React, { useCallback, useEffect, useState } from 'react';
import { SlidersHorizontal, Loader2, AlertCircle, Info, RefreshCw, History, ChevronDown, Clock, Lock } from 'lucide-react';
import { MAN_HINH } from '../utils/glossary';
import { laMaster } from '../utils/menu';
import { vnToday } from '../utils/period';
import { api } from '../services/api';
import { loadSystemValues } from '../services/systemValues';
import {
  chuanHoaCaiDat, nhomCaiDat, kiemForm, khongDoi, cauXacNhan, dongTrangThai, chuoiGiaTri, donViHienThi, hienThiSo, soVN,
  ngayVN, lucVN, ngayToiDa, lichSuMoiNhat, GHI_CHU_TOI_DA
} from '../services/systemSettings';
import { appConfirm } from '../services/dialogService';
import { toast } from '../services/toastService';

/**
 * CÀI ĐẶT HỆ THỐNG (14/10/2026) — giá trị DÙNG CHUNG cả hệ thống FC, CHỈ master (central_admin) xem và sửa.
 *
 * Vẽ TỔNG QUÁT từ getSystemSettings: mỗi cài đặt tự mô tả (nhãn, ghi chú, kiểu, min/max, đơn vị, định dạng) nên thêm cài đặt ở máy
 * chủ không phải sửa màn này. Khác Cài đặt cá nhân (pages/Settings.jsx) ở chỗ có nút Lưu: mỗi lần lưu là MỘT thay đổi có ngày hiệu lực
 * và được ghi lịch sử, nên phải hỏi xác nhận. Logic thuần (đổi %, kiểm hợp lệ, câu xác nhận) ở services/systemSettings.js;
 * máy chủ vẫn là nơi quyết định cuối cùng và lỗi của nó (câu tiếng Việt) hiện ngay dưới dòng vừa lưu.
 */

const sheet = 'bg-white rounded-xl border border-slate-200 shadow-sm';
const nutPhu = 'inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg';
const nutChinh = 'inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-3 py-1.5 rounded-lg';
const oNhap = 'bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60';
const idOf = (khoa, hau) => 'ss-' + String(khoa).replace(/[^A-Za-z0-9]+/g, '-') + '-' + hau;

export default function SystemSettings({ user }) {
  // Chốt chặn hiển thị: App đã không render màn này cho người khác, đây là lớp thứ hai (không gọi máy chủ khi không phải master).
  if (!laMaster(user?.role)) {
    return (
      <div className={`${sheet} p-6 max-w-xl flex items-start gap-3`} role="alert">
        <Lock className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h2 className="font-bold text-slate-900 text-sm">{MAN_HINH.system.ten}</h2>
          <p className="text-xs text-slate-600 mt-1">Chỉ master mới xem được cài đặt hệ thống.</p>
        </div>
      </div>
    );
  }
  return <NoiDung />;
}

function NoiDung() {
  const [data, setData] = useState(null);          // phản hồi đã chuẩn hoá
  const [loi, setLoi] = useState('');
  const [dangNap, setDangNap] = useState(true);

  const layDuLieu = useCallback(async () => {
    const res = chuanHoaCaiDat(await api.getSystemSettings());
    if (!res) throw new Error('Máy chủ trả dữ liệu cài đặt hệ thống không hợp lệ.');
    return res;
  }, []);

  const ketQua = useCallback((res) => { setData(res); setLoi(''); setDangNap(false); }, []);
  const thatBai = useCallback((err) => { setLoi(err?.message || 'Không tải được cài đặt hệ thống.'); setDangNap(false); }, []);
  const nap = useCallback(() => layDuLieu().then(ketQua, thatBai), [layDuLieu, ketQua, thatBai]);

  // Lần mở màn: nạp trực tiếp trong effect (dangNap bắt đầu là true nên không cần setState đồng bộ); bỏ kết quả nếu đã rời màn.
  useEffect(() => {
    let huy = false;
    layDuLieu().then((r) => { if (!huy) ketQua(r); }, (e) => { if (!huy) thatBai(e); });
    return () => { huy = true; };
  }, [layDuLieu, ketQua, thatBai]);
  const taiLai = () => { setDangNap(true); return nap(); };

  // Sau khi lưu: nạp lại danh sách + làm mới kho giá trị hệ thống (xem trước "chu kỳ mới" ở các màn khác dùng đúng số vừa đặt).
  const sauKhiLuu = useCallback(async () => {
    await Promise.all([nap(), loadSystemValues()]);
  }, [nap]);

  const today = data?.today || vnToday();
  const nhom = data ? nhomCaiDat(data.settings) : [];
  const khongLuuDuoc = !data || data.tableMissing || !data.canEdit;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className={`${sheet} p-4 flex flex-wrap items-start justify-between gap-3`}>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-blue-600" aria-hidden="true" />
            {MAN_HINH.system.tieuDe}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Giá trị dùng chung cho cả hệ thống, chỉ master xem và sửa. Mỗi thay đổi có <strong>ngày hiệu lực</strong> và được ghi lịch sử;
            chu kỳ đã tạo giữ nguyên.
          </p>
        </div>
        <button type="button" onClick={taiLai} disabled={dangNap} className={nutPhu}>
          {dangNap ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          Tải lại
        </button>
      </div>

      {data?.tableMissing && (
        <div className="bg-sky-50 border border-sky-200 text-sky-900 text-xs rounded-lg p-3 flex items-start gap-2" role="status">
          <Info className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span><strong>Chưa chạy SQL đợt 8 — chưa lưu được.</strong> Các cài đặt bên dưới đang dùng giá trị mặc định; xem được nhưng nút Lưu bị tắt cho tới khi bảng được tạo ở máy chủ.</span>
        </div>
      )}
      {data && !data.tableMissing && !data.canEdit && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg p-3 flex items-start gap-2" role="status">
          <Lock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>Tài khoản này chỉ xem được cài đặt hệ thống, không sửa được.</span>
        </div>
      )}

      {loi && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3 flex items-start gap-2" role="alert">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="flex-1">{loi}</span>
          <button type="button" onClick={taiLai} className="font-semibold underline">Thử lại</button>
        </div>
      )}

      {!data && dangNap && (
        <div className="text-xs text-slate-500 p-4 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Đang tải cài đặt hệ thống...</div>
      )}

      {data && nhom.length === 0 && !loi && (
        <div className={`${sheet} p-4 text-xs text-slate-500`}>Máy chủ chưa có cài đặt hệ thống nào.</div>
      )}

      {nhom.map((g) => (
        <section key={g.nhom} className={`${sheet} p-4 sm:p-5`} aria-label={g.nhom}>
          <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide border-b border-slate-200 pb-2">{g.nhom}</h3>
          <div className="divide-y divide-slate-100">
            {g.items.map((s) => (
              <DongCaiDat
                key={[s.khoa, s.giaTri, s.hieuLucTu, (s.choHieuLuc || []).length, (s.lichSu || []).length].join('|')}
                s={s} today={today} khongLuuDuoc={khongLuuDuoc} onSaved={sauKhiLuu}
              />
            ))}
          </div>
        </section>
      ))}

      {data && (
        <p className="text-[11px] text-slate-500 px-1">Hôm nay theo máy chủ: {ngayVN(today)}.</p>
      )}
    </div>
  );
}

function DongCaiDat({ s, today, khongLuuDuoc, onSaved }) {
  const [text, setText] = useState(() => { const x = hienThiSo(s, s.giaTri); return x === null ? '' : soVN(x); });
  const [ngay, setNgay] = useState(today);
  const [ghiChu, setGhiChu] = useState('');
  const [busy, setBusy] = useState(false);
  const [moLichSu, setMoLichSu] = useState(false);
  const [loi, setLoi] = useState({});

  const dv = donViHienThi(s);
  const cho = Array.isArray(s.choHieuLuc) ? [...s.choHieuLuc].sort((a, b) => String(a.hieuLucTu).localeCompare(String(b.hieuLucTu))) : [];
  const lichSu = lichSuMoiNhat(s);
  const max = ngayToiDa(today);
  const coKhoang = typeof s.min === 'number' || typeof s.max === 'number';
  const khoang = typeof s.min === 'number' && typeof s.max === 'number'
    ? `từ ${chuoiGiaTri(s, s.min)} đến ${chuoiGiaTri(s, s.max)}`
    : typeof s.min === 'number' ? `không nhỏ hơn ${chuoiGiaTri(s, s.min)}` : typeof s.max === 'number' ? `không lớn hơn ${chuoiGiaTri(s, s.max)}` : '';

  const luu = async (veMacDinh) => {
    setLoi({});
    const kq = kiemForm(s, { text, ngay, ghiChu, reset: veMacDinh }, today);
    if (!kq.ok) { setLoi({ gt: kq.errGiaTri, ngay: kq.errNgay, gc: kq.errGhiChu }); return; }
    if (!veMacDinh && khongDoi(s, kq.giaTri, kq.ngay, today)) {
      setLoi({ chung: 'Giá trị mới trùng giá trị đang dùng — chưa có gì để lưu.' });
      return;
    }
    const ok = await appConfirm(cauXacNhan(s, kq.giaTri, kq.ngay), {
      title: veMacDinh ? 'Đưa về mặc định?' : 'Lưu cài đặt hệ thống?',
      okLabel: veMacDinh ? 'Về mặc định' : 'Lưu cài đặt'
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.setSystemSetting(kq.payload);
      toast.success(veMacDinh
        ? `Đã đưa "${s.nhan}" về mặc định, hiệu lực từ ${ngayVN(kq.ngay)}.`
        : `Đã lưu "${s.nhan}": ${chuoiGiaTri(s, kq.giaTri)}, hiệu lực từ ${ngayVN(kq.ngay)}.`);
      setGhiChu('');
      await onSaved();
    } catch (err) {
      setLoi({ chung: err?.message || 'Không lưu được. Thử lại sau.' });
    } finally {
      setBusy(false);
    }
  };

  const tt = dongTrangThai(s, today);
  const coThayDoiDangCho = cho.length > 0;
  const idGt = idOf(s.khoa, 'gt');
  const idNgay = idOf(s.khoa, 'ngay');
  const idGc = idOf(s.khoa, 'gc');

  return (
    <div className="py-4 space-y-3" data-khoa={s.khoa}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{s.nhan}</div>
        {s.ghiChu && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed max-w-2xl">{s.ghiChu}</p>}
        <p className={`mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border ${s.daDat ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
          {tt}
          {s.daDat && <span className="font-normal text-blue-800">· đang dùng {chuoiGiaTri(s, s.giaTri)}</span>}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div>
          <label htmlFor={idGt} className="text-[11px] font-semibold text-slate-600 block mb-1">Giá trị mới</label>
          <div className="flex items-center gap-1.5">
            <input
              id={idGt} type="text" inputMode="decimal" autoComplete="off" value={text} disabled={busy}
              onChange={(e) => { setText(e.target.value); setLoi({}); }}
              aria-invalid={loi.gt ? 'true' : undefined} aria-describedby={idGt + '-goi-y'}
              className={`${oNhap} w-28 text-right tabular-nums`}
            />
            {dv && <span className="text-xs text-slate-600">{dv}</span>}
          </div>
          <div id={idGt + '-goi-y'} className="text-[11px] text-slate-500 mt-1">
            Mặc định {chuoiGiaTri(s, s.macDinh)}{coKhoang ? ` · cho phép ${khoang}` : ''}{s.kieu === 'integer' ? ' · số nguyên' : ''}
          </div>
        </div>
        <div>
          <label htmlFor={idNgay} className="text-[11px] font-semibold text-slate-600 block mb-1">Hiệu lực từ</label>
          <input
            id={idNgay} type="date" value={ngay} min={today} max={max || undefined} disabled={busy}
            onChange={(e) => { setNgay(e.target.value); setLoi({}); }}
            aria-invalid={loi.ngay ? 'true' : undefined}
            className={`${oNhap} w-40`}
          />
          <div className="text-[11px] text-slate-500 mt-1">Từ hôm nay tới 1 năm sau</div>
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor={idGc} className="text-[11px] font-semibold text-slate-600 block mb-1">Ghi chú (không bắt buộc)</label>
          <input
            id={idGc} type="text" value={ghiChu} maxLength={GHI_CHU_TOI_DA} disabled={busy}
            onChange={(e) => { setGhiChu(e.target.value); setLoi({}); }}
            placeholder="Lý do đổi"
            className={`${oNhap} w-full`}
          />
        </div>
      </div>

      {(loi.gt || loi.ngay || loi.gc || loi.chung) && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5 flex items-start gap-2" role="alert">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{[loi.gt, loi.ngay, loi.gc, loi.chung].filter(Boolean).join(' ')}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button" onClick={() => luu(false)} disabled={khongLuuDuoc || busy} className={nutChinh}
          title={khongLuuDuoc ? 'Chưa lưu được (máy chủ chưa sẵn sàng hoặc không có quyền sửa).' : undefined}
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />} Lưu
        </button>
        <button
          type="button" onClick={() => luu(true)} disabled={khongLuuDuoc || busy || (!s.daDat && !coThayDoiDangCho)} className={nutPhu}
          title={!s.daDat && !coThayDoiDangCho ? 'Đang dùng mặc định rồi.' : 'Bỏ giá trị đã đặt, quay về mặc định ' + chuoiGiaTri(s, s.macDinh)}
        >
          Về mặc định
        </button>
      </div>

      {coThayDoiDangCho && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
          <div className="font-semibold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> Thay đổi sắp có hiệu lực</div>
          <ul className="mt-1 space-y-0.5">
            {cho.map((c, i) => (
              <li key={i}>
                Từ <strong>{ngayVN(c.hieuLucTu)}</strong>: {c.giaTri === null || c.giaTri === undefined ? `về mặc định (${chuoiGiaTri(s, s.macDinh)})` : chuoiGiaTri(s, c.giaTri)}
                {c.nguoiSua ? ` · ${c.nguoiSua}` : ''}{c.lucSua ? ` · đặt lúc ${lucVN(c.lucSua)}` : ''}{c.ghiChu ? ` · ${c.ghiChu}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lichSu.length > 0 && (
        <div>
          <button
            type="button" onClick={() => setMoLichSu((v) => !v)} aria-expanded={moLichSu} aria-controls={idOf(s.khoa, 'ls')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
          >
            <History className="w-3.5 h-3.5" aria-hidden="true" /> Lịch sử ({lichSu.length})
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moLichSu ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {moLichSu && (
            <div id={idOf(s.khoa, 'ls')} className="mt-2 overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left font-semibold px-3 py-1.5 whitespace-nowrap">Lúc sửa</th>
                    <th className="text-left font-semibold px-3 py-1.5">Người sửa</th>
                    <th className="text-right font-semibold px-3 py-1.5">Giá trị</th>
                    <th className="text-left font-semibold px-3 py-1.5 whitespace-nowrap">Hiệu lực từ</th>
                    <th className="text-left font-semibold px-3 py-1.5">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lichSu.map((h, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 whitespace-nowrap text-slate-600">{lucVN(h.lucSua)}</td>
                      <td className="px-3 py-1.5">{h.nguoiSua || '—'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                        {h.giaTri === null || h.giaTri === undefined ? <span className="font-normal text-slate-600">Về mặc định ({chuoiGiaTri(s, s.macDinh)})</span> : chuoiGiaTri(s, h.giaTri)}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{ngayVN(h.hieuLucTu)}</td>
                      <td className="px-3 py-1.5 text-slate-600">{h.ghiChu || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
