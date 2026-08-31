import React, { useState } from 'react';
import { FileSpreadsheet, Download, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { monthLabel, currentMonth, weeksOfMonth } from '../utils/period';
import { downloadWorkbook, buildB0SumSheet, buildB1SumSheet } from '../utils/excelExport';
import { buildSapRows, SAP_CHANNELS } from '../utils/sapExport';
import { downloadZpp702 } from '../utils/zpp702Workbook';

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

  /**
   * File upload SAP cho XK và OEM.
   *
   * Lấy số từ BẢN ĐÃ DUYỆT. Kênh nào chưa có phê duyệt thì KHÔNG xuất và
   * nói rõ — một file SAP thiếu hẳn một kênh trông vẫn bình thường, rất dễ
   * upload xong mới phát hiện.
   */
  const handleExportSap = async () => {
    setBusy('sap');
    setMessage(null);
    try {
      const data = await api.getSapExport(monthValue);
      const exportedAt = new Date();
      const done = [];
      const skipped = [];
      const folded = [];

      Object.keys(SAP_CHANNELS).forEach((channel) => {
        if ((data.missingApproval || []).includes(channel)) {
          skipped.push(`${channel} (chưa có bản duyệt)`);
          return;
        }
        const rows = buildSapRows({
          channel,
          baseMonth: data.baseMonth,
          rows: data.rows,
          weekly: data.weekly,
          exportedAt
        });
        if (!rows.length) {
          skipped.push(`${channel} (không có SKU nào có số)`);
          return;
        }
        const plant = SAP_CHANNELS[channel].plant;
        downloadZpp702(rows, `ZPP702_Upload_KHKD_${plant}_${channel}_${baseMonth}.xlsx`);
        done.push(`${channel}: ${rows.length} dòng, ngày ${rows[0][8]}`);
        // Dồn tuần 5 vào W4 là thay đổi số thật — phải nói ra, không để im.
        if (rows.foldedWeeks && rows.foldedWeeks.length) {
          const total = rows.foldedWeeks.reduce((s, f) => s + f.quantity, 0);
          folded.push(`${channel}: ${rows.foldedWeeks.length} SKU có tuần 5 (${total.toLocaleString('vi-VN')} cái) được dồn vào W4`);
        }
      });

      if (!done.length) {
        setMessage({ type: 'error', text: `Không xuất được file nào — ${skipped.join('; ')}.` });
        return;
      }
      setMessage({
        type: skipped.length ? 'error' : 'success',
        text: `Đã xuất ${done.join(' | ')}.` +
          (skipped.length ? `  CHƯA xuất: ${skipped.join('; ')}.` : '') +
          (folded.length ? `  LƯU Ý — ${folded.join('; ')}.` : '')
      });
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
          description="Ba file upload SAP (XK, OEM, GT2) dùng được ngay, lấy số từ bản đã duyệt. Kênh nào chưa duyệt thì không xuất và báo rõ."
          busy={busy === 'sap'}
          onClick={handleExportSap}
        />

      </div>


      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-2">
        <div className="flex items-center gap-2 font-bold">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Khác biệt so với file anh đang làm tay
        </div>
        <ul className="list-disc list-inside space-y-1 text-amber-800">
          <li><strong>Không còn dòng toàn số 0.</strong> File làm tay xuất trọn danh mục (492/756 dòng XK tháng 7 là số 0); app chỉ xuất SKU có số. Nếu SAP không xoá kế hoạch cũ trước khi nạp, SKU tụt về 0 sẽ giữ nguyên số cũ trên SAP.</li>
          <li><strong>File chỉ có sheet ZPP702</strong>, không kèm 6 sheet tài liệu và không có định dạng màu/viền của form gốc. Giá trị, kiểu ô và công thức dòng 2 giống hệt.</li>
          <li><strong>VSE/VSF</strong> theo quy tắc mã đầu 1, trừ khi danh mục Products có ghi sẵn cột <code>requirements_type</code> — 6 mã Lõi/Màng đầu 2 của XK cần điền VSE ở đó.</li>
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
