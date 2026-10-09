import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Eye,
  EyeOff,
  MailCheck,
  Users,
  UserRound,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Brand from "../components/Brand";
import { errorMessage } from "../lib/api";

const choices = [
  {
    id: "personal",
    icon: UserRound,
    title: "Personal productivity",
    copy: "Plan your day and stay ahead of bills.",
  },
  {
    id: "team",
    icon: Users,
    title: "Team collaboration",
    copy: "Assign work and keep delivery visible.",
  },
  {
    id: "both",
    icon: Workflow,
    title: "A bit of both",
    copy: "Keep personal and shared work together.",
  },
];
const passwordChecks = [
  ["length", "At least 8 characters", (value) => value.length >= 8],
  ["upper", "One uppercase letter", (value) => /[A-Z]/.test(value)],
  ["lower", "One lowercase letter", (value) => /[a-z]/.test(value)],
  ["number", "One number", (value) => /\d/.test(value)],
  ["symbol", "One symbol", (value) => /[^A-Za-z0-9]/.test(value)],
];
const emailSyntaxIsValid = (email) =>
  /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
    email.trim(),
  );
const sanitizePersonName = (value) => {
  const sanitized = value
    .replace(/[^\p{L} .-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 40);
  return sanitized.replace(
    /(^|[ .-])(\p{L})/gu,
    (_match, separator, letter) =>
      `${separator}${letter.toLocaleUpperCase()}`,
  );
};

export default function Onboarding() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    primaryUsage: "both",
    code: "",
  });
  const [step, setStep] = useState("details"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [countdown, setCountdown] = useState(0),
    [emailError, setEmailError] = useState(""),
    [emailChecking, setEmailChecking] = useState(false),
    [validatedEmail, setValidatedEmail] = useState(""),
    [usernameError, setUsernameError] = useState(""),
    [usernameChecking, setUsernameChecking] = useState(false),
    [validatedUsername, setValidatedUsername] = useState(""),
    [otpDigits, setOtpDigits] = useState(() => Array(6).fill("")),
    [passwordFocused, setPasswordFocused] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [showConfirm, setShowConfirm] = useState(false);
  const { checkSignupEmailDomain, checkSignupUsername, requestSignupOtp, register } = useAuth();
  const navigate = useNavigate();
  const otpRefs = useRef([]);
  const emailValidationRef = useRef({ sequence: 0, email: "", promise: null });
  const usernameValidationRef = useRef({ sequence: 0, username: "", promise: null });
  const rules = passwordChecks.map(([id, label, test]) => ({
    id,
    label,
    met: test(form.password),
  }));
  const strongPassword = rules.every((rule) => rule.met);
  const passwordsMatch =
    form.password === form.confirmPassword && form.confirmPassword.length > 0;
  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = setInterval(
      () => setCountdown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [countdown]);
  useEffect(() => {
    if (step === "verify") otpRefs.current[0]?.focus();
  }, [step]);
  const updateOtp = (digits) => {
    setOtpDigits(digits);
    setForm((current) => ({ ...current, code: digits.join("") }));
  };
  const clearOtp = () => updateOtp(Array(6).fill(""));
  const enterOtpDigits = (startIndex, value) => {
    const incoming = value.replace(/\D/g, "").slice(0, 6 - startIndex);
    if (!incoming) return;
    const next = [...otpDigits];
    incoming.split("").forEach((digit, offset) => {
      next[startIndex + offset] = digit;
    });
    updateOtp(next);
    otpRefs.current[Math.min(startIndex + incoming.length, 5)]?.focus();
  };
  const validateEmailDomain = async ({ showEmptyError = false } = {}) => {
    const email = form.email.trim().toLowerCase();
    if (!email) {
      if (showEmptyError) setEmailError("Enter your email address.");
      return false;
    }
    if (!emailSyntaxIsValid(email)) {
      setEmailError(
        "Enter a complete email address, such as name@example.com.",
      );
      return false;
    }
    if (validatedEmail === email) return true;
    if (
      emailValidationRef.current.email === email &&
      emailValidationRef.current.promise
    ) {
      return emailValidationRef.current.promise;
    }
    const sequence = emailValidationRef.current.sequence + 1;
    setEmailChecking(true);
    setEmailError("");
    const promise = checkSignupEmailDomain(email)
      .then(() => {
        if (emailValidationRef.current.sequence !== sequence) return false;
        setValidatedEmail(email);
        return true;
      })
      .catch((validationError) => {
        if (emailValidationRef.current.sequence !== sequence) return false;
        setEmailError(
          errorMessage(validationError, "Unable to verify this email domain."),
        );
        return false;
      })
      .finally(() => {
        if (emailValidationRef.current.sequence === sequence) {
          setEmailChecking(false);
          emailValidationRef.current.promise = null;
        }
      });
    emailValidationRef.current = { sequence, email, promise };
    return promise;
  };
  const validateUsername = async ({ showEmptyError = false } = {}) => {
    const username = form.username.trim().toLowerCase();
    if (!username) {
      if (showEmptyError) setUsernameError("Choose a username.");
      return false;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setUsernameError("Use 3 to 24 lowercase letters, numbers, or underscores.");
      return false;
    }
    if (validatedUsername === username) return true;
    if (usernameValidationRef.current.username === username && usernameValidationRef.current.promise) return usernameValidationRef.current.promise;
    const sequence = usernameValidationRef.current.sequence + 1;
    setUsernameChecking(true); setUsernameError("");
    const promise = checkSignupUsername(username)
      .then(() => {
        if (usernameValidationRef.current.sequence !== sequence) return false;
        setValidatedUsername(username);
        return true;
      })
      .catch((validationError) => {
        if (usernameValidationRef.current.sequence !== sequence) return false;
        setUsernameError(errorMessage(validationError, "Unable to check this username."));
        return false;
      })
      .finally(() => {
        if (usernameValidationRef.current.sequence === sequence) {
          setUsernameChecking(false);
          usernameValidationRef.current.promise = null;
        }
      });
    usernameValidationRef.current = { sequence, username, promise };
    return promise;
  };
  const requestCode = async () => {
    setError("");
    const [emailValid, usernameValid] = await Promise.all([
      validateEmailDomain({ showEmptyError: true }),
      validateUsername({ showEmptyError: true }),
    ]);
    if (!emailValid || !usernameValid) return;
    if (!strongPassword) {
      setError("Complete all password requirements before continuing.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setEmailError("");
    setMessage("");
    setBusy(true);
    try {
      const data = await requestSignupOtp(form.email, form.username);
      clearOtp();
      setStep("verify");
      setCountdown(data.resendAfterSeconds || 60);
      setMessage(`We sent a 6-digit code to ${form.email}.`);
    } catch (requestError) {
      const message = errorMessage(
        requestError,
        "Unable to send a verification code.",
      );
      if (/username/i.test(message)) setUsernameError(message);
      else if (/email|domain/i.test(message)) setEmailError(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (step === "details") {
      await requestCode();
      return;
    }
    setError("");
    setBusy(true);
    try {
      await register({
        ...form,
        displayName: `${form.firstName} ${form.lastName}`.trim(),
      });
      navigate("/app", { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to verify your account."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="onboarding-page">
      <header>
        <Link to="/">
          <Brand />
        </Link>
        <span>
          {step === "details" ? "Create your workspace" : "Verify your email"}
        </span>
      </header>
      <main>
        <Link
          to={step === "details" ? "/login" : "#"}
          onClick={
            step === "verify"
              ? (event) => {
                  event.preventDefault();
                  setStep("details");
                  setError("");
                  setMessage("");
                }
              : undefined
          }
          className="back-link"
        >
          <ArrowLeft size={17} />{" "}
          {step === "details" ? "Back to login" : "Change account details"}
        </Link>
        {step === "details" ? (
          <>
            <h1>Start organizing with KayaTo.</h1>
            <p>
              Create one account for personal tasks, team projects,
              conversations, and bill reminders.
            </p>
          </>
        ) : (
          <div className="otp-heading">
            <span className="otp-icon">
              <MailCheck size={24} />
            </span>
            <h1>Check your email.</h1>
            <p>
              Enter the code we sent to <b>{form.email}</b>. It expires in 10
              minutes.
            </p>
          </div>
        )}
        <form onSubmit={submit} className="onboarding-form">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="form-message" role="status">
              {message}
            </p>
          )}
          {step === "details" ? (
            <>
              <div className="form-grid signup-name-grid">
                <label className="field-label">
                  <span className="field-label-text">
                    First name
                    <span className="required-marker" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    value={form.firstName}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        firstName: sanitizePersonName(e.target.value),
                      })
                    }
                    autoComplete="given-name"
                    autoCapitalize="words"
                    aria-describedby="name-input-hint"
                    required
                    minLength="2"
                    maxLength="40"
                  />
                </label>
                <label className="field-label">
                  <span className="field-label-text">
                    Last name
                    <span className="required-marker" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    value={form.lastName}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        lastName: sanitizePersonName(e.target.value),
                      })
                    }
                    autoComplete="family-name"
                    autoCapitalize="words"
                    aria-describedby="name-input-hint"
                    required
                    minLength="2"
                    maxLength="40"
                  />
                </label>
              </div>
              <small className="name-field-hint" id="name-input-hint">
                Letters, spaces, periods, and hyphens only.
              </small>
              <div className="form-grid signup-contact-grid">
                <label className="field-label">
                  <span className="field-label-text">
                    Username
                    <span className="required-marker" aria-hidden="true">*</span>
                  </span>
                  <span className="username-field">
                    <span aria-hidden="true">@</span>
                    <input
                      id="signup-username"
                      value={form.username}
                      onChange={(event) => {
                        const username = event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
                        setForm({ ...form, username });
                        setUsernameError(""); setValidatedUsername(""); setUsernameChecking(false);
                        usernameValidationRef.current.sequence += 1;
                        usernameValidationRef.current.username = "";
                        usernameValidationRef.current.promise = null;
                      }}
                      onBlur={() => void validateUsername()}
                      autoComplete="username"
                      spellCheck="false"
                      minLength="3"
                      maxLength="24"
                      aria-invalid={Boolean(usernameError)}
                      aria-describedby={usernameError ? "signup-username-error" : "signup-username-hint"}
                      required
                    />
                  </span>
                  {usernameError ? <small id="signup-username-error" className="match-error" role="alert">{usernameError}</small> : usernameChecking ? <small className="field-status" role="status">Checking username...</small> : <small id="signup-username-hint" className="field-hint">Letters, numbers, and underscores only.</small>}
                </label>
                <label className="field-label">
                  <span className="field-label-text">
                    Email address
                    <span className="required-marker" aria-hidden="true">*</span>
                  </span>
                  <input
                    id="signup-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      setEmailError("");
                      setValidatedEmail("");
                      emailValidationRef.current.sequence += 1;
                      emailValidationRef.current.email = "";
                      emailValidationRef.current.promise = null;
                      setEmailChecking(false);
                    }}
                    onBlur={() => void validateEmailDomain()}
                    autoComplete="email"
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? "signup-email-error" : undefined}
                    required
                  />
                  {emailError && <small id="signup-email-error" className="match-error" role="alert">{emailError}</small>}
                  {emailChecking && !emailError && <small className="field-status" role="status">Checking email address...</small>}
                </label>
              </div>
              <div className="form-grid password-grid">
                <div>
                  <label className="field-label">
                    <span className="field-label-text">
                      Password
                      <span className="required-marker" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <span className="password-field">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        autoComplete="new-password"
                        aria-describedby={
                          passwordFocused ? "password-requirements" : undefined
                        }
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </button>
                    </span>
                  </label>
                  {passwordFocused && (
                    <ul
                      className="password-checklist"
                      id="password-requirements"
                      aria-label="Password requirements"
                    >
                      {rules.map((rule) => (
                        <li key={rule.id} className={rule.met ? "met" : ""}>
                          {rule.met ? (
                            <Check size={14} />
                          ) : (
                            <Circle size={12} />
                          )}
                          <span>{rule.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <label className="field-label">
                  <span className="field-label-text">
                    Confirm password
                    <span className="required-marker" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <span className="password-field">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={(e) =>
                        setForm({ ...form, confirmPassword: e.target.value })
                      }
                      autoComplete="new-password"
                      aria-invalid={
                        form.confirmPassword.length > 0 && !passwordsMatch
                      }
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((value) => !value)}
                      aria-label={
                        showConfirm
                          ? "Hide confirmed password"
                          : "Show confirmed password"
                      }
                    >
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                  {form.confirmPassword.length > 0 && (
                    <small
                      className={
                        passwordsMatch ? "match-success" : "match-error"
                      }
                    >
                      {passwordsMatch
                        ? "Passwords match"
                        : "Passwords do not match"}
                    </small>
                  )}
                </label>
              </div>
              <fieldset className="plain-fieldset">
                <legend>What would you like to organize?</legend>
                <div className="choice-grid">
                  {choices.map(({ id, icon: Icon, title, copy }) => (
                    <button
                      type="button"
                      key={id}
                      className={`choice-card ${form.primaryUsage === id ? "selected" : ""}`}
                      onClick={() => setForm({ ...form, primaryUsage: id })}
                    >
                      <span className="choice-icon">
                        <Icon size={23} />
                      </span>
                      <span>
                        <b>{title}</b>
                        <small>{copy}</small>
                      </span>
                      <span className="selection-indicator">
                        {form.primaryUsage === id && <Check size={15} />}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <div className="otp-form">
              <div className="field-label">
                <span className="field-label-text" id="signup-code-label">
                  Verification code
                  <span className="required-marker" aria-hidden="true">
                    *
                  </span>
                </span>
                <div
                  className="otp-inputs"
                  role="group"
                  aria-labelledby="signup-code-label"
                  onPaste={(event) => {
                    event.preventDefault();
                    enterOtpDigits(
                      0,
                      event.clipboardData.getData("text"),
                    );
                  }}
                >
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        otpRefs.current[index] = element;
                      }}
                      id={`signup-code-${index}`}
                      className="otp-digit"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      pattern="[0-9]"
                      maxLength="1"
                      value={digit}
                      aria-label={`Verification code digit ${index + 1} of 6`}
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => {
                        const value = event.target.value.replace(/\D/g, "");
                        if (value) enterOtpDigits(index, value);
                        else {
                          const next = [...otpDigits];
                          next[index] = "";
                          updateOtp(next);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Backspace" && !digit && index > 0) {
                          otpRefs.current[index - 1]?.focus();
                        }
                        if (event.key === "ArrowLeft" && index > 0) {
                          event.preventDefault();
                          otpRefs.current[index - 1]?.focus();
                        }
                        if (event.key === "ArrowRight" && index < 5) {
                          event.preventDefault();
                          otpRefs.current[index + 1]?.focus();
                        }
                      }}
                      required
                    />
                  ))}
                </div>
                <small>Enter the six digits from your KayaTo email.</small>
              </div>
              <button
                type="button"
                className="text-action"
                disabled={busy || countdown > 0}
                onClick={requestCode}
              >
                {countdown > 0
                  ? `Resend available in ${countdown}s`
                  : "Resend verification code"}
              </button>
            </div>
          )}
          <div className="onboarding-actions">
            <span>
              {step === "details"
                ? "We will verify your email before creating the account."
                : "Do not share this code with anyone."}
            </span>
            <button
              className="button button-primary"
              disabled={
                busy ||
                emailChecking ||
                usernameChecking ||
                (step === "details" && (!strongPassword || !passwordsMatch)) ||
                (step === "verify" && form.code.length !== 6)
              }
            >
              {busy ? (
                step === "details" ? (
                  "Sending code..."
                ) : (
                  "Verifying..."
                )
              ) : step === "details" ? (
                <>
                  Continue <ArrowRight size={17} />
                </>
              ) : (
                "Verify and create account"
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
