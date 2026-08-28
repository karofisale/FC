import React, { useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Package,
  HelpCircle,
  FileSpreadsheet,
  TrendingUp,
  Download,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

const COLLAPSE_KEY = 'karofi_fc_sidebar_collapsed';

export default function Sidebar({ activeTab, setActiveTab, pendingCount = 0, role }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Trình duyệt chặn localStorage: chỉ mất ghi nhớ trạng thái, không ảnh hưởng chức năng
      }
      return next;
    });
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tổng quan & Báo cáo', icon: LayoutDashboard, badge: null },
    { id: 'monthly', label: 'Bảng 0: Forecast 4 Tháng', icon: CalendarDays, badge: null },
    { id: 'weekly', label: 'Bảng 1: Forecast Tuần/Miền', icon: CalendarRange, badge: null },
    { id: 'approvals', label: 'Quy trình Phê duyệt', icon: CheckCircle2, badge: pendingCount > 0 ? pendingCount : null },
    { id: 'actuals', label: 'Sản lượng Thực hiện', icon: TrendingUp, badge: null },
    { id: 'products', label: 'Danh mục SKU', icon: Package, badge: null },
    ...(role === 'central_admin' || role === 'viewer'
      ? [{ id: 'exports', label: 'Xuất Báo cáo', icon: Download, badge: null }]
      : []),
    { id: 'guide', label: 'Sơ đồ Quy trình B5', icon: HelpCircle, badge: null }
  ];

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} shrink-0 bg-slate-900 text-slate-300 min-h-[calc(100vh-61px)] p-3 flex flex-col border-r border-slate-800 transition-[width] duration-200`}
    >
      <div className={`flex items-center mb-3 ${collapsed ? 'justify-center' : 'justify-between px-1'}`}>
        {!collapsed && (
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            DANH MỤC CHỨC NĂNG
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="space-y-1 flex-1">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center rounded-lg text-sm font-medium transition-all ${
                collapsed ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 font-semibold'
                  : 'hover:bg-slate-800 hover:text-white text-slate-400'
              }`}
            >
              <div className={`flex items-center ${collapsed ? '' : 'space-x-3'} relative`}>
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {collapsed && item.badge && (
                  <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-amber-500" />
                )}
                {!collapsed && <span>{item.label}</span>}
              </div>
              {!collapsed && item.badge && (
                <span className="bg-amber-500 text-slate-950 text-xs font-black px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 space-y-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel Model: XK_OEM_GT2_2026</span>
          </div>
          <p className="text-[11px] leading-tight">Dữ liệu tự động đồng bộ theo chu kỳ 4 tháng &amp; cập nhật tuần.</p>
        </div>
      )}
    </aside>
  );
}
