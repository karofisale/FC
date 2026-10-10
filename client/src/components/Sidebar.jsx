import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { MENU_ITEMS } from '../utils/menu';

const COLLAPSE_KEY = 'karofi_fc_sidebar_collapsed';

/**
 * Menu bên trái.
 *  - Từ 768px trở lên: cột cố định, thu gọn được thành cột icon (như trước).
 *  - Dưới 768px (điện thoại): menu thành NGĂN KÉO trượt từ trái ra, mở bằng nút ☰ ở Header (`open` / `onClose`),
 *    nội dung chiếm trọn chiều ngang. Trước đây cột 256px luôn chiếm chỗ nên ở màn 375px nội dung chỉ còn ~120px
 *    (Rà soát 4 app, Đợt 3 mục 1). Ngăn kéo luôn hiện đủ chữ — trạng thái "thu gọn" chỉ áp dụng cho cột cố định (tiền tố md:).
 *
 * `badges`: { [mã mục]: { n, title } } — số chờ xử lý hiện ở mục menu (Phê duyệt, Kế hoạch năm).
 */
export default function Sidebar({ activeTab, setActiveTab, badges = {}, role, open = false, onClose }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const nutDong = useRef(null);

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

  // Ngăn kéo đang mở: Esc đóng, khoá cuộn trang nền, focus vào nút đóng rồi TRẢ focus về nút ☰ khi đóng;
  // kéo rộng cửa sổ lên ≥768px (xoay ngang máy tính bảng) thì tự đóng để khỏi kẹt khoá cuộn.
  useEffect(() => {
    if (!open) return undefined;
    const truoc = document.activeElement;
    const phim = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose?.(); } };
    document.addEventListener('keydown', phim);
    const cuTruoc = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nutDong.current?.focus();
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 768px)') : null;
    const doi = () => { if (mq && mq.matches) onClose?.(); };
    mq?.addEventListener?.('change', doi);
    return () => {
      document.removeEventListener('keydown', phim);
      document.body.style.overflow = cuTruoc;
      mq?.removeEventListener?.('change', doi);
      if (truoc && typeof truoc.focus === 'function' && document.contains(truoc)) truoc.focus();
    };
  }, [open, onClose]);

  // Danh sách mục + icon nằm ở utils/menu.js (mỗi mục một icon riêng, không trùng).
  const menuItems = MENU_ITEMS
    .filter((m) => !m.roles || m.roles.includes(role))
    .map((m) => ({ ...m, badge: badges[m.id] && badges[m.id].n > 0 ? badges[m.id] : null }));

  const chon = (id) => {
    setActiveTab(id);
    onClose?.();
  };

  return (
    <>
      {open && (
        <div
          className="md:hidden fixed inset-y-0 inset-x-0 bg-slate-950/60 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        id="menu-chinh"
        aria-label="Danh mục chức năng"
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto transition-[transform,visibility] duration-200 ${
          open ? 'translate-x-0 visible' : '-translate-x-full invisible'
        } md:visible md:translate-x-0 md:static md:z-auto md:max-w-none md:overflow-visible md:transition-[width] ${
          collapsed ? 'md:w-16' : 'md:w-64'
        } shrink-0 bg-slate-900 text-slate-300 md:min-h-[calc(100vh-61px)] p-3 flex flex-col border-r border-slate-800`}
      >
        <div className={`flex items-center justify-between mb-3 px-1 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          <span className={`text-xs font-bold text-slate-400 uppercase tracking-wider ${collapsed ? 'md:hidden' : ''}`}>
            DANH MỤC CHỨC NĂNG
          </span>
          <button
            type="button"
            ref={nutDong}
            onClick={onClose}
            aria-label="Đóng menu"
            className="md:hidden p-2 -m-1 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            className="hidden md:block p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
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
                onClick={() => chon(item.id)}
                title={collapsed ? `${item.label} — ${item.mota}` : item.mota}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between rounded-lg text-sm font-medium transition-all px-3 py-3 md:py-2.5 ${
                  collapsed ? 'md:justify-center md:px-2' : ''
                } ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50 font-semibold'
                    : 'hover:bg-slate-800 hover:text-white text-slate-400'
                }`}
              >
                <div className={`flex items-center space-x-3 relative ${collapsed ? 'md:space-x-0' : ''}`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {collapsed && item.badge && (
                    <span className="hidden md:block absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-amber-500" />
                  )}
                  <span className={collapsed ? 'md:hidden' : ''}>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    title={item.badge.title}
                    className={`bg-amber-500 text-slate-950 text-xs font-black px-2 py-0.5 rounded-full ${collapsed ? 'md:hidden' : ''}`}
                  >
                    {item.badge.n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className={`pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-2 ${collapsed ? 'md:hidden' : ''}`}>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel Model: XK_OEM_GT2_2026</span>
          </div>
          <p className="text-[11px] leading-tight">Dữ liệu tự động đồng bộ theo chu kỳ 4 tháng &amp; cập nhật tuần.</p>
        </div>
      </aside>
    </>
  );
}
