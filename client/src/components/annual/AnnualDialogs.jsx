import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { dinhDangSo, dinhDangGia, NHAN_THANG } from '../../utils/annualPlanModel';
import { apDungBangDoanhThu } from '../../utils/annualPlanSkuOps';

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

export function AddCustomerDialog({ market, onAdd, onClose, thiTruongDs, tenDaCo }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [thiTruong, setThiTruong] = useState('');
  const [khac, setKhac] = useState(false);           // chọn "Thị trường khác…" để gõ tên thị trường mới
  const chonTT = Array.isArray(thiTruongDs);          // Export OEM: KHÁCH MỚI = tên ngắn + thị trường (không ghi vào danh mục khách của các app)
  const trung = chonTT && name.trim() && (tenDaCo || []).some((t) => String(t).trim().toLowerCase() === name.trim().toLowerCase());
  const can = name.trim() && (!market || thiTruong.trim()) && !trung;
  return (
    <Khung title={chonTT ? 'Thêm khách mới' : 'Thêm khách hàng'} onClose={onClose}>
      <div className="space-y-3">
        {chonTT && <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Khách mới chỉ nằm trong kế hoạch này (không ghi vào danh mục khách hàng của các app). Dòng khách sẽ nằm trong nhóm thị trường đã chọn.</p>}
        <div><label className={nhan}>{chonTT ? 'Tên ngắn của khách mới *' : 'Tên khách *'}</label><input className={o} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {trung && <div className="text-[11px] text-rose-600 mt-1">Đã có khách tên này trong bảng.</div>}</div>
        {!chonTT && <div><label className={nhan}>Mã khách (Search Code / Short Name) — để trống nếu chưa có</label><input className={o} value={code} onChange={(e) => setCode(e.target.value)} /></div>}
        {market && chonTT && (
          <div>
            <label className={nhan}>Thị trường *</label>
            <select className={o} value={khac ? '__khac' : thiTruong} onChange={(e) => { if (e.target.value === '__khac') { setKhac(true); setThiTruong(''); } else { setKhac(false); setThiTruong(e.target.value); } }}>
              <option value="">— chọn thị trường —</option>
              {thiTruongDs.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="__khac">＋ Thị trường khác…</option>
            </select>
            {khac && <input className={o + ' mt-2'} placeholder="Gõ tên thị trường mới" value={thiTruong} onChange={(e) => setThiTruong(e.target.value)} />}
          </div>
        )}
        {market && !chonTT && <div><label className={nhan}>Thị trường *</label><input className={o} value={thiTruong} onChange={(e) => setThiTruong(e.target.value)} /></div>}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className={nutPhu} onClick={onClose}>Hủy</button>
        <button className={nutChinh} disabled={!can} onClick={() => onAdd({ name: name.trim(), code: code.trim(), market: thiTruong.trim() })}>Thêm khách</button>
      </div>
    </Khung>
  );
}

/** Thêm SKU cho một khách: chọn SKU tương tự đã có trong bảng, hoặc tạo SKU mới (tên, mô tả, đơn giá VNĐ). */
export function AddSkuDialog({ customerName, existing, onAdd: onAddGoc, onClose, tien, tim, khach, khachChonSan }) {
  // khach (tuỳ chọn) = [{ key, name }]: cho chọn MỘT HOẶC NHIỀU khách để thêm dòng; onAdd(du, [khóa khách đã chọn])
  const [dsKhach, setDsKhach] = useState(() => new Set(khachChonSan || []));
  const onAdd = (du) => onAddGoc(du, Array.from(dsKhach));
  const thieuKhach = !!khach && dsKhach.size === 0;
  const usd = !!(tien && tien.loai === 'USD' && tien.fx > 0);
  const [tab, setTab] = useState(tim ? 'dm' : 'co');
  // --- tab "Danh mục": tìm SKU trong danh mục (Export / OEM Products), chọn rồi chỉnh đơn giá nếu cần
  const [qDm, setQDm] = useState('');
  const [kqDm, setKqDm] = useState({ items: [], canhBao: '' });
  const [dangTim, setDangTim] = useState(false);
  const [loiTim, setLoiTim] = useState('');
  const [chonDm, setChonDm] = useState(null);
  const [giaDm, setGiaDm] = useState('');
  useEffect(() => {
    if (tab !== 'dm' || !tim) return undefined;
    const t = qDm.trim();
    if (t.length < 2) { setKqDm({ items: [], canhBao: '' }); setLoiTim(''); return undefined; }
    let huy = false;
    const h = setTimeout(async () => {
      setDangTim(true); setLoiTim('');
      try { const r = await tim(t); if (!huy) setKqDm({ items: r.items || [], canhBao: r.canhBao || '' }); }
      catch (e) { if (!huy) setLoiTim(e.message || String(e)); }
      finally { if (!huy) setDangTim(false); }
    }, 300);
    return () => { huy = true; clearTimeout(h); };
  }, [qDm, tab, tim]);
  const chonSkuDm = (s) => {
    setChonDm(s);
    setGiaDm(usd ? String(Math.round((s.priceVnd / tien.fx) * 100) / 100) : String(Math.round(s.priceVnd)));
  };
  const giaDmNum = parseFloat(String(giaDm).replace(',', '.'));
  const giaDmVnd = usd ? Math.round(giaDmNum * tien.fx) : Math.round(giaDmNum);
  const [q, setQ] = useState('');
  const [chon, setChon] = useState(null);
  const [moi, setMoi] = useState({ code: '', name: '', description: '', price: '', category: '' });
  const ds = useMemo(() => {
    const t = q.trim().toLowerCase();
    return existing.filter((s) => !t || (s.skuCode || s.tempSkuId).toLowerCase().includes(t) || (s.skuName || '').toLowerCase().includes(t)).slice(0, 60);
  }, [existing, q]);
  const gia = parseFloat(String(moi.price).replace(',', '.'));
  const hopLeMoi = moi.name.trim() && isFinite(gia) && gia >= 0 && moi.price !== '';
  const giaVnd = usd ? Math.round(gia * tien.fx) : Math.round(gia);
  return (
    <Khung title={khach ? 'Thêm SKU cho một hoặc nhiều khách' : 'Thêm SKU cho ' + (customerName || 'đơn vị')} onClose={onClose} rong>
      {khach && (
        <div className="mb-3 border border-slate-200 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-600">Thêm SKU cho {dsKhach.size}/{khach.length} khách</span>
            <span className="text-[11px] flex gap-2">
              <button className="underline text-blue-600" onClick={() => setDsKhach(new Set(khach.map((k) => k.key)))}>Chọn tất cả</button>
              <button className="underline text-slate-500" onClick={() => setDsKhach(new Set())}>Bỏ chọn</button>
            </span>
          </div>
          <div className="max-h-24 overflow-y-auto grid grid-cols-2 gap-x-3">
            {khach.map((k) => (
              <label key={k.key} className="flex items-center gap-1.5 text-xs truncate">
                <input type="checkbox" checked={dsKhach.has(k.key)} onChange={() => setDsKhach((s) => { const n = new Set(s); if (n.has(k.key)) n.delete(k.key); else n.add(k.key); return n; })} />
                <span className="truncate" title={k.name}>{k.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-1 mb-3">
        {[...(tim ? [['dm', 'Tìm trong danh mục']] : []), ['co', 'SKU có trong bảng'], ['moi', 'SKU mới (nhập tay)']].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${tab === k ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
        ))}
      </div>
      {tab === 'dm' ? (
        <>
          <div className="relative mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input className={o + ' pl-8'} placeholder="Gõ mã, tên, model hoặc nhóm sản phẩm (từ 2 ký tự)…" value={qDm} onChange={(e) => setQDm(e.target.value)} autoFocus />
            {dangTim && <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400 animate-spin" />}
          </div>
          {loiTim && <div className="text-xs text-rose-600 mb-2">{loiTim}</div>}
          {kqDm.canhBao && <div className="text-[11px] text-amber-700 mb-2">{kqDm.canhBao}</div>}
          <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
            {kqDm.items.map((s) => (
              <button key={s.code} onClick={() => chonSkuDm(s)} className={`w-full text-left px-3 py-1.5 text-xs flex justify-between gap-2 ${chonDm && chonDm.code === s.code ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <span className="truncate">
                  <b className="font-mono">{s.code}</b> {s.name}
                  {s.category ? <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-600 rounded px-1">{s.category}</span> : null}
                </span>
                <span className="font-mono text-slate-500 shrink-0">{s.priceVnd > 0 ? dinhDangGia(s.priceVnd, tien ? tien.loai : 'VND', tien ? tien.fx : 0) : 'chưa có giá'}</span>
              </button>
            ))}
            {!kqDm.items.length && <div className="text-xs text-slate-400 p-3">{qDm.trim().length < 2 ? 'Gõ ít nhất 2 ký tự để tìm.' : (dangTim ? 'Đang tìm…' : 'Không có SKU phù hợp.')}</div>}
          </div>
          {chonDm && (
            <div className="mt-3 flex items-end gap-3">
              <div className="grow min-w-0"><div className="text-[11px] text-slate-500">Đã chọn</div><div className="text-xs font-semibold truncate"><span className="font-mono">{chonDm.code}</span> {chonDm.name}</div></div>
              <div className="w-40"><label className={nhan}>Đơn giá ({usd ? 'USD' : 'VNĐ'}) — sửa được</label><input className={o} inputMode="decimal" value={giaDm} onChange={(e) => setGiaDm(e.target.value.replace(/[^\d.,]/g, ''))} /></div>
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-2">Đơn giá gợi ý là giá đề xuất trong danh mục; sửa lại nếu giá bán thực khác.</p>
          <div className="flex justify-end gap-2 mt-3">
            <button className={nutPhu} onClick={onClose}>Hủy</button>
            <button className={nutChinh} disabled={thieuKhach || !chonDm || !isFinite(giaDmNum) || giaDmNum < 0 || giaDm === ''} onClick={() => onAdd({ skuCode: chonDm.code, tempSkuId: '', skuName: chonDm.name, priceVnd: giaDmVnd, category: chonDm.category || '' })}>Thêm SKU</button>
          </div>
        </>
      ) : tab === 'co' ? (
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
            <button className={nutChinh} disabled={thieuKhach || !chon} onClick={() => onAdd({ skuCode: chon.skuCode, tempSkuId: chon.tempSkuId, skuName: chon.skuName, priceVnd: chon.priceVnd })}>Thêm SKU</button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={nhan}>Mã SAP (nếu đã có)</label><input className={o} value={moi.code} onChange={(e) => setMoi({ ...moi, code: e.target.value })} placeholder="để trống = mã tạm" /></div>
              <div><label className={nhan}>Đơn giá ({usd ? 'USD' : 'VNĐ'}) *</label><input className={o} inputMode="decimal" value={moi.price} onChange={(e) => setMoi({ ...moi, price: e.target.value.replace(/[^\d.,]/g, '') })} /></div>
            </div>
            <div><label className={nhan}>Tên SKU *</label><input className={o} value={moi.name} onChange={(e) => setMoi({ ...moi, name: e.target.value })} /></div>
            <div><label className={nhan}>Mô tả ngắn</label><input className={o} value={moi.description} onChange={(e) => setMoi({ ...moi, description: e.target.value })} /></div>
            <div><label className={nhan}>Nhóm / Category (tùy chọn — để SKU hiện đúng nhóm ở bảng Theo SKU)</label><input className={o} value={moi.category} onChange={(e) => setMoi({ ...moi, category: e.target.value })} /></div>
            <p className="text-[11px] text-slate-500">SKU chưa có mã SAP dùng mã tạm; chưa nạp được sang Forecast hàng tháng cho tới khi có mã chính thức.</p>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className={nutPhu} onClick={onClose}>Hủy</button>
            <button className={nutChinh} disabled={thieuKhach || !hopLeMoi} onClick={() => onAdd({
              skuCode: moi.code.trim(), tempSkuId: moi.code.trim() ? '' : 'NEW-' + Date.now().toString(36).toUpperCase(),
              skuName: moi.name.trim(), priceVnd: giaVnd, description: moi.description.trim(), category: moi.category.trim()
            })}>Thêm SKU</button>
          </div>
        </>
      )}
    </Khung>
  );
}

/**
 * Xóa hàng loạt: các tiêu chí là Ô TICK ĐỘC LẬP (dòng thỏa bất kỳ tiêu chí nào đang bật thì bị xóa), xem trước số dòng sẽ bị xóa.
 *  - Mặt hàng nhỏ: máy / linh kiện có tổng SL năm dưới ngưỡng (chỉnh được).
 *  - Hàng FOC: đơn giá = 0 hoặc tổng giá (doanh thu cả năm của dòng) = 0.
 *  - Hàng thanh lý (chỉ đơn vị OEM, khi có coThanhLy): SKU thuộc nhóm "thanh lý" (Nhóm sản phẩm trong Products hoặc trong doanh thu).
 */
export function MassDeleteDialog({ preview, onConfirm, onClose, coThanhLy = false, soThanhLy = 0 }) {
  const [xoaNho, setXoaNho] = useState(true);
  const [nguongMay, setNguongMay] = useState('100');
  const [nguongLk, setNguongLk] = useState('1000');
  const [xoaFoc, setXoaFoc] = useState(true);
  const [xoaThanhLy, setXoaThanhLy] = useState(false);
  const opts = { xoaNho, nguongMay: Number(nguongMay) || 0, nguongLinhKien: Number(nguongLk) || 0, xoaFoc, xoaGiaKhong: false, xoaThanhLy: coThanhLy && xoaThanhLy };
  const ds = (xoaNho || xoaFoc || opts.xoaThanhLy) ? preview(opts) : [];
  return (
    <Khung title="Xóa hàng loạt" onClose={onClose}>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-2"><input type="checkbox" checked={xoaNho} onChange={(e) => setXoaNho(e.target.checked)} /> Xóa mặt hàng nhỏ</label>
      <div className={`grid grid-cols-2 gap-3 mb-3 pl-6 ${xoaNho ? '' : 'opacity-40'}`}>
        <div><label className={nhan}>Máy: tổng SL năm nhỏ hơn</label><input className={o} inputMode="numeric" disabled={!xoaNho} value={nguongMay} onChange={(e) => setNguongMay(e.target.value.replace(/[^\d]/g, ''))} /></div>
        <div><label className={nhan}>Linh kiện: tổng SL năm nhỏ hơn</label><input className={o} inputMode="numeric" disabled={!xoaNho} value={nguongLk} onChange={(e) => setNguongLk(e.target.value.replace(/[^\d]/g, ''))} /></div>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1"><input type="checkbox" checked={xoaFoc} onChange={(e) => setXoaFoc(e.target.checked)} /> Xóa hàng FOC</label>
      <p className="text-[11px] text-slate-500 pl-6 mb-3">FOC = đơn giá bằng 0, hoặc tổng giá (doanh thu cả năm của dòng) bằng 0.</p>
      {coThanhLy && (
        <>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 mb-1"><input type="checkbox" checked={xoaThanhLy} onChange={(e) => setXoaThanhLy(e.target.checked)} /> Xóa hàng thanh lý</label>
          <p className="text-[11px] text-slate-500 pl-6 mb-3">Hàng thanh lý = SKU có "Nhóm sản phẩm" chứa "thanh lý" trong Products của OEM, hoặc "Nhóm sản phẩm" trong dữ liệu doanh thu khi Products chưa có. Hiện có {soThanhLy} dòng thuộc nhóm này.</p>
        </>
      )}
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

/** Sửa mã / tên SKU cho TOÀN BỘ khách có SKU đó. Có thể tìm mã đúng trong danh mục (tim) rồi bấm chọn. */
export function SuaMaSkuDialog({ sku, onSave, onClose, tim }) {
  const [code, setCode] = useState(sku.ma);
  const [name, setName] = useState(sku.ten || '');
  const [q, setQ] = useState('');
  const [kq, setKq] = useState([]);
  const [dangTim, setDangTim] = useState(false);
  useEffect(() => {
    if (!tim) return undefined;
    const t = q.trim();
    if (t.length < 2) { setKq([]); return undefined; }
    let huy = false;
    const h = setTimeout(async () => {
      setDangTim(true);
      try { const r = await tim(t); if (!huy) setKq(r.items || []); } catch (e) { if (!huy) setKq([]); } finally { if (!huy) setDangTim(false); }
    }, 300);
    return () => { huy = true; clearTimeout(h); };
  }, [q, tim]);
  return (
    <Khung title={'Sửa mã SKU ' + sku.ma} onClose={onClose}>
      <p className="text-[11px] text-slate-500 mb-3">Mã và tên mới được áp cho <b>{sku.dong.length}</b> khách có SKU này. Số lượng, đơn giá và ô đã Fix giữ nguyên. Không đổi doanh thu.</p>
      {tim && (
        <div className="mb-3">
          <label className={nhan}>Tìm trong danh mục để chọn mã đúng (không bắt buộc)</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input className={o + ' pl-8'} placeholder="Gõ mã, tên hoặc model…" value={q} onChange={(e) => setQ(e.target.value)} />
            {dangTim && <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400 animate-spin" />}
          </div>
          {kq.length > 0 && (
            <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100 mt-1">
              {kq.map((s) => (
                <button key={s.code} onClick={() => { setCode(s.code); setName(s.name); setQ(''); setKq([]); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 truncate">
                  <b className="font-mono">{s.code}</b> {s.name}{s.category ? <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-600 rounded px-1">{s.category}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div><label className={nhan}>Mã SKU mới *</label><input className={o} value={code} onChange={(e) => setCode(e.target.value)} /></div>
        <div className="col-span-2"><label className={nhan}>Tên SKU</label><input className={o} value={name} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className={nutPhu} onClick={onClose}>Hủy</button>
        <button className={nutChinh} disabled={!code.trim()} onClick={() => onSave({ skuCode: code.trim(), skuName: name.trim() })}>Lưu cho {sku.dong.length} khách</button>
      </div>
    </Khung>
  );
}

/**
 * Tải lên bảng doanh thu khách × tháng (tab Plan_Per_Client của file Xuất Excel, đã sửa): xem trước kết quả rồi áp dụng.
 * state = kế hoạch đầy đủ; info = thông tin khách; nguon = nguồn đơn vị; fmt / nhan = định dạng tiền đang hiển thị.
 */
export function TaiDoanhThuKhachDialog({ state, info, nguon, fmt, nhan: nhanTien, onApply, onClose, catOf }) {
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [bang, setBang] = useState(null);                 // { bang: Map, khongKhop, trung }
  const [tenFile, setTenFile] = useState('');
  const [canBang, setCanBang] = useState(true);
  const chonFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setDang(true); setLoi(''); setBang(null); setTenFile(f.name);
    try {
      const X = await import('../../utils/annualPlanExcel');
      const r = await X.docFileBang(f);
      if (r.loi) { setLoi(r.loi); return; }
      const kh = X.khopBangVoiKhach(r.dong, state, info, nguon);
      if (!kh.bang.size) { setLoi('Không dòng nào khớp với khách trong kế hoạch (so theo Mã khách rồi Tên khách).'); return; }
      setBang(kh);
    } catch (err) { setLoi(err.message || String(err)); } finally { setDang(false); }
  };
  const kq = useMemo(() => (bang ? apDungBangDoanhThu(state, bang.bang, { canBangVeTarget: canBang, catOf }) : null), [bang, state, canBang, catOf]);
  const tenKhach = (k) => { const c = state.customers.find((x) => x.key === k); return (c && c.name) || k; };
  const soKhachDoi = kq ? new Set(kq.thayDoi.map((x) => x.key)).size : 0;
  return (
    <Khung title="Tải Excel doanh thu khách theo tháng" onClose={onClose} rong>
      <p className="text-[11px] text-slate-600 mb-3">
        Bấm <b>Xuất Excel</b> để lấy file, sửa các cột <b>DT KH T1…T12</b> của tab <b>Plan_Per_Client</b> (số tiền là VNĐ đầy đủ; ô để trống = không đổi), rồi tải lại ở đây.
        Với mỗi khách và tháng thay đổi, SL các SKU chưa Fix của khách đó co giãn theo tỷ lệ cho đúng doanh thu mới.
      </p>
      <input type="file" accept=".xlsx,.xls" onChange={chonFile} className="text-xs mb-3" />
      {dang && <div className="text-xs text-slate-500 flex items-center gap-2 mb-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc {tenFile}…</div>}
      {loi && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">{loi}</div>}
      {kq && (
        <div className="space-y-2 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div>Khớp <b>{bang.bang.size}</b> khách{bang.khongKhop.length ? <>, <b className="text-amber-700">{bang.khongKhop.length}</b> dòng không khớp</> : null}. Thay đổi <b>{kq.thayDoi.length}</b> ô khách × tháng ở <b>{soKhachDoi}</b> khách.</div>
            {bang.khongKhop.length > 0 && <div className="mt-1 text-[11px] text-amber-700 max-h-16 overflow-y-auto">Không khớp (bỏ qua): {bang.khongKhop.map((x) => x.ma || x.ten).join(', ')}</div>}
            {bang.trung.length > 0 && <div className="mt-1 text-[11px] text-amber-700">Khách xuất hiện nhiều dòng (lấy dòng sau): {bang.trung.join(', ')}</div>}
          </div>
          {kq.lechTruoc && (
            <div className="border border-slate-200 rounded-lg p-3">
              <label className="flex items-center gap-2 font-semibold text-slate-800 mb-1"><input type="checkbox" checked={canBang} onChange={(e) => setCanBang(e.target.checked)} /> Cân bằng về Target × tỷ trọng: co giãn đều các ô chưa Fix ở tháng bị lệch</label>
              <div className="overflow-x-auto">
                <table className="text-[10px] font-mono">
                  <thead><tr><th className="text-left pr-2 font-sans font-semibold text-slate-500">Lệch tháng ({nhanTien})</th>{NHAN_THANG.map((t) => <th key={t} className="px-1 text-right text-slate-500">{t}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="pr-2 font-sans text-slate-500">Sau khi tải lên</td>{kq.lechTruoc.map((v, m) => <td key={m} className={`px-1 text-right ${Math.abs(v) > 1 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>{Math.abs(v) > 1 ? fmt(v) : '·'}</td>)}</tr>
                    <tr><td className="pr-2 font-sans text-slate-500">Sau khi áp dụng</td>{kq.lechSau.map((v, m) => <td key={m} className={`px-1 text-right ${Math.abs(v) > 1e4 ? 'text-rose-600 font-bold' : 'text-emerald-700'}`}>{Math.abs(v) > 1e4 ? fmt(v) : '✓'}</td>)}</tr>
                  </tbody>
                </table>
              </div>
              {!canBang && <p className="text-[11px] text-amber-700 mt-1">Không cân bằng: tổng tháng sẽ lệch Target — chưa gửi duyệt được cho tới khi khớp.</p>}
            </div>
          )}
          {kq.loi.length > 0 && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 max-h-24 overflow-y-auto">
              {kq.loi.length} ô không áp được:
              {kq.loi.slice(0, 12).map((x, i) => <div key={i}>{x.key ? tenKhach(x.key) + ' · ' + (x.m >= 0 ? NHAN_THANG[x.m] : '') + ': ' : ''}{x.text}</div>)}
              {kq.loi.length > 12 ? <div>… và {kq.loi.length - 12} lỗi nữa</div> : null}
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button className={nutPhu} onClick={onClose}>Hủy</button>
        <button className={nutChinh} disabled={!kq || !kq.thayDoi.length} onClick={() => onApply(kq)}>Áp dụng {kq ? kq.thayDoi.length : 0} thay đổi</button>
      </div>
    </Khung>
  );
}
