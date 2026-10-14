import { Bell, Bot, CalendarDays, ChevronLeft, ChevronRight, Clock3, CreditCard, LayoutDashboard, ListTodo, LogOut, MessageCircle, Search, Settings, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Brand from './Brand';
import { SESSION_TIMEOUT_MINUTES, useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

const nav = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/tasks', label: 'My tasks', icon: ListTodo },
  { to: '/app/ai-planner', label: 'AI planner', icon: Bot },
  { to: '/app/team', label: 'Team', icon: Users },
  { to: '/app/chat', label: 'Chat', icon: MessageCircle },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/bills', label: 'Bills & reminders', icon: CreditCard },
];

const mobileNav = [nav[0], nav[1], nav[2], nav[4], nav[6]];

export default function AppShell() {
  const { user, logout, sessionWarning, sessionSecondsRemaining, extendSession } = useAuth();
  const navigate = useNavigate();
  const logoutDialog = useRef(null);
  const sessionDialog = useRef(null);
  const initials = (user?.displayName || 'KayaTo User').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const [teams, setTeams] = useState([]);
  const [teamsStatus, setTeamsStatus] = useState('loading');
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem('kayato-sidebar') === 'collapsed'; }
    catch { return false; }
  });

  useEffect(() => {
    let active = true;
    api.get('/teams')
      .then(({ data }) => { if (active) { setTeams(data); setTeamsStatus('ready'); } })
      .catch(() => { if (active) { setTeams([]); setTeamsStatus('error'); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadNotifications = () => api.get('/notifications')
      .then(({ data }) => { if (active) setNotifications(data); })
      .catch(() => {});
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const openNotifications = async () => {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (opening && notifications.some((item) => !item.read)) {
      try {
        await api.patch('/notifications/read');
        setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      } catch { /* The list remains usable if read state cannot be saved. */ }
    }
  };

  useEffect(() => {
    if (sessionWarning) {
      logoutDialog.current?.close();
      if (!sessionDialog.current?.open) sessionDialog.current?.showModal();
    } else if (sessionDialog.current?.open) {
      sessionDialog.current.close();
    }
  }, [sessionWarning]);

  const toggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem('kayato-sidebar', next ? 'collapsed' : 'expanded'); }
      catch { /* Embedded previews may block storage. */ }
      return next;
    });
  };

  const confirmLogout = () => {
    logoutDialog.current?.close();
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#app-content">Skip to main content</a>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand-row">
          <Brand compact={collapsed} />
          <button className="sidebar-collapse" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <NavLink to="/app/team" className="workspace-switch" data-tooltip="Personal workspace" aria-label="Open teams">
          <span className="avatar avatar-plum">{initials}</span>
          <div><strong>Personal workspace</strong><small>{teamsStatus === 'loading' ? 'Checking teams...' : teamsStatus === 'error' ? 'Teams unavailable' : teams.length === 0 ? 'No teams yet' : `${teams.length} ${teams.length === 1 ? 'team' : 'teams'}`}</small></div>
          <Users size={16} aria-hidden="true" />
        </NavLink>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <span className="nav-label">Workspace</span>
          {nav.map(({ to, label, icon: Icon, badge, end }) => (
            <NavLink key={to} to={to} end={end} data-tooltip={label} aria-label={collapsed ? label : undefined} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} /><span>{label}</span>{badge && <b className="nav-badge">{badge}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/app/settings" data-tooltip="Settings" aria-label={collapsed ? 'Settings' : undefined} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings size={18} /><span>Settings</span></NavLink>
          <button type="button" className="nav-item sidebar-logout" data-tooltip="Log out" aria-label="Log out" aria-haspopup="dialog" onClick={() => logoutDialog.current?.showModal()}><LogOut size={18} /><span>Log out</span></button>
          <NavLink to="/app/settings" className="profile-mini" data-tooltip={user?.displayName}><span className="avatar avatar-peach">{initials}</span><div><strong>{user?.displayName}</strong><small>{user?.email}</small></div><ChevronRight size={16}/></NavLink>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="global-search"><Search size={18} /><input aria-label="Search" placeholder="Search tasks, people, or projects" /><kbd>Ctrl K</kbd></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications" title="Notifications" aria-expanded={notificationsOpen} onClick={openNotifications}><Bell size={19} />{notifications.some((item) => !item.read) && <span className="notification-dot" />}</button>
            {notificationsOpen && <section className="notification-menu" aria-label="Notifications"><header><b>Notifications</b><span>{notifications.length}</span></header><div>{notifications.length ? notifications.slice(0, 12).map((item) => <article key={item._id} className={item.read ? '' : 'unread'}><p>{item.message}</p><small>{item.team?.name || 'Personal task'} · {new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</small></article>) : <p className="notification-empty">No notifications yet.</p>}</div></section>}
            <button type="button" className="avatar avatar-peach mobile-avatar" aria-label="Open account actions" aria-haspopup="dialog" onClick={() => logoutDialog.current?.showModal()}>{initials}</button>
          </div>
        </header>
        <div className="app-content" id="app-content" tabIndex="-1"><Outlet /></div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={20} /><span>{label.replace('My ', '')}</span></NavLink>
        ))}
      </nav>

      <dialog ref={logoutDialog} className="logout-dialog" aria-labelledby="logout-title" aria-describedby="logout-description">
        <div className="logout-dialog-icon" aria-hidden="true"><LogOut size={22} /></div>
        <h2 id="logout-title">Log out of KayaTo?</h2>
        <p id="logout-description">You will need to enter your email and password to access your workspace again.</p>
        <div className="logout-dialog-actions">
          <form method="dialog"><button className="button button-secondary" autoFocus>Cancel</button></form>
          <button type="button" className="button logout-confirm" onClick={confirmLogout}>Log out</button>
        </div>
      </dialog>

      <dialog ref={sessionDialog} className="logout-dialog session-timeout-dialog" aria-labelledby="session-timeout-title" aria-describedby="session-timeout-description" onCancel={(event) => event.preventDefault()}>
        <div className="logout-dialog-icon session-timeout-icon" aria-hidden="true"><Clock3 size={22} /></div>
        <h2 id="session-timeout-title">Your session is about to expire</h2>
        <p id="session-timeout-description">For your security, KayaTo signs you out after {SESSION_TIMEOUT_MINUTES} minutes without activity.</p>
        <p className="session-countdown" role="timer" aria-label={`${sessionSecondsRemaining} seconds remaining`}><strong>{sessionSecondsRemaining}</strong> seconds remaining</p>
        <div className="logout-dialog-actions">
          <button type="button" className="button button-secondary" onClick={() => { logout(); navigate('/login', { replace: true }); }}>Log out now</button>
          <button type="button" className="button button-primary" onClick={extendSession} autoFocus>Stay signed in</button>
        </div>
      </dialog>
    </div>
  );
}
