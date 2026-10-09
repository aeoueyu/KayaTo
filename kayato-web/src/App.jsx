import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import PageSkeleton from './components/PageSkeleton';
import { ProtectedRoute } from './auth/AuthContext';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tasks = lazy(() => import('./pages/Tasks'));
const AIPlanner = lazy(() => import('./pages/AIPlanner'));
const Chat = lazy(() => import('./pages/Chat'));
const Bills = lazy(() => import('./pages/Bills'));
const Team = lazy(() => import('./pages/Team'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Settings = lazy(() => import('./pages/Settings'));

function LazyPage({ children, variant }) {
  return <Suspense fallback={<PageSkeleton variant={variant} />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LazyPage variant="landing"><Landing /></LazyPage>} />
      <Route path="/login" element={<LazyPage variant="auth"><Login /></LazyPage>} />
      <Route path="/onboarding" element={<LazyPage variant="auth"><Onboarding /></LazyPage>} />
      <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<LazyPage variant="app"><Dashboard /></LazyPage>} />
        <Route path="tasks" element={<LazyPage variant="app"><Tasks /></LazyPage>} />
        <Route path="ai-planner" element={<LazyPage variant="app"><AIPlanner /></LazyPage>} />
        <Route path="chat" element={<LazyPage variant="app"><Chat /></LazyPage>} />
        <Route path="bills" element={<LazyPage variant="app"><Bills /></LazyPage>} />
        <Route path="calendar" element={<LazyPage variant="app"><Calendar /></LazyPage>} />
        <Route path="team" element={<LazyPage variant="app"><Team /></LazyPage>} />
        <Route path="settings" element={<LazyPage variant="app"><Settings /></LazyPage>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
