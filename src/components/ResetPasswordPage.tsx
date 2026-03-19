import { useState } from 'react';
import { Eye, EyeOff, ArrowRight, Loader2, CheckCircle2, ArrowLeft, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [shaking, setShaking] = useState(false);

  const triggerError = (msg: string) => {
    setError(msg);
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      triggerError('Password minimal 6 karakter');
      return;
    }
    if (password !== confirmPassword) {
      triggerError('Password tidak cocok');
      return;
    }
    if (!token) {
      triggerError('Token reset tidak ditemukan');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoading(false);
        triggerError(data.error || 'Gagal mereset password');
        return;
      }

      setLoading(false);
      setSuccess(true);
    } catch {
      setLoading(false);
      triggerError('Gagal menghubungi server');
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        .reset-mint * { font-family: 'Outfit', sans-serif; }
        .reset-mint-input {
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
        .reset-mint-input::placeholder { color: #c8cdd3; }
        .reset-mint-input:focus {
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #10b981;
        }
        .reset-mint-input.input-error {
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 2px #ef4444;
        }
        .reset-mint-input-pw { padding-right: 48px; }
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
        @keyframes successPop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div
        className="reset-mint"
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

          {success ? (
            /* ── Success State ── */
            <div style={{ textAlign: 'center', animation: 'successPop 0.4s ease' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: '#d1fae5',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                }}
              >
                <CheckCircle2 size={32} color="#10b981" />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#064e3b', margin: '0 0 8px' }}>
                Password Berhasil Diubah
              </h1>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 28px', lineHeight: 1.6 }}>
                Password Anda telah diperbarui. Silakan login dengan password baru.
              </p>
              <button
                onClick={() => { window.location.href = '/login'; }}
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
                Login <ArrowRight size={18} />
              </button>
            </div>
          ) : !token ? (
            /* ── No Token State ── */
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: '#fef2f2',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                }}
              >
                <Lock size={32} color="#ef4444" />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#064e3b', margin: '0 0 8px' }}>
                Link Tidak Valid
              </h1>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 28px', lineHeight: 1.6 }}>
                Link reset password tidak valid atau sudah kedaluwarsa. Silakan minta link baru.
              </p>
              <button
                onClick={() => { window.location.href = '/login'; }}
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
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#065f46';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <ArrowLeft size={18} /> Kembali ke Login
              </button>
            </div>
          ) : (
            /* ── Reset Form ── */
            <form onSubmit={handleSubmit}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: '#064e3b', letterSpacing: '-0.5px', margin: 0 }}>
                Atur Password Baru
              </h1>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '6px 0 32px 0' }}>
                Masukkan password baru untuk akun Anda.
              </p>

              {/* New Password */}
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="reset-password"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}
                >
                  Password Baru
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    placeholder="Minimal 6 karakter"
                    required
                    minLength={6}
                    autoFocus
                    className={`reset-mint-input reset-mint-input-pw${error ? ' input-error' : ''}${shaking ? ' shake' : ''}`}
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
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="reset-confirm"
                  style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}
                >
                  Konfirmasi Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="Ketik ulang password"
                    required
                    minLength={6}
                    className={`reset-mint-input reset-mint-input-pw${error ? ' input-error' : ''}${shaking ? ' shake' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
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
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
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
                  <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 500 }}>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: 16,
                  background: '#065f46',
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
                  marginBottom: 16,
                }}
                onMouseEnter={e => {
                  if (!loading) {
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
                {loading ? (
                  <><Loader2 size={18} className="animate-spin" /> Memproses...</>
                ) : (
                  <>Simpan Password Baru <ArrowRight size={18} /></>
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

          {/* Footer */}
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 24 }}>
            © {new Date().getFullYear()} Alhijaz Indowisata
          </p>
        </div>
      </div>
    </>
  );
}
