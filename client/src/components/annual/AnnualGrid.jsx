import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Lock, Unlock, Trash2 } from 'lucide-react';
import {
  NHAN_THANG, tomTatKhach, tomTatDonVi, dinhDangSo, dinhDangPct, tyTrongPct, dinhDangGia, doiTuVnd, nhomTheoThiTruong
} from '../../utils/annualPlanModel';
import { trangThaiFix, lechTheoMucTieu, saiSoChoPhep } from '../../utils/annualPlanSkuOps';
import { useTableSort } from '../../utils/useTableSort';
import { applyOrder } from '../../utils/tableSortCore';
import { SortTh } from '../TableStates';
import { parsePastedNumber } from '../../utils/useGridEditing';

const COT1 = 'w-72 min-w-72 max-w-72';          // cột Khách / SKU (cố định khi kéo sang phải)
const TONG_LEFT = 'left-72';                     // cột Tổng năm dính ngay sau cột 1

/** Tăng lên mỗi khi một thao tác sửa bị TỪ CHỐI (báo lỗi): các ô nhập đặt lại về số đang có thay vì giữ số vừa gõ. */
export const LamLaiCtx = createContext(0);

/**
 * Chạy MỘT LÔ thao tác sửa ô (dán nhiều ô từ Excel) như một bước duy nhất: nơi cung cấp (AnnualPlan) gom các lần sửa, nếu có
 * ô nào bị từ chối thì HUỶ CẢ LÔ (chưa đổi gì) và báo lỗi, thành công thì ghi một bước Hoàn tác. `chayLo(viec, soO)`.
 */
export const LoCtx = createContext(null);

// Ô nhập (phần tử input) -> hàm "áp giá trị này như người dùng vừa gõ vào ô đó". Dùng cho dán nhiều ô: tìm các ô đích bằng DOM
// (theo dòng / cột đang hiển thị) rồi gọi đúng bộ xử lý sửa của từng ô, nên mọi quy tắc co giãn / Fix / từ chối vẫn áp như khi gõ tay.
const ap = new WeakMap();

/** Chạy lần lượt các (ô, giá trị) đã chọn — gọi trong `chayLo`. */
export function apDungODan(muc) {
  muc.forEach(({ el, giaTri }) => { const h = ap.get(el); if (h) h(giaTri); });
}

/** Ô nhập lân cận trong cùng bảng: 'xuong' / 'len' = cùng cột (cột tháng), 'trai' / 'phai' = cùng dòng. */
function oLanCan(el, huong) {
  const bang = el.closest('table');
  if (!bang) return null;
  const ds = [...bang.querySelectorAll('input[data-o-luoi]:not([disabled])')];
  const i = ds.indexOf(el);
  if (i < 0) return null;
  if (huong === 'xuong') return ds.slice(i + 1).find((x) => x.dataset.cot === el.dataset.cot) || null;
  if (huong === 'len') return ds.slice(0, i).reverse().find((x) => x.dataset.cot === el.dataset.cot) || null;
  const cungDong = ds.filter((x) => x.closest('tr') === el.closest('tr'));
  const j = cungDong.indexOf(el);
  return (huong === 'phai' ? cungDong[j + 1] : cungDong[j - 1]) || null;
}

function diChuyen(el, huong) {
  const dich = oLanCan(el, huong);
  if (!dich) return false;
  dich.focus();
  if (typeof dich.select === 'function') dich.select();
  return true;
}

/** Các ô đích của một khối dán, tính từ ô đang đứng: bỏ ô không sửa được / ngoài bảng / đã đúng bằng số dán. */
function layODich(el, ma) {
  const bang = el.closest('table');
  if (!bang) return [];
  const hang = [...bang.querySelectorAll('tr')].filter((tr) => tr.querySelector('input[data-o-luoi]:not([disabled])'));
  const r0 = hang.indexOf(el.closest('tr'));
  const c0 = Number(el.dataset.cot);
  const muc = [];
  ma.forEach((dong, r) => dong.forEach((raw, c) => {
    const tr = hang[r0 + r];
    const o = tr && tr.querySelector(`input[data-o-luoi][data-cot="${c0 + c}"]:not([disabled])`);
    if (!o) return;
    const giaTri = String(Math.max(0, Math.round(parsePastedNumber(raw))));
    if (giaTri !== o.value) muc.push({ el: o, giaTri });
  }));
  return muc;
}

