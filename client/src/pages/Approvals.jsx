import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { CheckCircle2, XCircle, MessageSquare, Clock, ShieldCheck } from 'lucide-react';

export default function Approvals({ currentBU, currentUser }) {
  const [approvals, setApprovals] = useState([]);
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadApprovals();
  }, [currentBU]);

  const loadApprovals = async () => {
    try {
      setLoading(true);
      const list = await api.getApprovals();
      setApprovals(list);
      if (list.length > 0) {
        setSelectedApproval(list[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (decision) => {
    if (!selectedApproval) return;
    try {
      setProcessing(true);
      await api.decideApproval(selectedApproval.id, decision, comment, currentUser ? currentUser.id : null);
      setComment('');
      loadApprovals();
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
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

              {/* Approver Action Panel */}
              {selectedApproval.status === 'pending' && (
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
