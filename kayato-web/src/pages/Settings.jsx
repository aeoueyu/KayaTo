import {
  Bell, Check, Eye, EyeOff, Laptop, LockKeyhole, LogOut, Mail, Monitor, MonitorCog, Moon,
  Save, Send, ShieldCheck, Smartphone, Sun, Trash2, UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from '../lib/formatters';
import { browserPushState, disableBrowserPush, enableBrowserPush } from '../lib/pushNotifications';
import { useTheme } from '../theme/ThemeProvider';

const sections = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'security', label: 'Password & security', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: MonitorCog },
  { id: 'danger', label: 'Delete account', icon: Trash2 },
];

const notificationOptions = [
  { key: 'taskAssignments', title: 'Task assignments', description: 'When someone assigns a task to you.' },
  { key: 'deadlines', title: 'Deadlines and reminders', description: 'Upcoming due dates and overdue work.' },
  { key: 'teamMessages', title: 'Team messages', description: 'New messages from your teams and friends.' },
  { key: 'bills', title: 'Bills and payments', description: 'Reminders before a bill is due.' },
];
const deliveryOptions = [
  { key: 'inApp', title: 'In-app notifications', description: 'Show updates in the notification menu.', icon: Bell },
  { key: 'email', title: 'Email reminders', description: 'Send selected updates to your verified email.', icon: Mail },
  { key: 'browserPush', title: 'Browser push', description: 'Show notifications even when KayaTo is in the background.', icon: Laptop },
  { key: 'mobilePush', title: 'Mobile push', description: 'Send selected updates to registered Android or iOS devices.', icon: Smartphone },
];

const themeOptions = [
  { value: 'light', label: 'Light', description: 'Bright and clear', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'High contrast', icon: Moon },
  { value: 'system', label: 'System', description: 'Match your device', icon: Monitor },
];

const capitalizePersonName = (value) => value
  .replace(/[^\p{L} .-]/gu, '')
  .replace(/(^|[ .-])(\p{L})/gu, (_match, separator, letter) => `${separator}${letter.toLocaleUpperCase()}`)
  .slice(0, 40);

