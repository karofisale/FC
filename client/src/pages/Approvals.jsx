import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import HopChoDuyet from '../components/annual/HopChoDuyet';
import { monthLabelFull } from '../utils/period';
import { appConfirm } from '../services/dialogService';
import { thongBao } from '../services/toastService';
import { useTableSort } from '../utils/useTableSort';
import { roleLabel, ngayGioVN } from '../utils/glossary';
import { SortIcon, StateBlock, SortTh } from '../components/TableStates';
import {
  CheckCircle2, XCircle, MessageSquare, Clock,
  TrendingUp, TrendingDown, Minus, Layers
} from 'lucide-react';

const CHUA_CO = [];
const maYeuCau = (a) => a.id;
const maNhom = (g) => g.product_group_code;
// Cột sắp xếp của danh sách yêu cầu duyệt: chữ / ngày / ngày.
const COT_DANH_SACH = {
  donVi: { type: 'text', get: (a) => a.business_unit_code },
  chuKy: { type: 'date', get: (a) => a.base_month },
  ngayGui: { type: 'date', get: (a) => a.requested_at },
  trangThai: { type: 'text', get: (a) => a.status }
};

/**
 * Màn Phê duyệt. Danh sách tách làm HAI nhóm rõ ràng (Rà soát 4 app, Đợt 3 mục 5): "Chờ duyệt" (việc cần làm) và "Lịch sử"
 * (đã duyệt / từ chối / bị thay thế) — trước đây trộn chung một danh sách nên đơn chờ chìm giữa các đơn cũ.
 * `keHoachNamChoDuyet` + `onMoKeHoachNam`: kế hoạch năm chờ duyệt (App gom từ API sẵn có) — duyệt ở màn Kế hoạch năm nên chỉ liệt kê và dẫn sang.
 */
