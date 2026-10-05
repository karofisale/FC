import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Lock, Unlock, Trash2 } from 'lucide-react';
import {
  NHAN_THANG, tomTatKhach, tomTatDonVi, dinhDangTy, dinhDangTrieu, dinhDangSo, dinhDangPct, tyTrongPct
} from '../../utils/annualPlanModel';

const COT1 = 'w-72 min-w-72 max-w-72';          // cột Khách / SKU (cố định khi kéo sang phải)
const TONG_LEFT = 'left-72';                     // cột Tổng năm dính ngay sau cột 1

/** Ô số nguyên: sửa tại chỗ, chốt khi rời ô / Enter (không dựng lại cả bảng theo từng phím). */
function CellInput({ value, onCommit, disabled, title, highlight }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <input
      value={v}
      disabled={disabled}
      title={title}
      inputMode="numeric"
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => { if (v !== String(value)) onCommit(v === '' ? '0' : v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
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
  useEffect(() => { setV(fmt(value)); }, [value]);
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
 * Bảng khách × tháng. view 'base' = cơ sở năm hiện tại, 'plan' = kế hoạch năm sau.
 * Khách: doanh thu (triệu VNĐ); bấm + mở danh sách SKU (SL từng tháng, sửa được). Đơn vị MỘT khách: hiện thẳng theo SKU.
 */
export default function AnnualGrid({
  state, view, editable, expanded, onToggle, onEditCell, onToggleLock, onDeleteSku, onDeleteCustomer, onShareChange, single
}) {
  const kh = tomTatKhach(state);
  const dv = tomTatDonVi(state);
  const arr = view === 'base' ? 'base' : 'plan';
  const soTong = view === 'base' ? dv.baseTotal : dv.planTotal;
  const doanhThuDv = view === 'base' ? dv.base : dv.plan;
  const lastMonth = state.baselineLastMonth;
  const choPhepSuaCoSo = editable && !state.targetApplied;
  const tyPct = tyTrongPct(state);

  const ocSku = (l, m) => {
    const q = view === 'base' ? l.qtyBase[m] : l.qty[m];
    const duocSua = view === 'base' ? (choPhepSuaCoSo && m > lastMonth) : editable;
    const khoa = view === 'plan' && l.khoa && l.khoa[m];
    return (
      <td key={m} className={`px-0.5 py-0.5 w-20 min-w-20 ${view === 'base' && m <= lastMonth ? 'bg-slate-50' : ''}`}>
        <div className="relative">
          <CellInput
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
              className={`absolute -top-1 -right-0.5 ${khoa ? 'text-amber-500' : 'text-transparent hover:text-slate-400'}`}
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
            <div className="min-w-0">
              <div className="font-mono text-[11px] font-bold text-slate-800 truncate">
                {l.skuCode || l.tempSkuId}{l.tempSkuId ? <span className="ml-1 text-[9px] font-sans bg-amber-100 text-amber-700 rounded px-1">mã tạm</span> : null}
              </div>
              <div className="text-[10px] text-slate-500 truncate" title={l.skuName}>{l.skuName} · {dinhDangSo(l.priceVnd)}đ</div>
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

  return (
    <div className="overflow-auto border border-slate-200 rounded-xl bg-white max-h-[68vh]">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="bg-slate-800 text-slate-200">
            <th className={`sticky top-0 left-0 z-30 bg-slate-800 ${COT1} text-left px-3 py-2 font-semibold`}>
              {single ? 'SKU (SL cái)' : 'Khách hàng (doanh thu, triệu VNĐ)'}
            </th>
            <th className={`sticky top-0 ${TONG_LEFT} z-30 bg-slate-800 w-24 min-w-24 text-right px-2 py-2 font-semibold`}>Tổng năm</th>
            {NHAN_THANG.map((t, m) => (
              <th key={t} className="sticky top-0 z-20 bg-slate-800 w-20 min-w-20 text-right px-2 py-2 font-semibold">
                {t}
                {view === 'base' && <div className={`text-[9px] font-normal ${m <= lastMonth ? 'text-emerald-300' : 'text-amber-300'}`}>{m <= lastMonth ? 'thực hiện' : 'dự kiến'}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-blue-50 font-bold text-slate-900">
            <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1.5`}>Tổng doanh thu (Tỷ VNĐ)</td>
            <td className={`sticky ${TONG_LEFT} z-10 bg-blue-50 text-right px-2 py-1.5 font-mono`}>{dinhDangTy(soTong)}</td>
            {doanhThuDv.map((v, m) => <td key={m} className="text-right px-2 py-1.5 font-mono">{dinhDangTy(v)}</td>)}
          </tr>
          <tr className="bg-blue-50/60 text-slate-700">
            <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1`}>
              Tỷ trọng tháng (%){view === 'plan' && editable ? <span className="text-[9px] text-slate-400 ml-1">(sửa được)</span> : null}
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
          {view === 'plan' && (
            <tr className="bg-blue-50/40 text-slate-600">
              <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1`}>Tăng trưởng so cơ sở</td>
              <td className={`sticky ${TONG_LEFT} z-10 bg-blue-50 text-right px-2 py-1 font-mono`}>{dinhDangPct(dv.growthYear)}</td>
              {dv.growth.map((g, m) => <td key={m} className={`text-right px-2 py-1 font-mono text-[11px] ${g !== null && g < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{dinhDangPct(g)}</td>)}
            </tr>
          )}

          {single
            ? state.lines.map((l) => dongSku(l, true))
            : kh.map((c) => {
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
                          <span className="text-[10px] font-normal text-slate-400 shrink-0">({c.lines.length})</span>
                        </button>
                        {editable && view === 'plan' && (
                          <button onClick={() => onDeleteCustomer(c.key)} title="Bớt khách này" className="text-slate-300 hover:text-rose-600 shrink-0">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`sticky ${TONG_LEFT} z-10 bg-slate-50 text-right px-2 py-1.5 font-mono text-[11px]`}>{dinhDangTrieu(tongNam)}</td>
                    {c[arr].map((v, m) => <td key={m} className="text-right px-2 py-1.5 font-mono text-[11px]">{dinhDangTrieu(v)}</td>)}
                  </tr>
                  {mo && c.lines.map((l) => dongSku(l, false))}
                </React.Fragment>
              );
            })}
          {!state.lines.length && (
            <tr><td colSpan={14} className="text-center text-slate-400 py-8">Chưa có dòng nào.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
