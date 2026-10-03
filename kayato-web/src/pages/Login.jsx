import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Brand from '../components/Brand';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const submit = (event) => { event.preventDefault(); navigate('/app'); };

  return (
    <div className="auth-page auth-page-centered">
      <header className="auth-header"><Link to="/"><Brand /></Link><ThemeToggle label={false} /></header>
      <main className="auth-layout auth-layout-centered">
        <section className="auth-panel auth-panel-centered">
          <div className="auth-card auth-card-glass">
            <div className="auth-card-mark" aria-hidden="true">
              <img className="auth-card-brand auth-card-brand-light" src="/brand/kayato-redlogo.svg" alt="" />
              <img className="auth-card-brand auth-card-brand-dark" src="/brand/kayato-whitelogo.svg" alt="" />
            </div>
            <div className="auth-card-heading">
              <span className="eyebrow">Welcome back</span>
              <h1>Continue to KayaTo</h1>
              <p>Sign in to keep your projects, plans, and conversations moving.</p>
            </div>

            <form onSubmit={submit} className="auth-form">
              <label>Email address<input type="email" placeholder="name@example.com" defaultValue="jamie@kayato.com" required /></label>
              <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} placeholder="Enter your password" defaultValue="password123" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
              <div className="form-options"><label className="checkbox-label"><input type="checkbox" defaultChecked /><span>Remember me</span></label><a href="#reset">Forgot password?</a></div>
              <button className="button button-primary button-full" type="submit">Log in</button>
            </form>

            <div className="divider auth-divider"><span>or continue with</span></div>
            <div className="social-row auth-social-icons">
              <button aria-label="Continue with Google" className="social-button"><img className="social-logo social-logo-google" src="/auth/google.svg" alt="" /></button>
              <button aria-label="Continue with Facebook" className="social-button"><img className="social-logo" src="/auth/facebook.svg" alt="" /></button>
              <button aria-label="Continue with Apple" className="social-button"><img className="social-logo social-logo-apple" src="/auth/apple.svg" alt="" /></button>
            </div>
            <p className="auth-switch">New to KayaTo? <Link to="/onboarding">Create an account</Link></p>
          </div>
        </section>
      </main>
    </div>
  );
}
