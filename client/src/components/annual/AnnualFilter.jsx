import React from 'react';
import { Search, X } from 'lucide-react';

const o = 'border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white';

/**
 * Thanh lọc khách của Kế hoạch năm — dùng chung cho các bảng Cơ sở / Kế hoạch / Preview / Duyệt:
 *  - Thị trường (chỉ Export OEM), Sale (OEM + Export OEM), tìm Khách hàng (theo Search Code / Short Name / mã). Các bộ lọc kết hợp theo VÀ.
 * Chỉ ảnh hưởng phần HIỂN THỊ (và các tổng của phần đang lọc); sửa số vẫn tác động đúng khách / SKU được chọn.
 */
export function ThanhLoc({ loc, setLoc, giaTri, coThiTruong, coSale, soKhach, tong, dangLoc }) {
  const dat = (k, v) => setLoc({ ...loc, [k]: v });
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2 text-xs" data-testid="thanh-loc">
      {coThiTruong && (
        <label className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-600">Thị trường</span>
          <select value={loc.thiTruong} onChange={(e) => dat('thiTruong', e.target.value)} className={o}>
            <option value="">Tất cả</option>
            {giaTri.thiTruong.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}
      {coSale && (
        <label className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-600">Sale</span>
          <select value={loc.sale} onChange={(e) => dat('sale', e.target.value)} className={o}>
            <option value="">Tất cả</option>
            {giaTri.sale.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1.5">
        <span className="font-semibold text-slate-600">Khách hàng</span>
        <span className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input value={loc.tuKhoa} onChange={(e) => dat('tuKhoa', e.target.value)} placeholder="Tìm theo mã / tên khách"
            className={o + ' pl-7 w-52'} />
        </span>
      </label>
      {dangLoc && (
        <>
          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-1">Đang lọc: {soKhach}/{tong} khách — các tổng là của phần đang lọc</span>
          <button onClick={() => setLoc({ thiTruong: '', sale: '', tuKhoa: '' })} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 underline">
            <X className="w-3 h-3" /> Bỏ lọc
          </button>
        </>
      )}
    </div>
  );
}

/** Chọn đơn vị tiền hiển thị: Triệu VNĐ | USD (USD theo tỷ giá chốt của phiên bản). `khoa` = bảng gửi duyệt luôn Triệu VNĐ. */
export function ChonTien({ tien, setTien, khoa, fx }) {
  const nut = (k, t) => (
    <button key={k} onClick={() => setTien(k)} disabled={khoa}
      className={`px-2.5 py-1.5 ${tien === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'} disabled:cursor-not-allowed`}>{t}</button>
  );
  return (
    <div className="inline-flex items-center gap-2 text-xs">
      <span className="font-semibold text-slate-600">Tiền tệ</span>
      <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden font-semibold" title={khoa ? 'Bảng gửi duyệt / chờ duyệt luôn hiển thị Triệu VNĐ' : 'USD quy đổi theo tỷ giá ' + Number(fx).toLocaleString('vi-VN')}>
        {nut('VND', 'Triệu VNĐ')}{nut('USD', 'USD')}
      </div>
      {khoa && <span className="text-[10px] text-slate-500">bảng chờ duyệt: luôn Triệu VNĐ</span>}
    </div>
  );
}
