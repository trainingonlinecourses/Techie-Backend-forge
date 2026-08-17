import axios from 'axios';

export const TOKEN_KEY = 'backendforge_token';

// In dev, Vite proxies /api to the backend. In production, point VITE_API_URL at
// the deployed backend (e.g. https://your-backend-host.com/api) during the build.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => {
    // Static-only deployments (e.g. Vercel rewrites any unmatched path —
    // including /api/* — to index.html) resolve a "successful" request with
    // HTML instead of JSON. Reject so callers' .catch fallbacks kick in
    // instead of crashing on .map() over a non-array body.
    if (res.data === null || typeof res.data !== 'object') {
      const err = new Error(`API returned a non-JSON response (${typeof res.data})`);
      err.response = res;
      err.config = res.config;
      return Promise.reject(err);
    }
    return res;
  },
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/api/auth/')) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export function errorMessage(error, fallback = 'Something went wrong') {
  return error?.response?.data?.message || error?.message || fallback;
}
