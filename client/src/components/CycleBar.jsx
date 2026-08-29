import React, { useState } from 'react';
import { CalendarPlus, GitBranch, Loader2, AlertCircle, Unlock, X } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { api } from '../services/api';
import { currentMonth, isoWeekLabel, monthLabel, todayISO } from '../utils/period';

/**
 * Thanh chọn chu kỳ / bản cập nhật, kèm ba thao tác mà bản cũ không có
 * đường nào bấm được: mở chu kỳ tháng mới, chốt bản cập nhật tuần, và mở
 * lại chu kỳ đã duyệt khi số đã duyệt bị sai.
 *
 * canReopen tách riêng khỏi canEdit vì đây là quyền của người THẨM ĐỊNH:
 * người đã duyệt mới là người được rút lại phê duyệt, không phải người lập
 * kế hoạch. Backend cũng kiểm lại vai trò này, nút chỉ là lớp hiển thị.
 */
export default function CycleBar({
  currentBU,
  cycles,
  selectedCycle,
  onSelectCycle,
  versions,
  selectedVersion,
  onSelectVersion,
  canEdit,
  canReopen,
  onChanged
}) {
  const [creating, setCreating] = useState(null); // 'cycle' | 'version' | null
  const [newMonth, setNewMonth] = useState(currentMonth().slice(0, 7));
  const [error, setError] = useState(null);
  const [showReopen, setShowReopen] = useState(false);

  const cycleApproved = selectedCycle?.status === 'approved' || selectedCycle?.status === 'locked';

  const createCycle = async () => {
    setError(null);
    setCreating('cycle');
    try {
      const res = await api.createCycle({
        businessUnitCode: currentBU,
        baseMonth: `${newMonth}-01`,
        horizonMonths: 4
      });
      await onChanged(res.cycle?.id, res.initialVersionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(null);
    }
  };

  const createVersion = async () => {
    if (!selectedCycle) return;
    setError(null);
    setCreating('version');
    try {
      const nextWeek = versions.length
        ? Math.max(...versions.map((v) => Number(v.update_week) || 0)) + 1
        : 0;
      const res = await api.createVersion(selectedCycle.id, {
        updateWeek: nextWeek,
        updateDate: todayISO(),
        isoWeekLabel: `Tuần ${nextWeek} (${isoWeekLabel()})`,
        copyFromPrevious: true
      });
      await onChanged(selectedCycle.id, res.version?.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(null);
    }
  };

  const reopen = async (reason) => {
    if (!selectedCycle) return;
    setError(null);
    setCreating('reopen');
    try {
      await api.reopenCycle(selectedCycle.id, reason);
      setShowReopen(false);
      await onChanged(selectedCycle.id, selectedVersion?.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">

        {/* Chọn chu kỳ */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 whitespace-nowrap">Chu kỳ:</span>
          {cycles.length > 0 ? (
            <select
              value={selectedCycle?.id || ''}
              onChange={(e) => onSelectCycle(cycles.find((c) => c.id === e.target.value))}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.business_unit_code} · {monthLabel(c.base_month)}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-slate-400 italic">Chưa có chu kỳ nào cho {currentBU}</span>
          )}
          {selectedCycle && <StatusBadge status={selectedCycle.status} />}
        </div>

        {/* Chọn bản cập nhật */}
        {selectedCycle && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 whitespace-nowrap">Bản cập nhật:</span>
            <select
              value={selectedVersion?.id || ''}
              onChange={(e) => onSelectVersion(versions.find((v) => v.id === e.target.value))}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.iso_week_label || `Tuần ${v.update_week}`}
                  {String(v.is_final) === '1' ? ' — mới nhất' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Mở lại chu kỳ đã duyệt — quyền của người thẩm định, tách khỏi khối canEdit */}
        {canReopen && cycleApproved && (
          <div className={canEdit ? '' : 'lg:ml-auto'}>
            <button
              onClick={() => { setError(null); setShowReopen(true); }}
              disabled={creating !== null}
              title="Rút lại phê duyệt để sửa số. Bắt buộc nêu lý do và được ghi vào nhật ký."
              className="flex items-center gap-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {creating === 'reopen'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Unlock className="w-3.5 h-3.5" />}
              Mở lại chu kỳ
            </button>
          </div>
        )}

        {/* Thao tác */}
        {canEdit && (
          <div className="flex items-center gap-2 lg:ml-auto">
            {selectedCycle && (
              <button
                onClick={createVersion}
                disabled={creating !== null}
                title="Tạo bản cập nhật tuần mới, kế thừa số của bản gần nhất"
                className="flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {creating === 'version'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <GitBranch className="w-3.5 h-3.5" />}
                Bản cập nhật tuần mới
              </button>
            )}

            <div className="flex items-center gap-1.5">
              <input
                type="month"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
              />
              <button
                onClick={createCycle}
                disabled={creating !== null || !newMonth}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {creating === 'cycle'
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <CalendarPlus className="w-3.5 h-3.5" />}
                Mở chu kỳ
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {showReopen && (
        <ReopenDialog
          cycleLabel={`${selectedCycle?.business_unit_code} · ${monthLabel(selectedCycle?.base_month)}`}
          busy={creating === 'reopen'}
          onCancel={() => setShowReopen(false)}
          onConfirm={reopen}
        />
      )}
    </div>
  );
}

/** Hỏi lý do trước khi rút lại phê duyệt — backend từ chối nếu để trống. */
function ReopenDialog({ cycleLabel, busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
      <form
        onSubmit={(e) => { e.preventDefault(); if (trimmed) onConfirm(trimmed); }}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-slate-900"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm">Mở lại chu kỳ đã duyệt</h3>
            <p className="text-xs text-slate-500 mt-0.5">{cycleLabel}</p>
          </div>
          <button type="button" onClick={onCancel} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Chu kỳ sẽ quay về trạng thái soạn thảo và cần gửi duyệt lại.
            Bản đã duyệt vẫn được giữ nguyên trong lịch sử, nhưng
            <strong> số liệu sửa sau đây sẽ ghi đè lên bản hiện tại</strong>.
            Lý do được ghi vào nhật ký kèm tên người thực hiện.
          </span>
        </div>

        <div className="space-y-1">
          <label htmlFor="reopen-reason" className="text-xs font-semibold text-slate-700 block">
            Lý do mở lại <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="reopen-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="VD: Sai sản lượng SKU KAQ-P95 tháng 9, đã đối chiếu lại với kế hoạch sản xuất."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-slate-300 text-slate-700 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50"
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={busy || !trimmed}
            className="flex-1 flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-bold"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
            Mở lại chu kỳ
          </button>
        </div>
      </form>
    </div>
  );
}
