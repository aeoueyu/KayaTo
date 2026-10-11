import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

const AuthContext = createContext(null);
const LAST_ACTIVITY_KEY = 'kayato-last-activity';
export const SESSION_NOTICE_KEY = 'kayato-auth-notice';
const configuredTimeoutMinutes = Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES || 30);
export const SESSION_TIMEOUT_MINUTES = Number.isFinite(configuredTimeoutMinutes) && configuredTimeoutMinutes >= 2 ? configuredTimeoutMinutes : 30;
export const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60_000;
const SESSION_WARNING_MS = Math.min(60_000, Math.floor(SESSION_TIMEOUT_MS / 2));

function tokenStorage() {
  if (window.localStorage.getItem('kayato-token')) return window.localStorage;
  if (window.sessionStorage.getItem('kayato-token')) return window.sessionStorage;
  return null;
}

function clearStoredSession() {
  window.localStorage.removeItem('kayato-token');
  window.localStorage.removeItem('kayato-user');
  window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  window.sessionStorage.removeItem('kayato-token');
  window.sessionStorage.removeItem('kayato-user');
  window.sessionStorage.removeItem(LAST_ACTIVITY_KEY);
}

function storedUser() {
  try { return JSON.parse(window.localStorage.getItem('kayato-user') || window.sessionStorage.getItem('kayato-user')); }
  catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser);
  const [loading, setLoading] = useState(Boolean(tokenStorage()));
  const [sessionWarning, setSessionWarning] = useState(false);
  const [sessionSecondsRemaining, setSessionSecondsRemaining] = useState(Math.ceil(SESSION_WARNING_MS / 1000));
  const sessionWarningRef = useRef(false);

  const setWarningState = useCallback((visible) => {
    sessionWarningRef.current = visible;
    setSessionWarning(visible);
  }, []);

  const logout = useCallback((reason = 'manual') => {
    clearStoredSession();
    if (reason === 'timeout') {
      window.sessionStorage.setItem(SESSION_NOTICE_KEY, 'Your session timed out because there was no activity. Log in to continue.');
    } else {
      window.sessionStorage.removeItem(SESSION_NOTICE_KEY);
    }
    setWarningState(false);
    setUser(null);
  }, [setWarningState]);

  useEffect(() => {
    const storage = tokenStorage();
    if (!storage) { setLoading(false); return; }
    const lastActivity = Number(storage.getItem(LAST_ACTIVITY_KEY));
    if (lastActivity && Date.now() - lastActivity >= SESSION_TIMEOUT_MS) {
      logout('timeout');
      setLoading(false);
      return;
    }
    if (!lastActivity) storage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data);
        storage.setItem('kayato-user', JSON.stringify(data));
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [logout]);

  useEffect(() => {
    if (!user) return undefined;
    const storage = tokenStorage();
    if (!storage) return undefined;
    let lastWrite = Number(storage.getItem(LAST_ACTIVITY_KEY)) || Date.now();
    if (!storage.getItem(LAST_ACTIVITY_KEY)) storage.setItem(LAST_ACTIVITY_KEY, String(lastWrite));

    const evaluateSession = () => {
      const lastActivity = Number(storage.getItem(LAST_ACTIVITY_KEY)) || lastWrite;
      const remaining = SESSION_TIMEOUT_MS - (Date.now() - lastActivity);
      if (remaining <= 0) {
        logout('timeout');
        return;
      }
      if (remaining <= SESSION_WARNING_MS) {
        setSessionSecondsRemaining(Math.max(1, Math.ceil(remaining / 1000)));
        if (!sessionWarningRef.current) setWarningState(true);
      } else if (sessionWarningRef.current) {
        setWarningState(false);
      }
    };

    const recordActivity = () => {
      if (sessionWarningRef.current) return;
      const now = Date.now();
      if (now - lastWrite < 1_000) return;
      lastWrite = now;
      try { storage.setItem(LAST_ACTIVITY_KEY, String(now)); }
      catch { /* The active session still works if storage is temporarily unavailable. */ }
    };

    const handleVisibility = () => { if (document.visibilityState === 'visible') evaluateSession(); };
    const handleStorage = (event) => {
      if (event.key === 'kayato-token' && !event.newValue) { logout(); return; }
      if (event.key === LAST_ACTIVITY_KEY || event.key === 'kayato-token') evaluateSession();
    };
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('storage', handleStorage);
    const interval = window.setInterval(evaluateSession, 1_000);
    evaluateSession();

    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleStorage);
    };
  }, [logout, setWarningState, user]);

  const persistSession = ({ token, user: nextUser }, remember = true) => {
    const storage = remember ? window.localStorage : window.sessionStorage;
    clearStoredSession();
    storage.setItem('kayato-token', token);
    storage.setItem('kayato-user', JSON.stringify(nextUser));
    storage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    setWarningState(false);
    setUser(nextUser);
  };

  const extendSession = useCallback(() => {
    const storage = tokenStorage();
    if (!storage) return;
    storage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    setSessionSecondsRemaining(Math.ceil(SESSION_WARNING_MS / 1000));
    setWarningState(false);
  }, [setWarningState]);

  const login = async (credentials, remember) => { const { data } = await api.post('/auth/login', credentials); persistSession(data, remember); return data.user; };
  const checkSignupEmailDomain = async (email) => { const { data } = await api.post('/auth/register/check-email-domain', { email }); return data; };
  const checkSignupUsername = async (username) => { const { data } = await api.post('/auth/register/check-username', { username }); return data; };
  const requestSignupOtp = async (email, username) => { const { data } = await api.post('/auth/register/request-otp', { email, username }); return data; };
  const register = async (details) => { const { data } = await api.post('/auth/register/verify', details); persistSession(data); return data.user; };
  const updateUser = async (updates) => { const { data } = await api.patch('/auth/me', updates); setUser(data); const storage = tokenStorage(); storage?.setItem('kayato-user', JSON.stringify(data)); return data; };
  const value = useMemo(() => ({ user, loading, login, checkSignupEmailDomain, checkSignupUsername, requestSignupOtp, register, updateUser, logout, sessionWarning, sessionSecondsRemaining, extendSession }), [user, loading, logout, sessionWarning, sessionSecondsRemaining, extendSession]);
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
