import React, { useState } from 'react';
import { Building2, ShieldCheck, LogOut, KeyRound, X, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { api } from '../services/api';
import { ROLE_LABELS } from '../services/auth';
import KarofiMark from './KarofiMark';

export default function Header({ user, currentBU, setCurrentBU, bus, onLogout }) {
  const [showPinDialog, setShowPinDialog] = useState(false);

  return (
    <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-950 text-white shadow-md border-b border-blue-700 sticky top-0 z-30">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">

        {/* Logo & Title */}
        <div className="flex items-center space-x-3">
          {/* Đường về cổng. Cần thiết vì khi chạy như ứng dụng đã cài, cửa sổ
              không có nút back của trình duyệt. */}
          <a
            href="/VHKD/"
            title="Về Karofi Portal"
            className="flex items-center gap-1 text-xs text-blue-200 hover:text-white whitespace-nowrap border border-blue-600/40 rounded-lg px-2 py-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Portal</span>
          </a>
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
            <KarofiMark className="w-6 h-6 text-blue-300" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              KAROFI SALES FORECAST
              <span className="bg-blue-500/20 text-blue-200 border border-blue-400/30 text-[10px] px-2 py-0.5 rounded font-mono uppercase">
                v3.0 2026
              </span>
            </h1>
            <p className="text-xs text-blue-200">Hệ thống Lập &amp; Thẩm định Kế hoạch Kinh doanh Karofi</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">

          {/* Chọn đơn vị — chỉ hiện những đơn vị người dùng được phép */}
          {bus.length > 1 ? (
            <div className="flex items-center bg-blue-950/40 border border-blue-600/40 rounded-lg px-3 py-1.5 shadow-inner">
              <Building2 className="w-4 h-4 text-blue-400 mr-2" />
              <span className="text-xs text-blue-200 mr-2">Đơn vị:</span>
              <select
                value={currentBU}
                onChange={(e) => setCurrentBU(e.target.value)}
                className="bg-transparent text-sm font-semibold text-white outline-none cursor-pointer pr-2"
              >
                {bus.map((b) => (
                  <option key={b.code} value={b.code} className="bg-slate-900 text-white">
                    {b.code} - {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center bg-blue-950/40 border border-blue-600/40 rounded-lg px-3 py-1.5 shadow-inner">
              <Building2 className="w-4 h-4 text-blue-400 mr-2" />
              <span className="text-sm font-semibold text-white">{currentBU || '—'}</span>
            </div>
          )}

          {/* Người đang đăng nhập — lấy từ phiên, không cho tự chọn */}
          <div className="flex items-center bg-blue-950/40 border border-blue-600/40 rounded-lg px-3 py-1.5 shadow-inner">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mr-2" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">{user?.full_name}</div>
              <div className="text-[10px] text-blue-200">{ROLE_LABELS[user?.role] || user?.role}</div>
            </div>
          </div>

          <button
            onClick={() => setShowPinDialog(true)}
            title="Đổi mã PIN"
            className="p-2 rounded-lg bg-blue-950/40 border border-blue-600/40 hover:bg-blue-800/60 transition"
          >
            <KeyRound className="w-4 h-4 text-blue-300" />
          </button>

          <button
            onClick={onLogout}
            title="Đăng xuất"
            className="p-2 rounded-lg bg-blue-950/40 border border-blue-600/40 hover:bg-rose-900/60 transition"
          >
            <LogOut className="w-4 h-4 text-blue-200" />
          </button>

        </div>
      </div>

      {showPinDialog && <ChangePinDialog onClose={() => setShowPinDialog(false)} />}
    </header>
  );
}

function ChangePinDialog({ onClose }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setResult(null);

    if (newPin !== confirmPin) {
      setResult({ ok: false, text: 'Hai lần nhập PIN mới không giống nhau.' });
      return;
    }
    if (newPin === currentPin) {
      setResult({ ok: false, text: 'PIN mới phải khác PIN hiện tại.' });
      return;
    }

    setBusy(true);
    try {
      const res = await api.changeMyPin(currentPin, newPin);
      setResult({ ok: true, text: res.message || 'Đã đổi PIN.' });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const field = (id, label, value, onChange) => (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-semibold text-slate-700 block">{label}</label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        maxLength={12}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono tracking-[0.25em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4 text-slate-900">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-sm">Đổi mã PIN</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tối thiểu 6 chữ số, không dùng dãy trùng hoặc liên tiếp.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {result && (
          <div className={`text-xs rounded-lg p-2.5 flex items-start gap-2 border ${
            result.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {result.ok
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
            <span>{result.text}</span>
          </div>
        )}

        {field('pin-current', 'PIN hiện tại', currentPin, setCurrentPin)}
        {field('pin-new', 'PIN mới', newPin, setNewPin)}
        {field('pin-confirm', 'Nhập lại PIN mới', confirmPin, setConfirmPin)}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-slate-300 text-slate-700 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50"
          >
            Đóng
          </button>
          <button
            type="submit"
            disabled={busy || !currentPin || !newPin || !confirmPin}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-bold"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Đổi PIN
          </button>
        </div>
      </form>
    </div>
  );
}
