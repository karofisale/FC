import React from 'react';
import { UserCheck, Building2, Calendar, ShieldCheck } from 'lucide-react';

export default function Header({ currentUser, setCurrentUser, currentBU, setCurrentBU, bus, users }) {
  return (
    <header className="bg-gradient-to-r from-blue-900 via-blue-800 to-sky-900 text-white shadow-md border-b border-blue-700 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        
        {/* Logo & Title */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
            <span className="font-black text-xl text-cyan-300 tracking-tighter">K</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              KAROFI SALES FORECAST
              <span className="bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 text-[10px] px-2 py-0.5 rounded font-mono uppercase">
                v2.0 2026
              </span>
            </h1>
            <p className="text-xs text-blue-200">Hệ thống Lập & Thẩm định Kế hoạch Kinh doanh Karofi</p>
          </div>
        </div>

        {/* Global Controls & User Role Switcher */}
        <div className="flex items-center space-x-4">

          {/* Business Unit Selector */}
          <div className="flex items-center bg-blue-950/40 border border-blue-600/40 rounded-lg px-3 py-1.5 shadow-inner">
            <Building2 className="w-4 h-4 text-cyan-400 mr-2" />
            <span className="text-xs text-blue-200 mr-2">Đơn vị:</span>
            <select
              value={currentBU}
              onChange={(e) => setCurrentBU(e.target.value)}
              className="bg-transparent text-sm font-semibold text-white outline-none cursor-pointer pr-2"
            >
              {bus.map(b => (
                <option key={b.code} value={b.code} className="bg-slate-900 text-white">
                  {b.code} - {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* User Role Switcher */}
          <div className="flex items-center bg-blue-950/40 border border-blue-600/40 rounded-lg px-3 py-1.5 shadow-inner">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mr-2" />
            <span className="text-xs text-blue-200 mr-2">Người dùng:</span>
            <select
              value={currentUser ? currentUser.id : ''}
              onChange={(e) => {
                const found = users.find(u => u.id === e.target.value);
                if (found) setCurrentUser(found);
              }}
              className="bg-transparent text-sm font-semibold text-white outline-none cursor-pointer"
            >
              {users.map(u => (
                <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

        </div>

      </div>
    </header>
  );
}
