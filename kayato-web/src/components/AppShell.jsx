import { Bell, Bot, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CreditCard, LayoutDashboard, ListTodo, MessageCircle, Search, Settings, Users } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import Brand from './Brand';
import ThemeToggle from './ThemeToggle';

const nav = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/tasks', label: 'My tasks', icon: ListTodo },
  { to: '/app/ai-planner', label: 'AI planner', icon: Bot },
  { to: '/app/team', label: 'Team', icon: Users },
  { to: '/app/chat', label: 'Chat', icon: MessageCircle, badge: 4 },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/bills', label: 'Bills & reminders', icon: CreditCard },
];

const mobileNav = [nav[0], nav[1], nav[2], nav[4], nav[6]];

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem('kayato-sidebar') === 'collapsed'; }
    catch { return false; }
  });

  const toggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem('kayato-sidebar', next ? 'collapsed' : 'expanded'); }
      catch { /* Embedded previews may block storage. */ }
      return next;
    });
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
        <div className="workspace-switch" data-tooltip="KayaTo Team"><span className="avatar avatar-plum">KT</span><div><strong>KayaTo Team</strong><small>4 members</small></div><ChevronDown size={16} /></div>
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
          <ThemeToggle label={!collapsed} />
          <div className="profile-mini" data-tooltip="Jamie Aquino"><span className="avatar avatar-peach">JA</span><div><strong>Jamie Aquino</strong><small>Project owner</small></div><ChevronDown size={16} /></div>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="global-search"><Search size={18} /><input aria-label="Search" placeholder="Search tasks, people, or projects" /><kbd>Ctrl K</kbd></div>
          <div className="top-actions"><button className="icon-button" aria-label="Notifications" title="Notifications"><Bell size={19} /><span className="notification-dot" /></button><span className="avatar avatar-peach mobile-avatar">JA</span></div>
        </header>
        <div className="app-content" id="app-content" tabIndex="-1"><Outlet /></div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={20} /><span>{label.replace('My ', '')}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}
