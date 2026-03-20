import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──

interface CapiConfig {
  pixelId: string;
  accessToken: string;
  testEventCode: string;
  testMode: boolean;
  events: Record<string, { enabled: boolean; eventName: string; customEventName?: string }>;
  updatedAt: string;
}

type ConnectionStatus = 'unconfigured' | 'connected' | 'error' | 'checking';

const META_EVENTS = [
  'PageView', 'Search', 'ViewContent', 'Contact', 'Lead',
  'CompleteRegistration', 'AddToCart', 'AddToWishlist',
  'InitiateCheckout', 'Purchase', 'Subscribe', 'CustomEvent',
] as const;

const EVENT_DEFINITIONS = [
  { key: 'pageView', label: 'User Cek Jadwal', desc: 'Ketika user membuka halaman utama jadwal agent', defaultEvent: 'PageView' },
  { key: 'search', label: 'User Search', desc: 'Ketika user menggunakan fitur search/filter paket', defaultEvent: 'Search' },
  { key: 'viewContent', label: 'User Interaksi Konten', desc: 'Ketika user download brosur, itinerary, simpan, hitung, compare, atau bagikan', defaultEvent: 'ViewContent' },
  { key: 'contact', label: 'User Klik WhatsApp/CTA', desc: 'Ketika user klik tombol WhatsApp atau CTA hubungi agent', defaultEvent: 'Contact' },
] as const;

const DEFAULT_CONFIG: CapiConfig = {
  pixelId: '',
  accessToken: '',
  testEventCode: '',
  testMode: false,
  events: Object.fromEntries(
    EVENT_DEFINITIONS.map(e => [e.key, { enabled: true, eventName: e.defaultEvent }])
  ),
  updatedAt: '',
};

// ── Meta Event Icons (inline SVG paths) ──
const META_EVENT_ICONS: Record<string, JSX.Element> = {
  PageView: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  ViewContent: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Contact: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
  Lead: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
  CompleteRegistration: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  AddToCart: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>,
  AddToWishlist: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  InitiateCheckout: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Purchase: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  Subscribe: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  CustomEvent: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

// ── Custom Event Dropdown Component ──
function EventDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="capi-dropdown" ref={ref}>
      <button type="button" className="capi-dropdown-trigger" onClick={() => setOpen(!open)}>
        <span className="capi-dropdown-icon">{META_EVENT_ICONS[value] || META_EVENT_ICONS.CustomEvent}</span>
        <span className="capi-dropdown-value">{value}</span>
        <svg className="capi-dropdown-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div className="capi-dropdown-menu">
          {META_EVENTS.map(me => (
            <button
              key={me}
              type="button"
              className={`capi-dropdown-option${me === value ? ' capi-dropdown-active' : ''}`}
              onClick={() => { onChange(me); setOpen(false); }}
            >
              <span className="capi-dropdown-icon">{META_EVENT_ICONS[me]}</span>
              <span>{me}</span>
              {me === value && (
                <svg className="capi-dropdown-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export default function CapiPage({ agentSlug, hideHeader = false, embedded = false }: { agentSlug: string; hideHeader?: boolean; embedded?: boolean }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [agentName, setAgentName] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('darkMode', next.toString());
      return next;
    });
  }, []);

  // Check stored session on mount (check both storages)
  // When accessed from dashboard (hideHeader=true or embedded=true), auto-bypass login
  useEffect(() => {
    if (hideHeader || embedded) {
      // Already authenticated via dashboard — skip CAPI login
      setIsLoggedIn(true);
    } else {
      const sessionKey = `capi_session_${agentSlug}`;
      if (localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey)) {
        setIsLoggedIn(true);
      }
    }
    import('@/data/agents').then(mod => {
      const agent = mod.AGENTS_DATA[agentSlug];
      if (agent) setAgentName(agent.name);
    });
    setIsLoading(false);
  }, [agentSlug]);

  const handleLogin = (remember: boolean) => {
    const key = `capi_session_${agentSlug}`;
    if (remember) {
      localStorage.setItem(key, 'true');
    } else {
      sessionStorage.setItem(key, 'true');
    }
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    const key = `capi_session_${agentSlug}`;
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    setIsLoggedIn(false);
  };

  const darkClass = isDarkMode ? ' capi-dark' : '';

  if (isLoading) return <><div className={`capi-page capi-center${darkClass}`}><div className="capi-spinner" /></div><style>{capiStyles}</style></>;

  return (
    <>
      {isLoggedIn
        ? <SettingsPage agentSlug={agentSlug} agentName={agentName} isDark={isDarkMode} onToggleDark={toggleDarkMode} onLogout={handleLogout} hideHeader={hideHeader} />
        : <LoginPage agentSlug={agentSlug} agentName={agentName} isDark={isDarkMode} onToggleDark={toggleDarkMode} onLogin={handleLogin} />
      }
      <style>{capiStyles}</style>
    </>
  );
}

// ── Login Page ──