/**
 * Ô số nguyên: sửa tại chỗ, chốt khi rời ô / Enter (không dựng lại cả bảng theo từng phím).
 * Phím mũi tên lên / xuống đi theo cột tháng, trái / phải đi theo dòng (khi con trỏ ở mép ô), Enter chốt rồi xuống ô dưới.
 * Dán nhiều ô từ Excel (có tab / xuống dòng) áp lần lượt như gõ tay, nguyên khối hoặc không gì cả; dán một giá trị thì để trình duyệt tự dán.
 * `cot` = chỉ số tháng của ô (để biết ô nào cùng cột).
 */
export function CellInput({ value, onCommit, disabled, title, highlight, cot }) {
  const [v, setV] = useState(String(value));
  const lamLai = useContext(LamLaiCtx);
  const chayLo = useContext(LoCtx);
  const oRef = useRef(null);
  const cb = useRef(onCommit);
  useEffect(() => { cb.current = onCommit; });
  useEffect(() => { setV(String(value)); }, [value, lamLai]);
  useEffect(() => {
    const el = oRef.current;
    if (!el) return undefined;
    ap.set(el, (g) => cb.current(g));
    return () => { ap.delete(el); };
  }, []);
  return (
    <input
      ref={oRef}
      data-o-luoi="1"
      data-cot={cot}
      value={v}
      disabled={disabled}
      title={title}
      inputMode="numeric"
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => { if (v !== String(value)) onCommit(v === '' ? '0' : v); }}
      onPaste={(e) => {
        const text = e.clipboardData?.getData('text');
        if (!text || !chayLo) return;
        const dong = text.replace(/\r/g, '').split('\n');
        while (dong.length && dong[dong.length - 1] === '') dong.pop();
        if (dong.length <= 1 && !String(dong[0] || '').includes('\t')) return;
        e.preventDefault();
        const dich = layODich(e.currentTarget, dong.map((d) => d.split('\t')));
        if (dich.length) chayLo(() => apDungODan(dich), dich.length);
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === 'Enter') { e.preventDefault(); if (!diChuyen(el, 'xuong')) el.blur(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (diChuyen(el, e.key === 'ArrowDown' ? 'xuong' : 'len')) e.preventDefault(); return; }
        if (e.key === 'ArrowLeft' && el.selectionStart === 0 && diChuyen(el, 'trai')) e.preventDefault();
        else if (e.key === 'ArrowRight' && el.selectionEnd === el.value.length && diChuyen(el, 'phai')) e.preventDefault();
      }}
      className={`w-full text-right font-mono text-[11px] px-1.5 py-1 rounded border ${
        disabled ? 'bg-slate-50 border-transparent text-slate-500' : 'bg-white border-slate-200 focus:border-blue-500 focus:outline-none'
      } ${highlight ? 'ring-1 ring-amber-400' : ''}`}
    />
  );
}

/** Ô phần trăm (tỷ trọng tháng), đơn vị %, 2 số lẻ. */
function PctInput({ value, onCommit, disabled }) {
  const fmt = (x) => x.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [v, setV] = useState(fmt(value));
  const lamLai = useContext(LamLaiCtx);
  useEffect(() => { setV(fmt(value)); }, [value, lamLai]);
  return (
    <input
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
        if (isFinite(n) && Math.abs(n - value) > 1e-9) onCommit(n);
        else setV(fmt(value));
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`w-full text-right font-mono text-[11px] px-1.5 py-1 rounded border ${
        disabled ? 'bg-transparent border-transparent text-slate-700' : 'bg-white border-slate-200 focus:border-blue-500 focus:outline-none'
      }`}
    />
  );
}

/**
 * Ô TỔNG DOANH THU THÁNG sửa được (bảng Cơ sở, tháng dự kiến): nhập theo đơn vị đang hiển thị (triệu VNĐ / USD); doanh thu khách và SL các SKU của tháng đó
 * tự co giãn theo tỷ lệ. Chốt khi rời ô / Enter. Số hiển thị dạng vi-VN (dấu . ngăn nghìn, dấu , thập phân).
 */
