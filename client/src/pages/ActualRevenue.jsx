import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { vnYear } from '../utils/period';
import { tienDayDu, tienRutGon } from '../utils/formatMoney';
import { usePersistedState } from '../utils/usePersistedState';
import { StateRow } from '../components/TableStates';
import { dungBangDoanhThuNam, chiTietThang, phanTramDoi } from '../utils/revenueTable';

/**
 * DOANH THU THỰC HIỆN THEO THÁNG (19/10/2026, Đợt 12) — dữ liệu cào từ SAP (ZSD450), cột "Doanh thu thuần VND":
 * sau chiết khấu / giảm giá, TRƯỚC thuế; trả hàng là số âm. Mỗi tháng bấm để xem theo từng mã vật tư.
 * Chỉ ĐỌC: số được nạp bằng nút "Cào từ SAP" ở màn Sản lượng Thực hiện (cùng lượt cào ghi cả sản lượng lẫn doanh thu).
 * Tháng chưa có dữ liệu hiện "—" (khác tháng có dữ liệu nhưng doanh thu bằng 0).
 */
const laNamHopLe = (v) => /^\d{4}$/.test(String(v));
// Kỳ trước gần 0 (vd tháng chỉ có hàng trả) làm % vọt lên hàng nghìn — chặn ở ±999% để khỏi gây hiểu nhầm.
const pct = (v) => (v === null || v === undefined ? '—'
  : Math.abs(v) > 999 ? (v > 0 ? '> +999%' : '< −999%')
    : `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`);
const mauPct = (v) => (v === null || v === undefined ? 'text-slate-500' : v > 0 ? 'text-emerald-700' : v < 0 ? 'text-rose-700' : 'text-slate-600');
const so0 = (v) => Math.round(Number(v) || 0).toLocaleString('vi-VN');