export default function Approvals({ currentBU, user, onCountChange, keHoachNamChoDuyet = [], onMoKeHoachNam }) {
  const [approvals, setApprovals] = useState([]);
  const [tab, setTab] = useState('cho');                 // 'cho' | 'lichSu'
  const [selectedId, setSelectedId] = useState('');
  const [comment, setComment] = useState('');
  const [loiYKien, setLoiYKien] = useState('');          // từ chối mà chưa ghi lý do
  const oYKien = useRef(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loiTai, setLoiTai] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryTick, setSummaryTick] = useState(0);        // tăng để bấm "Thử lại" tải lại số liệu
  // Số liệu tổng hợp backend đã gửi kèm cho mục đầu tiên, để không gọi lại
  const [preloadedSummary, setPreloadedSummary] = useState(null);

  // Chỉ người thẩm định của đơn vị (hoặc quản trị) mới thấy nút quyết định
  const canApprove = user?.role === 'bu_approver' || user?.role === 'central_admin';

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    setLoiTai(null);
    try {
      // Một lượt gọi lấy cả danh sách lẫn số liệu tổng hợp của mục đầu tiên,
      // thay vì getApprovals rồi mới getVersionSummary ở effect kế tiếp.
      const ws = await api.getApprovalsWorkspace({ bu: currentBU });
      const list = ws.approvals || [];
      setApprovals(list);
      const chosen = list[0] || null;
      onCountChange?.(list.filter((a) => a.status === 'pending').length);
      // Chỉ dùng được khi mục đang chọn đúng là mục backend đã tính sẵn
      if (ws.summary && chosen) setPreloadedSummary({ versionId: chosen.version_id, data: ws.summary });
    } catch (err) {
      // Lỗi tải: cột danh sách hiện lỗi + "Thử lại", không im lặng thành "Chưa có yêu cầu nào".
      setLoiTai(err.message);
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, [currentBU, onCountChange]);

  useEffect(() => {
    if (currentBU) loadApprovals();
  }, [currentBU, loadApprovals]);

  // Hai nhóm: việc cần làm (pending) và lịch sử (mọi trạng thái khác). Mục đang xem luôn thuộc nhóm đang mở:
  // đổi nhóm / tải lại mà mục cũ không còn trong nhóm thì chọn mục đầu của nhóm.
  const dsCho = approvals.filter((a) => a.status === 'pending');
  const dsLichSu = approvals.filter((a) => a.status !== 'pending');
  const dsHienTai = tab === 'cho' ? dsCho : dsLichSu;
  const selectedApproval = dsHienTai.find((a) => a.id === selectedId) || dsHienTai[0] || null;

  const chonYeuCau = (app) => {
    // Ý kiến đang gõ thuộc về yêu cầu đang xem — đổi yêu cầu thì bỏ, kẻo gửi nhầm lý do của đơn này cho đơn khác.
    if (app.id !== selectedApproval?.id) { setComment(''); setLoiYKien(''); }
    setSelectedId(app.id);
  };
  const doiTab = (t) => {
    if (t === tab) return;
    setTab(t);
    setSelectedId('');
    setComment('');
    setLoiYKien('');
  };

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
  }, [selectedApproval?.version_id, preloadedSummary, summaryTick]);

  const handleDecision = async (decision) => {
    if (!selectedApproval) return;
    const duyet = decision === 'approved';
    const ly = comment.trim();
    // Từ chối PHẢI có lý do (như Kế hoạch năm): đơn vị cần biết sửa gì — không để một lần từ chối trống trơn.
    if (!duyet && !ly) {
      setLoiYKien('Ghi lý do từ chối để đơn vị biết cần sửa gì.');
      oYKien.current?.focus();
      return;
    }
    if (!(await appConfirm(
      duyet ? 'Duyệt kế hoạch này? Không thể hoàn tác sau khi duyệt.' : 'Từ chối kế hoạch này? Đơn vị sẽ phải sửa và gửi lại.',
      duyet
        ? { title: 'Duyệt kế hoạch?', okLabel: 'Duyệt kế hoạch' }
        : { title: 'Từ chối kế hoạch?', okLabel: 'Từ chối kế hoạch', danger: true }
    ))) return;
    setProcessing(true);
    try {
      await api.decideApproval(selectedApproval.id, decision, ly);
      setComment('');
      setLoiYKien('');
      await loadApprovals();
      thongBao({ type: 'success', text: duyet ? 'Đã duyệt kế hoạch.' : 'Đã từ chối kế hoạch.' });
    } catch (err) {
      thongBao({ type: 'error', text: err.message });
    } finally {
      setProcessing(false);
    }
  };

  // Sắp xếp danh sách yêu cầu (theo đơn vị / chu kỳ / ngày gửi / trạng thái) và bảng số liệu theo nhóm hàng.
  const { rows: dsXep, spec: sortDs, toggle: doiSapXepDs } = useTableSort(dsHienTai, COT_DANH_SACH, maYeuCau);
  const cotNhom = {
    nhom: { type: 'text', get: (g) => g.product_group_name },
    tong: { type: 'number', get: (g) => g.total }
  };
  (summary?.months || CHUA_CO).forEach((m) => { cotNhom['t:' + m] = { type: 'number', get: (g) => g.months[m] || 0 }; });
  const { rows: nhomXep, spec: sortNhom, toggle: doiSapXepNhom } = useTableSort(summary?.byGroup || CHUA_CO, cotNhom, maNhom);

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
            QUY TRÌNH THẨM ĐỊNH & PHÊ DUYỆT FORECAST
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dành cho Bộ phận Tài chính / Cấp Quản lý Đơn vị thẩm định và phê duyệt kế hoạch bán hàng.
          </p>
        </div>
      </div>

      {/* Kế hoạch NĂM đang chờ duyệt: duyệt ở màn Kế hoạch năm, ở đây chỉ liệt kê và dẫn sang đúng đơn vị × năm */}
      {canApprove && keHoachNamChoDuyet.length > 0 && onMoKeHoachNam && (
        <HopChoDuyet items={keHoachNamChoDuyet} onMo={onMoKeHoachNam} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Approval List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div role="tablist" aria-label="Nhóm yêu cầu duyệt" className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase">
            {[['cho', 'Chờ duyệt', dsCho.length], ['lichSu', 'Lịch sử', dsLichSu.length]].map(([k, t, n]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => doiTab(k)}
                className={`flex-1 px-3 py-3 border-b-2 ${tab === k ? 'border-blue-600 text-blue-800 bg-white' : 'border-transparent text-slate-600 hover:bg-slate-100'}`}
              >
                {t} ({n})
              </button>
            ))}
          </div>

          {/* Sắp xếp danh sách: bấm lần 1 tăng, lần 2 giảm, lần 3 về thứ tự gốc */}
          {dsHienTai.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-slate-200 text-[11px] text-slate-600">
              <span className="mr-1">Sắp xếp:</span>
              {[['donVi', 'Đơn vị'], ['chuKy', 'Chu kỳ'], ['ngayGui', 'Ngày gửi'], ['trangThai', 'Trạng thái']].map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => doiSapXepDs(k)}
                  aria-sort={sortDs && sortDs.key === k ? (sortDs.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${sortDs && sortDs.key === k ? 'bg-blue-50 border-blue-300 text-blue-800 font-semibold' : 'bg-white border-slate-300 hover:bg-slate-50'}`}
                >
                  {t}<SortIcon spec={sortDs} sortKey={k} />
                </button>
              ))}
            </div>
          )}

          <div className="divide-y divide-slate-200 max-h-[500px] overflow-y-auto">
            {loading ? (
              <StateBlock kind="loading" text="Đang tải danh sách yêu cầu..." />
            ) : loiTai ? (
              <StateBlock kind="error" text={loiTai} onRetry={loadApprovals} />
            ) : dsHienTai.length === 0 ? (
              <StateBlock
                kind="empty"
                text={tab === 'cho'
                  ? (dsLichSu.length ? 'Không có yêu cầu nào đang chờ duyệt. Xem tab Lịch sử để tra các lần duyệt trước.' : 'Chưa có yêu cầu phê duyệt nào')
                  : 'Chưa có yêu cầu nào đã được xử lý'}
              />
            ) : (
              dsXep.map(app => {
                const isSelected = selectedApproval && selectedApproval.id === app.id;
                return (
                  <div
                    key={app.id}
                    onClick={() => chonYeuCau(app)}
                    className={`p-4 cursor-pointer transition ${isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-slate-900 text-sm">{app.business_unit_code} - {app.business_unit_name}</span>
                      <StatusBadge status={app.status} />
                    </div>
                    <p className="text-xs text-slate-600">Chu kỳ: {monthLabelFull(app.base_month)} | Tuần {app.update_week}</p>
                    <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Gửi {ngayGioVN(app.requested_at)}
                      {app.decided_at ? ` · xử lý ${ngayGioVN(app.decided_at)}` : ''}
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
                    Chu kỳ: <strong>{monthLabelFull(selectedApproval.base_month)}</strong> | Cập nhật Tuần <strong>{selectedApproval.update_week}</strong>
                  </p>
                </div>
                <StatusBadge status={selectedApproval.status} />
              </div>

              {/* Workflow timeline info */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Thời gian gửi duyệt:</span>
                  <span className="font-mono text-slate-800">{ngayGioVN(selectedApproval.requested_at)}</span>
                </div>
                {selectedApproval.decided_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thời gian quyết định:</span>
                    <span className="font-mono text-slate-800">{ngayGioVN(selectedApproval.decided_at)}</span>
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
                  <StateBlock kind="loading" text="Đang tải số liệu..." />
                ) : summaryError ? (
                  <StateBlock kind="error" text={summaryError} onRetry={() => { setPreloadedSummary(null); setSummaryTick((t) => t + 1); }} />
                ) : !summary || summary.byGroup.length === 0 ? (
                  <StateBlock kind="empty" text="Chưa có dữ liệu Forecast tháng nào được nhập cho bản này." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-white border-b border-slate-200 text-slate-500">
                        <tr>
                          <SortTh label="Nhóm hàng" sortKey="nhom" spec={sortNhom} onSort={doiSapXepNhom} className="text-left font-semibold py-2 px-3" />
                          {summary.months.map((m) => (
                            <SortTh key={m} label={monthLabelFull(m)} sortKey={'t:' + m} spec={sortNhom} onSort={doiSapXepNhom} className="text-right font-semibold py-2 px-3 whitespace-nowrap" />
                          ))}
                          <SortTh label="Tổng" sortKey="tong" spec={sortNhom} onSort={doiSapXepNhom} className="text-right font-semibold py-2 px-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {nhomXep.map((g) => (
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
                  <strong> {roleLabel(user?.role)}</strong> của bạn chỉ được xem trạng thái.
                </div>
              )}

              {selectedApproval.status === 'pending' && canApprove && (
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-4">
                  <h4 className="text-xs font-bold uppercase text-blue-900 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    Ý KIẾN PHÊ DUYỆT CỦA CẤP THẨM ĐỊNH
                  </h4>

                  <div>
                    <label htmlFor="y-kien-duyet" className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Ý kiến thẩm định — <span className="text-rose-700">bắt buộc khi từ chối</span>
                    </label>
                    <textarea
                      id="y-kien-duyet"
                      ref={oYKien}
                      rows="3"
                      placeholder="Ghi chú khi duyệt, hoặc lý do từ chối để đơn vị biết cần sửa gì..."
                      value={comment}
                      aria-invalid={!!loiYKien}
                      aria-describedby={loiYKien ? 'y-kien-loi' : undefined}
                      onChange={(e) => { setComment(e.target.value); if (loiYKien) setLoiYKien(''); }}
                      className={`w-full p-3 bg-white border rounded-lg text-xs outline-none focus:border-blue-500 ${loiYKien ? 'border-rose-500 ring-1 ring-rose-300' : 'border-slate-300'}`}
                    />
                    {loiYKien && <p id="y-kien-loi" role="alert" className="text-[11px] text-rose-700 font-semibold mt-1">{loiYKien}</p>}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch gap-3">
                    <button
                      onClick={() => handleDecision('approved')}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center space-x-2 bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 rounded-lg text-xs font-bold shadow transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Duyệt kế hoạch</span>
                    </button>

                    <button
                      onClick={() => handleDecision('rejected')}
                      disabled={processing}
                      className="flex-1 flex items-center justify-center space-x-2 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Từ chối / yêu cầu sửa</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
              {tab === 'cho' ? 'Không có yêu cầu nào cần duyệt lúc này.' : 'Chọn một yêu cầu ở cột bên trái để xem chi tiết.'}
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
      <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
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