export function TongThangInput({ value, onCommit, title, nho }) {
  const fmt = (x) => Math.round(x).toLocaleString('vi-VN');
  const [v, setV] = useState(fmt(value));
  const lamLai = useContext(LamLaiCtx);
  useEffect(() => { setV(fmt(value)); }, [value, lamLai]);
  return (
    <input
      value={v}
      title={title}
      onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ''))}
      onBlur={() => {
        const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
        if (isFinite(n) && Math.round(n) !== Math.round(value)) onCommit(n);
        else setV(fmt(value));
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`w-full text-right font-mono text-[11px] ${nho ? 'font-semibold' : 'font-bold'} px-1.5 py-1 rounded border bg-white ${nho ? 'border-slate-200 focus:border-blue-500' : 'border-blue-300 focus:border-blue-600'} focus:outline-none`}
    />
  );
}

/** Ô tick "Fix" ở đầu dòng: Fix cả dòng (12 tháng); trạng thái một phần hiện dấu gạch. */
export function TickFix({ trangThai, onClick, title }) {
  return (
    <input
      type="checkbox"
      title={title || 'Fix cả dòng: SL các tháng không bị co giãn khi sửa nơi khác'}
      checked={trangThai === 'het'}
      ref={(el) => { if (el) el.indeterminate = trangThai === 'mot-phan'; }}
      onChange={onClick}
      className="shrink-0 accent-amber-500 cursor-pointer"
    />
  );
}

/**
 * Bảng khách × tháng. view 'base' = cơ sở năm hiện tại, 'plan' = kế hoạch năm sau.
 * Khách: doanh thu (fmt = triệu VNĐ hoặc USD); bấm + mở danh sách SKU (SL từng tháng, sửa được). Đơn vị MỘT khách: hiện thẳng theo SKU.
 * `state` là phần ĐANG HIỂN THỊ (đã lọc khách + đổi tên hiển thị); mọi thao tác dùng khóa nên vẫn đúng khi đang lọc.
 */
