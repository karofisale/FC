import React from 'react';
import { ChevronRight, ChevronDown, Lock, Unlock, Trash2, Pencil } from 'lucide-react';
import { NHAN_THANG, tomTatDonVi, dinhDangSo, dinhDangGia } from '../../utils/annualPlanModel';
import { gomTheoNhomSku, trangThaiFix, trangThaiFixTong, lechTheoMucTieu, saiSoChoPhep } from '../../utils/annualPlanSkuOps';
import { CellInput, TickFix } from './AnnualGrid';

const COT1 = 'w-72 min-w-72 max-w-72';
const TONG_LEFT = 'left-72';

/** Nút khóa (Fix) một ô tổng: amber = đã Fix hết, xám đậm = Fix một phần. */
function NutFix({ trangThai, onClick, title }) {
  const bat = trangThai === 'het';
  return (
    <button onClick={onClick} title={title} className={`absolute -top-1 -right-0.5 ${bat ? 'text-amber-700' : (trangThai === 'mot-phan' ? 'text-slate-500' : 'text-transparent hover:text-slate-400')}`}>
      {bat || trangThai === 'mot-phan' ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
    </button>
  );
}

/**
 * Bảng "Lập KH theo SKU": nhóm lớn theo Category (xếp theo doanh thu kế hoạch năm cao nhất ở trên) → SKU → khách. Hiện SẢN LƯỢNG theo tháng.
 * Sửa tổng Category / tổng SKU / SL SKU của một khách: xem annualPlanSkuOps.js (các nhóm / SKU chưa Fix co giãn để doanh thu từng khách không đổi).
 * `state` là phần đang hiển thị (đã lọc khách); khi đang lọc khách, ô tổng Category / SKU chỉ đọc (vì chúng tính trên TOÀN BỘ khách).
 */
export default function AnnualSkuGrid({
  state, catOf, editable, single, fmt, nhan, tien, dangLoc,
  moNhom, moSku, onToggleNhom, onToggleSku, onEditNhom, onEditSku, onEditCell, onToggleFix, onToggleFixTong, onDeleteSku, onEditCode
}) {
  const nhom = gomTheoNhomSku(state, catOf);
  const dv = tomTatDonVi(state);
  const tenKhach = new Map(state.customers.map((c) => [c.key, c.name || c.key]));
  const choSuaTong = editable && !dangLoc;
  const lechMt = !dangLoc ? lechTheoMucTieu(state) : null;

  // Ô số tháng: tt = trạng thái Fix của CHÍNH nó ('tat' | 'mot-phan' | 'het'), onFix = bật / tắt Fix. Ô khách: Fix ô. Ô SKU / Category: Fix TỔNG (các dòng con vẫn co giãn được).
  const oTong = (q, m, suaDuoc, onCommit, tieuDe, tt, onFix, tipFix) => (
    <td key={m} className="px-0.5 py-0.5 w-20 min-w-20">
      <div className="relative">
        <CellInput cot={m} value={q} disabled={!suaDuoc} title={tieuDe} onCommit={onCommit} highlight={tt === 'het'} />
        {editable && onFix && <NutFix trangThai={tt} onClick={onFix} title={tipFix} />}
      </div>
    </td>
  );

  const dongKhach = (l, tenSku) => (
    <tr key={l.key} className="border-b border-slate-100 hover:bg-blue-50/30">
      <td className={`sticky left-0 z-10 bg-white ${COT1} pl-14 pr-2 py-1`}>
        <div className="flex items-center gap-1.5">
          {editable && <TickFix trangThai={trangThaiFix(state, [l.key], null)} onClick={() => onToggleFix([l.key], null)} />}
          <span className="text-[11px] text-slate-700 truncate" title={tenKhach.get(l.customerKey) || l.customerKey}>{tenKhach.get(l.customerKey) || l.customerKey || tenSku}</span>
        </div>
      </td>
      <td className={`sticky ${TONG_LEFT} z-10 bg-white px-2 py-1 text-right font-mono text-[11px] text-slate-600 w-24 min-w-24`}>{dinhDangSo(l.qty.reduce((s, v) => s + (Number(v) || 0), 0))}</td>
      {NHAN_THANG.map((_, m) => oTong(l.qty[m], m, editable, (v) => onEditCell(l.key, m, v), l.khoa && l.khoa[m] ? 'Ô đã Fix' : undefined,
        trangThaiFix(state, [l.key], m), () => onToggleFix([l.key], m), 'Fix / bỏ Fix ô này: ô đứng yên khi sửa nơi khác'))}
    </tr>
  );

  const dongSku = (n, s) => {
    const mo = !single && moSku.has(s.khoa);
    return (
      <React.Fragment key={s.khoa}>
        <tr className="border-b border-slate-100 bg-white hover:bg-blue-50/30">
          <td className={`sticky left-0 z-10 bg-white ${COT1} pl-7 pr-2 py-1`}>
            <div className="flex items-center gap-1.5">
              {editable && <TickFix trangThai={trangThaiFixTong(state, 'sku', s.khoa, null)} onClick={() => onToggleFixTong('sku', s.khoa, null)} title="Fix TỔNG SL của SKU này cả 12 tháng (các dòng khách bên trong vẫn co giãn được)" />}
              {!single ? (
                <button onClick={() => onToggleSku(s.khoa)} className="flex items-center gap-1 min-w-0 text-left grow">
                  {mo ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block font-mono text-[11px] font-bold text-slate-800 truncate">{s.ma}<span className="ml-1 text-[10px] font-normal text-slate-500">({s.dong.length} khách)</span></span>
                    <span className="block text-[10px] text-slate-500 truncate" title={s.ten}>{s.ten} · {dinhDangGia(s.gia, tien.loai, tien.fx)}</span>
                  </span>
                </button>
              ) : (
                <span className="min-w-0 grow">
                  <span className="block font-mono text-[11px] font-bold text-slate-800 truncate">{s.ma}</span>
                  <span className="block text-[10px] text-slate-500 truncate" title={s.ten}>{s.ten} · {dinhDangGia(s.gia, tien.loai, tien.fx)}</span>
                </span>
              )}
              {editable && (
                <span className="flex gap-1 shrink-0">
                  <button onClick={() => onEditCode(s.khoa)} title="Sửa mã / tên SKU (áp cho mọi khách có SKU này)" className="text-slate-300 hover:text-blue-600"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => onDeleteSku(s.khoa)} title="Xóa SKU khỏi mọi khách" className="text-slate-300 hover:text-rose-600"><Trash2 className="w-3 h-3" /></button>
                </span>
              )}
            </div>
          </td>
          <td className={`sticky ${TONG_LEFT} z-10 bg-white px-2 py-1 text-right font-mono text-[11px] font-semibold text-slate-700 w-24 min-w-24`}>{dinhDangSo(s.qty.reduce((a, b) => a + b, 0))}</td>
          {NHAN_THANG.map((_, m) => oTong(s.qty[m], m, choSuaTong, (v) => onEditSku(s.khoa, m, v),
            dangLoc ? 'Đang lọc khách: tổng SKU chỉ đọc (bỏ lọc để sửa)' : 'Sửa tổng SL SKU trong tháng: các SKU chưa Fix khác cùng nhóm co giãn để tổng nhóm không đổi; doanh thu từng khách và tổng tháng giữ nguyên',
            trangThaiFixTong(state, 'sku', s.khoa, m), () => onToggleFixTong('sku', s.khoa, m), 'Fix / bỏ Fix TỔNG SL SKU tháng này (các dòng khách bên trong vẫn co giãn được)'))}

        </tr>
        {mo && s.dong.map((d) => dongKhach(d.line, s.ma))}
      </React.Fragment>
    );
  };

  return (
    <div className="overflow-auto border border-slate-200 rounded-xl bg-white max-h-[68vh]">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="bg-slate-800 text-slate-200">
            <th className={`sticky top-0 left-0 z-30 bg-slate-800 ${COT1} text-left px-3 py-2 font-semibold`}>Category › SKU › Khách (sản lượng, cái)</th>
            <th className={`sticky top-0 ${TONG_LEFT} z-30 bg-slate-800 w-24 min-w-24 text-right px-2 py-2 font-semibold`}>Tổng năm</th>
            {NHAN_THANG.map((t) => <th key={t} className="sticky top-0 z-20 bg-slate-800 w-20 min-w-20 text-right px-2 py-2 font-semibold">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-blue-50 font-bold text-slate-900">
            <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1.5`}>Tổng doanh thu ({nhan}){dangLoc ? <span className="ml-1 text-[9px] font-semibold text-blue-700">đang lọc</span> : null}</td>
            <td className={`sticky ${TONG_LEFT} z-10 bg-blue-50 text-right px-2 py-1.5 font-mono`}>{fmt(dv.planTotal)}</td>
            {dv.plan.map((v, m) => <td key={m} className="text-right px-2 py-1.5 font-mono">{fmt(v)}</td>)}
          </tr>
          {lechMt && (
            <tr className="bg-blue-50/30 text-slate-600">
              <td className={`sticky left-0 z-10 bg-blue-50 ${COT1} px-3 py-1`}>Chênh so Target × tỷ trọng</td>
              <td className={`sticky ${TONG_LEFT} z-10 bg-blue-50 text-right px-2 py-1 font-mono text-[11px]`}>{fmt(lechMt.reduce((a, b) => a + b, 0))}</td>
              {lechMt.map((v, m) => {
                const lech = Math.abs(v) > saiSoChoPhep(state, m);
                return <td key={m} className={`text-right px-2 py-1 font-mono text-[11px] ${lech ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>{lech ? (v > 0 ? '+' : '') + fmt(v) : '✓'}</td>;
              })}
            </tr>
          )}
          {nhom.map((n) => {
            const mo = moNhom.has(n.nhom);
            return (
              <React.Fragment key={n.nhom}>
                <tr className="border-b border-slate-200 bg-slate-100 font-semibold text-slate-900">
                  <td className={`sticky left-0 z-10 bg-slate-100 ${COT1} px-2 py-1.5`}>
                    <div className="flex items-center gap-1.5">
                      {editable && <TickFix trangThai={trangThaiFixTong(state, 'cat', n.nhom, null)} onClick={() => onToggleFixTong('cat', n.nhom, null)} title="Fix TỔNG SL của Category này cả 12 tháng (các SKU / dòng bên trong vẫn co giãn được)" />}
                      <button onClick={() => onToggleNhom(n.nhom)} className="flex items-center gap-1 min-w-0 text-left grow">
                        {mo ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                        <span className="min-w-0">
                          <span className="block truncate" title={n.nhom}>{n.nhom} <span className="text-[10px] font-normal text-slate-500">({n.skus.length} SKU)</span></span>
                          <span className="block text-[10px] font-normal text-slate-500">DT năm {fmt(n.dtNam)} {nhan}{dv.planTotal > 0 ? ' · ' + (n.dtNam / dv.planTotal * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%' : ''}</span>
                        </span>
                      </button>
                    </div>
                  </td>
                  <td className={`sticky ${TONG_LEFT} z-10 bg-slate-100 px-2 py-1.5 text-right font-mono text-[11px] w-24 min-w-24`}>{dinhDangSo(n.qty.reduce((a, b) => a + b, 0))}</td>
                  {NHAN_THANG.map((_, m) => oTong(n.qty[m], m, choSuaTong, (v) => onEditNhom(n.nhom, m, v),
                    dangLoc ? 'Đang lọc khách: tổng nhóm chỉ đọc (bỏ lọc để sửa)' : 'Sửa tổng SL Category trong tháng: các SKU chưa Fix trong nhóm co giãn theo, nhóm khác chưa Fix bù lại; doanh thu từng khách và tổng tháng giữ nguyên',
                    trangThaiFixTong(state, 'cat', n.nhom, m), () => onToggleFixTong('cat', n.nhom, m), 'Fix / bỏ Fix TỔNG SL Category tháng này (các SKU / dòng bên trong vẫn co giãn được)'))}

                </tr>
                {mo && n.skus.map((s) => dongSku(n, s))}
              </React.Fragment>
            );
          })}
          {!nhom.length && <tr><td colSpan={14} className="text-center text-slate-500 py-8">Chưa có dòng nào.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
