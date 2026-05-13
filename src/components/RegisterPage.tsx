import { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, ArrowLeft, User, Phone, Mail } from 'lucide-react';
import { useDarkMode } from '../utils/useDarkMode';

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function RegisterPage() {
  const isDark = useDarkMode();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Set page title
  useEffect(() => { document.title = 'Buat Akun Baru - Alhijaz.co'; }, []);

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugManual) {
      setSlug(slugify(name));
    }
  }, [name, slugManual]);

  // Per-field validators (return error string or null)
  const validators: Record<string, () => string | null> = {
    name: () => {
      if (!name.trim()) return 'Nama wajib diisi';
      if (name.trim().length < 4) return 'Nama minimal 4 karakter';
      if (name.trim().length > 40) return 'Nama maksimal 40 karakter';
      if (/[^a-zA-Z\s.''-]/.test(name.trim())) return 'Nama hanya boleh huruf, spasi, titik, apostrof';
      return null;
    },
    slug: () => {
      const s = slug.trim();
      if (!s) return 'Username wajib diisi';
      if (s.length < 4) return 'Username minimal 4 karakter';
      if (s.length > 30) return 'Username maksimal 30 karakter';
      if (/^-|-$/.test(s)) return 'Tidak boleh diawali/diakhiri strip';
      if (!/^[a-z0-9-]+$/.test(s)) return 'Hanya huruf kecil, angka, dan strip';
      if (/--/.test(s)) return 'Tidak boleh ada strip ganda';
      return null;
    },
    phone: () => {
      const cleaned = phone.replace(/\D/g, '');
      if (!cleaned) return 'Nomor WhatsApp wajib diisi';
      if (!cleaned.startsWith('62')) return 'Nomor harus diawali 62 (contoh: 6281xxx)';
      if (cleaned.length < 10) return 'Nomor terlalu pendek (minimal 10 digit)';
      if (cleaned.length > 15) return 'Nomor terlalu panjang (maksimal 15 digit)';
      return null;
    },
    email: () => {
      const e = email.trim();
      if (!e) return 'Email wajib diisi';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Format email tidak valid';
      return null;
    },
    password: () => {
      if (!password) return 'Password wajib diisi';
      if (password.length < 6) return 'Password minimal 6 karakter';
      return null;
    },
  };

  const validateField = (field: string) => {
    // Skip validation if field is still empty (don't nag on first blur)
    const isEmpty = field === 'phone'
      ? !phone.replace(/\D/g, '')
      : !({ name, slug, email, password }[field as keyof typeof validators] as string)?.trim();
    if (isEmpty) return;
    const err = validators[field]?.();
    setFieldErrors(p => ({ ...p, [field]: err || '' }));
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const [key, fn] of Object.entries(validators)) {
      const err = fn();
      if (err) errors[key] = err;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          phone: phone.replace(/\D/g, '').replace(/^08/, '628'),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLoading(false);
        setError(data.error || 'Terjadi kesalahan');
        return;
      }

      setLoading(false);
      setSuccess(true);
    } catch {
      setLoading(false);
      setError('Gagal menghubungi server');
    }
  };

  const inputStyle = (hasError: boolean): string =>
    `login-mint-input${hasError ? ' input-error' : ''}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        .login-mint {
          --lm-page-bg: #f0fdf4;
          --lm-heading: #064e3b;
          --lm-subtext: #6b7280;
          --lm-label: #374151;
          --lm-input-bg: #fff;
          --lm-input-text: #111;
          --lm-input-placeholder: #c8cdd3;
          --lm-input-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
          --lm-input-shadow-focus: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #10b981;
          --lm-input-shadow-error: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #ef4444;
          --lm-icon: #9ca3af;
          --lm-button-bg: #065f46;
          --lm-button-bg-hover: #064e3b;
          --lm-button-shadow-hover: 0 8px 24px rgba(6,95,70,0.3);
          --lm-link: #10b981;
          --lm-footer: #9ca3af;
          --lm-error: #ef4444;
          --lm-success-bg: #d1fae5;
          --lm-success-icon: #10b981;
          --lm-slug-prefix: #9ca3af;
          --lm-circle1: linear-gradient(135deg, #d1fae5, #a7f3d0);
          --lm-circle1-opacity: 0.6;
          --lm-circle2: linear-gradient(135deg, #6ee7b7, #34d399);
          --lm-circle2-opacity: 0.15;
        }
        .login-mint.dark {
          --lm-page-bg: #0f172a;
          --lm-heading: #f1f5f9;
          --lm-subtext: #94a3b8;
          --lm-label: #cbd5e1;
          --lm-input-bg: #1e293b;
          --lm-input-text: #f1f5f9;
          --lm-input-placeholder: #64748b;
          --lm-input-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(148,163,184,0.1);
          --lm-input-shadow-focus: 0 1px 3px rgba(0,0,0,0.3), 0 0 0 2px #10b981;
          --lm-input-shadow-error: 0 1px 3px rgba(0,0,0,0.3), 0 0 0 2px #f87171;
          --lm-icon: #64748b;
          --lm-button-bg: #047857;
          --lm-button-bg-hover: #059669;
          --lm-button-shadow-hover: 0 8px 24px rgba(4,120,87,0.4);
          --lm-link: #34d399;
          --lm-footer: #64748b;
          --lm-error: #f87171;
          --lm-success-bg: rgba(16,185,129,0.15);
          --lm-success-icon: #34d399;
          --lm-slug-prefix: #64748b;
          --lm-circle1: linear-gradient(135deg, #064e3b, #065f46);
          --lm-circle1-opacity: 0.3;
          --lm-circle2: linear-gradient(135deg, #065f46, #047857);
          --lm-circle2-opacity: 0.18;
        }
        .login-mint * { font-family: 'Outfit', sans-serif; }
        .login-mint-input {
          width: 100%;
          padding: 14px 16px;
          border: none;
          background: var(--lm-input-bg);
          border-radius: 14px;
          box-shadow: var(--lm-input-shadow);
          font-size: 15px;
          font-weight: 500;
          color: var(--lm-input-text);
          outline: none;
          transition: all 0.25s ease;
        }
        .login-mint-input::placeholder { color: var(--lm-input-placeholder); }
        .login-mint-input:focus {
          box-shadow: var(--lm-input-shadow-focus);
        }
        .login-mint-input.input-error {
          box-shadow: var(--lm-input-shadow-error);
        }
        .login-mint-input.input-error:focus {
          box-shadow: var(--lm-input-shadow-error);
        }
        .login-mint-input-pw { padding-right: 48px; }
        .login-mint-circle-1 {
          position: absolute;
          top: -180px;
          right: -120px;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: var(--lm-circle1);
          opacity: var(--lm-circle1-opacity);
          pointer-events: none;
        }
        .login-mint-circle-2 {
          position: absolute;
          bottom: -100px;
          left: -80px;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          background: var(--lm-circle2);
          opacity: var(--lm-circle2-opacity);
          pointer-events: none;
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes errorSlideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className={`login-mint${isDark ? ' dark' : ''}`}
        style={{
          minHeight: '100vh',
          background: 'var(--lm-page-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles */}
        <div className="login-mint-circle-1" />
        <div className="login-mint-circle-2" />

        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div style={{ marginBottom: 32, display: 'flex', justifyContent: success ? 'center' : 'flex-start' }}>
            <img
              src="/logo-alhijaz.webp"
              alt="Alhijaz Indowisata"
              style={{ height: 40, objectFit: 'contain' }}
            />
          </div>

          {success ? (
            /* ════════ SUCCESS SCREEN ════════ */
            <div style={{ textAlign: 'center', animation: 'fadeSlideIn 0.3s ease' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  background: 'var(--lm-success-bg)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                }}
              >
                <CheckCircle2 size={28} color={isDark ? '#34d399' : '#10b981'} />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--lm-heading)', margin: '0 0 8px' }}>
                Pendaftaran Berhasil!
              </h2>
              <p style={{ fontSize: 14, color: 'var(--lm-subtext)', margin: '0 0 28px', lineHeight: 1.6 }}>
                Akun Anda sedang menunggu persetujuan admin. Anda akan bisa login setelah akun disetujui.
              </p>
              <button
                type="button"
                onClick={() => { window.location.href = '/login'; }}
                style={{
                  width: '100%',
                  padding: 16,
                  background: 'var(--lm-button-bg)',
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
                  e.currentTarget.style.background = 'var(--lm-button-bg-hover)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = 'var(--lm-button-shadow-hover)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--lm-button-bg)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <ArrowLeft size={18} /> Kembali ke Login
              </button>
            </div>
          ) : (
            /* ════════ REGISTER FORM ════════ */
            <form onSubmit={handleSubmit} style={{ animation: 'fadeSlideIn 0.3s ease' }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--lm-heading)', letterSpacing: '-0.5px', margin: 0 }}>
                Buat Akun Baru
              </h1>
              <p style={{ fontSize: 14, color: 'var(--lm-subtext)', margin: '6px 0 28px 0' }}>
                Platform Cerdas untuk Agent Umroh Modern
              </p>

              {/* Nama */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--lm-label)', marginBottom: 6 }}>
                  Nama Lengkap
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); setFieldErrors(p => ({ ...p, name: '' })); }}
                    onBlur={() => validateField('name')}
                    placeholder="Dwi Puji Hastuti"
                    required
                    autoFocus
                    className={inputStyle(!!fieldErrors.name)}
                    style={{ paddingLeft: 44 }}
                  />
                  <User size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--lm-icon)', pointerEvents: 'none' }} />
                </div>
                {fieldErrors.name && <p style={{ fontSize: 12, color: 'var(--lm-error)', marginTop: 4 }}>{fieldErrors.name}</p>}
              </div>

              {/* Slug */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--lm-label)', marginBottom: 6 }}>
                  Username (Slug)
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--lm-input-bg)',
                  borderRadius: 14,
                  boxShadow: fieldErrors.slug
                    ? 'var(--lm-input-shadow-error)'
                    : 'var(--lm-input-shadow)',
                  overflow: 'hidden',
                  transition: 'all 0.25s ease',
                }}>
                  <span style={{
                    padding: '14px 0 14px 16px',
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--lm-slug-prefix)',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    pointerEvents: 'none',
                  }}>
                    alhijaz.co/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={e => {
                      setSlugManual(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      setFieldErrors(p => ({ ...p, slug: '' }));
                    }}
                    onBlur={() => validateField('slug')}
                    placeholder="dwi"
                    required
                    style={{
                      flex: 1,
                      padding: '14px 16px 14px 0',
                      border: 'none',
                      background: 'transparent',
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--lm-input-text)',
                      outline: 'none',
                    }}
                  />
                </div>
                {fieldErrors.slug && <p style={{ fontSize: 12, color: 'var(--lm-error)', marginTop: 4 }}>{fieldErrors.slug}</p>}
              </div>

              {/* WhatsApp */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--lm-label)', marginBottom: 6 }}>
                  Nomor WhatsApp
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => {
                      let v = e.target.value.replace(/\D/g, '');
                      if (v.startsWith('0')) v = '62' + v.substring(1);
                      setPhone(v);
                      setFieldErrors(p => ({ ...p, phone: '' }));
                    }}
                    onBlur={() => validateField('phone')}
                    placeholder="628xxxxxxxxxx"
                    required
                    className={inputStyle(!!fieldErrors.phone)}
                    style={{ paddingLeft: 44 }}
                  />
                  <Phone size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--lm-icon)', pointerEvents: 'none' }} />
                </div>
                {fieldErrors.phone && <p style={{ fontSize: 12, color: 'var(--lm-error)', marginTop: 4 }}>{fieldErrors.phone}</p>}
              </div>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--lm-label)', marginBottom: 6 }}>
                  Email
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); }}
                    onBlur={() => validateField('email')}
                    placeholder="nama@email.com"
                    required
                    className={inputStyle(!!fieldErrors.email)}
                    style={{ paddingLeft: 44 }}
                  />
                  <Mail size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--lm-icon)', pointerEvents: 'none' }} />
                </div>
                {fieldErrors.email && <p style={{ fontSize: 12, color: 'var(--lm-error)', marginTop: 4 }}>{fieldErrors.email}</p>}
              </div>

              {/* Password (visible by default, with show/hide toggle) */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--lm-label)', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); }}
                    onBlur={() => validateField('password')}
                    placeholder="Minimal 6 karakter"
                    required
                    autoComplete="off"
                    className={`${inputStyle(!!fieldErrors.password)} login-mint-input-pw`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      color: 'var(--lm-icon)', transition: 'all 0.25s ease', display: 'flex', alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--lm-link)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--lm-icon)')}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.password && <p style={{ fontSize: 12, color: 'var(--lm-error)', marginTop: 4 }}>{fieldErrors.password}</p>}
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, marginBottom: 16, animation: 'errorSlideIn 0.3s ease',
                }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--lm-error)' }}>
                    <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span style={{ fontSize: 13, color: 'var(--lm-error)', fontWeight: 500 }}>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: 16,
                  background: 'var(--lm-button-bg)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 14,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.25s ease',
                  opacity: loading ? 0.8 : 1,
                  marginBottom: 12,
                }}
                onMouseEnter={e => {
                  if (!loading) {
                    e.currentTarget.style.background = 'var(--lm-button-bg-hover)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = 'var(--lm-button-shadow-hover)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--lm-button-bg)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Mendaftar...</>
                ) : (
                  <>Daftar <ArrowRight size={18} /></>
                )}
              </button>

              {/* Back to login */}
              <button
                type="button"
                onClick={() => { window.location.href = '/login'; }}
                style={{
                  width: '100%',
                  padding: 12,
                  background: 'none',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--lm-link)',
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
                <ArrowLeft size={14} /> Sudah punya akun? Login
              </button>
            </form>
          )}

          {/* Footer */}
          <p style={{ fontSize: 12, color: 'var(--lm-footer)', textAlign: 'center', marginTop: 24 }}>
            &copy; {new Date().getFullYear()} Alhijaz Indowisata
          </p>
        </div>
      </div>
    </>
  );
}
