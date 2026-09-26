import React, { useState, useRef, useEffect } from 'react';
import { Building2, ShieldCheck, LogOut, KeyRound, X, Loader2, CheckCircle2, AlertCircle, ArrowLeft, ChevronDown } from 'lucide-react';
import { api } from '../services/api';
import { ROLE_LABELS } from '../services/auth';
import KarofiMark from './KarofiMark';
import { appKhacDungDuoc } from '../services/karofiSession';

export default function Header({ user, currentBU, setCurrentBU, bus, onLogout }) {
  const [showPinDialog, setShowPinDialog] = useState(false);
  // Đọc một lần khi dựng: khối quyền nằm trong token, không đổi giữa các lần vẽ.
  const [appKhac] = useState(() => appKhacDungDuoc('FC'));

  return (
    <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-950 text-white shadow-md border-b border-blue-700 sticky top-0 z-30">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">

        {/* Logo & Title — 1 dòng duy nhất */}
        <div className="flex items-center space-x-3 min-w-0">
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
          {/* Chuyển sang app khác mà người này được vào, không phải đi vòng qua
              cổng. Chỉ hiện khi đang dùng phiên chung — đăng nhập riêng bằng
              ?direct=1 thì không có khối quyền nên mảng rỗng và không hiện gì. */}
          {appKhac.map(a => (
            <a
              key={a.key}
              href={a.href}
              title={'Sang ' + a.ten}
              className="text-xs text-blue-200 hover:text-white whitespace-nowrap border border-blue-600/40 rounded-lg px-2 py-1.5 hidden md:inline-block"
            >
              {a.nhan}
            </a>
          ))}
          <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner flex-shrink-0">
            <KarofiMark className="w-5 h-5 text-blue-300" />
          </div>
          <h1 className="text-base font-bold tracking-tight text-white whitespace-nowrap truncate">
            Karofi FC <span className="font-normal text-blue-300">- SOP Plan</span>
          </h1>
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

          {/* Người đang đăng nhập + Đổi PIN + Đăng xuất — gộp 1 nhóm menu */}
          <UserMenu user={user} onOpenPin={() => setShowPinDialog(true)} onLogout={onLogout} />

        </div>
      </div>

      {showPinDialog && <ChangePinDialog onClose={() => setShowPinDialog(false)} />}
    </header>
  );
}

function UserMenu({ user, onOpenPin, onLogout }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickFora(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-blue-950/40 border border-blue-600/40 rounded-lg pl-3 pr-2 py-1.5 shadow-inner hover:bg-blue-800/60 transition"
      >
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <div className="leading-tight text-left">
          <div className="text-sm font-semibold text-white">{user?.full_name}</div>
          <div className="text-[10px] text-blue-200">{ROLE_LABELS[user?.role] || user?.role}</div>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-blue-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-lg shadow-2xl border border-slate-200 py-1 z-40 text-slate-800 overflow-hidden">
          <button
            onClick={() => { setOpen(false); onOpenPin(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50"
          >
            <KeyRound className="w-3.5 h-3.5 text-blue-600" /> Đổi mã PIN
          </button>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-rose-50 text-rose-700"
          >
            <LogOut className="w-3.5 h-3.5" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
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
