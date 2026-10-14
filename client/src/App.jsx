import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import Settings from './pages/Settings';
import { api, clearBootstrapCache } from './services/api';
import { getSession, clearSession, logout, allowedBUs } from './services/auth';
import { onUnauthorized, onRetry } from './services/gasClient';
import { confirmNavigateAway, confirmLeaveApp, isDirty } from './services/dirtyState';
import { loadPref, savePref, bumpPrefsVersion } from './services/prefs';
import { thongBao, configureToast } from './services/toastService';
import { setPrefsTransport, startPrefsSync, flush as flushPrefs, stopPrefsSync } from './services/prefsSync';
import { laKhoaCaiDat, readSettings, seedRemembered, quyetDinhKhoiDong, lanMoDauCuaPhien, choToiDa } from './services/settings';
import { useSettings } from './utils/useSettings';
import { applyDensity } from './utils/density';
import { vnYear } from './utils/period';
import { VALID_TABS, landingIdsFor } from './utils/menu';
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

// Bản sao cài đặt / lựa chọn nhớ trên máy chủ (14/10/2026): chỉ cắm transport ở đây, logic nằm ở services/prefsSync.js.
setPrefsTransport({ get: () => api.getMyPrefs(), set: (changes) => api.setMyPrefs(changes) });
// Chờ đồng bộ lần đầu tối đa chừng này khi mở app — chậm hơn thì cứ vào app bằng giá trị ở máy, bản của máy chủ tới sau.
const CHO_DONG_BO_TOI_DA_MS = 3000;

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
  // Địa chỉ lúc mở đã có #màn hợp lệ? (#hash luôn thắng "trang đầu" ở Cài đặt; effect bên dưới sẽ ghi hash đè lên nên phải chụp ngay lúc dựng.)
  const [coHashLucMo] = useState(() => laTabHopLe(window.location.hash.replace('#', '')));
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryNotice, setRetryNotice] = useState(null);
  const [menuMo, setMenuMo] = useState(false);          // ngăn kéo menu trên điện thoại
  const [hetPhien, setHetPhien] = useState(null);       // { thongBao } khi phiên hết hạn LÚC ĐANG DÙNG: hộp đăng nhập lại đè lên trang

  const user = session?.user || null;
  const buCodes = useMemo(() => bus.map((b) => b.code), [bus]);
  const caiDat = useSettings(buCodes);
  // Cài đặt có hiệu lực toàn app: mật độ bảng (lớp trên <html>) và thời gian hiện toast.
  useEffect(() => { applyDensity(caiDat.density); }, [caiDat.density]);
  useEffect(() => { configureToast({ autoMs: caiDat.toastSec * 1000 }); }, [caiDat.toastSec]);
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
    // Chưa đăng nhập (màn Login) thì chưa biết ghi cho ai — đừng ghi vào khoá chung của trình duyệt.
    if (session) savePref('tab', activeTab);
  }, [activeTab, session]);

  useEffect(() => {
    if (currentBU && session) savePref('bu', currentBU);
  }, [currentBU, session]);

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
      // Số yêu cầu chờ duyệt (chấm số ở menu) lọc theo session phía server (bu/role trong token), không dùng gì từ getBootstrap, nên gọi
      // song song thay vì đợi bootstrap xong. Đợt 4: chỉ ĐẾM (countPendingApprovals) thay vì tải cả danh sách kèm tên người chỉ để lấy
      // độ dài; server cũ chưa có action đó thì api tự rơi về getApprovals. Lỗi thì coi như 0, không chặn cả trang.
      // Đồng bộ cài đặt cá nhân với máy chủ chạy SONG SONG, chờ tối đa vài giây và không bao giờ làm hỏng việc tải: startPrefsSync
      // không ném lỗi (máy chủ chưa có bảng / mất mạng -> giữ giá trị ở máy, không báo lỗi chặn).
      const nguoiDung = getSession()?.user;
      const dongBo = startPrefsSync(nguoiDung?.id);
      const [boot, soChoDuyet, dongBoXong] = await Promise.all([
        api.getBootstrap(),
        api.countPendingApprovals().catch(() => 0),
        choToiDa(dongBo, CHO_DONG_BO_TOI_DA_MS)
      ]);
      const list = allowedBUs(boot.businessUnits || []);
      const maDonVi = list.map((b) => b.code);
      const ctx = { namHienTai: vnYear(), landingIds: landingIdsFor(nguoiDung?.role), buCodes: maDonVi };
      // Mặc định tường minh (Cài đặt) chỉ áp ở lần mở đầu tiên của phiên trình duyệt này — xem services/settings.js.
      const moDau = lanMoDauCuaPhien(nguoiDung?.id);
      const caiDatLuc = readSettings(ctx);
      if (moDau) seedRemembered(caiDatLuc);
      // Máy chủ trả lời quá chậm (đã vào app bằng giá trị ở máy): khi bản của máy chủ tới, áp nốt các cài đặt khoá nhớ vừa đổi.
      if (dongBoXong === null) {
        dongBo.then((r) => {
          const ds = (r?.doi || []).filter(laKhoaCaiDat);
          if (ds.length) { seedRemembered(readSettings(ctx), ds); }
          bumpPrefsVersion();
        });
      }
      setBus(list);
      // Lần mở đầu của phiên: đọc LẠI tab / đơn vị đã nhớ — bản của máy chủ (nếu tới kịp) vừa được gộp vào, và state đầu tiên
      // của App được dựng trước đó. Từ lần sau thì giữ nguyên state đang có (không giật người dùng đang làm việc).
      const khoiDong = (prev) => quyetDinhKhoiDong({
        moDau, coHash: coHashLucMo,
        tabDaNho: moDau && !coHashLucMo ? loadPref('tab', prev.tab, laTabHopLe) : prev.tab,
        landing: caiDatLuc.landing, bu: caiDatLuc.bu,
        buHienTai: moDau ? loadPref('bu', prev.bu, (v) => typeof v === 'string') : prev.bu,
        buCodes: maDonVi, buCuaToi: boot.user.business_unit_code
      });
      // Đơn vị và trang đầu cùng một quyết định; tính trên giá trị hiện tại của từng state.
      setCurrentBU((prev) => khoiDong({ tab: '', bu: prev }).bu);
      setActiveTab((prev) => khoiDong({ tab: prev, bu: '' }).tab);
      setPendingApprovalsCount(soChoDuyet);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [coHashLucMo]);

  useEffect(() => {
    if (session) loadInitialData();
    else setLoading(false);
  }, [session, loadInitialData]);

  const handleLoginSuccess = () => {
    clearBootstrapCache();
    setHetPhien(null);      // một lượt đăng nhập sai ở màn Login cũng có thể báo UNAUTHORIZED: đừng để nó hiện thành hộp "hết phiên" ngay sau khi vào
    // Đơn vị đã nhớ của NGƯỜI VỪA ĐĂNG NHẬP (auth.js đã gắn người dùng cho prefs.js): state đầu tiên được dựng lúc chưa biết là ai.
    setCurrentBU(loadPref('bu', '', (v) => typeof v === 'string'));
    setSession(getSession());
  };

  // Đăng nhập lại từ hộp "hết phiên". Cùng người: giữ NGUYÊN session + state các trang (không nạp lại), chỉ token mới đã được
  // auth.js lưu. Người khác: dữ liệu đang hiện thuộc quyền người cũ nên nạp lại từ đầu (đổi session -> loadInitialData chạy lại).
  const handleReloginSuccess = (u) => {
    clearBootstrapCache();
    setHetPhien(null);
    if (!u || u.id !== session?.user?.id) setSession(getSession());
    else startPrefsSync(u.id);    // cùng người: gửi nốt cài đặt đang chờ (không bao giờ ném lỗi)
    if (u && u.id === session?.user?.id) thongBao({ type: 'success', text: 'Đã đăng nhập lại. Số đang nhập vẫn còn — thao tác vừa rồi (nếu có) hãy bấm lại và kiểm tra kết quả.' });
    choDuyetNam.nap();
  };

  const handleLogout = async () => {
    // confirmLeaveApp: đồng ý rồi thì gỡ cờ dirty, kẻo beforeunload của trình duyệt hỏi LẦN THỨ HAI khi logout() chuyển về cổng.
    if (!(await confirmLeaveApp('Đăng xuất'))) return;
    // Gửi nốt cài đặt đang chờ TRƯỚC khi mất token (tối đa ~1,5 giây, không bao giờ chặn đăng xuất; phần chưa gửi được còn trong danh sách chờ bền).
    await choToiDa(flushPrefs(), 1500);
    stopPrefsSync();
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
        onOpenSettings={async () => { if (await confirmNavigateAway()) setActiveTab('settings'); }}
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
              {activeTab === 'settings' && <Settings user={user} bus={bus} currentBU={currentBU} />}
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
