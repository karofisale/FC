import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import DialogHost from './components/DialogHost';
import ToastHost from './components/ToastHost';
import ReloginDialog from './components/ReloginDialog';
import { useChoDuyetNam } from './components/annual/HopChoDuyet';
import Login from './pages/Login';
// Tải lười: màn Tổng quan là tab mặc định nên được kéo sẵn lúc trình duyệt rảnh (hàm làm ấm bên dưới). Riêng thư viện biểu đồ
// (recharts, ~108KB gzip) KHÔNG nằm trong chunk này nữa — nó chỉ tải khi người dùng mở phần "Biểu đồ" (Đợt 3 mục 7).
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
import MonthlyForecast from './pages/MonthlyForecast';
import WeeklyForecast from './pages/WeeklyForecast';
import Approvals from './pages/Approvals';
import Actuals from './pages/Actuals';
// Tải lười — kéo theo thư viện xlsx (~290KB), chỉ admin/viewer mới dùng
// tới màn này, không nên bắt mọi người tải sẵn ngay từ đầu.
const Exports = React.lazy(() => import('./pages/Exports'));
// Kế hoạch năm: tải lười, chỉ người lập/duyệt kế hoạch năm mới dùng.
const AnnualPlan = React.lazy(() => import('./pages/AnnualPlan'));
import Products from './pages/Products';
import WorkflowGuide from './pages/WorkflowGuide';
import { api, clearBootstrapCache } from './services/api';
import { getSession, clearSession, logout, allowedBUs } from './services/auth';
import { onUnauthorized, onRetry } from './services/gasClient';
import { confirmNavigateAway, confirmLeaveApp, isDirty } from './services/dirtyState';
import { loadPref, savePref } from './services/prefs';
import { thongBao } from './services/toastService';
import { VALID_TABS } from './utils/menu';
import { AlertCircle } from 'lucide-react';

// Đồng bộ tab đang xem với #hash trên URL — không kéo theo thư viện
// router nào (8 tài khoản nội bộ không cần route lồng nhau/URL param),
// chỉ để nút Back của trình duyệt hoạt động và có thể chia sẻ/bookmark
// thẳng vào một tab thay vì luôn rơi về Dashboard.
//
// Mở app KHÔNG kèm #hash (gõ thẳng địa chỉ, link từ cổng) thì quay lại tab lần trước
// (Đợt 2 mục 9) thay vì luôn về Tổng quan; có #hash thì #hash thắng (link chia sẻ).
// Danh sách tab hợp lệ lấy từ utils/menu.js — cùng nguồn với Sidebar.
const laTabHopLe = (v) => VALID_TABS.includes(v);

function tabFromHash() {
  const tab = window.location.hash.replace('#', '');
  if (laTabHopLe(tab)) return tab;
  return loadPref('tab', 'dashboard', laTabHopLe);
}

