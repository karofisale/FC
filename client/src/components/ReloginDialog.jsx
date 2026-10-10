import React, { useState } from 'react';
import { KeyRound, User, AlertCircle, Loader2, LogOut } from 'lucide-react';
import Dialog from './Dialog';
import { login } from '../services/auth';

/**
 * Hộp ĐĂNG NHẬP LẠI khi hết phiên (Rà soát 4 app, Đợt 3 mục 1).
 *
 * Trước đây hết phiên là app gỡ cả trang về màn Login — mọi số đang nhập dở (lưới Forecast, Thực hiện, Kế hoạch năm...) mất sạch.
 * Giờ hộp này nằm ĐÈ lên trang đang mở: các trang giữ nguyên state ở bên dưới, đăng nhập xong thì làm tiếp.
 *
 * Không đóng được bằng Esc / bấm nền (phải đăng nhập hoặc đăng xuất) — chỉ Dialog dùng chung lo focus, Tab xoay vòng, role=dialog.
 * Thao tác đang dở lúc hết phiên (lưu, gửi duyệt...) KHÔNG được tự chạy lại: một lượt lưu có thể đã tới server hay chưa là điều
 * client không biết chắc, nên người dùng bấm lại — hộp nói rõ điều đó.
 *
 * `userId`: người đang dùng app. Đăng nhập bằng NGƯỜI KHÁC thì dữ liệu đang hiện thuộc quyền người cũ -> báo ra qua onSuccess(user)
 * để App nạp lại từ đầu thay vì giữ trang.
 */
export default function ReloginDialog({ userId, thongBao, onSuccess, onLogout }) {
  const [ma, setMa] = useState(userId || '');
  const [pin, setPin] = useState('');
  const [loi, setLoi] = useState('');
  const [busy, setBusy] = useState(false);

  const gui = async (e) => {
    e.preventDefault();
    if (busy || !ma.trim() || !pin) return;
    setBusy(true);
    setLoi('');
    try {
      const user = await login(ma, pin);
      setPin('');
      onSuccess(user);
    } catch (err) {
      setLoi(err.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      as="form"
      onSubmit={gui}
      onClose={() => {}}
      busy={busy}
      label="Phiên đăng nhập đã hết hạn"
      className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4 text-slate-900"
      overlayClassName="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-50"
    >
      <div>
        <h3 className="font-bold text-sm">Phiên đăng nhập đã hết hạn</h3>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          {thongBao || 'Đăng nhập lại để tiếp tục.'}{' '}
          Các số đang nhập trên màn hình <strong>vẫn còn nguyên</strong>. Sau khi đăng nhập, thao tác vừa rồi (nếu có) chưa chắc đã được ghi —
          hãy bấm lại và kiểm tra kết quả.
        </p>
      </div>

      {loi && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{loi}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="relogin-user" className="text-xs font-semibold text-slate-700 block">Mã người dùng hoặc email</label>
        <div className="relative">
          <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
          <input
            id="relogin-user"
            type="text"
            autoComplete="username"
            value={ma}
            onChange={(e) => setMa(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="relogin-pin" className="text-xs font-semibold text-slate-700 block">Mã PIN</label>
        <div className="relative">
          <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
          <input
            id="relogin-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            data-autofocus
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm tracking-[0.3em] font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-between pt-1">
        <button
          type="button"
          onClick={onLogout}
          disabled={busy}
          className="inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" /> Đăng xuất
        </button>
        <button
          type="submit"
          disabled={busy || !ma.trim() || !pin}
          className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          Đăng nhập lại
        </button>
      </div>
    </Dialog>
  );
}
