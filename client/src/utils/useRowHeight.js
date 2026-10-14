import { useSettings } from './useSettings';
import { rowHeightFor } from './density';

/** Hook: chiều cao dòng ước lượng cho useVirtualizer, đổi theo Cài đặt → Mật độ bảng (xem utils/density.js). */
export function useRowHeight(base) {
  return rowHeightFor(base, useSettings().density);
}
