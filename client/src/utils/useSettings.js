import { useMemo } from 'react';
import { readSettings } from '../services/settings';
import { landingIdsFor } from './menu';
import { vnYear } from './period';
import { usePrefsVersion } from './usePrefsVersion';
import { getCurrentUser } from '../services/auth';

/**
 * Cài đặt cá nhân đã kiểm hợp lệ (services/settings.js), vẽ lại khi giá trị đổi (người dùng bấm ở màn Cài đặt,
 * hoặc máy chủ đồng bộ về). `buCodes` = các đơn vị người này được chọn (App đã lọc theo quyền).
 */
export function useSettings(buCodes) {
  const phienBan = usePrefsVersion();
  const role = getCurrentUser()?.role;
  const khoaBu = Array.isArray(buCodes) ? buCodes.join('|') : '*';
  return useMemo(
    () => readSettings({ namHienTai: vnYear(), landingIds: landingIdsFor(role), buCodes: Array.isArray(buCodes) ? buCodes : undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phienBan, role, khoaBu]
  );
}
