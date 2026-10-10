import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

/**
 * Hai biểu đồ của màn Tổng quan, TÁCH RIÊNG để thư viện recharts (và d3 đi kèm, ~108KB gzip) chỉ tải khi người dùng
 * mở phần "Biểu đồ" (Dashboard.jsx nạp file này bằng React.lazy) — Rà soát 4 app, Đợt 3 mục 7. Trước đây recharts nằm
 * trong chunk của màn mặc định nên mọi người đều tải dù ít ai xem biểu đồ.
 *
 * Đừng import file này trực tiếp ở nơi khác (trừ React.lazy) — nếu không recharts sẽ quay lại gói ban đầu.
 */
const COLORS = ['#0284c7', '#0d9488', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

export default function DashboardCharts({ dataBU, dataGroup, khungThoiGian }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Chart 1: Bar chart by Business Unit */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex flex-wrap items-center justify-between gap-x-3">
          <span>SẢN LƯỢNG KẾ HOẠCH THEO ĐƠN VỊ KINH DOANH</span>
          <span className="text-xs text-slate-500 font-normal">{khungThoiGian}</span>
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataBU}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(val) => Number(val).toLocaleString('vi-VN')} />
              <Bar dataKey="sản_lượng" fill="#0284c7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Pie chart by Product Group */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
          <span>CƠ CẤU SẢN LƯỢNG THEO NHÓM HÀNG</span>
          <span className="text-xs text-slate-500 font-normal">Tỷ trọng %</span>
        </h3>
        <div className="h-64 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={dataGroup}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {dataGroup.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(val) => Number(val).toLocaleString('vi-VN')} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