export default function ActualRevenue({ currentBU }) {
  const [nam, setNam] = usePersistedState('revenueYear', () => String(vnYear()), laNamHopLe);
  const [thang, setThang] = useState([]);
  const [thieuBang, setThieuBang] = useState(false);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [mo, setMo] = useState('');                 // tháng đang mở chi tiết (YYYY-MM-01)
  const [chiTiet, setChiTiet] = useState({ key: '', rows: [], dangTai: false, loi: '' });
  const namSo = Number(nam);

  const tai = useCallback(async () => {
    if (!currentBU) return;
    setDangTai(true); setLoi('');
    try {
      const r = await api.getActualRevenue({ bu: currentBU, from: `${namSo - 1}-01`, to: `${namSo}-12` });
      setThang(r.months || []); setThieuBang(!!r.missing);
    } catch (e) {
      setLoi(e.message || 'Không tải được doanh thu.'); setThang([]);
    } finally { setDangTai(false); }
  }, [currentBU, namSo]);

  useEffect(() => { setMo(''); tai(); }, [tai]);

  const bang = useMemo(() => dungBangDoanhThuNam(thang, namSo), [thang, namSo]);
  // Cả năm so cả năm trước (chỉ khi năm trước có số): null nếu thiếu / bằng 0
  const yoyCaNam = bang.soThangNamTruocCo && bang.tongNamTruoc ? phanTramDoi(bang.tong, bang.tongNamTruoc) : null;

  const moChiTiet = async (key) => {
    if (mo === key) { setMo(''); return; }
    setMo(key);
    setChiTiet({ key, rows: [], dangTai: true, loi: '' });
    try {
      const m = key.slice(0, 7);
      const r = await api.getActualRevenue({ bu: currentBU, from: m, to: m, detail: true });
      setChiTiet({ key, rows: chiTietThang(r.rows), dangTai: false, loi: '' });
    } catch (e) {
      setChiTiet({ key, rows: [], dangTai: false, loi: e.message || 'Không tải được chi tiết.' });
    }
  };

  const nams = [];
  for (let y = vnYear(); y >= 2024; y--) nams.push(String(y));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Doanh thu Thực hiện — {currentBU || '(chọn đơn vị)'}</h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
            Doanh thu thuần theo tháng lấy từ SAP (ZSD450): sau chiết khấu và giảm giá, trước thuế; hàng trả về là số âm.
            Bấm một tháng để xem theo từng mã vật tư. Số được nạp bằng nút "Cào từ SAP" ở màn Sản lượng Thực hiện.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-600 flex items-center gap-1.5">Năm
            <select value={nam} onChange={(e) => setNam(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              {nams.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button type="button" onClick={tai} disabled={dangTai} className="inline-flex items-center gap-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${dangTai ? 'animate-spin' : ''}`} aria-hidden="true" /> Làm mới
          </button>
        </div>
      </div>

      {thieuBang && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg px-3 py-2" role="alert">
          Chưa có bảng doanh thu trên máy chủ (cần chạy SQL đợt 12). Báo quản trị hệ thống.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <The nhan={`Tổng ${nam}`} gtri={tienRutGon(bang.tong)} title={tienDayDu(bang.tong)} phu={`${bang.soThangCo} tháng có số`} />
        <The nhan={`Tổng ${namSo - 1}`} gtri={bang.soThangNamTruocCo ? tienRutGon(bang.tongNamTruoc) : '—'} title={tienDayDu(bang.tongNamTruoc)} phu={`${bang.soThangNamTruocCo} tháng có số`} />
        <The nhan="Trung bình tháng" gtri={bang.soThangCo ? tienRutGon(bang.tong / bang.soThangCo) : '—'} title={bang.soThangCo ? tienDayDu(bang.tong / bang.soThangCo) : ''} phu="trên các tháng có số" />
        <The nhan="Tháng cao nhất" gtri={bang.maxDoanhThu ? tienRutGon(bang.maxDoanhThu) : '—'} phu={bang.maxDoanhThu ? `Tháng ${bang.rows.find((r) => r.coSo && Math.abs(r.doanhThu) === bang.maxDoanhThu).thang}` : ''} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left font-semibold px-3 py-2 w-28">Tháng</th>
              <th className="text-right font-semibold px-3 py-2">Doanh thu thuần (đ)</th>
              <th className="px-3 py-2 w-48 hidden md:table-cell" aria-hidden="true" />
              <th className="text-right font-semibold px-3 py-2">Số lượng</th>
              <th className="text-right font-semibold px-3 py-2">Số mã</th>
              <th className="text-right font-semibold px-3 py-2" title="So với tháng liền trước">Với tháng trước</th>
              <th className="text-right font-semibold px-3 py-2">Cùng kỳ {namSo - 1}</th>
              <th className="text-right font-semibold px-3 py-2" title="So với cùng tháng năm trước">Với cùng kỳ</th>
              <th className="text-right font-semibold px-3 py-2" title="Tỷ trọng trong tổng cả năm (các tháng có số)">Tỷ trọng</th>
            </tr>
          </thead>
          <tbody>
            {dangTai && <StateRow colSpan={9} kind="loading" />}
            {!dangTai && loi && <StateRow colSpan={9} kind="error" text={loi} onRetry={tai} />}
            {!dangTai && !loi && bang.rows.map((r) => (
              <React.Fragment key={r.key}>
                <tr
                  className={`border-t border-slate-100 ${r.coSo ? 'cursor-pointer hover:bg-slate-50' : 'text-slate-500'}`}
                  onClick={r.coSo ? () => moChiTiet(r.key) : undefined}
                  data-thang={r.key}
                >
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-1">
                      {r.coSo ? (mo === r.key ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />) : <span className="w-3.5" />}
                      Tháng {r.thang}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" title={r.coSo ? tienDayDu(r.doanhThu) : 'Chưa có dữ liệu'}>{r.coSo ? so0(r.doanhThu) : '—'}</td>
                  <td className="px-3 py-2 hidden md:table-cell" aria-hidden="true">
                    {r.coSo && bang.maxDoanhThu > 0 && r.doanhThu > 0 && (
                      <div className="h-2 rounded bg-sky-500" style={{ width: `${Math.max(2, (r.doanhThu / bang.maxDoanhThu) * 100)}%` }} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.coSo ? so0(r.soLuong) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.coSo ? r.soMa : '—'}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${mauPct(r.momPct)}`}>{pct(r.momPct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.namTruoc === null ? '—' : so0(r.namTruoc)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${mauPct(r.yoyPct)}`}>{pct(r.yoyPct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.tyTrong === null ? '—' : `${r.tyTrong.toFixed(1).replace('.', ',')}%`}</td>
                </tr>
                {mo === r.key && (
                  <tr className="bg-slate-50/60">
                    <td colSpan={9} className="px-3 py-3">
                      {chiTiet.dangTai && <span className="text-slate-500">Đang tải chi tiết...</span>}
                      {chiTiet.loi && <span className="text-rose-700">{chiTiet.loi}</span>}
                      {!chiTiet.dangTai && !chiTiet.loi && (
                        <table className="w-full text-xs">
                          <thead className="text-slate-500">
                            <tr>
                              <th className="text-left font-semibold py-1 pr-3">Mã vật tư</th>
                              <th className="text-left font-semibold py-1 pr-3">Tên</th>
                              <th className="text-right font-semibold py-1 pr-3">Số lượng</th>
                              <th className="text-right font-semibold py-1 pr-3">Doanh thu thuần (đ)</th>
                              <th className="text-right font-semibold py-1 pr-3" title="Doanh thu thuần ÷ số lượng">Đơn giá thực tế (đ)</th>
                              <th className="text-right font-semibold py-1">Tỷ trọng</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chiTiet.rows.map((d) => (
                              <tr key={d.skuCode} className="border-t border-slate-200">
                                <td className="py-1 pr-3 font-mono">{d.skuCode}</td>
                                <td className="py-1 pr-3 text-slate-700">{d.skuName || '—'}</td>
                                <td className="py-1 pr-3 text-right tabular-nums">{so0(d.soLuong)}</td>
                                <td className="py-1 pr-3 text-right tabular-nums font-medium">{so0(d.doanhThu)}</td>
                                <td className="py-1 pr-3 text-right tabular-nums text-slate-600">{d.donGia ? so0(d.donGia) : '—'}</td>
                                <td className="py-1 text-right tabular-nums text-slate-600">{d.tyTrong === null ? '—' : `${d.tyTrong.toFixed(1).replace('.', ',')}%`}</td>
                              </tr>
                            ))}
                            {!chiTiet.rows.length && <tr><td colSpan={6} className="py-2 text-slate-500">Không có mã nào.</td></tr>}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          {!dangTai && !loi && (
            <tfoot className="bg-slate-50 font-semibold text-slate-800">
              <tr className="border-t border-slate-300">
                <td className="px-3 py-2">Cả năm {nam}</td>
                <td className="px-3 py-2 text-right tabular-nums" title={tienDayDu(bang.tong)}>{so0(bang.tong)}</td>
                <td className="hidden md:table-cell" />
                <td className="px-3 py-2 text-right tabular-nums">{so0(bang.rows.reduce((s, r) => s + (r.soLuong || 0), 0))}</td>
                <td />
                <td />
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{bang.soThangNamTruocCo ? so0(bang.tongNamTruoc) : '—'}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${mauPct(yoyCaNam)}`} title="Chỉ có ý nghĩa khi hai năm có SỐ THÁNG như nhau">
                  {pct(yoyCaNam)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Dòng "Cả năm" so cả năm với cả năm trước: chỉ so sánh được khi hai năm có số tháng như nhau ({bang.soThangCo} tháng năm {nam} / {bang.soThangNamTruocCo} tháng năm {namSo - 1}).</p>
    </div>
  );
}

function The({ nhan, gtri, phu, title }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{nhan}</div>
      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums" title={title}>{gtri}</div>
      {phu && <div className="text-[11px] text-slate-500 mt-0.5">{phu}</div>}
    </div>
  );
}