function PasswordInput({ id, label, value, onChange, autoComplete, error, success, disabled = false }) {
  const [visible, setVisible] = useState(false);
  const descriptionId = error ? `${id}-error` : success ? `${id}-success` : undefined;
  return (
    <label className="field-label" htmlFor={id}>
      <span>{label} <b className="required-mark" aria-hidden="true">*</b></span>
      <span className="password-field">
        <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} minLength="8" maxLength="64" autoComplete={autoComplete} required disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={descriptionId} />
        <button type="button" onClick={() => setVisible((current) => !current)} disabled={disabled} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {error && <small className="field-error" id={`${id}-error`} role="alert">{error}</small>}
      {!error && success && <small className="field-success" id={`${id}-success`} role="status">{success}</small>}
    </label>
  );
}

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { themePreference, setThemePreference } = useTheme();
  const navigate = useNavigate();
  const logoutDialog = useRef(null);
  const [activeSection, setActiveSection] = useState('profile');
  const [status, setStatus] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const initialNameParts = (user?.displayName || '').trim().split(/\s+/);
  const [profile, setProfile] = useState({
    firstName: user?.firstName || initialNameParts[0] || '',
    lastName: user?.lastName || initialNameParts.slice(1).join(' ') || '',
    username: user?.username || '',
    timezone: user?.timezone || 'Asia/Manila',
    currency: user?.currency || 'PHP',
    primaryUsage: user?.primaryUsage || 'both',
  });
  const [notifications, setNotifications] = useState({
    taskAssignments: user?.notificationPreferences?.taskAssignments ?? true,
    deadlines: user?.notificationPreferences?.deadlines ?? true,
    teamMessages: user?.notificationPreferences?.teamMessages ?? true,
    bills: user?.notificationPreferences?.bills ?? true,
  });
  const [notificationChannels, setNotificationChannels] = useState({
    inApp: user?.notificationChannels?.inApp ?? true,
    email: user?.notificationChannels?.email ?? false,
    browserPush: user?.notificationChannels?.browserPush ?? false,
    mobilePush: user?.notificationChannels?.mobilePush ?? false,
  });
  const [pushConfig, setPushConfig] = useState(null);
  const [pushConfigStatus, setPushConfigStatus] = useState('loading');
  const [testingNotifications, setTestingNotifications] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [deletion, setDeletion] = useState({ password: '', confirmation: '' });

  useEffect(() => {
    if (!user) return;
    const parts = (user.displayName || '').trim().split(/\s+/);
    setProfile({
      firstName: user.firstName || parts[0] || '',
      lastName: user.lastName || parts.slice(1).join(' ') || '',
      username: user.username || '',
      timezone: user.timezone || 'Asia/Manila',
      currency: user.currency || 'PHP',
      primaryUsage: user.primaryUsage || 'both',
    });
    setNotifications({
      taskAssignments: user.notificationPreferences?.taskAssignments ?? true,
      deadlines: user.notificationPreferences?.deadlines ?? true,
      teamMessages: user.notificationPreferences?.teamMessages ?? true,
      bills: user.notificationPreferences?.bills ?? true,
    });
    setNotificationChannels({
      inApp: user.notificationChannels?.inApp ?? true,
      email: user.notificationChannels?.email ?? false,
      browserPush: user.notificationChannels?.browserPush ?? false,
      mobilePush: user.notificationChannels?.mobilePush ?? false,
    });
  }, [user]);

  useEffect(() => {
    let active = true;
    browserPushState()
      .then((data) => { if (active) { setPushConfig(data); setPushConfigStatus('ready'); } })
      .catch(() => { if (active) setPushConfigStatus('error'); });
    return () => { active = false; };
  }, []);

  const showStatus = (type, message) => setStatus({ type, message });
  const selectSection = (id) => { setActiveSection(id); setStatus(null); setFieldErrors({}); };
  const clearFieldError = (field) => setFieldErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });

  const saveProfile = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!profile.firstName.trim()) errors.firstName = 'Enter your first name.';
    else if (profile.firstName.trim().length < 2) errors.firstName = 'First name must have at least 2 characters.';
    if (!profile.lastName.trim()) errors.lastName = 'Enter your last name.';
    else if (profile.lastName.trim().length < 2) errors.lastName = 'Last name must have at least 2 characters.';
    if (!profile.username.trim()) errors.username = 'Choose a username.';
    else if (!/^[a-z0-9_]{3,24}$/.test(profile.username)) errors.username = 'Use 3 to 24 lowercase letters, numbers, or underscores.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true); setStatus(null);
    try {
      await updateUser(profile);
      showStatus('success', 'Your profile changes were saved.');
    } catch (error) {
      showStatus('error', errorMessage(error));
    } finally { setBusy(false); }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setStatus(null);
    const errors = {};
    if (!passwords.currentPassword) errors.currentPassword = 'Enter your current password.';
    else if (!passwordVerified) errors.currentPassword = 'Verify your current password first.';
    if (!passwords.newPassword) errors.newPassword = 'Enter a new password.';
    else if (!(passwords.newPassword.length >= 8 && passwords.newPassword.length <= 64 && /[A-Z]/.test(passwords.newPassword) && /[a-z]/.test(passwords.newPassword) && /\d/.test(passwords.newPassword) && /[^A-Za-z0-9]/.test(passwords.newPassword))) errors.newPassword = 'Meet all password requirements before continuing.';
    if (!passwords.confirmPassword) errors.confirmPassword = 'Confirm your new password.';
    else if (passwords.newPassword !== passwords.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordVerified(false);
      showStatus('success', data.message || 'Your password was changed.');
    } catch (error) {
      showStatus('error', errorMessage(error));
    } finally { setBusy(false); }
  };

  const verifyCurrentPassword = async () => {
    setStatus(null);
    if (!passwords.currentPassword) {
      setFieldErrors((current) => ({ ...current, currentPassword: 'Enter your current password.' }));
      return;
    }
    setVerifyingPassword(true);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.currentPassword;
      return next;
    });
    try {
      await api.post('/auth/verify-password', { currentPassword: passwords.currentPassword });
      setPasswordVerified(true);
    } catch (error) {
      setPasswordVerified(false);
      setFieldErrors((current) => ({ ...current, currentPassword: errorMessage(error, 'Could not verify your password.') }));
    } finally {
      setVerifyingPassword(false);
    }
  };

  const changeCurrentPassword = (event) => {
    setPasswordVerified(false);
    setPasswords({ currentPassword: event.target.value, newPassword: '', confirmPassword: '' });
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.currentPassword;
      delete next.newPassword;
      delete next.confirmPassword;
      return next;
    });
  };

  const saveNotifications = async () => {
    setBusy(true); setStatus(null);
    try {
      if (notificationChannels.browserPush) {
        await enableBrowserPush(pushConfig?.web?.publicKey);
      } else if (savedNotificationChannels.browserPush || pushConfig?.web?.subscribed) {
        await disableBrowserPush();
      }
      await updateUser({ notificationPreferences: notifications, notificationChannels });
      const nextPushConfig = await browserPushState().catch(() => null);
      if (nextPushConfig) setPushConfig(nextPushConfig);
      showStatus('success', 'Notification preferences were saved.');
    } catch (error) {
      showStatus('error', errorMessage(error));
    } finally { setBusy(false); }
  };

  const sendTestNotification = async () => {
    setTestingNotifications(true); setStatus(null);
    try {
      const { data } = await api.post('/notifications/test');
      const results = Object.entries(data.deliveryStatus || {}).filter(([, value]) => value === 'sent').map(([key]) => key === 'browserPush' ? 'browser' : key === 'mobilePush' ? 'mobile' : key);
      showStatus('success', results.length ? `Test sent through ${results.join(', ')}.` : 'Test notification added to your in-app notifications.');
    } catch (error) { showStatus('error', errorMessage(error)); }
    finally { setTestingNotifications(false); }
  };

  const confirmLogout = () => {
    logoutDialog.current?.close();
    logout();
    navigate('/login', { replace: true });
  };

  const deleteAccount = async (event) => {
    event.preventDefault();
    setBusy(true); setStatus(null);
    try {
      await api.delete('/auth/me', { data: deletion });
      logout();
      navigate('/', { replace: true });
    } catch (error) {
      showStatus('error', errorMessage(error));
    } finally { setBusy(false); }
  };

  const rules = [
    ['8 to 64 characters', passwords.newPassword.length >= 8 && passwords.newPassword.length <= 64],
    ['One uppercase letter', /[A-Z]/.test(passwords.newPassword)],
    ['One lowercase letter', /[a-z]/.test(passwords.newPassword)],
    ['One number', /\d/.test(passwords.newPassword)],
    ['One symbol', /[^A-Za-z0-9]/.test(passwords.newPassword)],
  ];
  const profileIsValid = profile.firstName.trim().length >= 2
    && profile.lastName.trim().length >= 2
    && /\p{L}/u.test(profile.firstName)
    && /\p{L}/u.test(profile.lastName)
    && /^[\p{L} .-]{2,40}$/u.test(profile.firstName.trim())
    && /^[\p{L} .-]{2,40}$/u.test(profile.lastName.trim())
    && /^[a-z0-9_]{3,24}$/.test(profile.username);
  const savedNameParts = (user?.displayName || '').trim().split(/\s+/);
  const savedProfile = {
    firstName: user?.firstName || savedNameParts[0] || '',
    lastName: user?.lastName || savedNameParts.slice(1).join(' ') || '',
    username: user?.username || '',
    timezone: user?.timezone || 'Asia/Manila',
    currency: user?.currency || 'PHP',
    primaryUsage: user?.primaryUsage || 'both',
  };
  const profileHasChanges = Object.keys(savedProfile).some((key) => profile[key] !== savedProfile[key]);
  const passwordIsValid = passwordVerified
    && passwords.currentPassword.length >= 8
    && rules.every(([, met]) => met)
    && passwords.confirmPassword.length > 0
    && passwords.newPassword === passwords.confirmPassword;
  const confirmPasswordMismatch = passwords.confirmPassword.length > 0
    && passwords.newPassword !== passwords.confirmPassword;
  const confirmPasswordError = fieldErrors.confirmPassword
    || (confirmPasswordMismatch ? 'Passwords do not match.' : '');
  const confirmPasswordSuccess = passwords.confirmPassword.length > 0
    && passwords.newPassword === passwords.confirmPassword
    ? 'Passwords match.'
    : '';
  const savedNotifications = {
    taskAssignments: user?.notificationPreferences?.taskAssignments ?? true,
    deadlines: user?.notificationPreferences?.deadlines ?? true,
    teamMessages: user?.notificationPreferences?.teamMessages ?? true,
    bills: user?.notificationPreferences?.bills ?? true,
  };
  const savedNotificationChannels = {
    inApp: user?.notificationChannels?.inApp ?? true,
    email: user?.notificationChannels?.email ?? false,
    browserPush: user?.notificationChannels?.browserPush ?? false,
    mobilePush: user?.notificationChannels?.mobilePush ?? false,
  };
  const notificationsHaveChanges = Object.keys(savedNotifications).some((key) => notifications[key] !== savedNotifications[key])
    || Object.keys(savedNotificationChannels).some((key) => notificationChannels[key] !== savedNotificationChannels[key]);
  const initials = (user?.displayName || 'KayaTo User').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <section className="page-block settings-page">
      <div className="page-heading settings-heading"><div><h1>Account settings</h1><p>Manage your personal details, security, notifications, and display.</p></div></div>
      <div className="account-settings-layout">
        <nav className="settings-section-nav" aria-label="Account settings sections">
          <div className="settings-user-summary"><span className="avatar avatar-peach">{initials}</span><span><strong>{user?.displayName}</strong><small>@{user?.username || 'username'}</small></span></div>
          <div className="settings-nav-items">
            {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={activeSection === id ? 'active' : ''} onClick={() => selectSection(id)} aria-current={activeSection === id ? 'page' : undefined}><Icon size={18} /><span>{label}</span></button>)}
          </div>
          <button type="button" className="settings-logout-link" onClick={() => logoutDialog.current?.showModal()}><LogOut size={18} /><span>Log out</span></button>
        </nav>

        <div className="settings-content">
          {status && <p className={`settings-status ${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>{status.type === 'success' && <Check size={17} />}{status.message}</p>}

          {activeSection === 'profile' && <form className="settings-section" onSubmit={saveProfile} noValidate>
            <header><div className="settings-section-icon"><UserRound size={21} /></div><div><h2>Profile information</h2><p>Keep your account details accurate so teammates and friends can identify you.</p></div></header>
            <div className="settings-section-body form-grid">
              <label className="field-label"><span>First name <b className="required-mark">*</b></span><input value={profile.firstName} onChange={(event) => { clearFieldError('firstName'); setProfile({ ...profile, firstName: capitalizePersonName(event.target.value) }); }} minLength="2" maxLength="40" autoComplete="given-name" required aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? 'first-name-error' : undefined} />{fieldErrors.firstName && <small className="field-error" id="first-name-error" role="alert">{fieldErrors.firstName}</small>}</label>
              <label className="field-label"><span>Last name <b className="required-mark">*</b></span><input value={profile.lastName} onChange={(event) => { clearFieldError('lastName'); setProfile({ ...profile, lastName: capitalizePersonName(event.target.value) }); }} minLength="2" maxLength="40" autoComplete="family-name" required aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? 'last-name-error' : undefined} />{fieldErrors.lastName && <small className="field-error" id="last-name-error" role="alert">{fieldErrors.lastName}</small>}</label>
              <label className="field-label"><span>Username <b className="required-mark">*</b></span><span className="username-field"><span aria-hidden="true">@</span><input value={profile.username} onChange={(event) => { clearFieldError('username'); setProfile({ ...profile, username: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) }); }} minLength="3" maxLength="24" autoComplete="username" spellCheck="false" required aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? 'settings-username-error' : 'settings-username-hint'} /></span>{fieldErrors.username ? <small className="field-error" id="settings-username-error" role="alert">{fieldErrors.username}</small> : <small className="field-hint" id="settings-username-hint">3 to 24 lowercase letters, numbers, or underscores.</small>}</label>
              <label className="field-label"><span>Email address</span><input value={user?.email || ''} disabled /><small className="field-hint">Verified account email. Contact support to change it.</small></label>
              <label className="field-label"><span>Timezone</span><select value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}>{TIMEZONE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><small className="field-hint">Used for chat, notification, and activity timestamps.</small></label>
              <label className="field-label"><span>Currency</span><select value={profile.currency} onChange={(event) => setProfile({ ...profile, currency: event.target.value })}>{CURRENCY_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><small className="field-hint">Used for bill amounts and new reminders.</small></label>
              <label className="field-label settings-wide-field"><span>Primary use</span><select value={profile.primaryUsage} onChange={(event) => setProfile({ ...profile, primaryUsage: event.target.value })}><option value="personal">Personal productivity</option><option value="team">Team collaboration</option><option value="both">Personal and team</option></select></label>
            </div>
            <footer><small className="settings-action-note">{!profileIsValid ? 'Complete all required fields.' : profileHasChanges ? 'Your profile has unsaved changes.' : 'No unsaved changes.'}</small><button className="button button-primary" disabled={busy || !profileIsValid || !profileHasChanges}><Save size={16} />{busy ? 'Saving...' : 'Save profile'}</button></footer>
          </form>}

          {activeSection === 'security' && <form className="settings-section" onSubmit={savePassword} noValidate>
            <header><div className="settings-section-icon"><ShieldCheck size={21} /></div><div><h2>Password & security</h2><p>Use a unique password you do not use for another account.</p></div></header>
            <div className="settings-section-body security-fields">
              <div className="current-password-verification">
                <PasswordInput id="current-password" label="Current password" value={passwords.currentPassword} onChange={changeCurrentPassword} autoComplete="current-password" error={fieldErrors.currentPassword} success={passwordVerified ? 'Current password verified.' : ''} />
                <button type="button" className="button button-secondary" onClick={verifyCurrentPassword} disabled={busy || verifyingPassword || passwordVerified || !passwords.currentPassword}>
                  {passwordVerified && <Check size={16} />}
                  {verifyingPassword ? 'Verifying...' : passwordVerified ? 'Verified' : 'Verify password'}
                </button>
              </div>
              {!passwordVerified && <p className="password-verification-note"><LockKeyhole size={15} />Verify your current password to unlock the new password fields.</p>}
              <div className="security-password-grid" aria-disabled={!passwordVerified}>
                <PasswordInput id="new-password" label="New password" value={passwords.newPassword} onChange={(event) => { clearFieldError('newPassword'); clearFieldError('confirmPassword'); setPasswords({ ...passwords, newPassword: event.target.value }); }} autoComplete="new-password" error={fieldErrors.newPassword} disabled={!passwordVerified} />
                <PasswordInput id="confirm-new-password" label="Confirm new password" value={passwords.confirmPassword} onChange={(event) => { clearFieldError('confirmPassword'); setPasswords({ ...passwords, confirmPassword: event.target.value }); }} autoComplete="new-password" error={confirmPasswordError} success={confirmPasswordSuccess} disabled={!passwordVerified} />
              </div>
              {passwords.newPassword && <ul className="password-checklist settings-password-checklist" aria-label="Password requirements">{rules.map(([label, met]) => <li key={label} className={met ? 'met' : ''}><Check size={14} />{label}</li>)}</ul>}
            </div>
            <footer><small className="settings-action-note">{!passwordVerified ? 'Verify your current password to continue.' : passwordIsValid ? 'Your new password is ready to save.' : 'Complete all password requirements.'}</small><button className="button button-primary" disabled={busy || !passwordIsValid}><ShieldCheck size={16} />{busy ? 'Updating...' : 'Update password'}</button></footer>
          </form>}

          {activeSection === 'notifications' && <section className="settings-section">
            <header><div className="settings-section-icon"><Bell size={21} /></div><div><h2>Notification preferences</h2><p>Choose what KayaTo sends and where you receive it.</p></div></header>
            <div className="settings-section-body settings-preference-list">
              <div className="notification-settings-heading"><strong>Notify me about</strong><small>These categories apply to every enabled delivery method.</small></div>
              {notificationOptions.map((option) => <label className="preference-row" key={option.key}><span><strong>{option.title}</strong><small>{option.description}</small></span><input type="checkbox" checked={notifications[option.key]} onChange={(event) => setNotifications({ ...notifications, [option.key]: event.target.checked })} /><span className="settings-switch" aria-hidden="true" /></label>)}
              <div className="notification-settings-heading delivery-heading"><strong>Delivery methods</strong><small>Browser permission is requested only when you save browser push.</small></div>
              {deliveryOptions.map(({ key, title, description, icon: Icon }) => {
                const unavailable = (key === 'email' && pushConfigStatus === 'ready' && !pushConfig?.email?.configured)
                  || (key === 'browserPush' && pushConfigStatus === 'ready' && !pushConfig?.web?.configured)
                  || (key === 'mobilePush' && pushConfigStatus === 'ready' && !pushConfig?.mobile?.configured);
                const detail = unavailable ? `${description} Server setup is still required.`
                  : key === 'browserPush' && pushConfig?.permission === 'denied' ? 'Blocked in this browser. Allow notifications in your browser site settings.'
                    : key === 'mobilePush' && pushConfig?.mobile?.subscriptions ? `${description} ${pushConfig.mobile.subscriptions} device registered.`
                      : description;
                return <label className={`preference-row delivery-row ${unavailable ? 'unavailable' : ''}`} key={key}><Icon size={18} aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={notificationChannels[key]} disabled={busy || unavailable || (key === 'browserPush' && pushConfig?.permission === 'denied')} onChange={(event) => setNotificationChannels({ ...notificationChannels, [key]: event.target.checked })} /><span className="settings-switch" aria-hidden="true" /></label>;
              })}
              {pushConfigStatus === 'loading' && <p className="notification-config-status" role="status">Checking delivery availability...</p>}
              {pushConfigStatus === 'error' && <p className="notification-config-status error" role="alert">Delivery availability could not be checked. You can still save category preferences.</p>}
            </div>
            <footer><small className="settings-action-note">{notificationsHaveChanges ? 'Your notification choices have changed.' : 'Preferences are up to date.'}</small><div className="notification-actions"><button type="button" className="button button-secondary" disabled={busy || testingNotifications || notificationsHaveChanges} onClick={sendTestNotification}><Send size={16} />{testingNotifications ? 'Sending...' : 'Send test'}</button><button type="button" className="button button-primary" disabled={busy || !notificationsHaveChanges} onClick={saveNotifications}><Save size={16} />{busy ? 'Saving...' : 'Save notifications'}</button></div></footer>
          </section>}

          {activeSection === 'appearance' && <section className="settings-section">
            <header><div className="settings-section-icon"><MonitorCog size={21} /></div><div><h2>Appearance</h2><p>Select how KayaTo looks on this device.</p></div></header>
            <div className="settings-section-body"><fieldset className="appearance-options"><legend>Color theme</legend>{themeOptions.map(({ value, label, description, icon: Icon }) => <label key={value} className={themePreference === value ? 'selected' : ''}><input type="radio" name="theme" value={value} checked={themePreference === value} onChange={() => setThemePreference(value)} /><Icon size={20} /><span><strong>{label}</strong><small>{description}</small></span><span className="theme-radio" aria-hidden="true">{themePreference === value && <Check size={13} />}</span></label>)}</fieldset><p className="appearance-note">Your theme choice is saved in this browser and applied immediately.</p></div>
          </section>}

          {activeSection === 'danger' && <form className="settings-section" onSubmit={deleteAccount}>
            <header><div className="settings-section-icon"><Trash2 size={21} /></div><div><h2>Delete account</h2><p>Permanently remove your KayaTo account and personal data.</p></div></header>
            <div className="settings-section-body security-fields">
              <p>This cannot be undone. Teams you own with other members must be transferred or cleared first.</p>
              <PasswordInput id="delete-account-password" label="Current password" value={deletion.password} onChange={(event) => setDeletion({ ...deletion, password: event.target.value })} autoComplete="current-password" />
              <label className="field-label"><span>Type DELETE to confirm <b className="required-mark">*</b></span><input value={deletion.confirmation} onChange={(event) => setDeletion({ ...deletion, confirmation: event.target.value })} autoComplete="off" required /></label>
            </div>
            <footer><small className="settings-action-note">Your tasks, bills, friendships, and direct chats will be removed.</small><button className="button logout-confirm" disabled={busy || !deletion.password || deletion.confirmation !== 'DELETE'}><Trash2 size={16} />{busy ? 'Deleting...' : 'Permanently delete account'}</button></footer>
          </form>}
        </div>
      </div>

      <dialog ref={logoutDialog} className="logout-dialog" aria-labelledby="settings-logout-title" aria-describedby="settings-logout-description">
        <div className="logout-dialog-icon" aria-hidden="true"><LogOut size={22} /></div>
        <h2 id="settings-logout-title">Log out of KayaTo?</h2>
        <p id="settings-logout-description">You will need to enter your email and password to access your workspace again.</p>
        <div className="logout-dialog-actions"><form method="dialog"><button className="button button-secondary" autoFocus>Cancel</button></form><button type="button" className="button logout-confirm" onClick={confirmLogout}>Log out</button></div>
      </dialog>
    </section>
  );
}