export default function App() {
  const [session, setSession] = useState(getSession());
  const [activeTab, setActiveTab] = useState(tabFromHash);
  const [bus, setBus] = useState([]);
  // Đơn vị lần trước (Đợt 2 mục 9); loadInitialData bỏ qua nếu người này không còn quyền đơn vị đó.
  const [currentBU, setCurrentBU] = useState(() => loadPref('bu', '', (v) => typeof v === 'string'));
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryNotice, setRetryNotice] = useState(null);
  const [menuMo, setMenuMo] = useState(false);          // ngăn kéo menu trên điện thoại
  const [hetPhien, setHetPhien] = useState(null);       // { thongBao } khi phiên hết hạn LÚC ĐANG DÙNG: hộp đăng nhập lại đè lên trang

  const user = session?.user || null;
  const laNguoiDuyet = user?.role === 'bu_approver' || user?.role === 'central_admin';
  // Kế hoạch năm chờ duyệt (mọi đơn vị × năm người này duyệt được) — cho badge menu, hộp "Chờ duyệt" và màn Phê duyệt.
  // Gom ở đây một lần rồi chuyền xuống; chỉ người duyệt mới gọi.
  const choDuyetNam = useChoDuyetNam(!!session && laNguoiDuyet);

  // Server báo token hết hạn ở bất kỳ request nào. KHÔNG gỡ về màn Login nữa (mất sạch số đang nhập): xoá token, giữ nguyên
  // session/state của các trang và hiện hộp đăng nhập lại đè lên (Đợt 3 mục 1). Chưa đăng nhập (đang ở màn Login) thì bỏ qua.
  useEffect(() => onUnauthorized((err) => {
    clearSession();
    clearBootstrapCache();
    setHetPhien({ thongBao: err.message || 'Phiên đăng nhập đã hết hạn.' });
  }), []);

  // Mạng chập chờn / máy chủ chưa trả lời: gasClient tự thử lại, ở đây chỉ cho người dùng biết đang thử lại, không phải treo máy.
  useEffect(() => onRetry(() => {
    setRetryNotice('Không kết nối được máy chủ — đang thử lại...');
  }), []);

  // Đóng tab/tải lại trong lúc còn ô chưa lưu — trình duyệt tự hỏi xác
  // nhận (nội dung cụ thể do trình duyệt quyết định, không hiển thị được
  // message tuỳ ý ở đây, chỉ cần gọi preventDefault để kích hoạt hộp thoại).
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    if (!loading) setRetryNotice(null);
  }, [loading]);

  // Làm ấm chunk Dashboard lúc trình duyệt rảnh. Dashboard là tab mặc định
  // nhưng được tải lười; kéo sẵn ở đây để chunk về song song với lượt gọi API
  // mà màn này vốn phải chờ, thay vì chỉ bắt đầu tải khi người dùng đã nhìn
  // thấy màn trống. (Chunk này nhỏ: thư viện biểu đồ nằm riêng, tải khi mở phần Biểu đồ.)
  useEffect(() => {
    const warm = () => { import('./pages/Dashboard'); };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = setTimeout(warm, 300);
    return () => clearTimeout(id);
  }, []);

  // Đẩy tab đang xem lên #hash để bookmark/chia sẻ được và nút Back hoạt động; nhớ tab cho lần mở sau.
  useEffect(() => {
    if (window.location.hash.replace('#', '') !== activeTab) {
      window.location.hash = activeTab;
    }
    savePref('tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (currentBU) savePref('bu', currentBU);
  }, [currentBU]);

  // Bấm Back/Forward đổi #hash — đồng bộ ngược lại activeTab. Nếu đang
  // có ô chưa lưu và người dùng huỷ xác nhận, đẩy hash trở lại tab hiện
  // tại để URL không lệch khỏi những gì đang thực sự hiển thị.
  useEffect(() => {
    const handler = async () => {
      const nextTab = tabFromHash();
      if (nextTab === activeTab) return;
      if (await confirmNavigateAway()) {
        setActiveTab(nextTab);
      } else {
        window.location.hash = activeTab;
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [activeTab]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // getApprovals lọc theo session (bu/role trong token đăng nhập, xem
      // getApprovals_ ở Queries.gs) chứ không dùng gì từ getBootstrap trả về,
      // nên gọi song song thay vì đợi bootstrap xong mới gọi tiếp — rút ngắn
      // độ trễ khởi động. Approvals lỗi thì coi như 0, không chặn cả trang.
      const [boot, approvals] = await Promise.all([
        api.getBootstrap(),
        api.getApprovals({ status: 'pending' }).catch(() => [])
      ]);
      const list = allowedBUs(boot.businessUnits || []);
      setBus(list);
      setCurrentBU((prev) => {
        if (prev && list.some((b) => b.code === prev)) return prev;
        return boot.user.business_unit_code || list[0]?.code || '';
      });
      setPendingApprovalsCount(Array.isArray(approvals) ? approvals.length : 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) loadInitialData();
    else setLoading(false);
  }, [session, loadInitialData]);

  const handleLoginSuccess = () => {
    clearBootstrapCache();
    setHetPhien(null);      // một lượt đăng nhập sai ở màn Login cũng có thể báo UNAUTHORIZED: đừng để nó hiện thành hộp "hết phiên" ngay sau khi vào
    setSession(getSession());
  };

  // Đăng nhập lại từ hộp "hết phiên". Cùng người: giữ NGUYÊN session + state các trang (không nạp lại), chỉ token mới đã được
  // auth.js lưu. Người khác: dữ liệu đang hiện thuộc quyền người cũ nên nạp lại từ đầu (đổi session -> loadInitialData chạy lại).
  const handleReloginSuccess = (u) => {
    clearBootstrapCache();
    setHetPhien(null);
    if (!u || u.id !== session?.user?.id) setSession(getSession());
    else thongBao({ type: 'success', text: 'Đã đăng nhập lại. Số đang nhập vẫn còn — thao tác vừa rồi (nếu có) hãy bấm lại và kiểm tra kết quả.' });
    choDuyetNam.nap();
  };

  const handleLogout = async () => {
    // confirmLeaveApp: đồng ý rồi thì gỡ cờ dirty, kẻo beforeunload của trình duyệt hỏi LẦN THỨ HAI khi logout() chuyển về cổng.
    if (!(await confirmLeaveApp('Đăng xuất'))) return;
    const dangVeCong = await logout();
    clearBootstrapCache();
    // Đang rời trang thì đừng setState: React sẽ vẽ lại màn đăng nhập của FC
    // nhấp nháy một cái trước khi trình duyệt kịp chuyển sang cổng.
    if (dangVeCong) return;
    setHetPhien(null);
    setSession(null);
    setActiveTab('dashboard');
  };

  // Mở màn Kế hoạch năm ở đúng đơn vị × năm đang chờ duyệt (từ màn Phê duyệt). Năm nhớ qua prefs: AnnualPlan đọc lúc dựng.
  const moKeHoachNam = async (x) => {
    if (!(await confirmNavigateAway('Mở kế hoạch năm'))) return;
    savePref('annualYear', x.nam);
    if (x.bu !== currentBU) setCurrentBU(x.bu);
    setActiveTab('annual');
  };
  const soKhNamChoDuyet = choDuyetNam.items.length;

  if (!session) {
    return (
      <>
        <Login onSuccess={handleLoginSuccess} />
        <DialogHost />
        <ToastHost />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">

      <Header
        user={user}
        currentBU={currentBU}
        setCurrentBU={async (bu) => { if (await confirmNavigateAway('Đổi đơn vị')) setCurrentBU(bu); }}
        bus={bus}
        onLogout={handleLogout}
        onOpenMenu={() => setMenuMo(true)}
        menuOpen={menuMo}
      />

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={async (tab) => { if (await confirmNavigateAway()) setActiveTab(tab); }}
          badges={{
            // Phê duyệt đếm cả kế hoạch THÁNG chờ duyệt lẫn kế hoạch NĂM chờ duyệt; mục Kế hoạch năm đếm riêng phần của nó.
            approvals: {
              n: pendingApprovalsCount + soKhNamChoDuyet,
              title: `${pendingApprovalsCount} forecast chờ duyệt${soKhNamChoDuyet ? ` · ${soKhNamChoDuyet} kế hoạch năm chờ duyệt` : ''}`
            },
            annual: { n: soKhNamChoDuyet, title: `${soKhNamChoDuyet} kế hoạch năm chờ duyệt` }
          }}
          role={user?.role}
          open={menuMo}
          onClose={() => setMenuMo(false)}
        />

        <main className="flex-1 min-w-0 p-3 sm:p-4 md:p-6 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 text-sm gap-2">
              <span>Đang tải dữ liệu hệ thống...</span>
              {retryNotice && (
                <span className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                  {retryNotice}
                </span>
              )}
            </div>
          ) : error ? (
            <div className="bg-white border border-rose-200 rounded-xl p-6 max-w-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">Không tải được dữ liệu</h2>
                  <p className="text-xs text-slate-600 mt-1">{error}</p>
                  <button
                    onClick={loadInitialData}
                    className="mt-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                  >
                    Thử lại
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ErrorBoundary key={activeTab}>
              {activeTab === 'dashboard' && (
                <React.Suspense fallback={<div className="text-xs text-slate-500 p-4">Đang tải...</div>}>
                  <Dashboard currentBU={currentBU} user={user} />
                </React.Suspense>
              )}
              {activeTab === 'monthly' && <MonthlyForecast currentBU={currentBU} user={user} />}
              {activeTab === 'weekly' && <WeeklyForecast currentBU={currentBU} user={user} />}
              {activeTab === 'approvals' && (
                <Approvals
                  currentBU={currentBU} user={user} onCountChange={setPendingApprovalsCount}
                  keHoachNamChoDuyet={choDuyetNam.items} onMoKeHoachNam={moKeHoachNam}
                />
              )}
              {activeTab === 'actuals' && <Actuals currentBU={currentBU} user={user} />}
              {activeTab === 'annual' && (
                <React.Suspense fallback={<div className="text-xs text-slate-500 p-4">Đang tải...</div>}>
                  <AnnualPlan
                    currentBU={currentBU} user={user}
                    choDuyetNam={choDuyetNam} onChonDonVi={setCurrentBU}
                  />
                </React.Suspense>
              )}
              {activeTab === 'exports' && (
                <React.Suspense fallback={<div className="text-xs text-slate-500 p-4">Đang tải...</div>}>
                  <Exports user={user} />
                </React.Suspense>
              )}
              {activeTab === 'products' && <Products currentBU={currentBU} user={user} />}
              {activeTab === 'guide' && <WorkflowGuide />}
            </ErrorBoundary>
          )}
        </main>
      </div>

      {hetPhien && (
        <ReloginDialog
          userId={user?.id || ''}
          thongBao={hetPhien.thongBao}
          onSuccess={handleReloginSuccess}
          onLogout={handleLogout}
        />
      )}
      <DialogHost />
      <ToastHost />
    </div>
  );
}
