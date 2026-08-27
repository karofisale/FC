import React, { useState } from 'react';
import { CalendarPlus, GitBranch, Loader2, AlertCircle } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { api } from '../services/api';
import { currentMonth, isoWeekLabel, monthLabel, todayISO } from '../utils/period';

/**
 * Thanh chọn chu kỳ / bản cập nhật, kèm hai thao tác mà bản cũ không có
 * đường nào bấm được: mở chu kỳ tháng mới và chốt bản cập nhật tuần.
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
  onChanged
}) {
  const [creating, setCreating] = useState(null); // 'cycle' | 'version' | null
  const [newMonth, setNewMonth] = useState(currentMonth().slice(0, 7));
  const [error, setError] = useState(null);

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
    </div>
  );
}
