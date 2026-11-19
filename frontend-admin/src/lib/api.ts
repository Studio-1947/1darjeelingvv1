import axios from 'axios';

const api = axios.create({
  // Same-site /api by default: the dev server proxies it, production sets VITE_API_URL=/api.
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Auto attach Authorization header if token exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('admin_token');
    }
    return Promise.reject(error);
  }
);

export default api;
