import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem('kayato-token') || window.sessionStorage.getItem('kayato-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.localStorage.removeItem('kayato-token');
      window.localStorage.removeItem('kayato-user');
      window.sessionStorage.removeItem('kayato-token');
      window.sessionStorage.removeItem('kayato-user');
      if (window.location.pathname.startsWith('/app')) window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error.response?.data?.message || error.message || fallback;
}

export function formatDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
