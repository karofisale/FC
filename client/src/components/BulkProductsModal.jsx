import React, { useMemo, useState } from 'react';
import { ClipboardPaste, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { parseDanBang, COT_MAC_DINH } from '../utils/productPaste';

const NHAN_COT = {
  skuCode: 'Mã SKU',
  name: 'Tên sản phẩm',
  shortName: 'Tên gọi tắt',
  productGroupCode: 'Nhóm SP (mã)',
  technology: 'Công nghệ',
  defaultChannel: 'Kênh',
  avgPrice: 'Giá (VNĐ)'
};

/**
 * Thêm/sửa SKU hàng loạt bằng cách dán từ Excel.
 *
 * Luồng cố ý ba bước — dán, XEM, ghi — chứ không ghi thẳng. Một lượt dán chạm
 * tới hàng trăm dòng của danh mục dùng chung cho cả bốn đơn vị; hai kiểu hỏng
 * hay gặp nhất (lệch cột, và giá đọc ra NaN) đều nhìn thấy được trong bảng
 * xem trước, nhưng sau khi ghi thì không.
 *
 * Hai chế độ ghi là hai action khác nhau ở server chứ không phải một cờ:
 *   Chỉ thêm mới  -> addProducts    (bỏ qua mã đã có)
 *   Thêm và sửa   -> upsertProducts (ghi đè mã đã có)
 * Mặc định là chế độ an toàn; muốn ghi đè phải tự chọn.
 */
export default function BulkProductsModal({ groups, bus, existingProducts, onClose, onDone }) {
  const [text, setText] = useState('');
  const [ghiDe, setGhiDe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const maDangCo = useMemo(() => {
    const m = new Map();
    (existingProducts || []).forEach((p) => m.set(String(p.sku_code).trim(), p));
    return m;
  }, [existingProducts]);

  const maNhom = useMemo(() => new Set((groups || []).map((g) => String(g.code))), [groups]);
  const maKenh = useMemo(() => new Set((bus || []).map((b) => String(b.code))), [bus]);

  const { rows, coTieuDe, cotDaDung } = useMemo(() => parseDanBang(text), [text]);

  // Kiểm phần chỉ client mới biết: mã nhóm và mã kênh có thật không.
  const danhGia = useMemo(() => rows.map((r) => {
    const loi = [...r.loi];
    const canhBao = [];
    const kenh = String(r.defaultChannel || '').trim();
    // Kênh sai là hỏng im lặng: getProducts_ lọc theo kênh nên SKU sẽ không
    // hiện ở đơn vị nào cả, mà bảng tính thì vẫn có dòng đó.
    if (kenh && !maKenh.has(kenh)) loi.push('Kênh "' + kenh + '" không có trong danh sách đơn vị');
    const nhom = String(r.productGroupCode || '').trim();
    if (nhom && !maNhom.has(nhom)) canhBao.push('Nhóm "' + nhom + '" chưa có trong danh mục nhóm');
    return { ...r, loi, canhBao, daCo: maDangCo.has(r.skuCode) };
  }), [rows, maKenh, maNhom, maDangCo]);

  const soLoi = danhGia.filter((r) => r.loi.length).length;
  const soMoi = danhGia.filter((r) => !r.loi.length && !r.daCo).length;
  const soCu = danhGia.filter((r) => !r.loi.length && r.daCo).length;
  const seGhi = ghiDe ? soMoi + soCu : soMoi;

  const handleSubmit = async () => {
    if (saving || soLoi > 0 || seGhi === 0) return;
    setError(null);
    setSaving(true);
    try {
      const payload = danhGia
        .filter((r) => !r.loi.length)
        .filter((r) => (ghiDe ? true : !r.daCo))
        .map((r) => {
          const g = (groups || []).find((x) => String(x.code) === String(r.productGroupCode || ''));
          const o = {
            skuCode: r.skuCode,
            name: r.name || r.skuCode,
            shortName: r.shortName || '',
            productGroupCode: r.productGroupCode || '',
            productGroupName: g?.name || '',
            technology: r.technology || '',
            defaultChannel: r.defaultChannel || ''
          };
          // Chỉ gửi giá khi ô có nội dung. Gửi kèm null/0 cho ô để trống là
          // xoá sạch giá đang có của những mã chỉ định sửa tên.
          if (r.avgPrice !== null && r.avgPrice !== undefined) o.avgPrice = r.avgPrice;
          return o;
        });

      const res = ghiDe ? await api.upsertProducts(payload) : await api.addProducts(payload);
      onDone(res.message || 'Đã ghi xong.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col text-slate-900">

        <div className="flex items-start justify-between p-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-sm">Thêm/sửa SKU hàng loạt</h3>
              <p className="text-[11px] text-slate-500">
                Chọn vùng trong Excel, Ctrl+C, rồi dán vào ô dưới. Xem bảng kiểm tra trước khi ghi.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600">
            <div className="font-semibold text-slate-700 mb-1">Thứ tự cột khi dán không kèm dòng tiêu đề:</div>
            <div className="flex flex-wrap gap-1">
              {COT_MAC_DINH.map((c, i) => (
                <span key={c} className="bg-white border border-slate-300 rounded px-1.5 py-0.5 font-mono">
                  {i + 1}. {NHAN_COT[c]}
                </span>
              ))}
            </div>
            <div className="mt-1.5">
              Chỉ <strong>Mã SKU</strong> và <strong>Tên sản phẩm</strong> là bắt buộc; thiếu cột phía sau thì bỏ trống.
              Nếu dán kèm dòng tiêu đề thì thứ tự cột không quan trọng — hệ thống đọc theo tên cột.
            </div>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'Dán vào đây...\nSP001\tMáy lọc nước A\tA1\tNHOM1\tRO\tOEM\t1.234.567'}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono outline-none focus:border-blue-500"
          />

          {danhGia.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-semibold text-slate-700">Đọc được {danhGia.length} dòng</span>
                {coTieuDe && (
                  <span className="text-slate-500">
                    (đã nhận ra dòng tiêu đề, đọc theo cột: {cotDaDung.filter(Boolean).map((c) => NHAN_COT[c]).join(' · ')})
                  </span>
                )}
                <span className="text-emerald-700">{soMoi} mã mới</span>
                <span className="text-amber-700">{soCu} mã đã có</span>
                {soLoi > 0 && <span className="text-rose-700 font-semibold">{soLoi} dòng lỗi</span>}
              </div>

              <label className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5 cursor-pointer">
                <input type="checkbox" checked={ghiDe} onChange={(e) => setGhiDe(e.target.checked)} className="mt-0.5" />
                <span>
                  <strong>Ghi đè cả những mã đã có</strong> ({soCu} mã).
                  <span className="text-slate-600">
                    {' '}Không tích thì các mã đã có được bỏ qua, chỉ {soMoi} mã mới được thêm.
                    Ô để trống không xoá dữ liệu đang có.
                  </span>
                </span>
              </label>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-800 text-white sticky top-0">
                      <tr>
                        <th className="py-1.5 px-2">#</th>
                        <th className="py-1.5 px-2">Mã SKU</th>
                        <th className="py-1.5 px-2">Tên</th>
                        <th className="py-1.5 px-2">Kênh</th>
                        <th className="py-1.5 px-2 text-right">Giá</th>
                        <th className="py-1.5 px-2">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {danhGia.map((r, i) => (
                        <tr key={r.skuCode + '-' + i} className={r.loi.length ? 'bg-rose-50' : ''}>
                          <td className="py-1 px-2 text-slate-400">{r._dong}</td>
                          <td className="py-1 px-2 font-mono font-semibold">{r.skuCode}</td>
                          <td className="py-1 px-2 truncate max-w-[220px]">{r.name || '—'}</td>
                          <td className="py-1 px-2">{r.defaultChannel || '—'}</td>
                          <td className="py-1 px-2 text-right font-mono">
                            {r.avgPrice === null || r.avgPrice === undefined
                              ? <span className="text-slate-400">không đổi</span>
                              : r.avgPrice.toLocaleString('vi-VN')}
                          </td>
                          <td className="py-1 px-2">
                            {r.loi.length ? (
                              <span className="text-rose-700">{r.loi.join('; ')}</span>
                            ) : r.daCo ? (
                              <span className={ghiDe ? 'text-amber-700' : 'text-slate-400'}>
                                {ghiDe ? 'sẽ cập nhật' : 'đã có — bỏ qua'}
                              </span>
                            ) : (
                              <span className="text-emerald-700">mã mới</span>
                            )}
                            {r.canhBao.length > 0 && (
                              <span className="text-amber-600"> · {r.canhBao.join('; ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {soLoi > 0 && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-2.5 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Sửa {soLoi} dòng lỗi trong Excel rồi dán lại. Không ghi một phần —
                    dán nửa vời khó lần ra hơn là làm lại từ đầu.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 p-5 pt-3 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-300 text-slate-700 py-2 rounded-lg text-xs font-semibold hover:bg-slate-50">
            Huỷ
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || soLoi > 0 || seGhi === 0}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-bold">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {seGhi > 0 ? 'Ghi ' + seGhi + ' dòng' : 'Chưa có gì để ghi'}
          </button>
        </div>
      </div>
    </div>
  );
}