export default function AnnualGrid({
  state, view, editable, expanded, onToggle, onEditCell, onToggleLock, onDeleteSku, onDeleteCustomer, onShareChange, single,
  fmt, nhan, tien, dangLoc, onEditMonthTotal, onEditCustomerMonth, onToggleFix, nhomTT, info
}) {
  const khGoc = tomTatKhach(state);
  const [dongTT, setDongTT] = useState(() => new Set());           // thị trường đang thu gọn (mặc định mở hết)
  const dv = tomTatDonVi(state);
  const arr = view === 'base' ? 'base' : 'plan';

  // Sắp xếp theo cột (Khách / SKU, Tổng năm, từng tháng). Đây là bảng CÓ Ô NHẬP nên thứ tự được CHỐT lúc bấm tiêu đề
  // (xem useTableSort): sửa số không làm dòng nhảy chỗ dưới con trỏ, và sắp xếp chỉ đảo thứ tự hiển thị — không đụng dữ liệu.
  const cotKhach = {
    ten: { type: 'text', get: (c) => c.name || c.key },
    tong: { type: 'number', get: (c) => (view === 'base' ? c.baseTotal : c.planTotal) }
  };
  const cotSku = {
    ten: { type: 'text', get: (l) => l.skuCode || l.tempSkuId },
    tong: { type: 'number', get: (l) => (view === 'base' ? l.qtyBase : l.qty).reduce((s, v) => s + (Number(v) || 0), 0) }
  };
  NHAN_THANG.forEach((_, m) => {
    cotKhach['m:' + m] = { type: 'number', get: (c) => c[arr][m] };
    cotSku['m:' + m] = { type: 'number', get: (l) => (view === 'base' ? l.qtyBase : l.qty)[m] };
  });
  const sk = useTableSort(khGoc, cotKhach, (c) => c.key);
  const sl = useTableSort(state.lines, cotSku, (l) => l.key);
  const sortSpec = single ? sl.spec : sk.spec;
  const doiSapXep = single ? sl.toggle : sk.toggle;
  const kh = sk.rows;
  // Export OEM: gom khách theo THỊ TRƯỜNG trước, rồi mới tới khách → SKU (thứ tự khách trong từng nhóm theo cột đã chọn)
  const dsNhom = nhomTT && !single
    ? nhomTheoThiTruong(state, info).map((g) => ({ ...g, khach: applyOrder(g.khach, sk.order, (c) => c.key) }))
    : [{ key: '', ten: '', khach: kh }];
  const soTong = view === 'base' ? dv.baseTotal : dv.planTotal;
  const doanhThuDv = view === 'base' ? dv.base : dv.plan;
  const lastMonth = state.baselineLastMonth;
  const choPhepSuaCoSo = editable && !state.targetApplied;
  const choSuaTongThang = view === 'base' && choPhepSuaCoSo && !dangLoc && !!onEditMonthTotal;      // đang lọc khách thì không sửa tổng (không rõ co giãn phần nào)
  const tyPct = tyTrongPct(state);
  const choSuaDtKhach = view === 'plan' && editable && !!onEditCustomerMonth && !single;
  const lechMt = view === 'plan' && !dangLoc ? lechTheoMucTieu(state) : null;        // chênh so với Target × tỷ trọng (đã Apply, không lọc)

  const ocSku = (l, m) => {
    const q = view === 'base' ? l.qtyBase[m] : l.qty[m];
    const duocSua = view === 'base' ? (choPhepSuaCoSo && m > lastMonth) : editable;
    const khoa = view === 'plan' && l.khoa && l.khoa[m];
    return (
      <td key={m} className={`px-0.5 py-0.5 w-20 min-w-20 ${view === 'base' && m <= lastMonth ? 'bg-slate-50' : ''}`}>
        <div className="relative">
          <CellInput
            cot={m}
            value={q}
            disabled={!duocSua}
            highlight={khoa}
            title={khoa ? 'Ô đã chốt (không bị co giãn khi sửa ô khác)' : (view === 'base' && m <= lastMonth ? 'Số thực hiện' : undefined)}
            onCommit={(v) => onEditCell(l.key, m, v)}
          />
          {view === 'plan' && editable && (
            <button
              onClick={() => onToggleLock(l.key, m)}
              title={khoa ? 'Bỏ chốt ô' : 'Chốt ô'}
              className={`absolute -top-1 -right-0.5 ${khoa ? 'text-amber-700' : 'text-transparent hover:text-slate-400'}`}
            >
              {khoa ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
            </button>
          )}
        </div>
      </td>
    );
  };

  const dongSku = (l, kenhKhachRieng) => {
    const tongQty = (view === 'base' ? l.qtyBase : l.qty).reduce((s, v) => s + (Number(v) || 0), 0);
    return (
      <tr key={l.key} className="border-b border-slate-100 hover:bg-blue-50/30">
        <td className={`sticky left-0 z-10 bg-white ${COT1} px-2 py-1 ${kenhKhachRieng ? '' : 'pl-8'}`}>
          <div className="flex items-start justify-between gap-1">
            {editable && view === 'plan' && onToggleFix && <TickFix trangThai={trangThaiFix(state, [l.key], null)} onClick={() => onToggleFix([l.key], null)} />}
            <div className="min-w-0 grow">
              <div className="font-mono text-[11px] font-bold text-slate-800 truncate">
                {l.skuCode || l.tempSkuId}{l.tempSkuId ? <span className="ml-1 text-[9px] font-sans bg-amber-100 text-amber-700 rounded px-1">mã tạm</span> : null}
              </div>
              <div className="text-[10px] text-slate-500 truncate" title={l.skuName}>{l.skuName} · {dinhDangGia(l.priceVnd, tien.loai, tien.fx)}</div>
            </div>
            {editable && view === 'plan' && (
              <button onClick={() => onDeleteSku(l.key)} title="Bớt SKU này" className="text-slate-300 hover:text-rose-600 shrink-0 mt-0.5">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </td>
        <td className={`sticky ${TONG_LEFT} z-10 bg-white px-2 py-1 text-right font-mono text-[11px] font-semibold text-slate-700 w-24 min-w-24`}>{dinhDangSo(tongQty)}</td>
        {NHAN_THANG.map((_, m) => ocSku(l, m))}
      </tr>
    );
  };

  // Một khách: dòng tổng (bấm + xem SKU) và các dòng SKU của khách
  const hangKhach = (c) => {
              const mo = expanded.has(c.key);
              const tongNam = view === 'base' ? c.baseTotal : c.planTotal;
              return (
                <React.Fragment key={c.key}>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    <td className={`sticky left-0 z-10 bg-slate-50 ${COT1} px-2 py-1.5`}>
                      <div className="flex items-center justify-between gap-1">
                        <button onClick={() => onToggle(c.key)} className="flex items-center gap-1 min-w-0 text-left">
                          {mo ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                          <span className="truncate" title={c.name}>{c.name || c.key}</span>
                          {c.isNew && <span className="text-[9px] font-sans bg-emerald-100 text-emerald-700 rounded px-1">mới</span>}
                          <span className="text-[10px] font-normal text-slate-500 shrink-0">({c.lines.length})</span>
                        </button>
                        {editable && view === 'plan' && (
                          <button onClick={() => onDeleteCustomer(c.key)} title="Bớt khách này" className="text-slate-300 hover:text-rose-600 shrink-0">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`sticky ${TONG_LEFT} z-10 bg-slate-50 text-right px-2 py-1.5 font-mono text-[11px]`}>{fmt(tongNam)}</td>
                    {c[arr].map((v, m) => (
                      choSuaDtKhach && c.lines.length > 0
                        ? <td key={m} className="px-0.5 py-0.5"><TongThangInput nho value={doiTuVnd(v, tien.loai, tien.fx)} title="Sửa doanh thu khách trong tháng: SL các SKU của khách co giãn theo tỷ lệ" onCommit={(n) => onEditCustomerMonth(c.key, m, n)} /></td>
                        : <td key={m} className="text-right px-2 py-1.5 font-mono text-[11px]">{fmt(v)}</td>
                    ))}
                  </tr>
                  {mo && c.lines.map((l) => dongSku(l, false))}
                </React.Fragment>
              );
  };

  return (
    <div className="overflow-auto border border-slate-200 rounded-xl bg-white max-h-[68vh]">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="bg-slate-800 text-slate-200">
            <SortTh label={single ? 'SKU (SL cái)' : 'Khách hàng (doanh thu, ' + nhan + ')'} sortKey="ten" spec={sortSpec} onSort={doiSapXep} className={`sticky top-0 left-0 z-30 bg-slate-800 ${COT1} text-left px-3 py-2 font-semibold`} />
            <SortTh label="Tổng năm" sortKey="tong" spec={sortSpec} onSort={doiSapXep} className={`sticky top-0 ${TONG_LEFT} z-30 bg-slate-800 w-24 min-w-24 text-right px-2 py-2 font-semibold`} />
            {NHAN_THANG.map((t, m) => (
              <SortTh key={t} label={t} sortKey={'m:' + m} spec={sortSpec} onSort={doiSapXep} className="sticky top-0 z-20 bg-slate-800 w-20 min-w-20 text-right px-2 py-2 font-semibold">
                {view === 'base' && <div className={`text-[9px] font-normal ${m <= lastMonth ? 'text-emerald-300' : 'text-amber-300'}`}>{m <= lastMonth ? 'thực hiện' : 'dự kiến'}</div>}
              </SortTh>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-blue-50 font-bold text-slate-900">
            <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1.5`}>
              Tổng doanh thu ({nhan}){dangLoc ? <span className="ml-1 text-[9px] font-semibold text-blue-700">đang lọc</span> : null}
              {choSuaTongThang ? <span className="text-[9px] font-normal text-slate-500 ml-1">(tháng dự kiến sửa được)</span> : null}
            </td>
            <td className={`sticky ${TONG_LEFT} z-10 bg-blue-50 text-right px-2 py-1.5 font-mono`}>{fmt(soTong)}</td>
            {doanhThuDv.map((v, m) => (
              choSuaTongThang && m > lastMonth
                ? <td key={m} className="px-0.5 py-0.5"><TongThangInput value={doiTuVnd(v, tien.loai, tien.fx)} title="Sửa tổng doanh thu tháng: khách và SL các SKU tự co giãn theo tỷ lệ" onCommit={(n) => onEditMonthTotal(m, n)} /></td>
                : <td key={m} className="text-right px-2 py-1.5 font-mono">{fmt(v)}</td>
            ))}
          </tr>
          <tr className="bg-blue-50/60 text-slate-700">
            <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1`}>
              Tỷ trọng tháng (%){view === 'plan' && editable ? <span className="text-[9px] text-slate-500 ml-1">(sửa được)</span> : null}
            </td>
            <td className={`sticky ${TONG_LEFT} z-10 bg-blue-50 text-right px-2 py-1 font-mono`}>100,00</td>
            {NHAN_THANG.map((_, m) => (
              <td key={m} className="px-0.5 py-0.5">
                {view === 'plan'
                  ? <PctInput value={tyPct[m]} disabled={!editable} onCommit={(n) => onShareChange(m, n)} />
                  : <div className="text-right px-2 font-mono text-[11px]">{(dv.share[m] * 100).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
              </td>
            ))}
          </tr>
          {lechMt && (
            <tr className="bg-blue-50/30 text-slate-600">
              <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1`} title="Tổng kế hoạch − (Target × tỷ trọng). Dương = còn thiếu so với mục tiêu tháng. Trong sai số làm tròn chục thì xem như khớp.">Chênh so Target × tỷ trọng</td>
              <td className={`sticky ${TONG_LEFT} z-10 bg-blue-50 text-right px-2 py-1 font-mono text-[11px]`}>{fmt(lechMt.reduce((a, b) => a + b, 0))}</td>
              {lechMt.map((v, m) => {
                const lech = Math.abs(v) > saiSoChoPhep(state, m);
                return <td key={m} className={`text-right px-2 py-1 font-mono text-[11px] ${lech ? 'text-rose-600 font-bold' : 'text-slate-500'}`} title={lech ? 'Lệch quá sai số làm tròn — Apply lại hoặc chỉnh khách khác để khớp' : 'Khớp mục tiêu tháng'}>{lech ? (v > 0 ? '+' : '') + fmt(v) : '✓'}</td>;
              })}
            </tr>
          )}
          {view === 'plan' && (
            <tr className="bg-blue-50/40 text-slate-600">
              <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1`}>Tăng trưởng so cơ sở</td>
              <td className={`sticky ${TONG_LEFT} z-10 bg-blue-50 text-right px-2 py-1 font-mono`}>{dinhDangPct(dv.growthYear)}</td>
              {dv.growth.map((g, m) => <td key={m} className={`text-right px-2 py-1 font-mono text-[11px] ${g !== null && g < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{dinhDangPct(g)}</td>)}
            </tr>
          )}

          {single
            ? sl.rows.map((l) => dongSku(l, true))
            : dsNhom.map((g) => (
              <React.Fragment key={'tt:' + g.key}>
                {nhomTT && (
                  <tr className="border-b border-slate-300 bg-indigo-50 font-bold text-slate-900">
                    <td className={`sticky left-0 z-10 bg-indigo-50 ${COT1} px-2 py-1.5`}>
                      <button onClick={() => setDongTT((e) => { const n = new Set(e); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} className="flex items-center gap-1 min-w-0 text-left">
                        {dongTT.has(g.key) ? <ChevronRight className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                        <span className="truncate" title={g.ten}>{g.ten}</span>
                        <span className="text-[10px] font-normal text-slate-500 shrink-0">({g.khach.length} khách)</span>
                      </button>
                    </td>
                    <td className={`sticky ${TONG_LEFT} z-10 bg-indigo-50 text-right px-2 py-1.5 font-mono text-[11px]`}>{fmt(view === 'base' ? g.baseTotal : g.planTotal)}</td>
                    {g[arr].map((v, m) => <td key={m} className="text-right px-2 py-1.5 font-mono text-[11px]">{fmt(v)}</td>)}
                  </tr>
                )}
                {!(nhomTT && dongTT.has(g.key)) && g.khach.map((c) => hangKhach(c))}
              </React.Fragment>
            ))}
          {!state.lines.length && (
            <tr><td colSpan={14} className="text-center text-slate-500 py-8">Chưa có dòng nào.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
