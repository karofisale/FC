import React, { useState } from 'react';
import { PackagePlus, X, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

/**
 * Thêm SKU mới ngay tại chỗ khi đang nhập forecast mà phát hiện thiếu mã
 * hàng — không cần thoát ra màn Danh mục hay nhờ admin. Chỉ chèn dòng
 * mới (addProduct_ chặn ghi đè SKU đã tồn tại ở phía server).
 */
export default function AddProductModal({ groups, bus, defaultChannel, onClose, onAdded }) {
  const [form, setForm] = useState({
    skuCode: '',
    name: '',
    shortName: '',
    productGroupCode: groups[0]?.code || '',
    technology: '',
    defaultChannel: defaultChannel || bus[0]?.code || '',
    avgPrice: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      const group = groups.find((g) => g.code === form.productGroupCode);
      const res = await api.addProduct({
        skuCode: form.skuCode.trim(),
        name: form.name.trim(),
        shortName: form.shortName.trim(),
        productGroupCode: form.productGroupCode,
        productGroupName: group?.name || '',
        technology: form.technology.trim(),
        defaultChannel: form.defaultChannel,
        avgPrice: form.avgPrice
      });
      onAdded(res.product);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-slate-900">
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-sm">Thêm SKU mới</h3>
              <p className="text-[11px] text-slate-500">Ghi thẳng vào danh mục Products dùng chung toàn hệ thống.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">Mã SKU *</label>
            <input required value={form.skuCode} onChange={set('skuCode')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500" />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">Tên sản phẩm *</label>
            <input required value={form.name} onChange={set('name')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">Tên gọi tắt</label>
            <input value={form.shortName} onChange={set('shortName')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">Công nghệ</label>
            <input value={form.technology} onChange={set('technology')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">Nhóm sản phẩm</label>
            <select value={form.productGroupCode} onChange={set('productGroupCode')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500">
              {groups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">Kênh mặc định</label>
            <select value={form.defaultChannel} onChange={set('defaultChannel')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500">
              {bus.map((b) => <option key={b.code} value={b.code}>{b.code} - {b.name}</option>)}
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">Giá bán bình quân (VNĐ)</label>
            <input type="number" min="0" value={form.avgPrice} onChange={set('avgPrice')}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500" />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-300 text-slate-700 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50">
            Huỷ
          </button>
          <button type="submit" disabled={saving || !form.skuCode.trim() || !form.name.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-bold">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Thêm SKU
          </button>
        </div>
      </form>
    </div>
  );
}
