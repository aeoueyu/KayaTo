
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SESSION_NOTICE_KEY, useAuth } from '../auth/AuthContext';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';
import { errorMessage } from '../lib/api';

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    remember: true
  });
  const [error, setError] = useState('');
  const [notice] = useState(() => {
    const value = window.sessionStorage.getItem(SESSION_NOTICE_KEY) || '';
    window.sessionStorage.removeItem(SESSION_NOTICE_KEY);
    return value;
  });
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(
        { email: form.email, password: form.password },
        form.remember
      );
      navigate('/app', { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, 'Unable to sign in.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page auth-page-centered">
      <header className="auth-header">
        <Link to="/">
          <Brand />
        </Link>
        <ThemeToggle label={false} />
      </header>

      {/* Back to Home Button */}
      <Link
        to="/"
        className="back-link"
        style={{
          position: 'absolute',
          top: '90px',
          left: '32px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          textDecoration: 'none',
          color: 'inherit',
          fontSize: '14px',
          fontWeight: 500,
          zIndex: 10
        }}
      >
        <ArrowLeft size={18} />
        Back to Home
      </Link>

      <main className="auth-layout auth-layout-centered">
        <section className="auth-panel auth-panel-centered">
          <div className="auth-card auth-card-glass">

            <div className="auth-card-mark" aria-hidden="true">
              <img
                className="auth-card-brand auth-card-brand-light"
                src="/brand/kayato-redlogo.svg"
                alt=""
              />
              <img
                className="auth-card-brand auth-card-brand-dark"
                src="/brand/kayato-whitelogo.svg"
                alt=""
              />
            </div>

            <div className="auth-card-heading">
              <span className="eyebrow">Welcome back</span>
              <h1>Continue to KayaTo</h1>
              <p>
                Sign in to keep your projects, plans, and
                conversations moving.
              </p>
            </div>

            {notice && (
              <p className="form-info" role="status">
                {notice}
              </p>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <form onSubmit={submit} className="auth-form">
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  minLength="6"
                  maxLength="254"
                  required
                />
              </label>

              <label>
                Password
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={(event) =>
                      setForm({ ...form, password: event.target.value })
                    }
                    minLength="8"
                    maxLength="64"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </label>

              <div className="form-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.remember}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        remember: event.target.checked
                      })
                    }
                  />
                  <span>Remember me</span>
                </label>
                <Link to="/forgot-password">Forgot password?</Link>
              </div>

              <button
                className="button button-primary button-full"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Signing in...' : 'Log in'}
              </button>
            </form>

            <p className="auth-switch">
              New to KayaTo?{' '}
              <Link to="/onboarding">Create an account</Link>
            </p>

          </div>
        </section>
      </main>
    </div>
  );
}
