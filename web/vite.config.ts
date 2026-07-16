import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // /api/* lives in Vercel serverless functions, which the dev server
    // can't run — proxy to production so localhost shows real live data
    // (news feed, Pit Boss chat). The origin header is rewritten so the
    // chat endpoint's origin check accepts proxied requests.
    proxy: {
      '/api': {
        target: 'https://battlebotsglobe.com',
        changeOrigin: true,
        headers: { origin: 'https://battlebotsglobe.com' },
      },
    },
  },
})
