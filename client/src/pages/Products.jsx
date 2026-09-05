import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../services/api';
import { Package, Search, Filter, AlertCircle, PackagePlus, ClipboardPaste, PencilLine, CheckCircle2 } from 'lucide-react';
import AddProductModal from '../components/AddProductModal';
import BulkProductsModal from '../components/BulkProductsModal';

const ROW_HEIGHT_PX = 39;

export default function Products({ currentBU, user }) {
  // Ai duoc sua danh muc: cung bo vai tro voi cua ghi o server
  // (addProduct_/updateProduct_ deu assertRole_ ['bu_editor','central_admin']).
  // Nut an di voi vai tro khac chi la phep lich su — server van la cho chan that.
  const isEditor = user?.role === 'bu_editor' || user?.role === 'central_admin';

  const [products, setProducts] = useState([]);
  const [dangSua, setDangSua] = useState(null);   // san pham dang mo trong modal sua
  const [themMoi, setThemMoi] = useState(false);
  const [danHangLoat, setDanHangLoat] = useState(false);
  const [thongBao, setThongBao] = useState(null);
  const [groups, setGroups] = useState([]);
  const [bus, setBus] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedBU, setSelectedBU] = useState('ALL');
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

  const filteredProducts = products.filter(p => {
    const s = search.trim().toLowerCase();
    const matchSearch = s === ''
      || String(p.sku_code).toLowerCase().includes(s)
      || String(p.name).toLowerCase().includes(s);
    const matchGroup = selectedGroup === 'ALL' || p.product_group_code === selectedGroup;
    const matchBU = selectedBU === 'ALL' || p.default_channel === selectedBU;
    return matchSearch && matchGroup && matchBU;
  });

  const scrollParentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredProducts.length,
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
            <Package className="w-5 h-5 text-blue-600" />
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

      {thongBao && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{thongBao}</span>
          <button onClick={() => setThongBao(null)} className="underline font-semibold">Đóng</button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <span>{error}</span>
            <button onClick={loadData} className="ml-2 underline font-semibold">Thử lại</button>
          </div>
        </div>
      )}

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
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none"
          >
            <option value="ALL">Tất cả Nhóm sản phẩm</option>
            {groups.map(g => (
              <option key={g.code} value={g.code}>{g.name}</option>
            ))}
          </select>

          <select
            value={selectedBU}
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
                <th className="py-2.5 px-4">Mã SKU</th>
                <th className="py-2.5 px-4">Tên sản phẩm</th>
                <th className="py-2.5 px-4">Model (Tên gọi tắt)</th>
                <th className="py-2.5 px-4">Nhóm sản phẩm</th>
                <th className="py-2.5 px-4">Công nghệ</th>
                <th className="py-2.5 px-4">Kênh mặc định</th>
                <th className="py-2.5 px-4 text-right">Giá ghi nhận DT (VNĐ)</th>
                {isEditor && <th className="py-2.5 px-4 w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {filteredProducts.length === 0 ? (
                <tr><td colSpan={isEditor ? 8 : 7} className="py-8 text-center text-slate-400 font-sans">Không tìm thấy SKU phù hợp</td></tr>
              ) : (
                <>
                  {topPad > 0 && <tr style={{ height: topPad }} aria-hidden="true" />}
                  {virtualRows.map((vRow) => {
                    const p = filteredProducts[vRow.index];
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
                              className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600">
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
            setThongBao(message || ('Đã lưu SKU ' + (sp?.sku_code || '') + '.'));
            // Doc lai tu server thay vi va vao mang trong bo nho: danh muc la
            // du lieu dung chung, giua luc mo trang co the co nguoi khac vua ghi.
            loadData();
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
            setThongBao(message);
            loadData();
          }}
        />
      )}

    </div>
  );
}
