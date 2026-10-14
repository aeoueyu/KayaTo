import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';
import { SESSION_NOTICE_KEY } from '../auth/AuthContext';
import { api, errorMessage } from '../lib/api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email');
  const [form, setForm] = useState({ email: '', code: '', password: '', confirmPassword: '' });
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      if (step === 'email') {
        const { data } = await api.post('/auth/forgot-password', { email: form.email });
        setMessage(data.message);
        setStep('code');
      } else {
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match.');
        const { data } = await api.post('/auth/reset-password', { email: form.email, code: form.code, newPassword: form.password });
        window.sessionStorage.setItem(SESSION_NOTICE_KEY, data.message);
        navigate('/login', { replace: true });
      }
    } catch (requestError) {
      setError(errorMessage(requestError, requestError.message || 'Unable to reset your password.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-page auth-page-centered">
      <header className="auth-header"><Link to="/"><Brand /></Link><ThemeToggle label={false} /></header>
      <Link to="/login" className="back-link" style={{ position: 'absolute', top: 90, left: 32, display: 'inline-flex', alignItems: 'center', gap: 8 }}><ArrowLeft size={18} />Back to login</Link>
      <main className="auth-layout auth-layout-centered">
        <section className="auth-panel auth-panel-centered">
          <div className="auth-card auth-card-glass">
            <div className="auth-card-heading"><span className="eyebrow">Account recovery</span><h1>{step === 'email' ? 'Reset your password' : 'Check your email'}</h1><p>{step === 'email' ? 'Enter your account email and we will send a six-digit reset code.' : 'Enter the reset code and choose a new secure password.'}</p></div>
            {message && <p className="form-info" role="status">{message}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <form onSubmit={submit} className="auth-form">
              <label>Email address<input type="email" autoComplete="email" value={form.email} disabled={step === 'code'} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
              {step === 'code' && <>
                <label>Reset code<input inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '') })} required /></label>
                <label>New password<div className="password-field"><input type={visible ? 'text' : 'password'} minLength="8" maxLength="64" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
                <label>Confirm new password<input type="password" minLength="8" maxLength="64" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required /></label>
              </>}
              <button className="button button-primary button-full" disabled={busy}>{busy ? 'Please wait...' : step === 'email' ? 'Send reset code' : 'Reset password'}</button>
            </form>
            {step === 'code' && <button type="button" className="button button-ghost button-full" onClick={() => { setStep('email'); setMessage(''); }}>Use another email</button>}
          </div>
        </section>
      </main>
    </div>
  );
}
