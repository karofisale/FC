import React from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  CalendarRange, 
  CheckCircle2, 
  Package, 
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, pendingCount = 0 }) {
  const menuItems = [
    { id: 'dashboard', label: 'Tổng quan & Báo cáo', icon: LayoutDashboard, badge: null },
    { id: 'monthly', label: 'Bảng 0: Forecast 4 Tháng', icon: CalendarDays, badge: null },
    { id: 'weekly', label: 'Bảng 1: Forecast Tuần/Miền', icon: CalendarRange, badge: null },
    { id: 'approvals', label: 'Quy trình Phê duyệt', icon: CheckCircle2, badge: pendingCount > 0 ? pendingCount : null },
    { id: 'products', label: 'Danh mục SKU', icon: Package, badge: null },
    { id: 'guide', label: 'Sơ đồ Quy trình B5', icon: HelpCircle, badge: null }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 min-h-[calc(100vh-61px)] p-4 flex flex-col border-r border-slate-800">
      
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 mb-3">
        DANH MỤC CHỨC NĂNG
      </div>

      <nav className="space-y-1 flex-1">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 font-semibold' 
                  : 'hover:bg-slate-800 hover:text-white text-slate-400'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="bg-amber-500 text-slate-950 text-xs font-black px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-slate-800 text-xs text-slate-500 space-y-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Excel Model: XK_OEM_GT2_2026</span>
        </div>
        <p className="text-[11px] leading-tight">Dữ liệu tự động đồng bộ theo chu kỳ 4 tháng & cập nhật tuần.</p>
      </div>

    </aside>
  );
}
