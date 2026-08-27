import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Package, Search, Filter } from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [bus, setBus] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedBU, setSelectedBU] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [prods, grps, businessUnits] = await Promise.all([
        api.getProducts(),
        api.getGroups(),
        api.getBUs()
      ]);
      setProducts(prods);
      setGroups(grps);
      setBus(businessUnits);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchSearch = search === '' || 
      p.sku_code.toLowerCase().includes(search.toLowerCase()) || 
      p.name.toLowerCase().includes(search.toLowerCase());
    const matchGroup = selectedGroup === 'ALL' || p.product_group_code === selectedGroup;
    const matchBU = selectedBU === 'ALL' || p.default_channel === selectedBU;
    return matchSearch && matchGroup && matchBU;
  });

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
            Nguồn danh mục chuẩn duy nhất cho toàn hệ thống Karofi Sales Forecast ({products.length} SKU).
          </p>
        </div>
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
        <div className="overflow-x-auto max-h-[600px]">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {filteredProducts.map(p => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
