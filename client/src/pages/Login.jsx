import React, { useState } from 'react';
import { KeyRound, User, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { login } from '../services/auth';

export default function Login({ onSuccess }) {
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const user = await login(userId, pin);
      setPin('');
      onSuccess(user);
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm">

        {/* Nhận diện hệ thống */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-3">
            <span className="font-black text-2xl text-cyan-300 tracking-tighter">K</span>
          </div>
          <h1 className="text-white text-lg font-bold tracking-tight">KAROFI SALES FORECAST</h1>
          <p className="text-blue-300 text-xs mt-1">Hệ thống Lập &amp; Thẩm định Kế hoạch Kinh doanh</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4"
        >
          <div>
            <h2 className="text-sm font-bold text-slate-900">Đăng nhập</h2>
            <p className="text-xs text-slate-500 mt-0.5">Dùng mã người dùng và mã PIN được cấp.</p>
          </div>

          {error && (
            <div
              role="alert"
              className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="fc-user" className="text-xs font-semibold text-slate-700 block">
              Mã người dùng hoặc email
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="fc-user"
                type="text"
                autoComplete="username"
                autoFocus
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="vd: u-gt2-ed"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="fc-pin" className="text-xs font-semibold text-slate-700 block">
              Mã PIN
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="fc-pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                maxLength={12}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm tracking-[0.3em] font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !userId || !pin}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold shadow transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {busy ? 'Đang kiểm tra...' : 'Đăng nhập'}
          </button>

          <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
            Sai PIN 5 lần liên tiếp, tài khoản sẽ bị khoá 15 phút. Quên PIN hoặc cần cấp tài khoản:
            liên hệ quản trị hệ thống của bộ phận Vận hành Kinh doanh.
          </p>
        </form>

        <p className="text-center text-[11px] text-blue-300/70 mt-4">
          Không chia sẻ mã PIN. Mỗi người một tài khoản riêng để truy vết được ai sửa số nào.
        </p>
      </div>
    </div>
  );
}
