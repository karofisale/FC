import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../services/api';
import { Search, Filter, PackagePlus, ClipboardPaste, PencilLine } from 'lucide-react';
import AddProductModal from '../components/AddProductModal';
import BulkProductsModal from '../components/BulkProductsModal';
import { MENU_ICON } from '../utils/menu';
import { SortTh, StateRow } from '../components/TableStates';
import { useTableSort } from '../utils/useTableSort';
import { usePersistedState } from '../utils/usePersistedState';
import { thongBao as guiToast } from '../services/toastService';

const ROW_HEIGHT_PX = 39;
const Icon = MENU_ICON.products;       // tiêu đề trang dùng đúng icon của mục menu
const laChuoi = (v) => typeof v === 'string';
const maSku = (p) => p.sku_code;
const COT_SKU = {
  sku: { type: 'text', get: (p) => p.sku_code },
  ten: { type: 'text', get: (p) => p.name },
  model: { type: 'text', get: (p) => p.short_name },
  nhom: { type: 'text', get: (p) => p.product_group_name },
  congNghe: { type: 'text', get: (p) => p.technology },
  kenh: { type: 'text', get: (p) => p.default_channel },
  gia: { type: 'number', get: (p) => p.avg_price }
};

export default function Products({ currentBU, user }) {
  // Ai duoc sua danh muc: cung bo vai tro voi cua ghi o server
  // (addProduct_/updateProduct_ deu assertRole_ ['bu_editor','central_admin']).
  // Nut an di voi vai tro khac chi la phep lich su — server van la cho chan that.
  const isEditor = user?.role === 'bu_editor' || user?.role === 'central_admin';

  const [products, setProducts] = useState([]);
  const [dangSua, setDangSua] = useState(null);   // san pham dang mo trong modal sua
  const [themMoi, setThemMoi] = useState(false);
  const [danHangLoat, setDanHangLoat] = useState(false);
  const [groups, setGroups] = useState([]);
  const [bus, setBus] = useState([]);
  const [search, setSearch] = useState('');
  // Nhớ bộ lọc nhóm / kênh giữa các lần mở (Đợt 2 mục 9). Giá trị đã nhớ mà không còn trong danh sách thì coi như "Tất cả".
  const [selectedGroup, setSelectedGroup] = usePersistedState('productsGroup', 'ALL', laChuoi);
  const [selectedBU, setSelectedBU] = usePersistedState('productsBU', 'ALL', laChuoi);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prods, grps, businessUnits] = await Promise.all([
        api.getProducts(),
        api.getGroups(),
        api.getBUs()
      ]);
      setProducts(prods);
      setGroups(grps);
      setBus(businessUnits);
    } catch (err) {
      setError(err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const nhomHieuLuc = groups.some((g) => g.code === selectedGroup) ? selectedGroup : 'ALL';
  const kenhHieuLuc = bus.some((b) => b.code === selectedBU) ? selectedBU : 'ALL';

  const filteredProducts = products.filter(p => {
    const s = search.trim().toLowerCase();
    const matchSearch = s === ''
      || String(p.sku_code).toLowerCase().includes(s)
      || String(p.name).toLowerCase().includes(s);
    const matchGroup = nhomHieuLuc === 'ALL' || p.product_group_code === nhomHieuLuc;
    const matchBU = kenhHieuLuc === 'ALL' || p.default_channel === kenhHieuLuc;
    return matchSearch && matchGroup && matchBU;
  });

  // Sắp xếp theo cột (chữ / số): bấm tiêu đề — tăng, giảm, rồi về thứ tự gốc.
  const { rows: sapXep, spec: sortSku, toggle: doiSapXep } = useTableSort(filteredProducts, COT_SKU, maSku);

  const scrollParentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: sapXep.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPad = virtualRows.length ? virtualRows[0].start : 0;
  const bottomPad = virtualRows.length ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div className="space-y-4">
      
      {/* Title */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Icon className="w-5 h-5 text-blue-600" />
            DANH MỤC SẢN PHẨM (SKU MASTER CATALOG)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Nguồn danh mục chuẩn duy nhất cho toàn hệ thống Karofi Sales Forecast
            {loading ? ' — đang tải...' : ` (${products.length} SKU)`}.
          </p>
        </div>

        {isEditor && (
          <div className="flex items-center gap-2">
            <button onClick={() => setDanHangLoat(true)}
              className="flex items-center gap-1.5 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-50">
              <ClipboardPaste className="w-3.5 h-3.5" />
              Dán từ Excel
            </button>
            <button onClick={() => setThemMoi(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
              <PackagePlus className="w-3.5 h-3.5" />
              Thêm SKU
            </button>
          </div>
        )}
      </div>

      {/* Filter controls */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={nhomHieuLuc}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none"
          >
            <option value="ALL">Tất cả Nhóm sản phẩm</option>
            {groups.map(g => (
              <option key={g.code} value={g.code}>{g.name}</option>
            ))}
          </select>

          <select
            value={kenhHieuLuc}
            onChange={(e) => setSelectedBU(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none"
          >
            <option value="ALL">Tất cả Kênh mặc định</option>
            {bus.map(b => (
              <option key={b.code} value={b.code}>{b.code} - {b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div ref={scrollParentRef} className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white font-semibold sticky top-0 z-20">
              <tr>
                <SortTh label="Mã SKU" sortKey="sku" spec={sortSku} onSort={doiSapXep} className="py-2.5 px-4" />
                <SortTh label="Tên sản phẩm" sortKey="ten" spec={sortSku} onSort={doiSapXep} className="py-2.5 px-4" />
                <SortTh label="Model (Tên gọi tắt)" sortKey="model" spec={sortSku} onSort={doiSapXep} className="py-2.5 px-4" />
                <SortTh label="Nhóm sản phẩm" sortKey="nhom" spec={sortSku} onSort={doiSapXep} className="py-2.5 px-4" />
                <SortTh label="Công nghệ" sortKey="congNghe" spec={sortSku} onSort={doiSapXep} className="py-2.5 px-4" />
                <SortTh label="Kênh mặc định" sortKey="kenh" spec={sortSku} onSort={doiSapXep} className="py-2.5 px-4" />
                <SortTh label="Giá ghi nhận DT (VNĐ)" sortKey="gia" spec={sortSku} onSort={doiSapXep} className="py-2.5 px-4 text-right" />
                {isEditor && <th className="py-2.5 px-4 w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {loading ? (
                <StateRow colSpan={isEditor ? 8 : 7} kind="loading" />
              ) : error ? (
                <StateRow colSpan={isEditor ? 8 : 7} kind="error" text={error} onRetry={loadData} />
              ) : filteredProducts.length === 0 ? (
                <StateRow colSpan={isEditor ? 8 : 7} kind="empty" text="Không tìm thấy SKU phù hợp" />
              ) : (
                <>
                  {topPad > 0 && <tr style={{ height: topPad }} aria-hidden="true" />}
                  {virtualRows.map((vRow) => {
                    const p = sapXep[vRow.index];
                    return (
                      <tr key={p.sku_code} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-bold text-blue-900">{p.sku_code}</td>
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-900">{p.name}</td>
                        <td className="py-2.5 px-4 font-sans text-slate-600">{p.short_name || '-'}</td>
                        <td className="py-2.5 px-4 font-sans text-slate-700">{p.product_group_name}</td>
                        <td className="py-2.5 px-4 font-sans text-slate-500">{p.technology || '-'}</td>
                        <td className="py-2.5 px-4 font-sans font-semibold text-slate-800">{p.default_channel || '-'}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                          {p.avg_price ? p.avg_price.toLocaleString('vi-VN') : '-'}
                        </td>
                        {isEditor && (
                          <td className="py-2.5 px-4">
                            <button onClick={() => setDangSua(p)} title={'Sửa ' + p.sku_code}
                              className="p-1 rounded hover:bg-blue-50 text-slate-500 hover:text-blue-600">
                              <PencilLine className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {bottomPad > 0 && <tr style={{ height: bottomPad }} aria-hidden="true" />}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(themMoi || dangSua) && (
        <AddProductModal
          groups={groups}
          bus={bus}
          defaultChannel={currentBU}
          product={dangSua}
          onClose={() => { setThemMoi(false); setDangSua(null); }}
          onAdded={(sp, message) => {
            setThemMoi(false);
            setDangSua(null);
            guiToast({ type: 'success', text: message || ('Đã lưu SKU ' + (sp?.sku_code || '') + '.') });
            // Vá thẳng vào mảng products bằng object addProduct_/updateProduct_ đã
            // trả về, thay vì loadData() cả getProducts+getGroups+getBUs chỉ để
            // đổi ĐÚNG MỘT dòng (~1.141+ SKU tải lại một cách vô ích). Ngừng dùng
            // (is_active = 0) thì bỏ khỏi mảng luôn — getProducts_ lọc activeOnly_
            // nên tải lại trang cũng sẽ không còn thấy nó nữa.
            if (sp) {
              setProducts((prev) => {
                const conHoatDong = String(sp.is_active) !== '0';
                const idx = prev.findIndex((p) => String(p.sku_code) === String(sp.sku_code));
                if (!conHoatDong) return idx >= 0 ? prev.filter((p) => String(p.sku_code) !== String(sp.sku_code)) : prev;
                if (idx < 0) return [...prev, sp];
                const next = prev.slice();
                next[idx] = sp;
                return next;
              });
            }
          }}
        />
      )}

      {danHangLoat && (
        <BulkProductsModal
          groups={groups}
          bus={bus}
          existingProducts={products}
          onClose={() => setDanHangLoat(false)}
          onDone={(message) => {
            setDanHangLoat(false);
            guiToast({ type: 'success', text: message });
            loadData();
          }}
        />
      )}

    </div>
  );
}
