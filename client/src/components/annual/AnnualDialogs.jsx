import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { dinhDangSo } from '../../utils/annualPlanModel';

function Khung({ title, onClose, children, rong }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${rong ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-bold text-sm text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto text-sm">{children}</div>
      </div>
    </div>
  );
}

const nhan = 'block text-[11px] font-semibold text-slate-600 mb-1';
const o = 'w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-blue-500';
const nutChinh = 'bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5 rounded-lg';
const nutPhu = 'border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg';

/** Hỏi một dòng lý do (từ chối kế hoạch / lưu bản Final). */
export function ReasonDialog({ title, label, confirmLabel, onConfirm, onClose }) {
  const [text, setText] = useState('');
  return (
    <Khung title={title} onClose={onClose}>
      <label className={nhan}>{label}</label>
      <textarea className={o} rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="flex justify-end gap-2 mt-3">
        <button className={nutPhu} onClick={onClose}>Hủy</button>
        <button className={nutChinh} disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>{confirmLabel}</button>
      </div>
    </Khung>
  );
}

export function AddCustomerDialog({ market, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [thiTruong, setThiTruong] = useState('');
  const can = name.trim() && (!market || thiTruong.trim());
  return (
    <Khung title="Thêm khách hàng" onClose={onClose}>
      <div className="space-y-3">
        <div><label className={nhan}>Tên khách *</label><input className={o} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div><label className={nhan}>Mã khách (Search Code / Short Name) — để trống nếu chưa có</label><input className={o} value={code} onChange={(e) => setCode(e.target.value)} /></div>
        {market && <div><label className={nhan}>Thị trường *</label><input className={o} value={thiTruong} onChange={(e) => setThiTruong(e.target.value)} /></div>}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className={nutPhu} onClick={onClose}>Hủy</button>
        <button className={nutChinh} disabled={!can} onClick={() => onAdd({ name: name.trim(), code: code.trim(), market: thiTruong.trim() })}>Thêm khách</button>
      </div>
    </Khung>
  );
}

/** Thêm SKU cho một khách: chọn SKU tương tự đã có trong bảng, hoặc tạo SKU mới (tên, mô tả, đơn giá VNĐ). */
export function AddSkuDialog({ customerName, existing, onAdd, onClose }) {
  const [tab, setTab] = useState('co');
  const [q, setQ] = useState('');
  const [chon, setChon] = useState(null);
  const [moi, setMoi] = useState({ code: '', name: '', description: '', price: '' });
  const ds = useMemo(() => {
    const t = q.trim().toLowerCase();
    return existing.filter((s) => !t || (s.skuCode || s.tempSkuId).toLowerCase().includes(t) || (s.skuName || '').toLowerCase().includes(t)).slice(0, 60);
  }, [existing, q]);
  const hopLeMoi = moi.name.trim() && Number(moi.price) >= 0 && moi.price !== '';
  return (
    <Khung title={'Thêm SKU cho ' + (customerName || 'đơn vị')} onClose={onClose} rong>
      <div className="flex gap-1 mb-3">
        {[['co', 'Chọn SKU có trong bảng'], ['moi', 'SKU mới']].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${tab === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
        ))}
      </div>
      {tab === 'co' ? (
        <>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input className={o + ' pl-8'} placeholder="Tìm theo mã hoặc tên SKU…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
            {ds.map((s) => {
              const k = s.skuCode || s.tempSkuId;
              return (
                <button key={k} onClick={() => setChon(s)} className={`w-full text-left px-3 py-1.5 text-xs flex justify-between gap-2 ${chon && (chon.skuCode || chon.tempSkuId) === k ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className="truncate"><b className="font-mono">{k}</b> {s.skuName}</span>
                  <span className="font-mono text-slate-500 shrink-0">{dinhDangSo(s.priceVnd)}đ</span>
                </button>
              );
            })}
            {!ds.length && <div className="text-xs text-slate-400 p-3">Không có SKU phù hợp.</div>}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className={nutPhu} onClick={onClose}>Hủy</button>
            <button className={nutChinh} disabled={!chon} onClick={() => onAdd({ skuCode: chon.skuCode, tempSkuId: chon.tempSkuId, skuName: chon.skuName, priceVnd: chon.priceVnd })}>Thêm SKU</button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={nhan}>Mã SAP (nếu đã có)</label><input className={o} value={moi.code} onChange={(e) => setMoi({ ...moi, code: e.target.value })} placeholder="để trống = mã tạm" /></div>
              <div><label className={nhan}>Đơn giá (VNĐ) *</label><input className={o} inputMode="numeric" value={moi.price} onChange={(e) => setMoi({ ...moi, price: e.target.value.replace(/[^\d]/g, '') })} /></div>
            </div>
            <div><label className={nhan}>Tên SKU *</label><input className={o} value={moi.name} onChange={(e) => setMoi({ ...moi, name: e.target.value })} /></div>
            <div><label className={nhan}>Mô tả ngắn</label><input className={o} value={moi.description} onChange={(e) => setMoi({ ...moi, description: e.target.value })} /></div>
            <p className="text-[11px] text-slate-500">SKU chưa có mã SAP dùng mã tạm; chưa nạp được sang Forecast hàng tháng cho tới khi có mã chính thức.</p>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className={nutPhu} onClick={onClose}>Hủy</button>
            <button className={nutChinh} disabled={!hopLeMoi} onClick={() => onAdd({
              skuCode: moi.code.trim(), tempSkuId: moi.code.trim() ? '' : 'NEW-' + Date.now().toString(36).toUpperCase(),
              skuName: moi.name.trim(), priceVnd: Number(moi.price), description: moi.description.trim()
            })}>Thêm SKU</button>
          </div>
        </>
      )}
    </Khung>
  );
}

/** Xóa hàng loạt mặt hàng nhỏ: ngưỡng chỉnh được, xem trước số dòng sẽ bị xóa. */
export function MassDeleteDialog({ preview, onConfirm, onClose }) {
  const [nguongMay, setNguongMay] = useState('100');
  const [nguongLk, setNguongLk] = useState('1000');
  const [giaKhong, setGiaKhong] = useState(true);
  const opts = { nguongMay: Number(nguongMay) || 0, nguongLinhKien: Number(nguongLk) || 0, xoaGiaKhong: giaKhong };
  const ds = preview(opts);
  return (
    <Khung title="Xóa hàng loạt mặt hàng nhỏ" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className={nhan}>Máy: tổng SL năm nhỏ hơn</label><input className={o} inputMode="numeric" value={nguongMay} onChange={(e) => setNguongMay(e.target.value.replace(/[^\d]/g, ''))} /></div>
        <div><label className={nhan}>Linh kiện: tổng SL năm nhỏ hơn</label><input className={o} inputMode="numeric" value={nguongLk} onChange={(e) => setNguongLk(e.target.value.replace(/[^\d]/g, ''))} /></div>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-700 mb-3"><input type="checkbox" checked={giaKhong} onChange={(e) => setGiaKhong(e.target.checked)} /> Xóa cả các dòng có đơn giá = 0</label>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
        Sẽ xóa <b>{ds.length}</b> dòng. Doanh thu của chúng được dồn lại cho các dòng còn lại để tổng từng tháng không đổi.
        {ds.length > 0 && <div className="mt-2 max-h-32 overflow-y-auto font-mono text-[10px] text-slate-500">{ds.slice(0, 40).map((l) => <div key={l.key}>{l.key}</div>)}{ds.length > 40 ? <div>… và {ds.length - 40} dòng nữa</div> : null}</div>}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button className={nutPhu} onClick={onClose}>Hủy</button>
        <button className={nutChinh} disabled={!ds.length} onClick={() => onConfirm(opts)}>Xóa {ds.length} dòng</button>
      </div>
    </Khung>
  );
}

/** Chọn cách chia phần chênh khi sửa tỷ trọng một tháng. */
export function ShareModeBar({ mode, setMode, months, setMonths, nhan: nhanThang }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-slate-600">Khi sửa tỷ trọng, phần chênh:</span>
      <label className="flex items-center gap-1"><input type="radio" checked={mode === 'deu'} onChange={() => setMode('deu')} /> chia đều cho các tháng còn lại</label>
      <label className="flex items-center gap-1"><input type="radio" checked={mode === 'chiDinh'} onChange={() => setMode('chiDinh')} /> dồn vào các tháng:</label>
      {mode === 'chiDinh' && nhanThang.map((t, i) => (
        <button key={t} onClick={() => setMonths(months.includes(i) ? months.filter((x) => x !== i) : months.concat([i]))}
          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${months.includes(i) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'}`}>{t}</button>
      ))}
    </div>
  );
}
