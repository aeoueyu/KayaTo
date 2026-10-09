import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

const AuthContext = createContext(null);

function storedUser() {
  try { return JSON.parse(window.localStorage.getItem('kayato-user') || window.sessionStorage.getItem('kayato-user')); }
  catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser);
  const [loading, setLoading] = useState(Boolean(window.localStorage.getItem('kayato-token') || window.sessionStorage.getItem('kayato-token')));

  useEffect(() => {
    if (!window.localStorage.getItem('kayato-token') && !window.sessionStorage.getItem('kayato-token')) return;
    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data);
        const storage = window.localStorage.getItem('kayato-token') ? window.localStorage : window.sessionStorage;
        storage.setItem('kayato-user', JSON.stringify(data));
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const persistSession = ({ token, user: nextUser }, remember = true) => {
    const storage = remember ? window.localStorage : window.sessionStorage;
    window.localStorage.removeItem('kayato-token'); window.localStorage.removeItem('kayato-user');
    window.sessionStorage.removeItem('kayato-token'); window.sessionStorage.removeItem('kayato-user');
    storage.setItem('kayato-token', token);
    storage.setItem('kayato-user', JSON.stringify(nextUser));
    setUser(nextUser);
  };
  const login = async (credentials, remember) => { const { data } = await api.post('/auth/login', credentials); persistSession(data, remember); return data.user; };
  const checkSignupEmailDomain = async (email) => { const { data } = await api.post('/auth/register/check-email-domain', { email }); return data; };
  const checkSignupUsername = async (username) => { const { data } = await api.post('/auth/register/check-username', { username }); return data; };
  const requestSignupOtp = async (email, username) => { const { data } = await api.post('/auth/register/request-otp', { email, username }); return data; };
  const register = async (details) => { const { data } = await api.post('/auth/register/verify', details); persistSession(data); return data.user; };
  const updateUser = async (updates) => { const { data } = await api.patch('/auth/me', updates); setUser(data); const storage = window.localStorage.getItem('kayato-token') ? window.localStorage : window.sessionStorage; storage.setItem('kayato-user', JSON.stringify(data)); return data; };
  const logout = () => { window.localStorage.removeItem('kayato-token'); window.localStorage.removeItem('kayato-user'); window.sessionStorage.removeItem('kayato-token'); window.sessionStorage.removeItem('kayato-user'); setUser(null); };
  const value = useMemo(() => ({ user, loading, login, checkSignupEmailDomain, checkSignupUsername, requestSignupOtp, register, updateUser, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="app-loading" role="status"><span className="loading-spinner" />Loading your workspace...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
