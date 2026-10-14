import { useSyncExternalStore } from 'react';
import { getSystemValuesVersion, subscribeSystemValues, getHorizonMonths } from '../services/systemValues';

/**
 * Giá trị hệ thống (services/systemValues.js) cho React: vẽ lại khi kho đổi (nạp xong sau đăng nhập, master vừa lưu).
 * Hiện chỉ có `horizonMonths` = số tháng của chu kỳ MỚI (mặc định 4 khi máy chủ chưa trả lời / chưa có bảng).
 */
export function useSystemValues() {
  useSyncExternalStore(subscribeSystemValues, getSystemValuesVersion, getSystemValuesVersion);
  return { horizonMonths: getHorizonMonths() };
}
