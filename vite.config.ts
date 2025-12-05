import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/gis-proxy': {
        target: 'https://ims.kiel.de',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/gis-proxy/, '')
      }
    }
  }
})
