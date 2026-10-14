import { useSyncExternalStore } from 'react';
import { getPrefsVersion, subscribePrefsVersion } from '../services/prefs';

/**
 * Số phiên bản tăng mỗi khi lựa chọn đã nhớ đổi từ NGOÀI luồng của màn đang mở: đồng bộ máy chủ về, áp mặc định tường minh,
 * đổi người dùng, đổi trạng thái đồng bộ. Dùng làm phụ thuộc của useEffect / useMemo để đọc lại loadPref.
 */
export function usePrefsVersion() {
  return useSyncExternalStore(subscribePrefsVersion, getPrefsVersion, getPrefsVersion);
}
