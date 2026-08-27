import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Sử dụng relative paths để chạy mượt cả trên GitHub Pages (/FC/) và Localhost
  build: {
    // Bật sourcemap production để đọc được stack trace thật khi người
    // dùng gửi lỗi từ Console — trước đây chỉ thấy tên hàm rút gọn kiểu
    // "cR", "xo" không tra được. File .map không lộ gì nhạy cảm hơn
    // chính mã nguồn app (vốn đã public trên GitHub) nên bật thoải mái.
    sourcemap: true
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})
