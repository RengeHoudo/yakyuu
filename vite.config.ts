import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/yakyuu/',
  server: {
    proxy: {
      '/api/npb-roster': {
        target: 'https://npb.jp',
        changeOrigin: true,
        rewrite: () => '/announcement/roster/',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/store/**', 'src/types/**', 'src/lib/**'],
    },
  },
})
