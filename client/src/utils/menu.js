import {
  LayoutDashboard, CalendarDays, CalendarRange, CheckCircle2, TrendingUp, Target, Package, Download, HelpCircle
} from 'lucide-react';
import { MAN_HINH } from './glossary.js';

/**
 * Menu bên trái — MỘT icon riêng cho mỗi mục (không trùng), vì khi menu thu gọn chỉ còn icon
 * thì hai mục cùng icon không phân biệt được (Rà soát 4 app, Đợt 2 mục 7). Tiêu đề trang
 * và tab con dùng icon KHÁC các icon ở đây, hoặc đúng icon của mục menu tương ứng.
 * `roles` rỗng/không có = ai cũng thấy. `mota` = tooltip giải thích mục làm gì.
 * Tên các màn Forecast tháng / tuần và Quy trình lấy từ glossary (MAN_HINH), không đặt tên ở hai nơi.
 */
export const MENU_ITEMS = [
  { id: 'dashboard', label: 'Tổng quan & Báo cáo', mota: 'Số forecast của chu kỳ theo đơn vị và nhóm hàng, kèm biểu đồ.', icon: LayoutDashboard },
  { id: 'monthly', label: MAN_HINH.monthly.ten, mota: MAN_HINH.monthly.mota, icon: CalendarDays },
  { id: 'weekly', label: MAN_HINH.weekly.ten, mota: MAN_HINH.weekly.mota, icon: CalendarRange },
  { id: 'approvals', label: 'Quy trình Phê duyệt', mota: 'Duyệt hoặc từ chối forecast đã gửi; xem lịch sử các lần duyệt.', icon: CheckCircle2 },
  { id: 'actuals', label: 'Sản lượng Thực hiện', mota: 'Nhập hoặc lấy từ SAP sản lượng thực hiện từng tháng và so với forecast.', icon: TrendingUp },
  { id: 'annual', label: 'Kế hoạch năm', mota: 'Lập, gửi duyệt và duyệt kế hoạch doanh thu cả năm theo khách và SKU.', icon: Target },
  { id: 'products', label: 'Danh mục SKU', mota: 'Danh mục sản phẩm dùng để lập forecast: mã, tên, nhóm hàng, kênh.', icon: Package },
  { id: 'exports', label: 'Xuất Báo cáo', mota: 'Xuất file tổng hợp toàn công ty: form báo cáo FC và file upload SAP.', icon: Download, roles: ['central_admin', 'viewer'] },
  { id: 'guide', label: MAN_HINH.guide.ten, mota: MAN_HINH.guide.mota, icon: HelpCircle }
];

export const VALID_TABS = MENU_ITEMS.map((m) => m.id);

export const MENU_ICON = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m.icon]));
