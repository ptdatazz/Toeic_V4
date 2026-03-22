import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 1. Tăng giới hạn cảnh báo lên 1600 KB (Ẩn warning)
    chunkSizeWarningLimit: 1600,
    
    // 2. Chia nhỏ các thư viện nặng (Code splitting) để web load siêu nhanh
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        }
      }
    }
  }
})