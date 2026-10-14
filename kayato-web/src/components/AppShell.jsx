import { Bell, Bot, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, Clock3, CreditCard, FolderKanban, LayoutDashboard, ListTodo, LogOut, MessageCircle, RefreshCw, Search, Settings, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Brand from './Brand';
import { REMEMBERED_SESSION_TIMEOUT_DAYS, SHORT_SESSION_TIMEOUT_MINUTES, useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/formatters';

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
const emptySearchResults = { tasks: [], people: [], projects: [] };
const personInitials = (name = 'KayaTo User') => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();

export default function AppShell() {
  const { user, logout, sessionWarning, sessionSecondsRemaining, extendSession, rememberedSession } = useAuth();
  const navigate = useNavigate();
  const logoutDialog = useRef(null);
  const sessionDialog = useRef(null);
  const searchRoot = useRef(null);
  const searchInput = useRef(null);
  const initials = (user?.displayName || 'KayaTo User').split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const [teams, setTeams] = useState([]);
  const [teamsStatus, setTeamsStatus] = useState('loading');
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState('loading');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchResults, setSearchResults] = useState(emptySearchResults);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [searchRetry, setSearchRetry] = useState(0);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem('kayato-sidebar') === 'collapsed'; }
    catch { return false; }
  });

  const searchItems = useMemo(() => [
    ...searchResults.tasks.map((item) => ({ type: 'task', id: String(item._id), item })),
    ...searchResults.projects.map((item) => ({ type: 'project', id: `project-${item.name}`, item })),
    ...searchResults.people.map((item) => ({ type: 'person', id: String(item.id), item })),
  ], [searchResults]);

  const loadTeams = useCallback(() => {
    let active = true;
    setTeamsStatus('loading');
    api.get('/teams')
      .then(({ data }) => { if (active) { setTeams(data); setTeamsStatus('ready'); } })
      .catch(() => { if (active) { setTeams([]); setTeamsStatus('error'); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let disposeRequest = loadTeams();
    const refreshTeams = () => {
      disposeRequest?.();
      disposeRequest = loadTeams();
    };
    window.addEventListener('kayato:teams-changed', refreshTeams);
    window.addEventListener('focus', refreshTeams);
    return () => {
      disposeRequest?.();
      window.removeEventListener('kayato:teams-changed', refreshTeams);
      window.removeEventListener('focus', refreshTeams);
    };
  }, [loadTeams]);

  const loadNotifications = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setNotificationStatus('loading');
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data);
      setNotificationStatus('ready');
    } catch {
      if (!quiet) setNotificationStatus('error');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) loadNotifications({ quiet: true }); };
    loadNotifications();
    const interval = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [loadNotifications]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults(emptySearchResults);
      setSearchStatus('idle');
      setActiveSearchIndex(-1);
      return undefined;
    }

    const controller = new AbortController();
    setSearchStatus('loading');
    const timer = window.setTimeout(() => {
      api.get('/search', { params: { q: query }, signal: controller.signal })
        .then(({ data }) => {
          const next = {
            tasks: Array.isArray(data.tasks) ? data.tasks : [],
            projects: Array.isArray(data.projects) ? data.projects : [],
            people: Array.isArray(data.people) ? data.people : [],
          };
          setSearchResults(next);
          const count = next.tasks.length + next.projects.length + next.people.length;
          setSearchStatus(count ? 'ready' : 'empty');
          setActiveSearchIndex(count ? 0 : -1);
        })
        .catch((error) => {
          if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') return;
          setSearchResults(emptySearchResults);
          setSearchStatus('error');
          setActiveSearchIndex(-1);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, searchRetry]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setNotificationsOpen(false);
        setSearchOpen(true);
        window.requestAnimationFrame(() => searchInput.current?.focus());
      } else if (event.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        searchInput.current?.blur();
      }
    };
    const handleOutsideClick = (event) => {
      if (searchOpen && searchRoot.current && !searchRoot.current.contains(event.target)) setSearchOpen(false);
    };
    window.addEventListener('keydown', handleShortcut);
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => {
      window.removeEventListener('keydown', handleShortcut);
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || activeSearchIndex < 0) return;
    document.getElementById(`global-search-option-${activeSearchIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeSearchIndex, searchOpen]);

  const openNotifications = () => {
    setSearchOpen(false);
    setNotificationsOpen((current) => !current);
  };

  const markAllNotificationsRead = async () => {
    try {
      await api.patch('/notifications/read');
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch { /* The next poll will restore the server state. */ }
  };

  const openGlobalSearch = () => {
    setNotificationsOpen(false);
    setSearchOpen(true);
    window.requestAnimationFrame(() => searchInput.current?.focus());
  };

  const closeGlobalSearch = ({ clear = false } = {}) => {
    setSearchOpen(false);
    searchInput.current?.blur();
    if (clear) {
      setSearchQuery('');
      setSearchResults(emptySearchResults);
      setSearchStatus('idle');
    }
  };

  const chooseSearchResult = (result) => {
    if (!result) return;
    if (result.type === 'task') navigate(`/app/tasks?task=${result.item._id}`);
    else if (result.type === 'project') navigate(`/app/tasks?project=${encodeURIComponent(result.item.name)}`);
    else {
      const personQuery = result.item.username ? `@${result.item.username}` : result.item.displayName;
      navigate(`/app/chat?find=${encodeURIComponent(personQuery)}`);
    }
    closeGlobalSearch({ clear: true });
  };

  const handleSearchKeyDown = (event) => {
    if (!searchItems.length) {
      if (event.key === 'Escape') closeGlobalSearch();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSearchIndex((current) => (current + 1) % searchItems.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSearchIndex((current) => (current <= 0 ? searchItems.length - 1 : current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      chooseSearchResult(searchItems[Math.max(0, activeSearchIndex)]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeGlobalSearch();
    }
  };

  const selectNotification = async (item) => {
    if (!item.read) {
      try {
        const { data } = await api.patch(`/notifications/${item._id}/read`);
        setNotifications((current) => current.map((notification) => notification._id === item._id ? { ...notification, ...data, read: true } : notification));
      } catch { /* Navigation remains available if read state cannot be saved. */ }
    }
    setNotificationsOpen(false);
    if (typeof item.url === 'string' && item.url.startsWith('/app')) {
      navigate(item.url);
      return;
    }
    const taskId = item.task?._id || item.task;
    const billId = item.bill?._id || item.bill;
    const teamId = item.team?._id || item.team || item.task?.team;
    if (taskId) navigate(`/app/tasks?task=${taskId}${teamId ? `&team=${teamId}` : ''}`);
    else if (billId) navigate(`/app/bills?bill=${billId}`);
    else if (teamId) navigate(`/app/tasks?team=${teamId}`);
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

  const searchGroups = [
    { type: 'task', title: 'Tasks', items: searchItems.filter((result) => result.type === 'task') },
    { type: 'project', title: 'Projects', items: searchItems.filter((result) => result.type === 'project') },
    { type: 'person', title: 'People', items: searchItems.filter((result) => result.type === 'person') },
  ].filter((group) => group.items.length);

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
          <div className={`global-search-shell ${searchOpen ? 'open' : ''}`} ref={searchRoot}>
            <div className="global-search" role="search">
              <Search size={18} aria-hidden="true" />
              <input
                ref={searchInput}
                type="search"
                value={searchQuery}
                onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }}
                onFocus={openGlobalSearch}
                onKeyDown={handleSearchKeyDown}
                aria-label="Search tasks, people, or projects"
                aria-expanded={searchOpen}
                aria-controls="global-search-results"
                aria-activedescendant={activeSearchIndex >= 0 ? `global-search-option-${activeSearchIndex}` : undefined}
                aria-autocomplete="list"
                role="combobox"
                placeholder="Search tasks, people, or projects"
                autoComplete="off"
                spellCheck="false"
              />
              <kbd aria-hidden="true">Ctrl K</kbd>
              <button type="button" className="search-close" onClick={() => closeGlobalSearch({ clear: true })} aria-label="Close search"><X size={17} /></button>
            </div>

            {searchOpen && <section className="global-search-menu" id="global-search-results" role="listbox" aria-label="Global search results">
              {searchStatus === 'idle' && <div className="global-search-guidance"><Search size={22} /><strong>Search your workspace</strong><span>Type at least 2 characters to find tasks, projects, and people.</span></div>}
              {searchStatus === 'loading' && <div className="global-search-loading" role="status" aria-label="Searching"><span /><span /><span /></div>}
              {searchStatus === 'error' && <div className="global-search-guidance search-error" role="alert"><strong>Search is unavailable</strong><span>Check your connection, then try again.</span><button type="button" onClick={() => setSearchRetry((current) => current + 1)}>Try again</button></div>}
              {searchStatus === 'empty' && <div className="global-search-guidance"><Search size={22} /><strong>No matches found</strong><span>Try a task title, project name, username, or email.</span></div>}
              {searchStatus === 'ready' && <div className="global-search-results">
                {searchGroups.map((group) => <div className="global-search-group" role="group" aria-label={group.title} key={group.type}>
                  <span className="global-search-group-label">{group.title}</span>
                  {group.items.map((result) => {
                    const index = searchItems.findIndex((item) => item.type === result.type && item.id === result.id);
                    const item = result.item;
                    const primary = result.type === 'task' ? item.title : result.type === 'project' ? item.name : item.displayName;
                    const secondary = result.type === 'task'
                      ? `${item.project || 'Personal'}, ${String(item.status || 'todo').replace('-', ' ')}`
                      : result.type === 'project'
                        ? `${item.taskCount} ${item.taskCount === 1 ? 'task' : 'tasks'}`
                        : item.username ? `@${item.username}` : item.email;
                    return <button
                      type="button"
                      role="option"
                      aria-selected={index === activeSearchIndex}
                      id={`global-search-option-${index}`}
                      className={index === activeSearchIndex ? 'active' : ''}
                      onMouseEnter={() => setActiveSearchIndex(index)}
                      onClick={() => chooseSearchResult(result)}
                      key={`${result.type}-${result.id}`}
                    >
                      <span className={`global-search-result-icon ${result.type}`} aria-hidden="true">
                        {result.type === 'task' ? <ListTodo size={17} /> : result.type === 'project' ? <FolderKanban size={17} /> : <span>{personInitials(item.displayName)}</span>}
                      </span>
                      <span><strong>{primary}</strong><small>{secondary}</small></span>
                      {result.type === 'person' && <span className="global-search-relationship">{item.relationshipStatus === 'friends' ? 'Friend' : item.relationshipStatus === 'outgoing' ? 'Request sent' : item.relationshipStatus === 'incoming' ? 'Respond' : 'View'}</span>}
                    </button>;
                  })}
                </div>)}
              </div>}
              <footer role="presentation"><span><kbd>Up</kbd><kbd>Down</kbd> Navigate</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></footer>
            </section>}
          </div>
          <div className="top-actions">
            <button className="icon-button mobile-search-trigger" aria-label="Search workspace" title="Search" onClick={openGlobalSearch}><Search size={19} /></button>
            <button className="icon-button" aria-label="Notifications" title="Notifications" aria-expanded={notificationsOpen} onClick={openNotifications}><Bell size={19} />{notifications.some((item) => !item.read) && <span className="notification-dot" />}</button>
            {notificationsOpen && <section className="notification-menu" aria-label="Notifications"><header><div><b>Notifications</b><span>{notifications.filter((item) => !item.read).length} unread</span></div>{notifications.some((item) => !item.read) && <button type="button" className="notification-mark-read" onClick={markAllNotificationsRead}><CheckCheck size={15} />Mark all read</button>}</header><div>{notificationStatus === 'loading' ? <div className="notification-loading" role="status"><span /><span /><span /></div> : notificationStatus === 'error' ? <div className="notification-empty" role="alert"><RefreshCw size={22} /><b>Notifications unavailable</b><span>Check your connection and try again.</span><button type="button" onClick={() => loadNotifications()}>Try again</button></div> : notifications.length ? notifications.slice(0, 20).map((item) => <button type="button" key={item._id} className={`notification-item ${item.read ? '' : 'unread'}`} onClick={() => selectNotification(item)}><p>{item.message}</p><small>{item.team?.name || (item.bill ? 'Bill reminder' : item.type?.includes('message') ? 'Message' : 'Personal task')} · {formatDateTime(item.createdAt, user?.timezone)}</small></button>) : <div className="notification-empty"><Bell size={24} /><b>No notifications yet</b><span>Task, message, deadline, and bill updates will appear here.</span></div>}</div></section>}
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
        <p id="session-timeout-description">For your security, KayaTo signs you out after {rememberedSession ? `${REMEMBERED_SESSION_TIMEOUT_DAYS} days` : `${SHORT_SESSION_TIMEOUT_MINUTES} minutes`} without activity.</p>
        <p className="session-countdown" role="timer" aria-label={`${sessionSecondsRemaining} seconds remaining`}><strong>{sessionSecondsRemaining}</strong> seconds remaining</p>
        <div className="logout-dialog-actions">
          <button type="button" className="button button-secondary" onClick={() => { logout(); navigate('/login', { replace: true }); }}>Log out now</button>
          <button type="button" className="button button-primary" onClick={extendSession} autoFocus>Stay signed in</button>
        </div>
      </dialog>
    </div>
  );
}
