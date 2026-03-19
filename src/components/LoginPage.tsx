import { useState, useRef } from 'react';
import { Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, Check, ArrowLeft, Mail } from 'lucide-react';

interface AuthUser {
  slug: string;
  name: string;
  role: 'admin' | 'agent';
  photo: string;
  website: string;
  phone: string;
  email: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export function getStoredSession(): AuthSession | null {
  const raw = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem('auth_session');
  sessionStorage.removeItem('auth_session');
}

export function getAuthHeaders(): Record<string, string> {
  const session = getStoredSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.token}` };
}

export default function LoginPage({ onLogin }: { onLogin: (session: AuthSession) => void }) {
  const [slug, setSlug] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [inputError, setInputError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const slugRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const triggerError = (msg: string) => {
    setError(msg);
    setInputError(true);
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const clearError = () => {
    if (error) {
      setError('');
      setInputError(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim().toLowerCase(), password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoading(false);
        triggerError(data.error || 'Username atau password salah');
        return;
      }

      const session: AuthSession = { token: data.token, user: data.user };
      if (rememberMe) {
        localStorage.setItem('auth_session', JSON.stringify(session));
      } else {
        sessionStorage.setItem('auth_session', JSON.stringify(session));
      }

      setLoading(false);
      setSuccess(true);
      setTimeout(() => onLogin(session), 800);
    } catch {
      setLoading(false);
      triggerError('Gagal menghubungi server');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');

    if (!forgotEmail.trim()) {
      setForgotError('Email wajib diisi');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setForgotLoading(false);
        setForgotError(data.error || 'Terjadi kesalahan');
        return;
      }

      setForgotLoading(false);
      setForgotSuccess(true);
    } catch {
      setForgotLoading(false);
      setForgotError('Gagal menghubungi server');
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        .login-mint * { font-family: 'Outfit', sans-serif; }
        .login-mint-input {
          width: 100%;
          padding: 14px 16px;
          border: none;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
          font-size: 15px;
          font-weight: 500;
          color: #111;
          outline: none;
          transition: all 0.25s ease;
        }
        .login-mint-input::placeholder { color: #c8cdd3; }
        .login-mint-input:focus {
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #10b981;
        }
        .login-mint-input.input-error {
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #ef4444;
        }
        .login-mint-input.input-error:focus {
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #ef4444;
        }
        .login-mint-input-pw { padding-right: 48px; }
        @keyframes shakeIt {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(7px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
        }
        .shake { animation: shakeIt 0.5s ease; }
        @keyframes errorSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="login-mint"
        style={{
          minHeight: '100vh',
          background: '#f0fdf4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: 'absolute',
            top: '-180px',
            right: '-120px',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
            opacity: 0.6,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            left: '-80px',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6ee7b7, #34d399)',
            opacity: 0.15,
            pointerEvents: 'none',
          }}
        />

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div style={{ marginBottom: 32 }}>
            <img
              src="/logo-alhijaz.webp"
              alt="Alhijaz Indowisata"
              style={{ height: 40, objectFit: 'contain' }}
            />
          </div>

          {showForgotPassword ? (
            /* ════════════════════════════════════════════
               FORGOT PASSWORD FORM
               ════════════════════════════════════════════ */
            <div style={{ animation: 'fadeSlideIn 0.3s ease' }}>
              {forgotSuccess ? (
                /* Success state */
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      background: '#d1fae5',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 20px',
                    }}
                  >
                    <CheckCircle2 size={28} color="#10b981" />
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#064e3b', margin: '0 0 8px' }}>
                    Email Terkirim!
                  </h2>
                  <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 28px', lineHeight: 1.6 }}>
                    Jika email <strong>{forgotEmail}</strong> terdaftar, kami telah mengirimkan link untuk reset password. Cek inbox Anda.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotSuccess(false);
                      setForgotEmail('');
                      setForgotError('');
                    }}
                    style={{
                      width: '100%',
                      padding: 16,
                      background: '#065f46',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 14,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'all 0.25s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#064e3b';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(6,95,70,0.3)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#065f46';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <ArrowLeft size={18} /> Kembali ke Login
                  </button>
                </div>
              ) : (
                /* Forgot password form */
                <form onSubmit={handleForgotPassword}>
                  <h1 style={{ fontSize: 28, fontWeight: 700, color: '#064e3b', letterSpacing: '-0.5px', margin: 0 }}>
                    Lupa Password?
                  </h1>
                  <p style={{ fontSize: 14, color: '#6b7280', margin: '6px 0 32px 0' }}>
                    Masukkan email yang terdaftar, kami akan kirimkan link reset.
                  </p>

                  {/* Email Input */}
                  <div style={{ marginBottom: 16 }}>
                    <label
                      htmlFor="forgot-email"
                      style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}
                    >
                      Email
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={e => { setForgotEmail(e.target.value); setForgotError(''); }}
                        placeholder="nama@email.com"
                        required
                        autoFocus
                        className={`login-mint-input${forgotError ? ' input-error' : ''}`}
                        style={{ paddingLeft: 44 }}
                      />
                      <Mail
                        size={18}
                        style={{
                          position: 'absolute',
                          left: 14,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: '#9ca3af',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {/* Error */}
                  {forgotError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      marginBottom: 16,
                      animation: 'errorSlideIn 0.3s ease',
                    }}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
                        <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 500 }}>{forgotError}</span>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    style={{
                      width: '100%',
                      padding: 16,
                      background: '#065f46',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 14,
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: forgotLoading ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'all 0.25s ease',
                      opacity: forgotLoading ? 0.8 : 1,
                      marginBottom: 12,
                    }}
                    onMouseEnter={e => {
                      if (!forgotLoading) {
                        e.currentTarget.style.background = '#064e3b';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(6,95,70,0.3)';
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#065f46';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {forgotLoading ? (
                      <><Loader2 size={18} className="animate-spin" /> Mengirim...</>
                    ) : (
                      <>Reset Password <ArrowRight size={18} /></>
                    )}
                  </button>

                  {/* Back to login */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotError('');
                      setForgotEmail('');
                    }}
                    style={{
                      width: '100%',
                      padding: 12,
                      background: 'none',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#10b981',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      transition: 'all 0.25s ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  >
                    <ArrowLeft size={14} /> Kembali ke Login
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ════════════════════════════════════════════
               LOGIN FORM (original)
               ════════════════════════════════════════════ */
            <form
              onSubmit={handleSubmit}
              style={{ animation: 'fadeSlideIn 0.3s ease' }}
            >
              {/* Heading */}
              <h1 style={{ fontSize: 28, fontWeight: 700, color: '#064e3b', letterSpacing: '-0.5px', margin: 0 }}>
                Assalamu'alaikum
              </h1>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '6px 0 32px 0' }}>
                Bismillah, siap melayani dengan hati.
              </p>

              {/* Username */}
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="login-slug"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}
                >
                  Username
                </label>
                <input
                  ref={slugRef}
                  id="login-slug"
                  type="text"
                  value={slug}
                  onChange={e => { setSlug(e.target.value); clearError(); }}
                  onFocus={clearError}
                  placeholder="nikita"
                  autoFocus
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={`login-mint-input${inputError ? ' input-error' : ''}${shaking ? ' shake' : ''}`}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="login-password"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}
                >
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={passRef}
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); clearError(); }}
                    onFocus={clearError}
                    placeholder="••••••••"
                    required
                    className={`login-mint-input login-mint-input-pw${inputError ? ' input-error' : ''}${shaking ? ' shake' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: '#9ca3af',
                      transition: 'all 0.25s ease',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#10b981')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Error message */}
                {error && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    marginTop: 8,
                    animation: 'errorSlideIn 0.3s ease',
                  }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 500 }}>{error}</span>
                  </div>
                )}
              </div>

              {/* Options row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                {/* Checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={rememberMe}
                    onClick={() => setRememberMe(p => !p)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 6,
                      border: rememberMe ? '2px solid #10b981' : '2px solid #d1d5db',
                      background: rememberMe ? '#10b981' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'all 0.25s ease',
                      flexShrink: 0,
                    }}
                  >
                    {rememberMe && <Check size={12} strokeWidth={3} color="#fff" />}
                  </button>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>Ingat saya</span>
                </label>

                {/* Forgot password */}
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#10b981',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.25s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  Lupa password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || success}
                style={{
                  width: '100%',
                  padding: 16,
                  background: success ? '#10b981' : '#065f46',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 14,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading || success ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.25s ease',
                  opacity: loading || success ? 0.8 : 1,
                }}
                onMouseEnter={e => {
                  if (!loading && !success) {
                    e.currentTarget.style.background = '#064e3b';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(6,95,70,0.3)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = success ? '#10b981' : '#065f46';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Memproses...</>
                ) : success ? (
                  <><CheckCircle2 size={18} /> Berhasil!</>
                ) : (
                  <>Login <ArrowRight size={18} /></>
                )}
              </button>
            </form>
          )}

          {/* Footer */}
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 24 }}>
            © 2025 Alhijaz Indowisata
          </p>
        </div>
      </div>
    </>
  );
}