function LoginPage({ agentSlug, agentName, isDark, onToggleDark, onLogin }: { agentSlug: string; agentName: string; isDark: boolean; onToggleDark: () => void; onLogin: (remember: boolean) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/capi/${agentSlug}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setLoading(false);
        setSuccess(true);
        setTimeout(() => onLogin(rememberMe), 1000);
      } else {
        setError('Password salah. Silakan coba lagi.');
        setLoading(false);
      }
    } catch {
      setError('Gagal menghubungi server. Coba lagi nanti.');
      setLoading(false);
    }
  };

  return (
    <div className={`capi-page capi-center${isDark ? ' capi-dark' : ''}`}>
      {/* Dark mode toggle */}
      <button type="button" className="capi-theme-toggle" onClick={onToggleDark} title={isDark ? 'Light mode' : 'Dark mode'}>
        {isDark ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        )}
      </button>

      <form className="capi-login-card" onSubmit={handleSubmit}>
        <div className="capi-login-logo">
          <img src="/meta-logo.webp" alt="Alhijaz" className="capi-logo-img" loading="eager" />
        </div>
        <h1 className="capi-login-title">Meta CAPI Settings</h1>
        <p className="capi-login-subtitle">
          {agentName ? `Login sebagai ${agentName}` : `Agent: ${agentSlug}`}
        </p>

        <div className="capi-field">
          <label className="capi-label" htmlFor="capi-password">Password</label>
          <input
            id="capi-password"
            type="password"
            className="capi-input"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Masukkan password"
            autoFocus
            required
          />
        </div>

        {error && <div className="capi-alert capi-alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <label className="capi-remember">
          <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
          <span className="capi-remember-check" />
          <span className="capi-remember-text">Ingat Selamanya</span>
        </label>

        <button type="submit" className={`capi-btn capi-btn-primary capi-btn-save${success ? ' capi-btn-saved' : ''}`} disabled={loading || success}>
          {loading ? (
            <><span className="capi-spinner-sm" /> Memproses...</>
          ) : success ? (
            <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="capi-save-check"><polyline points="20 6 9 17 4 12"/></svg> Berhasil!</>
          ) : (
            'Login'
          )}
        </button>
      </form>
    </div>
  );
}

// ── Settings Page ──

