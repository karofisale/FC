import React, { useState, useSyncExternalStore } from 'react';
import { Settings as SettingsIcon, Palette, Rocket, Bell, ShieldCheck, RotateCcw, KeyRound, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { MAN_HINH, roleLabel } from '../utils/glossary';
import { MENU_ITEMS, landingIdsFor } from '../utils/menu';
import { vnYear } from '../utils/period';
import { getSession } from '../services/auth';
import { savePref, clearPref, bumpPrefsVersion } from '../services/prefs';
import {
  ST, MAT_DO, THOI_GIAN_TOAST, readSettings, seedRemembered, khoiPhucMacDinh, khoaCaiDatConLai
} from '../services/settings';
import { getSyncStatus, subscribeSyncStatus } from '../services/prefsSync';
import { appConfirm } from '../services/dialogService';
import { toast } from '../services/toastService';
import { useSettings } from '../utils/useSettings';
import { ChangePinDialog } from '../components/Header';

/**
 * CÀI ĐẶT CÁ NHÂN (14/10/2026) — mọi vai trò đều vào được; mỗi người chỉnh tuỳ chọn của CHÍNH MÌNH.
 *
 * Mọi thay đổi có hiệu lực ngay và được ghi ngay (không có nút "Lưu"): lưu ở máy (services/prefs.js, khoá `st.*`) rồi
 * tự đồng bộ lên máy chủ theo tài khoản (services/prefsSync.js) để đi theo người dùng sang máy khác.
 * Chọn "Tự động" = xoá cài đặt đó -> app chạy như trước (nhớ lựa chọn lần cuối). Quy tắc áp dụng: services/settings.js.
 */

const sheet = 'bg-white rounded-xl border border-slate-200 shadow-sm';
const nutPhu = 'inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg';

function Muc({ icon: Icon, tieuDe, children }) {
  return (
    <section className={`${sheet} p-4 sm:p-5`} aria-label={tieuDe}>
      <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide border-b border-slate-200 pb-2 flex items-center gap-2">
        <Icon className="w-4 h-4 text-blue-600" aria-hidden="true" /> {tieuDe}
      </h3>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function Dong({ id, nhan, mota, children }) {
  return (
    <div className="py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="min-w-0 md:max-w-xl">
        <div id={id + '-nhan'} className="text-sm font-semibold text-slate-900">{nhan}</div>
        {mota && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{mota}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

/** Nhóm nút chọn một (radiogroup). options: [{ v, label }]. */
function Nhom({ id, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-labelledby={id + '-nhan'} className="inline-flex flex-wrap rounded-lg border border-slate-300 overflow-hidden">
      {options.map((o, i) => {
        const dang = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={dang}
            onClick={() => onChange(o.v)}
            className={`px-3 py-1.5 text-xs font-semibold ${i > 0 ? 'border-l border-slate-300' : ''} ${dang ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Chon({ id, value, options, onChange }) {
  return (
    <select
      id={id}
      aria-labelledby={id + '-nhan'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 min-w-[12rem]"
    >
      {options.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.label}</option>)}
    </select>
  );
}

const TU_DONG = 'auto';
const BA_TRANG_THAI = (nhanBat, nhanTat) => [
  { v: TU_DONG, label: 'Tự động' },
  { v: 'true', label: nhanBat },
  { v: 'false', label: nhanTat }
];
const triBool = (v) => (v === null || v === undefined ? TU_DONG : String(v));
const doiTriBool = (s) => (s === TU_DONG ? null : s === 'true');

function TrangThaiDongBo() {
  const s = useSyncExternalStore(subscribeSyncStatus, () => getSyncStatus().status + '|' + getSyncStatus().pending);
  const [trangThai, soCho] = s.split('|');
  if (trangThai === 'ok' && soCho === '0') {
    return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1"><Cloud className="w-3.5 h-3.5" aria-hidden="true" /> Đã đồng bộ theo tài khoản</span>;
  }
  if (trangThai === 'offline') {
    return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1" title="Cài đặt vẫn được lưu trên máy này và sẽ tự gửi lên máy chủ khi kết nối được."><CloudOff className="w-3.5 h-3.5" aria-hidden="true" /> Chưa đồng bộ được — đang lưu trên máy này</span>;
  }
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Đang đồng bộ…</span>;
}

export default function Settings({ user, bus = [], currentBU }) {
  const buCodes = bus.map((b) => b.code);
  const st = useSettings(buCodes);
  const [hienPin, setHienPin] = useState(false);
  const role = user?.role;
  const namNay = vnYear();
  const nhieuDonVi = bus.length > 1;
  const tuCong = !!getSession()?.fromPortal;
  const manHinh = MENU_ITEMS.filter((m) => landingIdsFor(role).includes(m.id));

  /** Đặt (hoặc xoá, value null) một cài đặt; cài đặt trùng khoá nhớ cũ thì áp luôn vào khoá nhớ để thấy ngay. */
  const dat = (key, value) => {
    if (value === null || value === undefined) clearPref(key);
    else savePref(key, value);
    const ctx = { namHienTai: namNay, landingIds: landingIdsFor(role), buCodes };
    seedRemembered(readSettings(ctx), [key]);
    bumpPrefsVersion();
  };

  const khoiPhuc = async () => {
    const dem = khoaCaiDatConLai().length;
    if (dem === 0) { toast.info('Chưa có cài đặt nào được đặt — đang dùng mặc định.'); return; }
    const ok = await appConfirm(
      `Xoá ${dem} cài đặt cá nhân và quay về mặc định? Các lựa chọn app tự nhớ (tab, kỳ, bộ lọc...) được giữ nguyên.`,
      { title: 'Khôi phục mặc định?', okLabel: 'Khôi phục mặc định', danger: true }
    );
    if (!ok) return;
    khoiPhucMacDinh();
    bumpPrefsVersion();
    toast.success('Đã khôi phục cài đặt mặc định.');
  };

  const thuToast = () => toast.info(`Thông báo thử — tự tắt sau ${st.toastSec} giây.`);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className={`${sheet} p-4 flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-600" aria-hidden="true" />
            {MAN_HINH.settings.tieuDe}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Chỉ ảnh hưởng tài khoản của bạn. Thay đổi có hiệu lực ngay và đi theo tài khoản sang máy khác.
          </p>
        </div>
        <TrangThaiDongBo />
      </div>

      <Muc icon={Palette} tieuDe="Giao diện">
        <Dong id="st-density" nhan="Mật độ bảng" mota="Gọn: dòng thấp hơn để thấy nhiều SKU trên một màn hình.">
          <Nhom
            id="st-density" value={st.density}
            options={[{ v: 'thoang', label: MAT_DO.thoang }, { v: 'gon', label: MAT_DO.gon }]}
            onChange={(v) => dat(ST.density, v === 'thoang' ? null : v)}
          />
        </Dong>
        <Dong id="st-sidebar" nhan="Thu gọn menu trái mặc định" mota="Áp ở lần mở app đầu tiên của mỗi phiên; trong phiên bạn vẫn thu gọn / mở rộng tuỳ ý. Điện thoại luôn dùng ngăn kéo.">
          <Nhom
            id="st-sidebar" value={triBool(st.sidebarCollapsed)}
            options={BA_TRANG_THAI('Thu gọn', 'Mở rộng')}
            onChange={(v) => dat(ST.sidebarCollapsed, doiTriBool(v))}
          />
        </Dong>
      </Muc>

      <Muc icon={Rocket} tieuDe="Khi mở app">
        <Dong id="st-landing" nhan="Trang đầu" mota="Màn hiện ra khi mở app (không có địa chỉ #màn cụ thể). Tự động = mở lại màn bạn dùng lần trước.">
          <Chon
            id="st-landing" value={st.landing ?? TU_DONG}
            options={[{ v: TU_DONG, label: 'Tự động (màn lần trước)' }, ...manHinh.map((m) => ({ v: m.id, label: m.label }))]}
            onChange={(v) => dat(ST.landing, v === TU_DONG ? null : v)}
          />
        </Dong>
        {nhieuDonVi ? (
          <Dong id="st-bu" nhan="Đơn vị mặc định" mota="Đơn vị chọn sẵn khi mở app. Tự động = đơn vị lần trước.">
            <Chon
              id="st-bu" value={st.bu ?? TU_DONG}
              options={[{ v: TU_DONG, label: 'Tự động (đơn vị lần trước)' }, ...bus.map((b) => ({ v: b.code, label: `${b.code} - ${b.name}` }))]}
              onChange={(v) => dat(ST.bu, v === TU_DONG ? null : v)}
            />
          </Dong>
        ) : (
          <Dong id="st-bu" nhan="Đơn vị" mota="Tài khoản này gắn cố định với một đơn vị.">
            <span className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5">{currentBU || user?.business_unit_code || '—'}</span>
          </Dong>
        )}
        <Dong id="st-year" nhan="Năm kế hoạch mặc định" mota="Năm chọn sẵn ở màn Kế hoạch năm. Tự động = năm lần trước (lần đầu: từ tháng 9 là năm sau).">
          <Chon
            id="st-year" value={st.annualYear ?? TU_DONG}
            options={[{ v: TU_DONG, label: 'Tự động' }, ...[0, 1, 2].map((i) => ({ v: namNay + i, label: String(namNay + i) }))]}
            onChange={(v) => dat(ST.annualYear, v === TU_DONG ? null : Number(v))}
          />
        </Dong>
        <Dong id="st-tien" nhan="Đơn vị tiền ở Kế hoạch năm" mota="USD chỉ dùng được ở đơn vị Export OEM + Brand; nơi khác tự về triệu VNĐ.">
          <Nhom
            id="st-tien" value={st.annualTien ?? TU_DONG}
            options={[{ v: TU_DONG, label: 'Tự động' }, { v: 'VND', label: 'Triệu VNĐ' }, { v: 'USD', label: 'USD' }]}
            onChange={(v) => dat(ST.annualTien, v === TU_DONG ? null : v)}
          />
        </Dong>
        <Dong id="st-kieu" nhan="Cách xem Kế hoạch năm" mota="Theo khách hàng: Khách → SKU. Theo SKU: Nhóm hàng → SKU → Khách.">
          <Nhom
            id="st-kieu" value={st.annualKieu ?? TU_DONG}
            options={[{ v: TU_DONG, label: 'Tự động' }, { v: 'khach', label: 'Theo khách hàng' }, { v: 'sku', label: 'Theo SKU' }]}
            onChange={(v) => dat(ST.annualKieu, v === TU_DONG ? null : v)}
          />
        </Dong>
        <Dong id="st-charts" nhan="Hiện biểu đồ ở Tổng quan" mota="Tự động = giữ như lần trước (mặc định thu gọn).">
          <Nhom
            id="st-charts" value={triBool(st.dashCharts)}
            options={BA_TRANG_THAI('Hiện', 'Ẩn')}
            onChange={(v) => dat(ST.dashCharts, doiTriBool(v))}
          />
        </Dong>
        <Dong id="st-nonzero" nhan="Ẩn dòng bằng 0 ở Forecast tháng / Chia tuần & miền" mota="Chỉ hiện SKU đã có số lượng. Tự động = giữ như lần trước (mặc định: ẩn).">
          <Nhom
            id="st-nonzero" value={triBool(st.onlyNonZero)}
            options={BA_TRANG_THAI('Ẩn dòng 0', 'Hiện cả dòng 0')}
            onChange={(v) => dat(ST.onlyNonZero, doiTriBool(v))}
          />
        </Dong>
      </Muc>

      <Muc icon={Bell} tieuDe="Thông báo">
        <Dong id="st-toast" nhan="Thời gian hiện thông báo" mota="Thông báo thường tự tắt sau khoảng này. Thông báo lỗi không tự tắt — phải bấm ×.">
          <div className="flex items-center gap-2 flex-wrap">
            <Nhom
              id="st-toast" value={st.toastSec}
              options={THOI_GIAN_TOAST.map((s) => ({ v: s, label: `${s} giây` }))}
              onChange={(v) => dat(ST.toastSec, v === 4 ? null : v)}
            />
            <button type="button" onClick={thuToast} className={nutPhu}>Thử</button>
          </div>
        </Dong>
      </Muc>

      <Muc icon={ShieldCheck} tieuDe="Bảo mật">
        <Dong id="st-tk" nhan="Tài khoản" mota="Chỉ xem. Họ tên, vai trò và đơn vị do quản trị hệ thống cấp.">
          <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-800">
            <dt className="text-slate-500">Họ tên</dt><dd className="font-semibold">{user?.full_name || '—'}</dd>
            <dt className="text-slate-500">Mã đăng nhập</dt><dd className="font-semibold font-mono">{user?.id || '—'}</dd>
            <dt className="text-slate-500">Vai trò</dt><dd className="font-semibold">{roleLabel(role)}</dd>
            <dt className="text-slate-500">Đơn vị</dt><dd className="font-semibold">{user?.business_unit_code || (nhieuDonVi ? 'Tất cả đơn vị được cấp quyền' : '—')}</dd>
          </dl>
        </Dong>
        <Dong id="st-pin" nhan="Mã PIN" mota={tuCong ? 'Bạn đăng nhập từ Cổng VHKD: một PIN dùng chung cho cả ba app, nên đổi PIN ở Cổng (nút bên dưới sẽ báo lại nếu không đổi được ở đây).' : 'Tối thiểu 6 chữ số, không dùng dãy trùng hoặc liên tiếp.'}>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setHienPin(true)} className={nutPhu}>
              <KeyRound className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" /> Đổi mã PIN
            </button>
            {tuCong && <a href="/VHKD/" className="text-xs font-semibold text-blue-700 hover:underline">Mở Cổng VHKD</a>}
          </div>
        </Dong>
      </Muc>

      <div className="flex justify-end">
        <button type="button" onClick={khoiPhuc} className="inline-flex items-center gap-1.5 border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold px-3 py-1.5 rounded-lg">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Khôi phục mặc định
        </button>
      </div>

      {hienPin && <ChangePinDialog onClose={() => setHienPin(false)} />}
    </div>
  );
}
