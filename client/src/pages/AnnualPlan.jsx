import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Save, Send, CheckCircle2, XCircle, Loader2, AlertCircle, Plus, Unlock, Lock, Wand2, Trash2, UserPlus, GitBranch, Crown, Info, Target, FileSpreadsheet, RefreshCw
} from 'lucide-react';
import { api } from '../services/api';
import { setDirty } from '../services/dirtyState';
import AnnualGrid from '../components/annual/AnnualGrid';
import { ThanhLoc, ChonTien } from '../components/annual/AnnualFilter';
import { ReasonDialog, AddCustomerDialog, AddSkuDialog, MassDeleteDialog, ShareModeBar } from '../components/annual/AnnualDialogs';
import * as M from '../utils/annualPlanModel';

const NHAN_LOAI = { base: 'Bản gốc', adjust: 'Điều chỉnh', final: 'Final' };
const NHAN_TT = { draft: 'Đang soạn', submitted: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối', superseded: 'Đã thay thế' };
const MAU_TT = {
  draft: 'bg-slate-100 text-slate-700', submitted: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800', superseded: 'bg-slate-200 text-slate-500'
};

/** Câu thông báo kết quả điền ngược KPI năm của OEM (server trả `kpi`); '' nếu không có gì để nói. */
function thongBaoKpi(kpi) {
  if (!kpi) return '';
  if (kpi.trangThai === 'da-dien') return ' Đã điền ngược KPI năm ' + kpi.nam + ' của OEM (' + kpi.soKhach + ' khách, tổng ' + M.dinhDangTrieu(kpi.tongNam) + ' triệu VNĐ).';
  if (kpi.trangThai === 'giu-ban-co') return ' KPI năm ' + kpi.nam + ' của OEM được GIỮ NGUYÊN (' + kpi.ly + ') — admin có thể bấm "Áp vào KPI OEM" để ghi đè.';
  if (kpi.trangThai === 'loi') return ' Không điền được KPI OEM: ' + kpi.ly;
  return '';
}

/** Năm kế hoạch mặc định: từ tháng 10 lập cho năm sau; trước đó là năm hiện tại (để xem / điều chỉnh). */
function namMacDinh() {
  const d = new Date();
  return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
}

/** Đảm bảo mỗi dòng có đủ 12 phần tử cho khoa / qty / qtyBase (server có thể trả mảng rỗng). */
function chuanHoa(plan) {
  const m12 = (a, v) => (Array.isArray(a) && a.length === 12 ? a : new Array(12).fill(v));
  return { ...plan, lines: plan.lines.map((l) => ({ ...l, qty: m12(l.qty, 0), qtyBase: m12(l.qtyBase, 0), khoa: m12(l.khoa, false) })) };
}

const nutChinh = 'inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-semibold px-3 py-1.5 rounded-lg';
const nutPhu = 'inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg';

export default function AnnualPlan({ currentBU, user }) {
  const [year, setYear] = useState(namMacDinh);
  const [ws, setWs] = useState(null);
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loiTai, setLoiTai] = useState('');
  const [view, setView] = useState('plan');
  const [expanded, setExpanded] = useState(() => new Set());
  const [finalMode, setFinalMode] = useState(false);
  const [dlg, setDlg] = useState(null);
  const [cheDo, setCheDo] = useState('deu');
  const [thangChon, setThangChon] = useState([]);
  const [themVaoKhach, setThemVaoKhach] = useState('');
  const [bao, setBao] = useState(false);       // có thay đổi chưa lưu
  const [tangText, setTangText] = useState('');
  const [doanhThuText, setDoanhThuText] = useState('');
  const [tienTe, setTienTe] = useState('VND');                       // 'VND' = triệu VNĐ | 'USD' (chỉ Export OEM + Brand)
  const [loc, setLoc] = useState({ thiTruong: '', sale: '', tuKhoa: '' });

  const role = user?.role;
  const laSoan = role === 'bu_editor' || role === 'central_admin';
  const laDuyet = role === 'bu_approver' || role === 'central_admin';
  const laAdmin = role === 'central_admin';

  useEffect(() => {
    setDirty(bao, 'Kế hoạch năm còn thay đổi chưa lưu.');
    return () => setDirty(false);
  }, [bao]);

  const nap = useCallback(async (planId, tuBatDau) => {
    if (!currentBU) return;
    setLoading(true);
    setLoiTai('');
    setMsg(null);
    try {
      const r = await api.getAnnualPlanWorkspace({ bu: currentBU, year, planId: planId || '' });
      setWs(r);
      let p = r.plan ? chuanHoa(r.plan) : null;
      // Sau khi bỏ nháp: vào thẳng bản CHƯA LƯU dựng từ dữ liệu nguồn mới nhất (chỉ lưu khi bấm Lưu nháp)
      const chuaLuu = !p && tuBatDau && !!r.baseline;
      if (chuaLuu) p = M.taoStateTuCoSo(r.baseline, { bu: currentBU, year });
      setSt(p);
      setBao(!!chuaLuu);
      setFinalMode(false);
      setExpanded(new Set());
      setThemVaoKhach(p && p.customers[0] ? p.customers[0].key : '');
      setView(p && p.targetApplied ? 'plan' : 'base');
      setTangText(p && p.targetGrowthPct !== null && p.targetGrowthPct !== undefined ? String(p.targetGrowthPct) : '');
      setDoanhThuText(p && p.targetRevenueVnd ? String(Math.round(p.targetRevenueVnd / 1e4) / 100) : '');
      setLoc({ thiTruong: '', sale: '', tuKhoa: '' });
    } catch (e) {
      setWs(null);
      setSt(null);
      setLoiTai(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentBU, year]);

  useEffect(() => { nap(''); }, [nap]);

  const donVi = ws?.unit;
  const single = !!donVi?.single;
  const editable = !!st && ((laSoan && (st.status === 'draft' || st.status === 'rejected') && st.kind !== 'final') || (finalMode && laAdmin));
  const kiemTra = useMemo(() => (st ? M.kiemTra(st) : { loi: [], canhBao: [] }), [st]);
  const trangThaiMt = useMemo(() => (st ? M.trangThaiMucTieu(st) : { lech: null, canApplyLai: false }), [st]);
  const coSoTong = useMemo(() => (st ? M.tong(M.doanhThuCoSo(st)) : 0), [st]);
  const daXoa = useMemo(() => (st ? M.tomTatDaXoa(st) : { soDong: 0, base: 0 }), [st]);
  // Tỷ giá đã chốt theo phiên bản (chưa có bản thì tỷ giá hiện tại lúc dựng cơ sở) + tiền tệ hiển thị: USD chỉ cho Export OEM + Brand (có tỷ giá);
  // bảng chờ duyệt (đã gửi duyệt) luôn Triệu VNĐ.
  const fx = (st && st.fxRate) || (ws && ws.baseline && ws.baseline.fxRate) || 0;
  const laKrf = donVi?.source === 'krf';                       // Brand KRF-*: nhiều khách, dữ liệu từ đơn hàng Export
  const laBrand = donVi?.source === 'fc' || laKrf;
  const choUsd = (donVi?.source === 'export' || laBrand) && fx > 0;
  const khoaVnd = st?.status === 'submitted';
  const tienHienThi = choUsd && tienTe === 'USD' && !khoaVnd ? 'USD' : 'VND';
  const fmt = M.taoDinhDangTien(tienHienThi, fx);
  const nhan = M.nhanTien(tienHienThi);
  const tien = { loai: tienHienThi, fx };
  const chuoiTarget = (vnd) => String(Math.round(M.doiTuVnd(vnd, tienHienThi, fx) * 100) / 100);
  // đổi tiền tệ: ô Target doanh thu đổi theo đơn vị mới
  useEffect(() => { if (st && st.targetRevenueVnd) setDoanhThuText(chuoiTarget(st.targetRevenueVnd)); }, [tienHienThi]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Phần ĐANG HIỂN THỊ: lọc theo Thị trường / Sale / Khách hàng + tên khách hiển thị (OEM: Search Code, Export: Short Name)
  const locKq = useMemo(() => (st ? M.locTheoKhach(st, loc, ws && ws.customerInfo, donVi && donVi.source) : null), [st, loc, ws, donVi]);
  const giaTriLoc = useMemo(() => (st ? M.giaTriLoc(st, ws && ws.customerInfo) : { thiTruong: [], sale: [] }), [st, ws]);

  const baoLoi = (e) => setMsg({ loai: 'loi', text: e.message || String(e) });
  const capNhat = (fn) => {
    try {
      const kq = fn(st);
      const next = kq && kq.state ? kq.state : kq;
      setSt(next);
      setBao(true);
      return kq;
    } catch (e) { baoLoi(e); return null; }
  };

  /* ---------------- thao tác trên bảng ---------------- */
  const suaO = (key, m, v) => {
    capNhat((s) => (view === 'base' ? M.suaCoSo(s, key, m, v) : M.suaKeHoach(s, key, m, v)));
  };
  const suaTongThang = (m, giaTri) => {
    const kq = capNhat((s) => M.suaTongThangCoSo(s, m, M.doiSangVnd(giaTri, tienHienThi, fx)));
    if (kq) setMsg({ loai: 'ok', text: 'Đã sửa tổng doanh thu T' + (m + 1) + ': doanh thu từng khách và SL các SKU của tháng đó co giãn theo tỷ lệ.' });
  };
  const suaTyTrong = (m, pct) => {
    if (cheDo === 'chiDinh' && !thangChon.filter((x) => x !== m).length) { baoLoi(new Error('Chọn ít nhất một tháng khác để nhận phần chênh.')); return; }
    capNhat((s) => M.suaTyTrong(s, { [m]: pct }, cheDo, thangChon));
  };
  const datTang = () => {
    const n = parseFloat(String(tangText).replace(',', '.'));
    if (!isFinite(n)) return;
    const kq = capNhat((s) => M.datTarget(s, { tangTruongPct: n }));
    if (kq) setDoanhThuText(chuoiTarget(kq.targetRevenueVnd));
  };
  const datDoanhThu = () => {
    const n = parseFloat(String(doanhThuText).replace(',', '.'));
    if (!isFinite(n)) return;
    const kq = capNhat((s) => M.datTarget(s, { doanhThuMucTieu: Math.round(M.doiSangVnd(n, tienHienThi, fx)) }));
    if (kq) setTangText(String(kq.targetGrowthPct));
  };
  const apDung = () => {
    const kq = capNhat((s) => M.apDung(s));
    if (!kq) return;
    setView('plan');
    setMsg(kq.loi.length ? { loai: 'loi', text: kq.loi.join(' · ') } : { loai: 'ok', text: 'Đã Apply: doanh thu từng tháng = Target × tỷ trọng; SL từng SKU co giãn theo, làm tròn chục.' });
  };
  const moKhoa = () => {
    if (!window.confirm('Mở khóa Target sẽ đưa kế hoạch về số cơ sở — mọi tinh chỉnh SKU/ô đã chốt sẽ mất. Tiếp tục?')) return;
    capNhat((s) => M.moKhoaTarget(s));
  };
  const xoaSku = (key) => {
    if (!window.confirm('Bớt SKU ' + key.split('|')[1] + ' khỏi kế hoạch?')) return;
    capNhat((s) => M.xoaSku(s, key));
  };
  const xoaKhach = (key) => {
    if (!window.confirm('Bớt khách này (cùng toàn bộ SKU của khách) khỏi kế hoạch?')) return;
    capNhat((s) => M.xoaKhach(s, key));
  };
  const themKhach = ({ name, code, market }) => {
    const tienTo = donVi?.source === 'oem' ? 'OEM:' : (donVi?.source === 'export' || donVi?.source === 'krf' ? 'XK:' : '');
    const key = code ? tienTo + code : 'NEW:' + name;
    if (capNhat((s) => M.themKhach(s, { key, name, market }))) { setThemVaoKhach(key); setExpanded((e) => new Set(e).add(key)); }
    setDlg(null);
  };
  const themSku = (data) => {
    const kh = single ? '' : themVaoKhach;
    if (capNhat((s) => {
      const r = M.themSku(s, kh, data);
      if (data.tempSkuId && data.description) return { ...r, newSkus: r.newSkus.map((n) => (n.tempId === data.tempSkuId ? { ...n, description: data.description } : n)) };
      return r;
    })) { if (kh) setExpanded((e) => new Set(e).add(kh)); }
    setDlg(null);
  };
  // Hàng thanh lý (đơn vị OEM): tiêu chí tùy biến theo nhóm sản phẩm của SKU (server trả skuNhom)
  const coThanhLy = !!(ws && ws.unit && ws.unit.source === 'oem');
  const optsXoa = (opts) => (opts && opts.xoaThanhLy && coThanhLy ? { ...opts, xoaTheo: M.laThanhLyTheoNhom(ws.skuNhom) } : opts);
  const xoaNho = (opts) => {
    const kq = capNhat((s) => M.xoaMatHangNho(s, M.laMayMacDinh, optsXoa(opts)));
    setDlg(null);
    if (kq) setMsg({ loai: 'ok', text: 'Đã xóa ' + kq.xoa.length + ' dòng; doanh thu được dồn lại cho các dòng còn lại của từng khách.' });
  };

  /* ---------------- lưu / gửi / duyệt ---------------- */
  const xuatExcel = async () => {
    try {
      const X = await import('../utils/annualPlanExcel');
      X.xuatExcel({ state: st, donVi, year, info: ws && ws.customerInfo, skuInfo: ws && ws.skuInfo, status: st.status });
      setMsg({ loai: 'ok', text: 'Đã xuất Excel (2 tab: Plan_Per_Client, Plan_SKU) — toàn bộ kế hoạch' + (bao ? ', theo số đang hiển thị (có thay đổi chưa lưu)' : '') + '.' });
    } catch (e) { baoLoi(e); }
  };
  /** Bản chưa lưu (id rỗng): tạo bản nháp trên server rồi mới ghi. Đã có bản nháp khác (người khác vừa lưu) thì dừng, không ghi đè. */
  const bamBanLuu = async () => {
    if (st.id) return st.id;
    const r = await api.createAnnualPlan({ bu: currentBU, year, kind: 'base' });
    if (r.existed) throw new Error('Đơn vị này đã có một bản nháp khác (có thể người khác vừa lưu) — tải lại trang để mở bản đó; số đang sửa ở đây chưa được lưu.');
    return r.planId;
  };
  const luu = async () => {
    setBusy(true);
    try {
      if (finalMode) { setDlg({ loai: 'final' }); return; }
      const id = await bamBanLuu();
      const r = await api.saveAnnualPlan({ planId: id, plan: M.chuyenSangPayload({ ...st, id }) });
      await nap(id);
      setMsg({ loai: 'ok', text: 'Đã lưu nháp.' + (r.canhBao && r.canhBao.length ? ' (' + r.canhBao.length + ' cảnh báo)' : '') });
    } catch (e) { baoLoi(e); } finally { setBusy(false); }
  };
  /** Bỏ bản nháp đã lưu (số cơ sở có thể cũ so với dữ liệu nguồn hiện tại) và dựng lại cơ sở mới; bản mới CHƯA lưu cho tới khi bấm Lưu nháp. */
  const dungLai = async () => {
    if (!window.confirm('Bỏ bản nháp đang lưu (kể cả các chỉnh sửa) và dựng lại bảng Cơ sở từ dữ liệu nguồn mới nhất? Bản mới chỉ được lưu khi bạn bấm "Lưu nháp".')) return;
    setBusy(true);
    try {
      if (st.id) await api.discardAnnualPlan({ planId: st.id });
      await nap('', true);
      setMsg({ loai: 'ok', text: 'Đã dựng lại cơ sở từ dữ liệu nguồn mới nhất. Bản này CHƯA lưu — bấm "Lưu nháp" để lưu.' });
    } catch (e) { baoLoi(e); } finally { setBusy(false); }
  };
  const batDauKhongLuu = () => {
    const b = ws && ws.baseline;
    if (!b) return;
    const p = M.taoStateTuCoSo(b, { bu: currentBU, year });
    const trong = !p.lines.length;
    setSt(p);
    setBao(true);
    setView(trong ? 'plan' : 'base');
    setThemVaoKhach(p.customers[0] ? p.customers[0].key : '');
    setMsg({ loai: 'ok', text: trong
      ? 'Chưa có số liệu cũ — vẫn lập được: dùng "Thêm khách" / "Thêm SKU" rồi nhập số lượng từng tháng. Bản CHƯA lưu, bấm "Lưu nháp" để lưu.'
      : 'Bảng Cơ sở đã dựng từ dữ liệu nguồn — CHƯA lưu. Chỉnh sửa rồi bấm "Lưu nháp" để lưu vào hệ thống.' });
  };
  const chepThang = (nguon, dich) => {
    if (capNhat((s) => M.saoChepThang(s, nguon, dich))) setMsg({ loai: 'ok', text: 'Đã copy SL của T' + (nguon + 1) + ' sang ' + (dich.length > 1 ? dich.length + ' tháng dự kiến' : 'T' + (dich[0] + 1)) + '.' });
  };
  const guiDuyet = async () => {
    if (kiemTra.loi.length) { setMsg({ loai: 'loi', text: 'Chưa gửi duyệt được: ' + kiemTra.loi.slice(0, 3).join(' · ') }); return; }
    if (!window.confirm('Gửi kế hoạch năm ' + year + ' của ' + currentBU + ' để duyệt? Sau khi gửi sẽ không sửa được cho tới khi được duyệt hoặc bị từ chối.')) return;
    setBusy(true);
    try {
      const id = await bamBanLuu();
      await api.saveAnnualPlan({ planId: id, plan: M.chuyenSangPayload({ ...st, id }) });
      await api.submitAnnualPlan({ planId: id });
      await nap(id);
      setTienTe('VND');                          // bảng gửi duyệt luôn Triệu VNĐ
      setMsg({ loai: 'ok', text: 'Đã gửi duyệt.' });
    } catch (e) { baoLoi(e); } finally { setBusy(false); }
  };
  const quyetDinh = async (decision, comment) => {
    setBusy(true);
    try {
      const r = await api.decideAnnualPlan({ planId: st.id, decision, comment: comment || '' });
      await nap(st.id);
      setMsg({ loai: 'ok', text: (decision === 'approved' ? 'Đã duyệt kế hoạch.' : 'Đã từ chối kế hoạch.') + thongBaoKpi(r && r.kpi) });
    } catch (e) { baoLoi(e); } finally { setBusy(false); setDlg(null); }
  };
  const luuFinal = async (lyDo) => {
    setBusy(true);
    try {
      const r = await api.saveAnnualPlanFinal({ sourcePlanId: st.id, plan: M.chuyenSangPayload(st), reason: lyDo });
      await nap(r.planId);
      setMsg({ loai: 'ok', text: 'Đã lưu bản Final.' + thongBaoKpi(r.kpi) });
    } catch (e) { baoLoi(e); } finally { setBusy(false); setDlg(null); }
  };
  const taoMoi = async (kind) => {
    setBusy(true);
    try {
      const r = await api.createAnnualPlan({ bu: currentBU, year, kind });
      await nap(r.planId);
      setMsg({ loai: 'ok', text: r.existed ? 'Đã có bản đang soạn — mở lại bản đó.' : 'Đã tạo ' + (kind === 'adjust' ? 'bản điều chỉnh' : 'kế hoạch') + ' mới.' });
    } catch (e) { baoLoi(e); } finally { setBusy(false); }
  };
  const apVaoKpi = async () => {
    if (!window.confirm('Áp bản này vào KPI năm ' + year + ' của OEM? KPI hiện có (kể cả phần đã sửa tay) sẽ bị GHI ĐÈ.')) return;
    setBusy(true);
    try {
      const r = await api.applyAnnualPlanToKpi({ planId: st.id });
      setMsg({ loai: 'ok', text: 'Đã áp vào KPI.' + thongBaoKpi(r.kpi) });
    } catch (e) { baoLoi(e); } finally { setBusy(false); }
  };
  const vaoCheDoFinal = () => {
    if (!window.confirm('Điều chỉnh top-down: bạn sẽ sửa một bản sao và lưu thành bản Final mới (có lý do); bản của đơn vị không bị đổi. Tiếp tục?')) return;
    setFinalMode(true);
    setView('plan');
  };

  /* ---------------- hiển thị ---------------- */
  if (!currentBU) return <div className="text-sm text-slate-500">Chọn đơn vị ở thanh trên.</div>;
  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-400 p-4"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải kế hoạch năm…</div>;
  if (loiTai) {
    return (
      <div className="bg-white border border-rose-200 rounded-xl p-5 max-w-2xl">
        <div className="flex items-start gap-3"><AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />
          <div><h2 className="font-bold text-sm text-slate-900">Không tải được kế hoạch năm</h2><p className="text-xs text-slate-600 mt-1">{loiTai}</p>
            <button onClick={() => nap('')} className={nutPhu + ' mt-3'}>Thử lại</button></div></div>
      </div>
    );
  }

  const nam = new Date().getFullYear();
  const banList = ws?.plans || [];
  // Nguồn đơn giá theo đơn vị + tỷ giá đã chốt theo phiên bản (bản đang xem; chưa có bản thì tỷ giá hiện tại lúc dựng cơ sở)
  const taiFx = fx > 0 ? ' — tỷ giá chốt ' + fx.toLocaleString('vi-VN') : '';
  const ghiChuGia = donVi?.source === 'fc'
    ? 'Đơn giá = giá đề xuất của Export quy đổi VNĐ' + taiFx + ' (doanh thu theo giá đề xuất, không phải giá bán thực).'
    : (donVi?.source === 'export' || donVi?.source === 'krf'
      ? 'Đơn giá = giá thực tế trên đơn hàng Export (USD) quy đổi VNĐ' + taiFx + '.'
      : 'Đơn giá VNĐ theo doanh thu thực hiện.');
  const anhDau = (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div>
        <h1 className="text-lg font-black text-slate-900">Kế hoạch năm {year} — {donVi?.name || currentBU}</h1>
        <p className="text-xs text-slate-500">
          {single ? 'Đơn vị một khách: bảng theo SKU.' : 'Bảng doanh thu theo khách (' + nhan + '), bấm + để xem SKU.'}
          {' '}{ghiChuGia}
        </p>
        {donVi?.source === 'export' && ws?.khachLoai?.length > 0 && (
          <details className="text-[11px] text-slate-500 mt-0.5">
            <summary className="cursor-pointer">Export OEM = khách Export không phải Brand — đã loại {ws.khachLoai.length} khách Brand (bấm để xem)</summary>
            <div className="mt-1 max-w-3xl leading-relaxed">{ws.khachLoai.map((k) => k.name + ' (' + k.ly + ')').join(' · ')}</div>
          </details>
        )}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold bg-white">
          {[nam, nam + 1, nam + 2].map((y) => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        {banList.length > 0 && (
          <select value={st?.id || ''} onChange={(e) => nap(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white">
            {banList.map((b) => <option key={b.id} value={b.id}>{NHAN_LOAI[b.kind]} #{b.revisionNo} — {NHAN_TT[b.status]}</option>)}
          </select>
        )}
        {st && <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${MAU_TT[st.status]}`}>{NHAN_TT[st.status]}</span>}
      </div>
    </div>
  );

  const thongBao = msg && (
    <div className={`mb-3 text-xs rounded-lg px-3 py-2 flex items-start gap-2 ${msg.loai === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'}`}>
      {msg.loai === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}<span>{msg.text}</span>
      <button className="ml-auto text-[10px] underline" onClick={() => setMsg(null)}>đóng</button>
    </div>
  );

  // ---- chưa có kế hoạch ----
  if (!st) {
    const b = ws?.baseline;
    return (
      <div>
        {anhDau}{thongBao}
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
          <h2 className="font-bold text-sm text-slate-900 mb-1">Chưa có kế hoạch năm {year} cho {currentBU}</h2>
          {b && (
            <p className="text-xs text-slate-600 mb-3">
              Dữ liệu cơ sở: <b>{b.lines.length}</b> dòng SKU{single ? '' : <> của <b>{b.customers.length}</b> khách</>}, thực hiện đến
              {' '}<b>{b.lastMonth >= 0 ? 'T' + (b.lastMonth + 1) + '/' + (year - 1) : 'chưa có tháng nào'}</b>;{' '}
              {donVi?.source === 'export' ? 'các tháng còn lại lấy theo đơn hàng / PI đang chạy (opened, drafted, targeted).'
                : (donVi?.source === 'fc' || donVi?.source === 'krf' ? 'các tháng còn lại để TRỐNG — điền tay hoặc dùng nút Copy từ tháng n.'
                  : 'các tháng còn lại tự dự báo theo trung bình và xu hướng cùng kỳ.')}
              {' '}Bảng chỉ được lưu vào hệ thống khi bạn bấm <b>Lưu nháp</b>.
              {!b.lines.length && <> <b>Chưa có số liệu cũ</b> — vẫn lập được kế hoạch mới bằng cách thêm khách / thêm SKU rồi nhập số lượng từng tháng.</>}
            </p>
          )}
          {laSoan
            ? <button className={nutChinh} disabled={busy || !b} onClick={batDauKhongLuu}><Plus className="w-3.5 h-3.5" /> Bắt đầu lập kế hoạch năm {year}</button>
            : <p className="text-xs text-slate-500">Chỉ người lập kế hoạch (Editor) của đơn vị mới bắt đầu được.</p>}
        </div>
      </div>
    );
  }

  const duocDuyet = laDuyet && st.status === 'submitted';
  const coBanDangSoan = banList.some((b) => b.kind === 'adjust' && (b.status === 'draft' || b.status === 'submitted'));
  const duocTaoDieuChinh = laSoan && st.status === 'approved' && st.kind !== 'final' && !coBanDangSoan;
  const duocFinal = laAdmin && !finalMode && (st.status === 'approved' || st.status === 'superseded');

  return (
    <div>
      {anhDau}{thongBao}

      {finalMode && (
        <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-violet-50 border border-violet-200 text-violet-800 flex items-center gap-2">
          <Crown className="w-4 h-4" /> Đang điều chỉnh top-down: bấm "Lưu bản Final" để ghi thành phiên bản Final mới (bản của đơn vị không đổi).
        </div>
      )}
      {editable && !st.id && (
        <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" /> Bản CHƯA LƯU: bảng Cơ sở và Kế hoạch chỉ được lưu vào hệ thống khi bấm <b>Lưu nháp</b> (rời trang sẽ mất).
        </div>
      )}
      {editable && st.id && st.status === 'draft' && st.kind !== 'final' && (
        <div className="mb-3 text-[11px] rounded-lg px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0" /> Bản nháp đã lưu{st.updatedAt ? ' lúc ' + new Date(st.updatedAt).toLocaleString('vi-VN') : ''}: bảng Cơ sở là số tại thời điểm tạo, có thể cũ so với dữ liệu nguồn hiện tại.
          Muốn lấy dữ liệu / cách tính mới nhất: bấm <b>Dựng lại từ dữ liệu mới</b>.
        </div>
      )}
      {st.status === 'rejected' && st.decisionComment && (
        <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-rose-50 border border-rose-200 text-rose-800">Bị từ chối: {st.decisionComment}</div>
      )}
      {st.kind === 'adjust' && <div className="mb-3 text-xs rounded-lg px-3 py-2 bg-sky-50 border border-sky-200 text-sky-800 flex items-center gap-2"><Info className="w-4 h-4" /> Bản điều chỉnh: các tháng đã có số thực hiện được khóa theo số thực hiện.</div>}

      {/* thanh thao tác */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs font-semibold">
          {[['base', `1. Cơ sở năm ${year - 1}`], ['plan', `2. Kế hoạch năm ${year}`], ['preview', '3. Preview']].map(([k, t]) => (
            <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 ${view === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{t}</button>
          ))}
        </div>
        {choUsd && <ChonTien tien={tienHienThi} setTien={setTienTe} khoa={khoaVnd} fx={fx} />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button className={nutPhu} onClick={xuatExcel} title="Xuất Excel 2 tab: Plan_Per_Client, Plan_SKU (toàn bộ kế hoạch đang mở)"><FileSpreadsheet className="w-3.5 h-3.5" /> Xuất Excel</button>
          {editable && !finalMode && st.kind !== 'final' && <button className={nutPhu} onClick={dungLai} disabled={busy} title="Bỏ bản nháp và dựng lại bảng Cơ sở từ dữ liệu nguồn mới nhất"><RefreshCw className="w-3.5 h-3.5" /> Dựng lại từ dữ liệu mới</button>}
          {editable && !finalMode && <button className={nutChinh + ' !bg-slate-700 hover:!bg-slate-800'} onClick={luu} disabled={busy || (!bao && !!st.id)}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu nháp</button>}
          {editable && !finalMode && <button className={nutChinh} onClick={guiDuyet} disabled={busy}><Send className="w-3.5 h-3.5" /> Gửi duyệt</button>}
          {finalMode && <button className={nutChinh} onClick={luu} disabled={busy}><Crown className="w-3.5 h-3.5" /> Lưu bản Final</button>}
          {finalMode && <button className={nutPhu} onClick={() => nap(st.id)}>Hủy điều chỉnh</button>}
          {duocDuyet && <button className={nutChinh} onClick={() => quyetDinh('approved')} disabled={busy}><CheckCircle2 className="w-3.5 h-3.5" /> Duyệt</button>}
          {duocDuyet && <button className={nutPhu} onClick={() => setDlg({ loai: 'tuchoi' })} disabled={busy}><XCircle className="w-3.5 h-3.5" /> Từ chối</button>}
          {duocTaoDieuChinh && <button className={nutPhu} onClick={() => taoMoi('adjust')} disabled={busy}><GitBranch className="w-3.5 h-3.5" /> Lập bản điều chỉnh</button>}
          {duocFinal && <button className={nutPhu} onClick={vaoCheDoFinal}><Crown className="w-3.5 h-3.5" /> Điều chỉnh (Final)</button>}
          {laAdmin && !finalMode && st.status === 'approved' && donVi?.source === 'oem' && (
            <button className={nutPhu} onClick={apVaoKpi} disabled={busy} title="Ghi đè KPI năm của OEM bằng bản này"><Target className="w-3.5 h-3.5" /> Áp vào KPI OEM</button>
          )}
        </div>
      </div>

      {/* Target + tỷ trọng */}
      {view !== 'preview' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-3 space-y-2">
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <div>
              <div className="text-[11px] font-semibold text-slate-600 mb-1">Cơ sở năm {year - 1} ({nhan})</div>
              <div className="font-mono font-bold text-sm text-slate-900 pt-1.5">{fmt(coSoTong)}</div>
              {daXoa.soDong > 0 && (
                <div className="text-[10px] text-slate-500 pb-1" title="Các dòng đã xóa vẫn được giữ trong cơ sở để so sánh tăng trưởng và tính Target">
                  gồm {fmt(daXoa.base)} của {daXoa.soDong} dòng đã xóa
                </div>
              )}
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Target Grow Rate (%)</label>
              <input value={tangText} disabled={!editable || st.targetApplied} onChange={(e) => setTangText(e.target.value)} onBlur={datTang}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-xs disabled:bg-slate-50" placeholder="vd 15" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 mb-1 block">Target doanh thu năm {year} ({nhan})</label>
              <input value={doanhThuText} disabled={!editable || st.targetApplied} onChange={(e) => setDoanhThuText(e.target.value)} onBlur={datDoanhThu}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="w-36 border border-slate-300 rounded-lg px-2 py-1.5 font-mono text-xs disabled:bg-slate-50" placeholder={tienHienThi === 'USD' ? 'vd 5000000' : 'vd 120500'} />
            </div>
            {editable && !st.targetApplied && <button className={nutChinh} onClick={apDung} disabled={!(st.targetRevenueVnd > 0)}><Wand2 className="w-3.5 h-3.5" /> Apply</button>}
            {editable && st.targetApplied && trangThaiMt.canApplyLai && <button className={nutChinh} onClick={apDung}><Wand2 className="w-3.5 h-3.5" /> Apply lại (tỷ trọng đã đổi)</button>}
            {st.targetApplied && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-1"><Lock className="w-3 h-3" /> Target đã cố định</span>}
            {editable && st.targetApplied && <button className={nutPhu} onClick={moKhoa}><Unlock className="w-3.5 h-3.5" /> Mở khóa Target</button>}
          </div>
          {view === 'plan' && editable && <ShareModeBar mode={cheDo} setMode={setCheDo} months={thangChon} setMonths={setThangChon} nhan={M.NHAN_THANG} />}
          {view === 'plan' && !st.targetApplied && <p className="text-[11px] text-amber-700">Chưa Apply: nhập Target (tăng trưởng % hoặc doanh thu năm), chỉnh tỷ trọng tháng nếu cần rồi bấm Apply.</p>}
          {view === 'plan' && st.targetApplied && trangThaiMt.canApplyLai && <p className="text-[11px] text-amber-700">Tỷ trọng đã đổi — bấm "Apply lại" để doanh thu từng tháng khớp Target × tỷ trọng mới.</p>}
        </div>
      )}

      {!single && (
        <ThanhLoc loc={loc} setLoc={setLoc} giaTri={giaTriLoc} coThiTruong={donVi?.source === 'export'} coSale={donVi?.source === 'export' || donVi?.source === 'oem' || donVi?.source === 'krf'}
          soKhach={locKq.soKhach} tong={locKq.tong} dangLoc={locKq.dangLoc} />
      )}

      {view === 'preview' ? (
        <PreviewTable state={locKq.state} single={single} fmt={fmt} nhan={nhan} dangLoc={locKq.dangLoc} />
      ) : (
        <>
          {editable && !st.lines.length && (
            <div className="mb-2 text-xs rounded-lg px-3 py-2 bg-sky-50 border border-sky-200 text-sky-800 flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" /> Chưa có dòng nào: {single ? '' : 'thêm khách (nếu chưa có) rồi '}bấm <b>Thêm SKU</b>, nhập đơn giá và số lượng từng tháng ở bảng Kế hoạch. Không cần Target / Apply nếu lập tay.
            </div>
          )}
          {editable && view === 'plan' && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {!single && <button className={nutPhu} onClick={() => setDlg({ loai: 'khach' })}><UserPlus className="w-3.5 h-3.5" /> Thêm khách</button>}
              {!single && (
                <select value={themVaoKhach} onChange={(e) => setThemVaoKhach(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white max-w-56">
                  {st.customers.map((c) => <option key={c.key} value={c.key}>{M.tenKhachHienThi(c.key, c.name, donVi?.source)}</option>)}
                </select>
              )}
              <button className={nutPhu} onClick={() => setDlg({ loai: 'sku' })} disabled={!single && !themVaoKhach}><Plus className="w-3.5 h-3.5" /> Thêm SKU</button>
              <button className={nutPhu} onClick={() => setDlg({ loai: 'nho' })}><Trash2 className="w-3.5 h-3.5" /> Xóa hàng loạt</button>
              <span className="text-[11px] text-slate-400 ml-auto">Sửa SL một SKU: các SKU còn lại của cùng khách tự co giãn để doanh thu khách đó không đổi. Khách mới / bớt khách: các khách khác bù để tổng tháng không đổi.</span>
            </div>
          )}
          {editable && view === 'base' && !st.targetApplied && (donVi?.source === 'fc' || donVi?.source === 'krf') && <CopyThang st={st} onCopy={chepThang} />}
          <AnnualGrid
            state={locKq.state} view={view} editable={editable} single={single}
            fmt={fmt} nhan={nhan} tien={tien} dangLoc={locKq.dangLoc} onEditMonthTotal={suaTongThang}
            expanded={expanded}
            onToggle={(k) => setExpanded((e) => { const n = new Set(e); if (n.has(k)) n.delete(k); else n.add(k); return n; })}
            onEditCell={suaO}
            onToggleLock={(k, m) => capNhat((s) => M.doiKhoaO(s, k, m))}
            onDeleteSku={xoaSku}
            onDeleteCustomer={xoaKhach}
            onShareChange={suaTyTrong}
          />
        </>
      )}

      {(kiemTra.loi.length > 0 || kiemTra.canhBao.length > 0) && editable && (
        <div className="mt-3 text-[11px] space-y-1">
          {kiemTra.loi.slice(0, 4).map((t, i) => <div key={i} className="text-rose-700 flex gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{t}</div>)}
          {kiemTra.canhBao.length > 0 && <div className="text-amber-700">{kiemTra.canhBao.length} cảnh báo (đơn giá 0 / SKU mã tạm) — không chặn gửi duyệt.</div>}
        </div>
      )}

      {dlg?.loai === 'tuchoi' && <ReasonDialog title="Từ chối kế hoạch" label="Lý do từ chối *" confirmLabel="Từ chối" onClose={() => setDlg(null)} onConfirm={(t) => quyetDinh('rejected', t)} />}
      {dlg?.loai === 'final' && <ReasonDialog title="Lưu bản Final" label="Lý do điều chỉnh (top-down) *" confirmLabel="Lưu Final" onClose={() => { setDlg(null); setBusy(false); }} onConfirm={luuFinal} />}
      {dlg?.loai === 'khach' && <AddCustomerDialog market={donVi?.source === 'export' || donVi?.source === 'krf'} onClose={() => setDlg(null)} onAdd={themKhach} />}
      {dlg?.loai === 'sku' && <AddSkuDialog tien={tien} customerName={single ? donVi?.name : (st.customers.find((c) => c.key === themVaoKhach)?.name || themVaoKhach)} existing={M.skuTrongBang(st)} onClose={() => setDlg(null)} onAdd={themSku} />}
      {dlg?.loai === 'nho' && <MassDeleteDialog coThanhLy={coThanhLy} soThanhLy={st.lines.filter(M.laThanhLyTheoNhom(ws && ws.skuNhom)).length} preview={(opts) => M.xoaMatHangNho(st, M.laMayMacDinh, optsXoa(opts)).xoa} onClose={() => setDlg(null)} onConfirm={xoaNho} />}
    </div>
  );
}

/** Preview: thu gọn theo khách (đơn vị một khách: theo SKU) — doanh thu 12 tháng + cột tổng năm ở đầu, tăng trưởng cả năm và từng tháng so cơ sở. */
function PreviewTable({ state, single, fmt, nhan, dangLoc }) {
  const dv = M.tomTatDonVi(state);
  const hang = single
    ? state.lines.map((l) => {
      const base = l.qtyBase.map((q) => q * l.priceVnd), plan = l.qty.map((q) => q * l.priceVnd);
      const bt = M.tong(base), pt = M.tong(plan);
      return { key: l.key, name: (l.skuCode || l.tempSkuId) + ' — ' + l.skuName, plan, base, planTotal: pt, growthYear: bt > 0 ? pt / bt - 1 : null, growth: plan.map((v, m) => (base[m] > 0 ? v / base[m] - 1 : null)) };
    })
    : M.tomTatKhach(state).map((c) => ({ key: c.key, name: c.name || c.key, plan: c.plan, base: c.base, planTotal: c.planTotal, growthYear: c.growthYear, growth: c.growth }));
  return (
    <div className="overflow-auto border border-slate-200 rounded-xl bg-white max-h-[68vh]">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="bg-slate-800 text-slate-200">
            <th className="sticky top-0 left-0 z-30 bg-slate-800 w-72 min-w-72 text-left px-3 py-2">{single ? 'SKU' : 'Khách hàng'} ({nhan})</th>
            <th className="sticky top-0 left-72 z-30 bg-slate-800 w-28 min-w-28 text-right px-2 py-2">Tổng năm</th>
            {M.NHAN_THANG.map((t) => <th key={t} className="sticky top-0 z-20 bg-slate-800 w-20 min-w-20 text-right px-2 py-2">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-blue-50 font-bold">
            <td className="sticky left-0 z-10 bg-blue-50 px-3 py-1.5">{dangLoc ? 'Tổng (đang lọc)' : 'Tổng đơn vị'} ({nhan})</td>
            <td className="sticky left-72 z-10 bg-blue-50 text-right px-2 py-1.5 font-mono">{fmt(dv.planTotal)}<div className="text-[10px] font-normal">{M.dinhDangPct(dv.growthYear)}</div></td>
            {dv.plan.map((v, m) => <td key={m} className="text-right px-2 py-1.5 font-mono">{fmt(v)}<div className={`text-[10px] font-normal ${dv.growth[m] !== null && dv.growth[m] < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{M.dinhDangPct(dv.growth[m])}</div></td>)}
          </tr>
          {hang.map((h) => (
            <tr key={h.key} className="border-b border-slate-100">
              <td className="sticky left-0 z-10 bg-white px-3 py-1 truncate max-w-72">{h.name}</td>
              <td className="sticky left-72 z-10 bg-white text-right px-2 py-1 font-mono font-semibold">{fmt(h.planTotal)}<div className="text-[10px] font-normal text-slate-500">{M.dinhDangPct(h.growthYear)}</div></td>
              {h.plan.map((v, m) => <td key={m} className="text-right px-2 py-1 font-mono">{fmt(v)}<div className={`text-[10px] ${h.growth[m] !== null && h.growth[m] < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{M.dinhDangPct(h.growth[m], 0)}</div></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Đơn vị Brand: tháng dự kiến để trống (thiếu dữ liệu các tháng cũ) — điền tay từng ô hoặc COPY SL của tháng n sang tháng dự kiến. */
function CopyThang({ st, onCopy }) {
  const dau = st.baselineLastMonth + 1;                       // tháng dự kiến đầu tiên
  const [nguon, setNguon] = useState(Math.max(0, st.baselineLastMonth));
  const [dich, setDich] = useState('tat');
  const thangDuKien = M.NHAN_THANG.map((t, m) => m).filter((m) => m >= dau);
  if (!thangDuKien.length) return null;
  const chay = () => onCopy(nguon, dich === 'tat' ? thangDuKien : [Number(dich)]);
  const o = 'border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white';
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2 text-xs bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2">
      <span className="font-semibold text-slate-700">Kênh Brand — tháng dự kiến để trống, điền tay hoặc:</span>
      <span>Copy SL từ</span>
      <select value={nguon} onChange={(e) => setNguon(Number(e.target.value))} className={o}>{M.NHAN_THANG.map((t, m) => <option key={t} value={m}>{t}{m <= st.baselineLastMonth ? ' (thực hiện)' : ''}</option>)}</select>
      <span>sang</span>
      <select value={dich} onChange={(e) => setDich(e.target.value)} className={o}>
        <option value="tat">tất cả tháng dự kiến</option>
        {thangDuKien.map((m) => <option key={m} value={m}>{M.NHAN_THANG[m]}</option>)}
      </select>
      <button className={nutPhu} onClick={chay}>Copy</button>
    </div>
  );
}
