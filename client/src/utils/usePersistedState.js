import { useState, useCallback } from 'react';
import { loadPref, savePref } from '../services/prefs';

/**
 * useState có nhớ: đọc giá trị đã lưu lúc dựng (qua `validate`), ghi lại mỗi lần đổi.
 * Cùng chữ ký với useState (trả [giá trị, hàm đặt]), hàm đặt nhận giá trị hoặc hàm cập nhật.
 */
export function usePersistedState(key, initial, validate) {
  const [value, setValueRaw] = useState(() => {
    const fallback = typeof initial === 'function' ? initial() : initial;
    return loadPref(key, fallback, validate);
  });
  const setValue = useCallback((next) => {
    setValueRaw((prev) => {
      const v = typeof next === 'function' ? next(prev) : next;
      savePref(key, v);
      return v;
    });
  }, [key]);
  return [value, setValue];
}
