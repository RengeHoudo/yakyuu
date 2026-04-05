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
      '/api/npb-scores/': {
        target: 'https://npb.jp',
        changeOrigin: true,
        rewrite: (path) => {
          // /api/npb-scores/2026/0405/c-t-03/ → /scores/2026/0405/c-t-03/
          return path.replace('/api/npb-scores/', '/scores/')
        },
      },
      '/api/npb-stats/': {
        target: 'https://npb.jp',
        changeOrigin: true,
        rewrite: (path) => {
          // /api/npb-stats/batting/2026/c → /bis/2026/stats/idb1_c.html
          // /api/npb-stats/pitching/2026/c → /bis/2026/stats/idp1_c.html
          const m = path.match(/\/api\/npb-stats\/(batting|pitching)\/(\d+)\/(\w+)/)
          if (!m) return path
          const type = m[1]
          const year = m[2]
          const code = m[3]
          const prefix = type === 'batting' ? 'idb1' : 'idp1'
          return `/bis/${year}/stats/${prefix}_${code}.html`
        },
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
