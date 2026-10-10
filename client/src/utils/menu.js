import {
  LayoutDashboard, CalendarDays, CalendarRange, CheckCircle2, TrendingUp, Target, Package, Download, HelpCircle
} from 'lucide-react';

/**
 * Menu bên trái — MỘT icon riêng cho mỗi mục (không trùng), vì khi menu thu gọn chỉ còn icon
 * thì hai mục cùng icon không phân biệt được (Rà soát 4 app, Đợt 2 mục 7). Tiêu đề trang
 * và tab con dùng icon KHÁC các icon ở đây, hoặc đúng icon của mục menu tương ứng.
 * `roles` rỗng/không có = ai cũng thấy.
 */
export const MENU_ITEMS = [
  { id: 'dashboard', label: 'Tổng quan & Báo cáo', icon: LayoutDashboard },
  { id: 'monthly', label: 'Bảng 0: Forecast 4 Tháng', icon: CalendarDays },
  { id: 'weekly', label: 'Bảng 1: Forecast Tuần/Miền', icon: CalendarRange },
  { id: 'approvals', label: 'Quy trình Phê duyệt', icon: CheckCircle2 },
  { id: 'actuals', label: 'Sản lượng Thực hiện', icon: TrendingUp },
  { id: 'annual', label: 'Kế hoạch năm', icon: Target },
  { id: 'products', label: 'Danh mục SKU', icon: Package },
  { id: 'exports', label: 'Xuất Báo cáo', icon: Download, roles: ['central_admin', 'viewer'] },
  { id: 'guide', label: 'Sơ đồ Quy trình B5', icon: HelpCircle }
];

export const VALID_TABS = MENU_ITEMS.map((m) => m.id);

export const MENU_ICON = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m.icon]));
