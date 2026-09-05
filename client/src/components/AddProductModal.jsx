import React, { useState } from 'react';
import { PackagePlus, PencilLine, X, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { parseGiaNhap } from '../utils/productPaste';

/**
 * Thêm HOẶC sửa một SKU của danh mục dùng chung.
 *
 * Một component, hai chế độ, quyết định bởi prop `product`:
 *   không có product -> THÊM  (api.addProduct, server chặn ghi đè mã đã có)
 *   có product       -> SỬA   (api.updateProduct, server chặn tạo mã mới)
 *
 * Gộp làm một vì hai biểu mẫu giống nhau tới từng ô; tách đôi thì mỗi lần
 * thêm một trường lại phải nhớ sửa hai chỗ, và chỗ quên sẽ là chỗ hỏng.
 * Các màn Kế hoạch tháng/tuần gọi component này không truyền `product` nên
 * hành vi của chúng không đổi.
 *
 * Ở chế độ SỬA, mã SKU khoá lại: nó là khoá mà MonthlyForecastLines,
 * WeeklyRegionSplits và Actuals đều trỏ vào, đổi ở đây là bỏ rơi toàn bộ số
 * đã nhập cho mã cũ mà không có gì báo.
 */
export default function AddProductModal({ groups, bus, defaultChannel, product, onClose, onAdded }) {
  const suaDoi = !!product;

  /**
   * MỌI ô nhập phải là chuỗi.
   *
   * getValues() trả mã toàn chữ số về dạng NUMBER — "2013050022" đọc lên là
   * số 2013050022 — nên gán thẳng vào state rồi gọi .trim() là nổ
   * "skuCode.trim is not a function", và nổ lúc render nên mất cả trang chứ
   * không phải một ô. Ép ngay tại cửa vào, một chỗ, thay vì rải String() ra
   * bảy chỗ gọi .trim() phía dưới.
   */
  const chuoi = (v) => (v === null || v === undefined ? '' : String(v));

  const [form, setForm] = useState({
    skuCode: chuoi(product?.sku_code),
    name: chuoi(product?.name),
    shortName: chuoi(product?.short_name),
    productGroupCode: chuoi(product?.product_group_code) || (groups[0]?.code || ''),
    technology: chuoi(product?.technology),
    defaultChannel: chuoi(product?.default_channel) || (defaultChannel || bus[0]?.code || ''),
    // Hiện lại giá dạng số trần để sửa. Không định dạng nghìn ở đây: ô nhập có
    // dấu phân cách rồi lại phải đoán ngược khi đọc ra, mà đoán sai giá là sai
    // doanh thu.
    avgPrice: chuoi(product?.avg_price),
    isActive: product ? (String(product.is_active) === '0' ? '0' : '1') : '1'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const giaDoc = parseGiaNhap(form.avgPrice);
  const giaHong = form.avgPrice.trim() !== '' && giaDoc.loi;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || giaHong) return;
    setError(null);
    setSaving(true);
    try {
      const group = groups.find((g) => g.code === form.productGroupCode);
      const chung = {
        name: form.name.trim(),
        shortName: form.shortName.trim(),
        productGroupCode: form.productGroupCode,
        productGroupName: group?.name || '',
        technology: form.technology.trim(),
        defaultChannel: form.defaultChannel,
        // Ô để trống nghĩa là "chưa có giá" = 0, khác hẳn với "nhập sai".
        avgPrice: form.avgPrice.trim() === '' ? 0 : giaDoc.so
      };
      const res = suaDoi
        ? await api.updateProduct({ ...chung, skuCode: form.skuCode, isActive: form.isActive })
        : await api.addProduct({ ...chung, skuCode: form.skuCode.trim() });
      onAdded(res.product, res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const Icon = suaDoi ? PencilLine : PackagePlus;

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4 text-slate-900">
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-sm">{suaDoi ? 'Sửa SKU' : 'Thêm SKU mới'}</h3>
              <p className="text-[11px] text-slate-500">
                {suaDoi
                  ? 'Danh mục dùng chung — sửa ở đây là mọi màn hình đổi theo.'
                  : 'Ghi thẳng vào danh mục Products dùng chung toàn hệ thống.'}
              </p>
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
            <label className="text-xs font-semibold text-slate-700 block">
              Mã SKU {suaDoi ? '(không sửa được)' : '*'}
            </label>
            <input required readOnly={suaDoi} value={form.skuCode} onChange={set('skuCode')}
              className={'w-full px-3 py-2 border rounded-lg text-sm outline-none focus:border-blue-500 '
                + (suaDoi ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-slate-50 border-slate-300')} />
            {suaDoi && (
              <p className="text-[10px] text-slate-500">
                Mã là khoá của mọi dòng dự báo và sản lượng thực hiện. Cần đổi mã thì thêm mã mới rồi tắt mã cũ.
              </p>
            )}
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

          <div className={suaDoi ? 'space-y-1' : 'col-span-2 space-y-1'}>
            <label className="text-xs font-semibold text-slate-700 block">Giá ghi nhận DT (VNĐ)</label>
            <input value={form.avgPrice} onChange={set('avgPrice')} inputMode="decimal"
              placeholder="ví dụ 1.234.567"
              className={'w-full px-3 py-2 bg-slate-50 border rounded-lg text-sm outline-none '
                + (giaHong ? 'border-rose-400 focus:border-rose-500' : 'border-slate-300 focus:border-blue-500')} />
            {giaHong
              ? <p className="text-[10px] text-rose-600">{giaDoc.loi}</p>
              : (form.avgPrice.trim() !== '' && (
                  <p className="text-[10px] text-slate-500">= {giaDoc.so.toLocaleString('vi-VN')} đ</p>
                ))}
          </div>

          {suaDoi && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">Trạng thái</label>
              <select value={form.isActive} onChange={set('isActive')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500">
                <option value="1">Đang dùng</option>
                <option value="0">Ngừng dùng</option>
              </select>
              <p className="text-[10px] text-slate-500">
                Ngừng dùng thì SKU biến mất khỏi mọi màn hình nhưng số đã nhập vẫn còn.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-300 text-slate-700 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50">
            Huỷ
          </button>
          <button type="submit" disabled={saving || giaHong || !form.skuCode.trim() || !form.name.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-bold">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {suaDoi ? 'Lưu thay đổi' : 'Thêm SKU'}
          </button>
        </div>
      </form>
    </div>
  );
}
