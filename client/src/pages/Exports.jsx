import React, { useState } from 'react';
import { FileSpreadsheet, Download, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { monthLabel, currentMonth, weeksOfMonth } from '../utils/period';
import {
  downloadWorkbook, buildB0SumSheet, buildB1SumSheet,
  buildXkSheet, buildOemSheet, buildGt2Sheet
} from '../utils/excelExport';

export default function Exports({ user }) {
  const [baseMonth, setBaseMonth] = useState(currentMonth().slice(0, 7));
  const [busy, setBusy] = useState(null); // 'b0' | 'b1' | 'sap' | null
  const [message, setMessage] = useState(null);

  const canExport = user?.role === 'central_admin' || user?.role === 'viewer';

  const monthValue = `${baseMonth}-01`;

  const handleExportB0 = async () => {
    setBusy('b0');
    setMessage(null);
    try {
      const data = await api.getB0SumExport(monthValue);
      if (!data.rows.length) {
        setMessage({ type: 'error', text: `Không có dữ liệu forecast cho ${monthLabel(monthValue)}.` });
        return;
      }
      const aoa = buildB0SumSheet(data);
      downloadWorkbook([['B0.SUM', aoa]], `B0.SUM_${baseMonth}.xlsx`);
      setMessage({ type: 'success', text: `Đã xuất B0.SUM: ${data.rows.length} SKU, ${data.businessUnits.length} đơn vị.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const handleExportB1 = async () => {
    setBusy('b1');
    setMessage(null);
    try {
      const rows = await api.getB1Summary(monthValue);
      if (!rows.length) {
        setMessage({ type: 'error', text: `Không có dữ liệu tuần/miền cho ${monthLabel(monthValue)}.` });
        return;
      }
      const weeks = weeksOfMonth(monthValue);
      const regions = [...new Set(rows.map((r) => r.region_code))].sort();
      const aoa = buildB1SumSheet(rows, weeks, regions);
      downloadWorkbook([['B1.SUM', aoa]], `B1.SUM_${baseMonth}.xlsx`);
      setMessage({ type: 'success', text: `Đã xuất B1.SUM: ${weeks.length} tuần, ${regions.length} miền.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(null);
    }
  };

  const handleExportSap = async () => {
    setBusy('sap');
    setMessage(null);
    try {
      const [b0Export, weeklyExport] = await Promise.all([
        api.getB0SumExport(monthValue),
        api.getSapGt2Weekly(monthValue)
      ]);
      if (!b0Export.rows.length) {
        setMessage({ type: 'error', text: `Không có dữ liệu forecast cho ${monthLabel(monthValue)}.` });
        return;
      }
      downloadWorkbook([['ZPP702', buildXkSheet(b0Export)]], `ZPP702_Upload_KHKD_0400_XK_${baseMonth}.xlsx`);
      downloadWorkbook([['ZPP702', buildOemSheet(b0Export)]], `ZPP702_Upload_KHKD_0400_OEM_${baseMonth}.xlsx`);
      downloadWorkbook([['ZPP702', buildGt2Sheet(b0Export, weeklyExport)]], `ZPP702_Upload_KHKD_0200_GT2_${baseMonth}.xlsx`);
      setMessage({ type: 'success', text: 'Đã xuất 3 file ZPP702 (XK, OEM, GT2). Đối chiếu kỹ trước khi dùng — xem cảnh báo bên dưới.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(null);
    }
  };

  if (!canExport) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
        Chỉ Quản trị hệ thống hoặc người xem báo cáo mới xuất được các file tổng hợp toàn công ty.
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            XUẤT BÁO CÁO
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Tổng hợp toàn công ty (mọi đơn vị kinh doanh), theo chu kỳ tháng đã chọn.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Chu kỳ (tháng 1):</span>
          <input
            type="month"
            value={baseMonth}
            onChange={(e) => setBaseMonth(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        <ExportCard
          title="B0.SUM"
          description="Sản lượng theo SKU × đơn vị kinh doanh × 4 tháng. Khuôn cột khớp file XK_OEM_GT2_Online_Sales FC gốc để đối chiếu song song hai hệ."
          busy={busy === 'b0'}
          onClick={handleExportB0}
        />

        <ExportCard
          title="B1.SUM"
          description="Tổng theo Nhóm hàng × Tuần × Miền, gộp mọi đơn vị. Bản GỌN — không tách theo từng kênh và không có cột chênh lệch giữa các lần cập nhật như file gốc (272 cột); dùng màn Phê duyệt để xem chênh lệch."
          busy={busy === 'b1'}
          onClick={handleExportB1}
        />

        <ExportCard
          title="SAP ZPP702"
          description="3 file upload SAP (XK, OEM, GT2), theo đúng logic quy đổi từ skill upload-fc-sap."
          busy={busy === 'sap'}
          onClick={handleExportSap}
          warning
        />

      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-2">
        <div className="flex items-center gap-2 font-bold">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Trước khi dùng file ZPP702 để upload SAP thật
        </div>
        <ul className="list-disc list-inside space-y-1 text-amber-800">
          <li>File xuất ra <strong>không phải</strong> file template ZPP702 thật (không có sẵn để đối chiếu khi viết tính năng này) — cột A-U đúng vị trí, nhưng dòng tiêu đề là diễn giải, không phải tiêu đề gốc. Dán phần dữ liệu (từ dòng 3) vào đúng cột trong template thật trước khi upload.</li>
          <li>Cột tháng của kênh <strong>GT2</strong> (O-U) đang lấy trung bình chia đều sản lượng <em>riêng GT2</em> — bản gốc dùng tổng <em>toàn công ty</em> chia đều. Đây là điểm khác biệt cố ý đơn giản hoá, cần đối chiếu số thật trước khi tin dùng.</li>
          <li>Đối chiếu từng dòng với cách làm thủ công hiện tại ít nhất 1 tháng trước khi thay thế hẳn.</li>
        </ul>
      </div>

    </div>
  );
}

function ExportCard({ title, description, busy, onClick, warning }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col">
      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
        {title}
        {warning && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
      </h3>
      <p className="text-xs text-slate-500 mt-1 flex-1">{description}</p>
      <button
        onClick={onClick}
        disabled={busy}
        className="mt-3 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-semibold"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {busy ? 'Đang xuất...' : 'Xuất Excel'}
      </button>
    </div>
  );
}
