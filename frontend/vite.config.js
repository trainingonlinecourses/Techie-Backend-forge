import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Default: proxy to the local backend. To point the dev server at a hosted
// backend instead (e.g. the Render deployment), start with:
//   VITE_PROXY_TARGET=https://backendforge-academy-api-bef2.onrender.com npm run dev
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8080';

const apiProxy = {
  target: proxyTarget,
  changeOrigin: true,
  configure(proxy) {
    proxy.on('proxyReq', (proxyReq) => {
      // Browsers send an Origin header on POSTs. When proxying to a remote
      // backend that header carries our dev origin, which the backend's CORS
      // allowlist doesn't include — it would 403 the request. Strip it: the
      // browser only ever talks to this dev server (same-origin), so CORS is
      // irrelevant here and the backend treats the call like a plain client.
      proxyReq.removeHeader('origin');
    });
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxy,
      '/actuator': apiProxy,
    },
  },
});
