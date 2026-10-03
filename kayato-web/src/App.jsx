import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell';
import PageSkeleton from './components/PageSkeleton';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tasks = lazy(() => import('./pages/Tasks'));
const AIPlanner = lazy(() => import('./pages/AIPlanner'));
const Chat = lazy(() => import('./pages/Chat'));
const Bills = lazy(() => import('./pages/Bills'));

function LazyPage({ children, variant }) {
  return <Suspense fallback={<PageSkeleton variant={variant} />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LazyPage variant="landing"><Landing /></LazyPage>} />
      <Route path="/login" element={<LazyPage variant="auth"><Login /></LazyPage>} />
      <Route path="/onboarding" element={<LazyPage variant="auth"><Onboarding /></LazyPage>} />
      <Route path="/app" element={<AppShell />}>
        <Route index element={<LazyPage variant="app"><Dashboard /></LazyPage>} />
        <Route path="tasks" element={<LazyPage variant="app"><Tasks /></LazyPage>} />
        <Route path="ai-planner" element={<LazyPage variant="app"><AIPlanner /></LazyPage>} />
        <Route path="chat" element={<LazyPage variant="app"><Chat /></LazyPage>} />
        <Route path="bills" element={<LazyPage variant="app"><Bills /></LazyPage>} />
        <Route path="calendar" element={<Placeholder title="Calendar" copy="Your personal and team deadlines will appear here." />} />
        <Route path="team" element={<Placeholder title="Team" copy="Manage members, roles, invite links, and workload." />} />
        <Route path="settings" element={<Placeholder title="Settings" copy="Control your profile, notifications, security, and appearance." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Placeholder({ title, copy }) {
  return (
    <section className="page-block">
      <div className="page-heading"><div><h1>{title}</h1><p>{copy}</p></div></div>
      <div className="empty-panel"><div className="empty-mark">K</div><h2>{title} is ready for the next build</h2><p>This route is included in the KayaTo foundation and can now be connected to the API.</p></div>
    </section>
  );
}
