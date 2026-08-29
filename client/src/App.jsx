import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
// Tải lười — kéo theo recharts và các thư viện d3 đi kèm (~377KB build,
// 108KB gzip), chiếm hơn nửa gói JS ban đầu chỉ để vẽ 2 biểu đồ của đúng
// màn này. Đây là tab mặc định nên có hàm làm ấm ở dưới, tải sẵn ngay sau
// khi app mount để chunk về song song với lượt gọi API mà màn này vốn đã
// phải chờ — người dùng không thấy chậm thêm.
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
import MonthlyForecast from './pages/MonthlyForecast';
import WeeklyForecast from './pages/WeeklyForecast';
import Approvals from './pages/Approvals';
import Actuals from './pages/Actuals';
// Tải lười — kéo theo thư viện xlsx (~290KB), chỉ admin/viewer mới dùng
// tới màn này, không nên bắt mọi người tải sẵn ngay từ đầu.
const Exports = React.lazy(() => import('./pages/Exports'));
import Products from './pages/Products';
import WorkflowGuide from './pages/WorkflowGuide';
import { api, clearBootstrapCache } from './services/api';
import { getSession, clearSession, logout, allowedBUs } from './services/auth';
import { onUnauthorized, onRetry } from './services/gasClient';
import { confirmNavigateAway, isDirty } from './services/dirtyState';
import { AlertCircle, LogIn } from 'lucide-react';

// Đồng bộ tab đang xem với #hash trên URL — không kéo theo thư viện
// router nào (8 tài khoản nội bộ không cần route lồng nhau/URL param),
// chỉ để nút Back của trình duyệt hoạt động và có thể chia sẻ/bookmark
// thẳng vào một tab thay vì luôn rơi về Dashboard.
const VALID_TABS = ['dashboard', 'monthly', 'weekly', 'approvals', 'actuals', 'products', 'exports', 'guide'];

function tabFromHash() {
  const tab = window.location.hash.replace('#', '');
  return VALID_TABS.includes(tab) ? tab : 'dashboard';
}

export default function App() {
  const [session, setSession] = useState(getSession());
  const [activeTab, setActiveTab] = useState(tabFromHash);
  const [bus, setBus] = useState([]);
  const [currentBU, setCurrentBU] = useState('');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expiredNotice, setExpiredNotice] = useState(null);
  const [retryNotice, setRetryNotice] = useState(null);

  const user = session?.user || null;

  // Server báo token hết hạn ở bất kỳ request nào -> đưa về màn đăng nhập
  useEffect(() => onUnauthorized((err) => {
    clearSession();
    clearBootstrapCache();
    setSession(null);
    setExpiredNotice(err.message || 'Phiên đăng nhập đã hết hạn.');
  }), []);

  // Apps Script cold-start: lần gọi đầu sau khi "ngủ" hoặc sau deploy có
  // thể chậm và bị hạ tầng Google trả lỗi tạm thời — gasClient tự thử
  // lại, ở đây chỉ hiện cho người dùng biết đang thử lại, không phải treo máy.
  useEffect(() => onRetry(() => {
    setRetryNotice('Máy chủ đang khởi động lại, đang thử kết nối lại...');
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
  // nhưng được tải lười để recharts không nằm trong gói JS ban đầu; kéo sẵn
  // ở đây để chunk về song song với lượt gọi API mà màn này vốn phải chờ,
  // thay vì chỉ bắt đầu tải khi người dùng đã nhìn thấy màn trống.
  useEffect(() => {
    const warm = () => { import('./pages/Dashboard'); };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = setTimeout(warm, 300);
    return () => clearTimeout(id);
  }, []);

  // Đẩy tab đang xem lên #hash để bookmark/chia sẻ được và nút Back hoạt động.
  useEffect(() => {
    if (window.location.hash.replace('#', '') !== activeTab) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);

  // Bấm Back/Forward đổi #hash — đồng bộ ngược lại activeTab. Nếu đang
  // có ô chưa lưu và người dùng huỷ xác nhận, đẩy hash trở lại tab hiện
  // tại để URL không lệch khỏi những gì đang thực sự hiển thị.
  useEffect(() => {
    const handler = () => {
      const nextTab = tabFromHash();
      if (nextTab === activeTab) return;
      if (confirmNavigateAway()) {
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
      const boot = await api.getBootstrap();
      const list = allowedBUs(boot.businessUnits || []);
      setBus(list);
      setCurrentBU((prev) => {
        if (prev && list.some((b) => b.code === prev)) return prev;
        return boot.user.business_unit_code || list[0]?.code || '';
      });

      try {
        const approvals = await api.getApprovals({ status: 'pending' });
        setPendingApprovalsCount(Array.isArray(approvals) ? approvals.length : 0);
      } catch {
        setPendingApprovalsCount(0);
      }
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
    setExpiredNotice(null);
    setSession(getSession());
  };

  const handleLogout = async () => {
    if (!confirmNavigateAway()) return;
    await logout();
    clearBootstrapCache();
    setSession(null);
    setActiveTab('dashboard');
  };

  if (!session) {
    return (
      <>
        {expiredNotice && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-lg px-4 py-2.5 shadow-lg flex items-center gap-2 font-sans">
            <LogIn className="w-4 h-4 text-amber-600" />
            {expiredNotice}
          </div>
        )}
        <Login onSuccess={handleLoginSuccess} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">

      <Header
        user={user}
        currentBU={currentBU}
        setCurrentBU={(bu) => { if (confirmNavigateAway()) setCurrentBU(bu); }}
        bus={bus}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => { if (confirmNavigateAway()) setActiveTab(tab); }}
          pendingCount={pendingApprovalsCount}
          role={user?.role}
        />

        <main className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-sm gap-2">
              <span>Đang tải dữ liệu hệ thống...</span>
              {retryNotice && (
                <span className="text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
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
                <React.Suspense fallback={<div className="text-xs text-slate-400 p-4">Đang tải...</div>}>
                  <Dashboard currentBU={currentBU} />
                </React.Suspense>
              )}
              {activeTab === 'monthly' && <MonthlyForecast currentBU={currentBU} user={user} />}
              {activeTab === 'weekly' && <WeeklyForecast currentBU={currentBU} user={user} />}
              {activeTab === 'approvals' && (
                <Approvals currentBU={currentBU} user={user} onCountChange={setPendingApprovalsCount} />
              )}
              {activeTab === 'actuals' && <Actuals currentBU={currentBU} user={user} />}
              {activeTab === 'exports' && (
                <React.Suspense fallback={<div className="text-xs text-slate-400 p-4">Đang tải...</div>}>
                  <Exports user={user} />
                </React.Suspense>
              )}
              {activeTab === 'products' && <Products currentBU={currentBU} />}
              {activeTab === 'guide' && <WorkflowGuide />}
            </ErrorBoundary>
          )}
        </main>
      </div>

    </div>
  );
}