function SettingsPage({ agentSlug, agentName, isDark, onToggleDark, onLogout, hideHeader = false }: { agentSlug: string; agentName: string; isDark: boolean; onToggleDark: () => void; onLogout: () => void; hideHeader?: boolean }) {
  const [config, setConfig] = useState<CapiConfig>(DEFAULT_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('unconfigured');
  const [configLoaded, setConfigLoaded] = useState(false);


  // Load existing config
  useEffect(() => {
    fetch(`/api/capi/${agentSlug}/config`)
      .then(r => r.json())
      .then(async data => {
        if (data.config) {
          setConfig(data.config);
          // Validate connection with real Meta API
          if (data.config.pixelId && data.config.accessToken) {
            setStatus('checking');
            try {
              const valRes = await fetch(`/api/capi/${agentSlug}/validate`, { method: 'POST' });
              const valData = await valRes.json();
              setStatus(valData.valid ? 'connected' : 'error');
            } catch {
              setStatus('error');
            }
          }
        }
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  }, [agentSlug]);

  // Show toast
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Update config helper
  const updateConfig = (partial: Partial<CapiConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  };

  const updateEvent = (key: string, field: string, value: any) => {
    const def = EVENT_DEFINITIONS.find(e => e.key === key);
    const fallback = { enabled: true, eventName: def?.defaultEvent || 'PageView' };
    setConfig(prev => ({
      ...prev,
      events: {
        ...prev.events,
        [key]: { ...fallback, ...prev.events[key], [field]: value },
      },
    }));
  };

  // Save config
  const handleSave = async () => {
    // Validation
    if (!config.pixelId.trim()) {
      showToast('Pixel ID wajib diisi', 'error');
      return;
    }
    // Access token always required
    if (!config.accessToken.trim()) {
      showToast('Access Token wajib diisi', 'error');
      return;
    }

    setSaving(true);
    setStatus('checking');

    try {
      // Step 1: Save config first (so validate endpoint can read it)
      const res = await fetch(`/api/capi/${agentSlug}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Gagal menyimpan konfigurasi', 'error');
        setStatus('error');
        setSaving(false);
        return;
      }

      // Keep the token in the textarea
      if (data.savedToken) {
        setConfig(prev => ({ ...prev, accessToken: data.savedToken }));
      }

      // Step 2: Validate credentials against Meta API
      try {
        const valRes = await fetch(`/api/capi/${agentSlug}/validate`, { method: 'POST' });
        const valData = await valRes.json();
        if (valData.valid) {
          setStatus('connected');
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
          showToast('Konfigurasi disimpan & Pixel tervalidasi! Koneksi aktif.', 'success');
        } else {
          setStatus('error');
          showToast('Konfigurasi disimpan, tapi Pixel ID atau Access Token tidak valid.', 'error');
        }
      } catch {
        setStatus('error');
        showToast('Konfigurasi disimpan, tapi gagal memvalidasi koneksi ke Meta.', 'error');
      }
    } catch {
      showToast('Gagal menghubungi server', 'error');
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  if (!configLoaded) return <div className={`capi-page capi-center${isDark ? ' capi-dark' : ''}`}><div className="capi-spinner" /></div>;

  return (
    <div className={`capi-page${isDark ? ' capi-dark' : ''}`}>
      {/* Toast notification */}
      {toast && (
        <div className={`capi-toast ${toast.type === 'success' ? 'capi-toast-success' : 'capi-toast-error'}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      {!hideHeader && (
      <header className="capi-header">
        <div className="capi-header-left">
          <img src="/meta-logo.webp" alt="Meta" className="capi-header-logo" loading="eager" />
        </div>
        <div className="capi-header-right">
          <button type="button" className="capi-header-theme" onClick={onToggleDark} title={isDark ? 'Light mode' : 'Dark mode'}>
            {isDark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            )}
          </button>
          <button className="capi-header-logout" onClick={onLogout}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </button>
        </div>
      </header>
      )}

      <div className="capi-content">
        {/* Section 1: Meta Credentials */}
        <section className="capi-card">
          <h2 className="capi-card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Meta Credentials
          </h2>
          <p className="capi-card-desc">Masukkan Pixel ID dan Access Token dari Meta Business Manager.</p>

          <div className="capi-field">
            <label className="capi-label" htmlFor="pixelId">
              Pixel ID <span className="capi-required">*</span>
            </label>
            <input
              id="pixelId"
              type="text"
              className="capi-input"
              value={config.pixelId}
              onChange={e => updateConfig({ pixelId: e.target.value })}
              placeholder="Contoh: 123456789012345"
            />
            <span className="capi-help">Pixel ID dapat ditemukan di Meta Events Manager &gt; Data Sources.</span>
          </div>

          <div className="capi-field">
            <label className="capi-label" htmlFor="accessToken">
              Access Token <span className="capi-required">*</span>
            </label>
            <textarea
              id="accessToken"
              className="capi-input capi-textarea"
              value={config.accessToken}
              onChange={e => updateConfig({ accessToken: e.target.value })}
              placeholder="EAABxxxxxxx..."
              rows={3}
            />
            <span className="capi-help">Generate token di Meta Events Manager &gt; Settings &gt; Conversions API.</span>
          </div>

          {/* Advanced: Test Event Code (accordion) */}
          <button
            type="button"
            className={`capi-accordion-btn${showAdvanced ? ' capi-accordion-open' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Opsi Lanjutan
            </span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showAdvanced && (
            <div className="capi-field" style={{ marginTop: 12 }}>
              <label className="capi-label" htmlFor="testEventCode">Test Event Code</label>
              <input
                id="testEventCode"
                type="text"
                className="capi-input"
                value={config.testEventCode}
                onChange={e => updateConfig({ testEventCode: e.target.value })}
                placeholder="Contoh: TEST12345 (opsional)"
              />
              <span className="capi-help">Gunakan kode ini untuk menguji event di Meta Events Manager &gt; Test Events.</span>
            </div>
          )}
        </section>

        {/* Section 2: Event Mapping */}
        <section className="capi-card">
          <h2 className="capi-card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Event Mapping
          </h2>
          <p className="capi-card-desc">Pilih event mana yang ingin di-track dan mapping ke event Meta.</p>

          <div className="capi-event-list">
            {EVENT_DEFINITIONS.map(evt => {
              const eventConfig = config.events[evt.key] || { enabled: true, eventName: evt.defaultEvent };
              return (
                <div key={evt.key} className="capi-event-item">
                  <div className="capi-event-header">
                    <label className="capi-toggle">
                      <input
                        type="checkbox"
                        checked={eventConfig.enabled}
                        onChange={e => updateEvent(evt.key, 'enabled', e.target.checked)}
                      />
                      <span className="capi-toggle-slider" />
                    </label>
                    <div className="capi-event-info">
                      <span className="capi-event-label">{evt.label}</span>
                      <span className="capi-event-desc">{evt.desc}</span>
                    </div>
                  </div>
                  {eventConfig.enabled && (
                    <div className="capi-event-config">
                      <EventDropdown
                        value={eventConfig.eventName}
                        onChange={v => updateEvent(evt.key, 'eventName', v)}
                      />
                      {eventConfig.eventName === 'CustomEvent' && (
                        <input
                          type="text"
                          className="capi-input capi-mt-sm"
                          placeholder="Nama custom event"
                          value={eventConfig.customEventName || ''}
                          onChange={e => updateEvent(evt.key, 'customEventName', e.target.value)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3: Mode & Status */}
        <section className="capi-card">
          <h2 className="capi-card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Mode & Status
          </h2>

          {/* Segmented Mode Toggle */}
          <div className="capi-mode-toggle">
            <button
              type="button"
              className={`capi-mode-btn capi-mode-test${config.testMode ? ' capi-mode-active' : ''}`}
              onClick={() => updateConfig({ testMode: true })}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
              <div className="capi-mode-text">
                <span className="capi-mode-label">Test Mode</span>
                <span className="capi-mode-desc">Event dikirim ke Test Events</span>
              </div>
            </button>
            <button
              type="button"
              className={`capi-mode-btn capi-mode-live${!config.testMode ? ' capi-mode-active' : ''}`}
              onClick={() => updateConfig({ testMode: false })}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <div className="capi-mode-text">
                <span className="capi-mode-label">Live Mode</span>
                <span className="capi-mode-desc">Event dikirim secara live</span>
              </div>
            </button>
          </div>

          {config.testMode && !config.testEventCode && (
            <div className="capi-alert capi-alert-warning" style={{ marginTop: 12 }}>
              ⚠️ Test Mode aktif tapi Test Event Code belum diisi. Event tidak akan muncul di Test Events.
            </div>
          )}

          {/* Status Koneksi */}
          <div className="capi-status-section">
            <span className="capi-label" style={{ marginBottom: 8 }}>Status Koneksi</span>
            {status === 'unconfigured' && (
              <div className="capi-status-card capi-status-card-warn">
                <div className="capi-status-icon-wrap capi-status-icon-warn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div>
                  <div className="capi-status-card-title">Belum dikonfigurasi</div>
                  <div className="capi-status-card-desc">Isi Pixel ID dan Access Token lalu simpan.</div>
                </div>
              </div>
            )}
            {status === 'checking' && (
              <div className="capi-status-card capi-status-card-info">
                <div className="capi-status-icon-wrap capi-status-icon-info">
                  <span className="capi-spinner-sm" />
                </div>
                <div>
                  <div className="capi-status-card-title">Memeriksa koneksi...</div>
                  <div className="capi-status-card-desc">Harap tunggu sebentar.</div>
                </div>
              </div>
            )}
            {status === 'connected' && (
              <div className="capi-status-card capi-status-card-ok">
                <div className="capi-status-icon-wrap capi-status-icon-ok">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <div>
                  <div className="capi-status-card-title">Connected</div>
                  <div className="capi-status-card-desc">Pixel aktif dan siap menerima event.</div>
                </div>
              </div>
            )}
            {status === 'error' && (
              <div className="capi-status-card capi-status-card-err">
                <div className="capi-status-icon-wrap capi-status-icon-err">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </div>
                <div>
                  <div className="capi-status-card-title">Error</div>
                  <div className="capi-status-card-desc">Pixel ID atau Access Token tidak valid.</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Save Button */}
        <div className="capi-actions">
          <button
            className={`capi-btn capi-btn-primary capi-btn-lg capi-btn-save${saved ? ' capi-btn-saved' : ''}`}
            onClick={handleSave}
            disabled={saving || saved}
          >
            {saving ? (
              <><span className="capi-spinner-sm" /> Menyimpan...</>
            ) : saved ? (
              <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="capi-save-check"><polyline points="20 6 9 17 4 12"/></svg> Tersimpan!</>
            ) : (
              <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Konfigurasi</>
            )}
          </button>
        </div>

        {/* Reset Button */}
        <div className="capi-actions" style={{ paddingTop: 12 }}>
          <button
            type="button"
            className="capi-btn capi-btn-reset"
            onClick={async () => {
              if (!window.confirm('Apakah Anda yakin ingin mereset Pixel ID dan Access Token? Data akan dihapus permanen.')) return;
              try {
                const res = await fetch(`/api/capi/${agentSlug}/config`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) {
                  setConfig(prev => ({ ...prev, pixelId: '', accessToken: '', testEventCode: '' }));
                  setStatus('unconfigured');
                  showToast('Pixel ID dan Access Token berhasil direset.', 'success');
                } else {
                  showToast('Gagal mereset konfigurasi.', 'error');
                }
              } catch {
                showToast('Gagal menghubungi server.', 'error');
              }
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Reset Pixel & Token
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──

const capiStyles = `
/* ── Base / Reset ── */
.capi-page {
  min-height: 100vh;
  background: linear-gradient(to bottom, #f9fafb, #f3f4f6);
  color: #1f2937;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  position: relative;
}
.capi-page.capi-dark {
  background: #0f172a;
  color: #e2e8f0;
}
.capi-center {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* ── Theme Toggle (Login page - absolute top-right) ── */
.capi-theme-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.7);
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(8px);
  z-index: 10;
}
.capi-theme-toggle:hover { background: rgba(255,255,255,0.95); color: #374151; }
.capi-dark .capi-theme-toggle {
  border-color: rgba(148,163,184,0.15);
  background: rgba(30,41,59,0.7);
  color: #94a3b8;
}
.capi-dark .capi-theme-toggle:hover { background: rgba(30,41,59,0.95); color: #e2e8f0; }

/* ── Login Card ── */
.capi-login-card {
  background: #ffffff;
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 16px;
  padding: 40px 32px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04);
}
.capi-dark .capi-login-card {
  background: linear-gradient(145deg, #1e293b, #1a2332);
  border-color: rgba(148,163,184,0.1);
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}
.capi-login-logo {
  text-align: center;
  margin-bottom: 24px;
}
.capi-logo-img {
  height: 36px;
  display: block;
  margin: 0 auto;
  object-fit: contain;
}
.capi-login-title {
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  color: #111827;
  margin: 0 0 6px;
}
.capi-dark .capi-login-title { color: #f1f5f9; }
.capi-login-subtitle {
  font-size: 14px;
  color: #6b7280;
  text-align: center;
  margin: 0 0 28px;
}
.capi-dark .capi-login-subtitle { color: #94a3b8; }

/* ── Remember Me ── */
.capi-remember {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 16px;
  user-select: none;
}
.capi-remember input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.capi-remember-check {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid #d1d5db;
  background: #f9fafb;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  position: relative;
}
.capi-dark .capi-remember-check {
  border-color: #475569;
  background: #1e293b;
}
.capi-remember-check::after {
  content: '';
  display: none;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: -1px;
}
.capi-remember input:checked ~ .capi-remember-check {
  background: #16a34a;
  border-color: #16a34a;
}
.capi-dark .capi-remember input:checked ~ .capi-remember-check {
  background: #22c55e;
  border-color: #22c55e;
}
.capi-remember input:checked ~ .capi-remember-check::after {
  display: block;
}
.capi-remember-text {
  font-size: 13px;
  color: #6b7280;
}
.capi-dark .capi-remember-text { color: #94a3b8; }

/* ── Header ── */
.capi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(0,0,0,0.06);
  position: sticky;
  top: 0;
  z-index: 50;
}
.capi-dark .capi-header {
  background: rgba(15,23,42,0.88);
  border-bottom-color: rgba(148,163,184,0.08);
}
.capi-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.capi-header-logo-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.capi-dark .capi-header-logo-wrap {
}
.capi-header-logo {
  height: 28px;
  object-fit: contain;
}
.capi-header-info {
  min-width: 0;
}
.capi-header-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  margin: 0;
  line-height: 1.2;
  display: flex;
  align-items: center;
  gap: 6px;
}
.capi-header-title svg {
  color: #16a34a;
  flex-shrink: 0;
}
.capi-dark .capi-header-title { color: #f1f5f9; }
.capi-dark .capi-header-title svg { color: #4ade80; }
.capi-header-subtitle {
  font-size: 12px;
  color: #6b7280;
  margin: 2px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.capi-dark .capi-header-subtitle { color: #64748b; }
.capi-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.capi-header-theme {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.06);
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}
.capi-header-theme:hover { background: rgba(0,0,0,0.04); color: #374151; }
.capi-dark .capi-header-theme {
  border-color: rgba(148,163,184,0.1);
  color: #94a3b8;
}
.capi-dark .capi-header-theme:hover { background: rgba(148,163,184,0.08); color: #e2e8f0; }
.capi-header-logout {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: #6b7280;
  background: transparent;
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.capi-header-logout:hover { color: #ef4444; border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.04); }
.capi-dark .capi-header-logout {
  color: #94a3b8;
  border-color: rgba(148,163,184,0.1);
}
.capi-dark .capi-header-logout:hover { color: #f87171; border-color: rgba(239,68,68,0.2); background: rgba(239,68,68,0.06); }

/* ── Content ── */
.capi-content {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Card ── */
.capi-card {
  background: #ffffff;
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.capi-dark .capi-card {
  background: linear-gradient(145deg, #1e293b, #1a2332);
  border-color: rgba(148,163,184,0.08);
  box-shadow: none;
}
.capi-card-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.capi-dark .capi-card-title { color: #f1f5f9; }
.capi-card-title svg {
  color: #16a34a;
  flex-shrink: 0;
}
.capi-dark .capi-card-title svg { color: #4ade80; }
.capi-card-desc {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 20px;
  padding-left: 30px;
}
.capi-dark .capi-card-desc { color: #94a3b8; }

/* ── Form Fields ── */
.capi-field {
  margin-bottom: 18px;
}
.capi-field:last-child {
  margin-bottom: 0;
}
.capi-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}
.capi-dark .capi-label { color: #cbd5e1; }
.capi-required {
  color: #ef4444;
}
.capi-dark .capi-required { color: #f87171; }
.capi-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  color: #1f2937;
  background: #f9fafb;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}
.capi-dark .capi-input {
  color: #e2e8f0;
  background: #0f172a;
  border-color: rgba(148,163,184,0.15);
}
.capi-input:focus {
  border-color: #16a34a;
  box-shadow: 0 0 0 3px rgba(22,163,74,0.1);
}
.capi-dark .capi-input:focus {
  border-color: #4ade80;
  box-shadow: 0 0 0 3px rgba(74,222,128,0.12);
}
.capi-input::placeholder {
  color: #9ca3af;
}
.capi-dark .capi-input::placeholder { color: #64748b; }
.capi-input-group {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.capi-input-group .capi-input {
  flex: 1;
}
.capi-help {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 5px;
}
.capi-dark .capi-help { color: #64748b; }
.capi-select {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  color: #1f2937;
  background: #f9fafb;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 8px;
  outline: none;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}
.capi-dark .capi-select {
  color: #e2e8f0;
  background-color: #0f172a;
  border-color: rgba(148,163,184,0.15);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
}
.capi-select:focus {
  border-color: #16a34a;
  box-shadow: 0 0 0 3px rgba(22,163,74,0.1);
}
.capi-dark .capi-select:focus {
  border-color: #4ade80;
  box-shadow: 0 0 0 3px rgba(74,222,128,0.12);
}
/* ── Textarea ── */
.capi-textarea {
  resize: vertical;
  min-height: 70px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

/* ── Custom Dropdown ── */
.capi-dropdown {
  position: relative;
}
.capi-dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  color: #1f2937;
  background: #ffffff;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  text-align: left;
}
.capi-dark .capi-dropdown-trigger {
  color: #e2e8f0;
  background: #0f172a;
  border-color: rgba(148,163,184,0.15);
}
.capi-dropdown-trigger:hover {
  border-color: #16a34a;
}
.capi-dark .capi-dropdown-trigger:hover {
  border-color: #4ade80;
}
.capi-dropdown-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(22,163,74,0.08);
  color: #16a34a;
  flex-shrink: 0;
}
.capi-dark .capi-dropdown-icon {
  background: rgba(74,222,128,0.1);
  color: #4ade80;
}
.capi-dropdown-value {
  flex: 1;
  font-weight: 500;
}
.capi-dropdown-chevron {
  color: #9ca3af;
  flex-shrink: 0;
}
.capi-dark .capi-dropdown-chevron { color: #64748b; }
.capi-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 10px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.06);
  z-index: 60;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  animation: capi-dropdown-in 0.15s ease;
}
.capi-dark .capi-dropdown-menu {
  background: #1e293b;
  border-color: rgba(148,163,184,0.1);
  box-shadow: 0 12px 36px rgba(0,0,0,0.4);
}
@keyframes capi-dropdown-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.capi-dropdown-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: #374151;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
}
.capi-dark .capi-dropdown-option { color: #cbd5e1; }
.capi-dropdown-option:hover {
  background: #f3f4f6;
}
.capi-dark .capi-dropdown-option:hover {
  background: rgba(148,163,184,0.08);
}
.capi-dropdown-option.capi-dropdown-active {
  background: rgba(22,163,74,0.06);
  color: #16a34a;
}
.capi-dark .capi-dropdown-option.capi-dropdown-active {
  background: rgba(74,222,128,0.08);
  color: #4ade80;
}
.capi-dropdown-option.capi-dropdown-active .capi-dropdown-icon {
  background: #16a34a;
  color: #fff;
}
.capi-dark .capi-dropdown-option.capi-dropdown-active .capi-dropdown-icon {
  background: #22c55e;
  color: #052e16;
}
.capi-dropdown-check {
  margin-left: auto;
  color: #16a34a;
  flex-shrink: 0;
}
.capi-dark .capi-dropdown-check { color: #4ade80; }

/* ── Accordion ── */
.capi-accordion-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 11px 14px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: #6b7280;
  background: #fff;
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s;
  margin-top: 8px;
}
.capi-accordion-btn:hover { background: #f9fafb; color: #374151; }
.capi-accordion-btn.capi-accordion-open {
  color: #16a34a;
  border-color: rgba(22,163,74,0.2);
  background: #f0fdf4;
}
.capi-dark .capi-accordion-btn {
  color: #94a3b8;
  background: rgba(15,23,42,0.5);
  border-color: rgba(148,163,184,0.08);
}
.capi-dark .capi-accordion-btn:hover { background: rgba(15,23,42,0.8); color: #e2e8f0; }
.capi-dark .capi-accordion-btn.capi-accordion-open {
  color: #4ade80;
  border-color: rgba(74,222,128,0.15);
  background: rgba(34,197,94,0.06);
}

/* Reset button */
.capi-btn-reset {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 24px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: #9ca3af;
  background: transparent;
  border: 1px dashed rgba(0,0,0,0.1);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.capi-btn-reset:hover {
  color: #ef4444;
  border-color: rgba(239,68,68,0.3);
  background: rgba(239,68,68,0.04);
}
.capi-dark .capi-btn-reset {
  color: #64748b;
  border-color: rgba(148,163,184,0.1);
}
.capi-dark .capi-btn-reset:hover {
  color: #f87171;
  border-color: rgba(239,68,68,0.25);
  background: rgba(239,68,68,0.06);
}


.capi-mt-sm {
  margin-top: 8px;
}

/* ── Buttons ── */
.capi-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.capi-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.capi-btn-primary {
  background: linear-gradient(135deg, #16a34a, #15803d);
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(22,163,74,0.2);
  width: 100%;
}
.capi-dark .capi-btn-primary {
  background: linear-gradient(135deg, #4ade80, #22c55e);
  color: #052e16;
  box-shadow: 0 2px 8px rgba(74,222,128,0.2);
}
.capi-btn-primary:hover:not(:disabled) {
  box-shadow: 0 4px 16px rgba(22,163,74,0.3);
  transform: translateY(-1px);
}
.capi-btn-ghost {
  background: transparent;
  color: #6b7280;
  border: 1px solid rgba(0,0,0,0.1);
}
.capi-dark .capi-btn-ghost {
  color: #94a3b8;
  border-color: rgba(148,163,184,0.15);
}
.capi-btn-ghost:hover {
  background: rgba(0,0,0,0.04);
  color: #374151;
}
.capi-dark .capi-btn-ghost:hover {
  background: rgba(148,163,184,0.08);
  color: #e2e8f0;
}
.capi-btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: rgba(0,0,0,0.03);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 8px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}
.capi-dark .capi-btn-icon {
  background: rgba(148,163,184,0.08);
  border-color: rgba(148,163,184,0.15);
  color: #94a3b8;
}
.capi-btn-icon:hover {
  background: rgba(0,0,0,0.06);
  color: #374151;
}
.capi-dark .capi-btn-icon:hover {
  background: rgba(148,163,184,0.15);
  color: #e2e8f0;
}
.capi-btn-lg {
  padding: 14px 24px;
  font-size: 15px;
  border-radius: 10px;
}
.capi-btn-save {
  transition: all 0.3s ease;
}
.capi-btn-save:active:not(:disabled) {
  transform: scale(0.97);
}
.capi-btn-saved {
  background: #22c55e !important;
  box-shadow: 0 0 0 0 rgba(34,197,94,0.4);
  animation: capi-pulse-save 0.6s ease;
}
.capi-dark .capi-btn-saved {
  background: #4ade80 !important;
  box-shadow: 0 0 0 0 rgba(74,222,128,0.4);
}
.capi-save-check {
  animation: capi-check-draw 0.4s ease forwards;
}
@keyframes capi-pulse-save {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
  50% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(34,197,94,0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(34,197,94,0); }
}
@keyframes capi-check-draw {
  0% { opacity: 0; transform: scale(0.5); }
  50% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
}
.capi-actions {
  padding-top: 4px;
}

/* ── Toggle Switch ── */
.capi-toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}
.capi-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}
.capi-toggle-slider {
  position: absolute;
  inset: 0;
  background: #d1d5db;
  border-radius: 24px;
  cursor: pointer;
  transition: background 0.25s;
}
.capi-dark .capi-toggle-slider { background: #334155; }
.capi-toggle-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: #ffffff;
  border-radius: 50%;
  transition: transform 0.25s;
}
.capi-dark .capi-toggle-slider::before { background: #e2e8f0; }
.capi-toggle input:checked + .capi-toggle-slider {
  background: #22c55e;
}
.capi-toggle input:checked + .capi-toggle-slider::before {
  transform: translateX(20px);
}
.capi-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

/* ── Event List ── */
.capi-event-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.capi-event-item {
  background: #f9fafb;
  border: 1px solid rgba(0,0,0,0.04);
  border-radius: 10px;
  padding: 16px;
}
.capi-dark .capi-event-item {
  background: rgba(15,23,42,0.5);
  border-color: rgba(148,163,184,0.08);
}
.capi-event-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.capi-event-info {
  flex: 1;
}
.capi-event-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.capi-dark .capi-event-label { color: #e2e8f0; }
.capi-event-desc {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 3px;
}
.capi-dark .capi-event-desc { color: #64748b; }
.capi-event-config {
  margin-top: 12px;
  padding-left: 58px;
}

/* ── Alerts ── */
.capi-alert {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.capi-alert-error {
  background: rgba(239,68,68,0.06);
  border: 1px solid rgba(239,68,68,0.15);
  color: #dc2626;
}
.capi-dark .capi-alert-error {
  background: rgba(239,68,68,0.1);
  border-color: rgba(239,68,68,0.2);
  color: #fca5a5;
}
.capi-alert-warning {
  background: rgba(234,179,8,0.06);
  border: 1px solid rgba(234,179,8,0.15);
  color: #b45309;
}
.capi-dark .capi-alert-warning {
  background: rgba(234,179,8,0.1);
  border-color: rgba(234,179,8,0.2);
  color: #fde047;
}

/* ── Status Badge ── */
.capi-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
}
.capi-status-success {
  background: rgba(34,197,94,0.08);
  border: 1px solid rgba(34,197,94,0.15);
  color: #16a34a;
}
.capi-dark .capi-status-success {
  background: rgba(34,197,94,0.1);
  border-color: rgba(34,197,94,0.2);
  color: #4ade80;
}
.capi-status-error {
  background: rgba(239,68,68,0.06);
  border: 1px solid rgba(239,68,68,0.15);
  color: #dc2626;
}
.capi-dark .capi-status-error {
  background: rgba(239,68,68,0.1);
  border-color: rgba(239,68,68,0.2);
  color: #f87171;
}
.capi-status-warning {
  background: rgba(234,179,8,0.06);
  border: 1px solid rgba(234,179,8,0.15);
  color: #b45309;
}
.capi-dark .capi-status-warning {
  background: rgba(234,179,8,0.1);
  border-color: rgba(234,179,8,0.2);
  color: #fde047;
}
.capi-status-checking {
  background: rgba(59,130,246,0.06);
  border: 1px solid rgba(59,130,246,0.15);
  color: #2563eb;
}
.capi-dark .capi-status-checking {
  background: rgba(59,130,246,0.1);
  border-color: rgba(59,130,246,0.2);
  color: #93c5fd;
}

/* ── Mode Toggle (Segmented) ── */
.capi-mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 16px;
  margin-bottom: 16px;
}
.capi-mode-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 2px solid rgba(0,0,0,0.06);
  background: #f9fafb;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.25s;
  font-family: inherit;
  text-align: left;
}
.capi-dark .capi-mode-btn {
  border-color: rgba(148,163,184,0.1);
  background: rgba(15,23,42,0.4);
  color: #94a3b8;
}
.capi-mode-btn:hover { border-color: rgba(0,0,0,0.12); }
.capi-dark .capi-mode-btn:hover { border-color: rgba(148,163,184,0.2); }
.capi-mode-btn svg { flex-shrink: 0; }
.capi-mode-text { display: flex; flex-direction: column; gap: 1px; }
.capi-mode-label { font-size: 14px; font-weight: 600; }
.capi-mode-desc { font-size: 11px; opacity: 0.7; }

/* Test active */
.capi-mode-test.capi-mode-active {
  border-color: #f59e0b;
  background: #fffbeb;
  color: #92400e;
}
.capi-dark .capi-mode-test.capi-mode-active {
  border-color: #f59e0b;
  background: rgba(245,158,11,0.08);
  color: #fbbf24;
}
/* Live active */
.capi-mode-live.capi-mode-active {
  border-color: #16a34a;
  background: #f0fdf4;
  color: #166534;
}
.capi-dark .capi-mode-live.capi-mode-active {
  border-color: #22c55e;
  background: rgba(34,197,94,0.08);
  color: #4ade80;
}

/* ── Status Cards ── */
.capi-status-section {
  margin-top: 20px;
}
.capi-status-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
}
.capi-status-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.capi-status-card-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}
.capi-status-card-desc {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 1px;
}

/* Warn */
.capi-status-card-warn { background: #fffbeb; border-color: rgba(245,158,11,0.15); color: #92400e; }
.capi-status-icon-warn { background: rgba(245,158,11,0.12); color: #f59e0b; }
.capi-dark .capi-status-card-warn { background: rgba(245,158,11,0.06); border-color: rgba(245,158,11,0.12); color: #fbbf24; }
.capi-dark .capi-status-icon-warn { background: rgba(245,158,11,0.12); color: #f59e0b; }

/* Info / Checking */
.capi-status-card-info { background: #eff6ff; border-color: rgba(59,130,246,0.15); color: #1e40af; }
.capi-status-icon-info { background: rgba(59,130,246,0.1); color: #3b82f6; }
.capi-dark .capi-status-card-info { background: rgba(59,130,246,0.06); border-color: rgba(59,130,246,0.12); color: #93c5fd; }
.capi-dark .capi-status-icon-info { background: rgba(59,130,246,0.12); color: #3b82f6; }

/* OK / Connected */
.capi-status-card-ok { background: #f0fdf4; border-color: rgba(34,197,94,0.15); color: #166534; }
.capi-status-icon-ok { background: rgba(34,197,94,0.1); color: #16a34a; }
.capi-dark .capi-status-card-ok { background: rgba(34,197,94,0.06); border-color: rgba(34,197,94,0.12); color: #4ade80; }
.capi-dark .capi-status-icon-ok { background: rgba(34,197,94,0.12); color: #22c55e; }

/* Error */
.capi-status-card-err { background: #fef2f2; border-color: rgba(239,68,68,0.15); color: #991b1b; }
.capi-status-icon-err { background: rgba(239,68,68,0.1); color: #ef4444; }
.capi-dark .capi-status-card-err { background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.12); color: #fca5a5; }
.capi-dark .capi-status-icon-err { background: rgba(239,68,68,0.12); color: #ef4444; }

/* ── Toast ── */
.capi-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 14px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  z-index: 100;
  animation: capi-toast-in 0.3s ease;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}
.capi-toast-success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid rgba(34,197,94,0.2);
}
.capi-dark .capi-toast-success {
  background: #166534;
  color: #bbf7d0;
  border-color: rgba(34,197,94,0.3);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}
.capi-toast-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid rgba(239,68,68,0.2);
}
.capi-dark .capi-toast-error {
  background: #7f1d1d;
  color: #fecaca;
  border-color: rgba(239,68,68,0.3);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}

/* ── Spinner ── */
.capi-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(0,0,0,0.08);
  border-top-color: #16a34a;
  border-radius: 50%;
  animation: capi-spin 0.7s linear infinite;
}
.capi-dark .capi-spinner {
  border-color: rgba(148,163,184,0.2);
  border-top-color: #4ade80;
}
.capi-spinner-sm {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0,0,0,0.08);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: capi-spin 0.7s linear infinite;
  vertical-align: middle;
}
.capi-dark .capi-spinner-sm {
  border-color: rgba(148,163,184,0.2);
  border-top-color: currentColor;
}

/* ── Animations ── */
@keyframes capi-spin {
  to { transform: rotate(360deg); }
}
@keyframes capi-toast-in {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .capi-card {
    padding: 18px 16px;
    border-radius: 12px;
  }
  .capi-card-desc {
    padding-left: 0;
  }
  .capi-event-config {
    padding-left: 0;
    margin-top: 10px;
  }
  .capi-header {
    padding: 12px 16px;
  }
  .capi-content {
    padding: 16px 12px 40px;
  }
  .capi-login-card {
    padding: 32px 24px;
  }
  .capi-toast {
    left: 12px;
    right: 12px;
    top: 12px;
  }
}
`;
