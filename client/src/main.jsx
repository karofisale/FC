import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getSession } from './services/auth'
import { bounceToPortal, clearBounceFlag } from './services/karofiSession'

/**
 * Chưa đăng nhập thì về cổng VHKD, không hiện form riêng của FC nữa.
 *
 * Quyết định TRƯỚC khi React vẽ, không phải trong App.jsx: đặt ở đó thì màn
 * hình đăng nhập kịp hiện lên một nhịp rồi trang mới nhảy đi — đúng cái nháy
 * mà app Xuất khẩu đã phải sửa riêng.
 *
 * bounceToPortal() trả false khi có lối thoát (?direct=1, hoặc vừa bị đá về
 * mà quay lại tay không) — lúc đó dựng app như cũ để form đăng nhập của FC
 * vẫn là đường vào dự phòng khi Karofi ID hỏng.
 */
const signedIn = !!getSession()
if (signedIn) clearBounceFlag()

if (signedIn || !bounceToPortal()) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
