import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { monthLabel } from '../utils/period';
import {
  CheckCircle2, XCircle, MessageSquare, Clock, ShieldCheck, AlertCircle, Loader2,
  TrendingUp, TrendingDown, Minus, Layers
} from 'lucide-react';

export default function Approvals({ currentBU, user, onCountChange }) {
  const [approvals, setApprovals] = useState([]);
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  // Số liệu tổng hợp backend đã gửi kèm cho mục đầu tiên, để không gọi lại
  const [preloadedSummary, setPreloadedSummary] = useState(null);

  // Chỉ người thẩm định của đơn vị (hoặc quản trị) mới thấy nút quyết định
  const canApprove = user?.role === 'bu_approver' || user?.role === 'central_admin';

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Một lượt gọi lấy cả danh sách lẫn số liệu tổng hợp của mục đầu tiên,
      // thay vì getApprovals rồi mới getVersionSummary ở effect kế tiếp.
      const ws = await api.getApprovalsWorkspace({ bu: currentBU });
      const list = ws.approvals || [];
      setApprovals(list);
      const chosen = list[0] || null;
      setSelectedApproval((prev) => list.find((a) => a.id === prev?.id) || chosen);
      onCountChange?.(list.filter((a) => a.status === 'pending').length);
      // Chỉ dùng được khi mục đang chọn đúng là mục backend đã tính sẵn
      if (ws.summary && chosen) setPreloadedSummary({ versionId: chosen.version_id, data: ws.summary });
    } catch (err) {
      setError(err.message);
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [currentBU, onCountChange]);

  useEffect(() => {
    if (currentBU) loadApprovals();
  }, [currentBU, loadApprovals]);

  // Tải số liệu tổng hợp của version đang xem, để người duyệt thấy số
  // thật thay vì chỉ thấy tên đơn vị và tuần cập nhật.
  useEffect(() => {
    if (!selectedApproval?.version_id) {
      setSummary(null);
      return;
    }
    // Mục đầu tiên đã có sẵn số liệu từ lượt gọi gộp — không gọi lại.
    if (preloadedSummary && preloadedSummary.versionId === selectedApproval.version_id) {
      setSummary(preloadedSummary.data);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    let cancelled = false;
    setSummaryLoading(true);
    setSummaryError(null);
    api.getVersionSummary(selectedApproval.version_id)
      .then((res) => { if (!cancelled) setSummary(res); })
      .catch((err) => { if (!cancelled) setSummaryError(err.message); })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, [selectedApproval?.version_id, preloadedSummary]);

  const handleDecision = async (decision) => {
    if (!selectedApproval) return;
    setProcessing(true);
    setError(null);
    try {
      await api.decideApproval(selectedApproval.id, decision, comment);
      setComment('');
      await loadApprovals();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            QUY TRÌNH THẨM ĐỊNH & PHÊ DUYỆT FORECAST
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dành cho Bộ phận Tài chính / Cấp Quản lý Đơn vị thẩm định và phê duyệt kế hoạch bán hàng.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải danh sách yêu cầu...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Approval List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs uppercase text-slate-700">
            DANH SÁCH YÊU CẦU DUYỆT ({approvals.length})
          </div>

          <div className="divide-y divide-slate-200 max-h-[500px] overflow-y-auto">
            {approvals.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">Chưa có yêu cầu phê duyệt nào</div>
            ) : (
              approvals.map(app => {
                const isSelected = selectedApproval && selectedApproval.id === app.id;
                return (
                  <div
                    key={app.id}
                    onClick={() => setSelectedApproval(app)}
                    className={`p-4 cursor-pointer transition ${isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900 text-sm">{app.business_unit_code} - {app.business_unit_name}</span>
                      <StatusBadge status={app.status} />
                    </div>
                    <p className="text-xs text-slate-600 font-mono">Chu kỳ: {app.base_month} | Tuần {app.update_week}</p>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="w-3.0 h-3.0" /> {new Date(app.requested_at).toLocaleString('vi-VN')}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Approval Action & Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selectedApproval ? (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Kế hoạch Forecast: {selectedApproval.business_unit_name} ({selectedApproval.business_unit_code})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chu kỳ: <strong>{selectedApproval.base_month}</strong> | Cập nhật Tuần <strong>{selectedApproval.update_week}</strong>
                  </p>
                </div>
                <StatusBadge status={selectedApproval.status} />
              </div>

              {/* Workflow timeline info */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Thời gian gửi duyệt:</span>
                  <span className="font-mono text-slate-800">{new Date(selectedApproval.requested_at).toLocaleString('vi-VN')}</span>
                </div>
                {selectedApproval.decided_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thời gian quyết định:</span>
                    <span className="font-mono text-slate-800">{new Date(selectedApproval.decided_at).toLocaleString('vi-VN')}</span>
                  </div>
                )}
                {selectedApproval.requested_by_name && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Người gửi duyệt:</span>
                    <span className="font-semibold text-slate-800">{selectedApproval.requested_by_name}</span>
                  </div>
                )}
                {selectedApproval.approver_name && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Người thẩm định:</span>
                    <span className="font-semibold text-slate-800">{selectedApproval.approver_name}</span>
                  </div>
                )}
                {selectedApproval.comment && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <span className="text-slate-500 block mb-1">Ghi chú / Ý kiến thẩm định:</span>
                    <p className="italic text-slate-700 bg-white p-2 rounded border border-slate-200">{selectedApproval.comment}</p>
                  </div>
                )}
              </div>

              {/* Số liệu kế hoạch đang chờ duyệt — để không còn "duyệt mù" */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-500" />
                    Số liệu kế hoạch đang chờ duyệt
                  </h4>
                  {summary && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono font-bold text-slate-900">
                        {summary.currentTotal.toLocaleString('vi-VN')} chiếc
                      </span>
                      {summary.previousTotal !== null && (
                        <VarianceBadge current={summary.currentTotal} previous={summary.previousTotal} label={summary.previousVersionLabel} />
                      )}
                    </div>
                  )}
                </div>

                {summaryLoading ? (
                  <div className="p-4 text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải số liệu...
                  </div>
                ) : summaryError ? (
                  <div className="p-4 text-xs text-rose-700 bg-rose-50">{summaryError}</div>
                ) : !summary || summary.byGroup.length === 0 ? (
                  <div className="p-4 text-xs text-slate-400">Chưa có dữ liệu Forecast tháng nào được nhập cho bản này.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-white border-b border-slate-200 text-slate-500">
                        <tr>
                          <th className="text-left font-semibold py-2 px-3">Nhóm hàng</th>
                          {summary.months.map((m) => (
                            <th key={m} className="text-right font-semibold py-2 px-3 whitespace-nowrap">{monthLabel(m)}</th>
                          ))}
                          <th className="text-right font-semibold py-2 px-3">Tổng</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {summary.byGroup.map((g) => (
                          <tr key={g.product_group_code}>
                            <td className="py-1.5 px-3 font-sans text-slate-700">{g.product_group_name}</td>
                            {summary.months.map((m) => (
                              <td key={m} className="text-right py-1.5 px-3 text-slate-800">
                                {(g.months[m] || 0).toLocaleString('vi-VN')}
                              </td>
                            ))}
                            <td className="text-right py-1.5 px-3 font-bold text-slate-900">{g.total.toLocaleString('vi-VN')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                          <td className="py-2 px-3 font-sans">TỔNG CỘNG</td>
                          {summary.months.map((m) => {
                            const total = summary.byGroup.reduce((s, g) => s + (g.months[m] || 0), 0);
                            return <td key={m} className="text-right py-2 px-3">{total.toLocaleString('vi-VN')}</td>;
                          })}
                          <td className="text-right py-2 px-3">{summary.currentTotal.toLocaleString('vi-VN')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Approver Action Panel */}
              {selectedApproval.status === 'pending' && !canApprove && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
                  Yêu cầu đang chờ cấp thẩm định của đơn vị xử lý. Vai trò
                  <strong> {user?.role}</strong> của bạn chỉ được xem trạng thái.
                </div>
              )}

              {selectedApproval.status === 'pending' && canApprove && (
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-4">
                  <h4 className="text-xs font-bold uppercase text-blue-900 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    Ý KIẾN PHÊ DUYỆT CỦA CẤP THẨM ĐỊNH
                  </h4>

                  <textarea
                    rows="3"
                    placeholder="Nhập ghi chú hoặc lý do chấp thuận / từ chối kế hoạch này..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
                  />

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleDecision('approved')}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-xs font-bold shadow transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>DUYỆT KẾ HOẠCH (APPROVE)</span>
                    </button>

                    <button
                      onClick={() => handleDecision('rejected')}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-lg text-xs font-bold shadow transition disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>TỪ CHỐI / YÊU CẦU SỬA (REJECT)</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
              Chọn một yêu cầu phê duyệt ở cột bên trái để xem chi tiết
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

function VarianceBadge({ current, previous, label }) {
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((diff / previous) * 1000) / 10 : null;

  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
        <Minus className="w-3 h-3" /> Không đổi so với {label}
      </span>
    );
  }

  const up = diff > 0;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${up ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{diff.toLocaleString('vi-VN')}{pct !== null ? ` (${up ? '+' : ''}${pct}%)` : ''} so với {label}
    </span>
  );
}
