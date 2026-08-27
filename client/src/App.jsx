import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import MonthlyForecast from './pages/MonthlyForecast';
import WeeklyForecast from './pages/WeeklyForecast';
import Approvals from './pages/Approvals';
import Products from './pages/Products';
import WorkflowGuide from './pages/WorkflowGuide';
import { api } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [bus, setBus] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentBU, setCurrentBU] = useState('GT2');
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [buList, userList, approvals] = await Promise.all([
        api.getBUs(),
        api.getUsers(),
        api.getApprovals({ status: 'pending' })
      ]);
      setBus(buList);
      setUsers(userList);
      setPendingApprovalsCount(approvals.length);

      if (buList.length > 0) setCurrentBU(buList[0].code);
      if (userList.length > 0) setCurrentUser(userList[0]);
    } catch (err) {
      console.error('Failed to load initial app data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      
      {/* Header */}
      <Header
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        currentBU={currentBU}
        setCurrentBU={setCurrentBU}
        bus={bus}
        users={users}
      />

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingCount={pendingApprovalsCount}
        />

        <main className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              Đang tải dữ liệu hệ thống...
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && <Dashboard currentBU={currentBU} />}
              {activeTab === 'monthly' && <MonthlyForecast currentBU={currentBU} currentUser={currentUser} />}
              {activeTab === 'weekly' && <WeeklyForecast currentBU={currentBU} currentUser={currentUser} />}
              {activeTab === 'approvals' && <Approvals currentBU={currentBU} currentUser={currentUser} />}
              {activeTab === 'products' && <Products />}
              {activeTab === 'guide' && <WorkflowGuide />}
            </>
          )}
        </main>
      </div>

    </div>
  );
}
