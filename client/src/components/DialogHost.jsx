import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Dialog from './Dialog';
import { registerDialogHost } from '../services/dialogService';

/**
 * Nơi vẽ các hộp xác nhận của appDialog / appConfirm / appAlert (services/dialogService.js).
 * Đặt MỘT lần ở App.jsx. Yêu cầu đến khi đang có hộp mở thì xếp hàng, hộp sau chỉ hiện khi hộp trước đóng.
 */
export default function DialogHost() {
  const [hang, setHang] = useState([]);
  const dem = useRef(0);

  useEffect(() => registerDialogHost((req) => {
    dem.current += 1;
    setHang((h) => [...h, { ...req, _id: dem.current }]);
  }), []);

  const hienTai = hang[0];
  if (!hienTai) return null;

  const xong = (ketQua) => {
    hienTai.resolve(ketQua);
    setHang((h) => h.slice(1));
  };
  return <HopXacNhan key={hienTai._id} req={hienTai} onDone={xong} />;
}

function HopXacNhan({ req, onDone }) {
  const [busy, setBusy] = useState(false);
  const [loi, setLoi] = useState('');
  const {
    title = 'Xác nhận', message, okLabel = 'Đồng ý', cancelLabel = 'Hủy', danger = false, hideCancel = false, run
  } = req;

  const dongY = async () => {
    if (busy) return;
    if (!run) { onDone(true); return; }
    setBusy(true);
    setLoi('');
    try {
      await run();
      onDone(true);
    } catch (e) {
      // Giữ hộp mở để người dùng thấy lỗi và thử lại hoặc huỷ.
      setLoi(e && e.message ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      onClose={() => onDone(false)}
      busy={busy}
      onEnter={dongY}
      className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-slate-900"
      overlayClassName="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-[55]"
    >
      <div className="flex items-start gap-3">
        {danger && <AlertTriangle className="w-5 h-5 text-rose-700 flex-shrink-0 mt-0.5" aria-hidden="true" />}
        <div className="min-w-0">
          <h3 className="font-bold text-sm">{title}</h3>
          {message && <p className="text-xs text-slate-600 mt-1.5 whitespace-pre-line leading-relaxed">{message}</p>}
        </div>
      </div>

      {loi && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5">{loi}</div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        {!hideCancel && (
          <button
            type="button"
            onClick={() => onDone(false)}
            disabled={busy}
            className="border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          data-autofocus
          onClick={dongY}
          disabled={busy}
          className={`flex items-center justify-center gap-1.5 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-60 ${
            danger ? 'bg-rose-700 hover:bg-rose-800' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {okLabel}
        </button>
      </div>
    </Dialog>
  );
}
