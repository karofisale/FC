import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MonthlyForecast from './pages/MonthlyForecast';
import WeeklyForecast from './pages/WeeklyForecast';
import Approvals from './pages/Approvals';
import Actuals from './pages/Actuals';
import Products from './pages/Products';
import WorkflowGuide from './pages/WorkflowGuide';
import { api, clearBootstrapCache } from './services/api';
import { getSession, clearSession, logout, allowedBUs } from './services/auth';
import { onUnauthorized } from './services/gasClient';
import { AlertCircle, LogIn } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState(getSession());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [bus, setBus] = useState([]);
  const [currentBU, setCurrentBU] = useState('');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expiredNotice, setExpiredNotice] = useState(null);

  const user = session?.user || null;

  // Server báo token hết hạn ở bất kỳ request nào -> đưa về màn đăng nhập
  useEffect(() => onUnauthorized((err) => {
    clearSession();
    clearBootstrapCache();
    setSession(null);
    setExpiredNotice(err.message || 'Phiên đăng nhập đã hết hạn.');
  }), []);

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
        setCurrentBU={setCurrentBU}
        bus={bus}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingCount={pendingApprovalsCount}
          role={user?.role}
        />

        <main className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              Đang tải dữ liệu hệ thống...
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
              {activeTab === 'dashboard' && <Dashboard currentBU={currentBU} />}
              {activeTab === 'monthly' && <MonthlyForecast currentBU={currentBU} user={user} />}
              {activeTab === 'weekly' && <WeeklyForecast currentBU={currentBU} user={user} />}
              {activeTab === 'approvals' && (
                <Approvals currentBU={currentBU} user={user} onCountChange={setPendingApprovalsCount} />
              )}
              {activeTab === 'actuals' && <Actuals currentBU={currentBU} user={user} />}
              {activeTab === 'products' && <Products currentBU={currentBU} />}
              {activeTab === 'guide' && <WorkflowGuide />}
            </ErrorBoundary>
          )}
        </main>
      </div>

    </div>
  );
}
