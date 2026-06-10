import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Eye, Search as SearchIcon, FileText, Phone, UserPlus, BadgeCheck,
  ShoppingCart, Heart, CreditCard, DollarSign, Bell, Sparkles,
  Lock, Activity, Shield, Settings as SettingsIcon, ScrollText,
  Save, Trash2, AlertTriangle, AlertCircle, CheckCircle2, XCircle,
  Loader2, ChevronDown, Check, FlaskConical, Zap, Sun, Moon, LogOut,
  RefreshCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import CapiEventLog from './CapiEventLog';
import { getAuthHeaders } from './LoginPage';

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

const DEFAULT_STATUS_ERROR_DESC = 'Pixel ID atau Access Token tidak valid.';

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

function normalizeLoadedConfig(config?: Partial<CapiConfig> | null): CapiConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(config || {}),
    events: {
      ...DEFAULT_CONFIG.events,
      ...(config?.events || {}),
    },
  };
}

// ── Meta Event Icons (lucide-react) ──
const META_EVENT_ICONS: Record<string, LucideIcon> = {
  PageView: Eye,
  Search: SearchIcon,
  ViewContent: FileText,
  Contact: Phone,
  Lead: UserPlus,
  CompleteRegistration: BadgeCheck,
  AddToCart: ShoppingCart,
  AddToWishlist: Heart,
  InitiateCheckout: CreditCard,
  Purchase: DollarSign,
  Subscribe: Bell,
  CustomEvent: Sparkles,
};

// ── Event Definition Icons (per row label) ──
const EVENT_DEF_ICONS: Record<string, LucideIcon> = {
  pageView: Eye,
  search: SearchIcon,
  viewContent: FileText,
  contact: Phone,
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

  const ActiveIcon = META_EVENT_ICONS[value] || META_EVENT_ICONS.CustomEvent;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium text-gray-800 dark:text-white hover:border-emerald-400 dark:hover:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
      >
        <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
          <ActiveIcon size={14} strokeWidth={2.2} />
        </span>
        <span className="flex-1 text-left">{value}</span>
        <ChevronDown
          size={14}
          className="text-gray-400 dark:text-slate-500 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-lg p-1">
          {META_EVENTS.map(me => {
            const Icon = META_EVENT_ICONS[me];
            const active = me === value;
            return (
              <button
                key={me}
                type="button"
                onClick={() => { onChange(me); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                  active
                    ? 'bg-emerald-500 text-white'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                }`}>
                  <Icon size={12} strokeWidth={2.2} />
                </span>
                <span className="flex-1 text-left">{me}</span>
                {active && <Check size={12} strokeWidth={3} />}
              </button>
            );
          })}
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

  if (isLoading) {
    if (hideHeader || embedded) {
      return (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-emerald-500" />
        </div>
      );
    }
    return <><div className={`capi-page capi-center${darkClass}`}><div className="capi-spinner" /></div><style>{capiStyles}</style></>;
  }

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
  // Read initial sub-tab from URL: /dashboard/settings/capi/log → 'event-log'
  const [capiView, setCapiView] = useState<'settings' | 'event-log'>(() => {
    const path = window.location.pathname;
    return path.endsWith('/capi/log') ? 'event-log' : 'settings';
  });

  // Sync URL when sub-tab changes
  const switchCapiView = (view: 'settings' | 'event-log') => {
    setCapiView(view);
    const base = '/dashboard/settings/capi';
    const url = view === 'event-log' ? base + '/log' : base;
    window.history.pushState(null, '', url);
  };

  // Listen for popstate (browser back/forward)
  useEffect(() => {
    const onPop = () => {
      setCapiView(window.location.pathname.endsWith('/capi/log') ? 'event-log' : 'settings');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [config, setConfig] = useState<CapiConfig>(DEFAULT_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replayingPurchases, setReplayingPurchases] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('unconfigured');
  const [statusErrorDesc, setStatusErrorDesc] = useState(DEFAULT_STATUS_ERROR_DESC);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Show toast
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Load existing config
  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const res = await fetch(`/api/capi/${agentSlug}/config`, { headers: getAuthHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        if (data.config) {
          const loadedConfig = normalizeLoadedConfig(data.config);
          if (!cancelled) setConfig(loadedConfig);

          // Validate connection with real Meta API
          if (loadedConfig.pixelId && loadedConfig.accessToken) {
            if (!cancelled) setStatus('checking');
            try {
              const valRes = await fetch(`/api/capi/${agentSlug}/validate`, { method: 'POST', headers: getAuthHeaders() });
              const valData = await valRes.json().catch(() => ({}));
              if (!cancelled) {
                setStatusErrorDesc(valData.reason || DEFAULT_STATUS_ERROR_DESC);
                setStatus(valRes.ok && valData.valid ? 'connected' : 'error');
              }
            } catch {
              if (!cancelled) {
                setStatusErrorDesc('Konfigurasi termuat, tapi koneksi ke Meta gagal divalidasi.');
                setStatus('error');
              }
            }
          } else if (!cancelled) {
            setStatus('unconfigured');
          }
        } else if (!cancelled) {
          setConfig(normalizeLoadedConfig());
          setStatus('unconfigured');
        }
      } catch (err) {
        console.warn('[CAPI] Gagal memuat konfigurasi:', err);
        if (!cancelled) {
          setStatusErrorDesc('Konfigurasi gagal dimuat dari server.');
          setStatus('error');
          showToast('Gagal memuat konfigurasi CAPI. Silakan login ulang jika masih terjadi.', 'error');
        }
      } finally {
        if (!cancelled) setConfigLoaded(true);
      }
    };

    loadConfig();
    return () => { cancelled = true; };
  }, [agentSlug, showToast]);

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

  const handleManualPurchaseReplay = async () => {
    if (!config.pixelId.trim() || !config.accessToken.trim()) {
      showToast('CAPI belum lengkap.', 'error');
      return;
    }
    if (!window.confirm('Re-hit event Purchase untuk seluruh jamaah umroh dan haji agent ini?')) return;

    setReplayingPurchases(true);
    try {
      const replayRes = await fetch(`/api/capi/${agentSlug}/replay-purchases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ reason: 'manual-rehit', mode: 'reset-all' }),
      });
      const replayData = await replayRes.json().catch(() => ({}));
      if (!replayRes.ok || !replayData.success) {
        showToast(replayData.error || 'Gagal menjalankan re-hit Purchase.', 'error');
        return;
      }
      showToast('Re-hit Purchase jamaah berjalan di background.', 'success');
    } catch {
      showToast('Gagal menghubungi server.', 'error');
    } finally {
      setReplayingPurchases(false);
    }
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
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || 'Gagal menyimpan konfigurasi', 'error');
        setStatusErrorDesc(data.error || 'Gagal menyimpan konfigurasi CAPI.');
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
        const valRes = await fetch(`/api/capi/${agentSlug}/validate`, { method: 'POST', headers: getAuthHeaders() });
        const valData = await valRes.json();
        if (valData.valid) {
          setStatus('connected');
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
          if (data.purchaseRehitRequired) {
            try {
              const replayRes = await fetch(`/api/capi/${agentSlug}/replay-purchases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                  reason: data.purchaseRehitReason || 'config-change',
                  mode: data.purchaseReplayMode || 'reset-all',
                }),
              });
              const replayData = await replayRes.json().catch(() => ({}));
              if (!replayRes.ok || !replayData.success) {
                console.warn('[CAPI] Gagal queue replay Purchase:', replayData.error || replayRes.status);
              }
            } catch (err) {
              console.warn('[CAPI] Gagal queue replay Purchase:', err);
            }
            showToast(
              data.purchaseReplayMode === 'retry-unhit'
                ? 'Konfigurasi tersimpan. Retry Purchase yang belum sukses berjalan di background.'
                : 'Konfigurasi tersimpan. Re-hit Purchase jamaah berjalan di background.',
              'success'
            );
          } else {
            showToast('CAPI tersimpan. Koneksi aktif.', 'success');
          }
        } else {
          setStatusErrorDesc(valData.reason || DEFAULT_STATUS_ERROR_DESC);
          setStatus('error');
          showToast(valData.reason || 'Konfigurasi disimpan, tapi Pixel ID atau Access Token tidak valid.', 'error');
        }
      } catch {
        setStatusErrorDesc('Konfigurasi disimpan, tapi koneksi ke Meta gagal divalidasi.');
        setStatus('error');
        showToast('Konfigurasi disimpan, tapi gagal memvalidasi koneksi ke Meta.', 'error');
      }
    } catch {
      showToast('Gagal menghubungi server', 'error');
      setStatusErrorDesc('Server tidak merespons saat menyimpan konfigurasi.');
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  if (!configLoaded) {
    return hideHeader ? (
      <div className="flex justify-center py-12">
        <Loader2 size={20} className="animate-spin text-emerald-500" />
      </div>
    ) : (
      <div className={`min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950 ${isDark ? 'dark' : ''}`}>
        <Loader2 size={28} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  const inputClass = "w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400";
  const labelClass = "flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide";

  const inner = (
    <div className="space-y-4">
      {/* Sub-tab: Settings | Event Log */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
        <button
          type="button"
          onClick={() => switchCapiView('settings')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${
            capiView === 'settings'
              ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold'
              : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'
          }`}
          style={capiView === 'settings' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}
        >
          <SettingsIcon size={13} strokeWidth={2.2} />
          <span className="text-[11px]">Settings</span>
        </button>
        <button
          type="button"
          onClick={() => switchCapiView('event-log')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${
            capiView === 'event-log'
              ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold'
              : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'
          }`}
          style={capiView === 'event-log' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}
        >
          <ScrollText size={13} strokeWidth={2.2} />
          <span className="text-[11px]">Event Log</span>
        </button>
      </div>

      {capiView === 'event-log' ? (
        <CapiEventLog agentSlug={agentSlug} />
      ) : (
        <>
          {/* Section 1: Meta Credentials */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-2">
              <Lock size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-slate-200">Meta Credentials</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">Masukkan Pixel ID dan Access Token dari Meta Business Manager.</p>

              <div>
                <label htmlFor="pixelId" className={labelClass}>
                  Pixel ID <span className="text-red-500">*</span>
                </label>
                <input
                  id="pixelId"
                  type="text"
                  value={config.pixelId}
                  onChange={e => updateConfig({ pixelId: e.target.value })}
                  placeholder="Contoh: 123456789012345"
                  className={inputClass}
                />
                <p className="mt-1.5 text-[11px] text-gray-400 dark:text-slate-500">Pixel ID dapat ditemukan di Meta Events Manager &gt; Data Sources.</p>
              </div>

              <div>
                <label htmlFor="accessToken" className={labelClass}>
                  Access Token <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="accessToken"
                  rows={3}
                  value={config.accessToken}
                  onChange={e => updateConfig({ accessToken: e.target.value })}
                  placeholder="EAABxxxxxxx..."
                  className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-[12px] font-mono break-all focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 resize-y"
                />
                <p className="mt-1.5 text-[11px] text-gray-400 dark:text-slate-500">Generate token di Meta Events Manager &gt; Settings &gt; Conversions API.</p>
              </div>

              {/* Advanced accordion */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                  showAdvanced
                    ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-100 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400'
                    : 'bg-gray-50 dark:bg-slate-900/40 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <SettingsIcon size={12} strokeWidth={2.2} />
                  Opsi Lanjutan
                </span>
                <ChevronDown
                  size={12}
                  className="transition-transform duration-200"
                  style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
              {showAdvanced && (
                <div>
                  <label htmlFor="testEventCode" className={labelClass}>Test Event Code</label>
                  <input
                    id="testEventCode"
                    type="text"
                    value={config.testEventCode}
                    onChange={e => updateConfig({ testEventCode: e.target.value })}
                    placeholder="Contoh: TEST12345 (opsional)"
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-[11px] text-gray-400 dark:text-slate-500">Gunakan kode ini untuk menguji event di Meta Events Manager &gt; Test Events.</p>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: Event Mapping */}
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-2 rounded-t-2xl">
              <Activity size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-slate-200">Event Mapping</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">Pilih event mana yang ingin di-track dan mapping ke event Meta.</p>

              {EVENT_DEFINITIONS.map(evt => {
                const eventConfig = config.events[evt.key] || { enabled: true, eventName: evt.defaultEvent };
                const RowIcon = EVENT_DEF_ICONS[evt.key];
                return (
                  <div
                    key={evt.key}
                    className="bg-gray-50 dark:bg-slate-900/40 border border-gray-100 dark:border-slate-700/60 rounded-xl p-3"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => updateEvent(evt.key, 'enabled', !eventConfig.enabled)}
                        role="switch"
                        aria-checked={eventConfig.enabled}
                        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors mt-0.5 ${
                          eventConfig.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                            eventConfig.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {RowIcon && <RowIcon size={12} className="text-gray-500 dark:text-slate-400" strokeWidth={2.2} />}
                          <span className="text-[13px] font-semibold text-gray-800 dark:text-white">{evt.label}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed">{evt.desc}</p>
                      </div>
                    </div>
                    {eventConfig.enabled && (
                      <div className="mt-3 space-y-2">
                        <EventDropdown
                          value={eventConfig.eventName}
                          onChange={v => updateEvent(evt.key, 'eventName', v)}
                        />
                        {eventConfig.eventName === 'CustomEvent' && (
                          <input
                            type="text"
                            placeholder="Nama custom event"
                            value={eventConfig.customEventName || ''}
                            onChange={e => updateEvent(evt.key, 'customEventName', e.target.value)}
                            className={inputClass}
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
          <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-2">
              <Shield size={14} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.2} />
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-slate-200">Mode & Status</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateConfig({ testMode: true })}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                    config.testMode
                      ? 'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300'
                      : 'bg-gray-50 dark:bg-slate-900/40 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <FlaskConical size={16} strokeWidth={2.2} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold leading-tight">Test Mode</div>
                    <div className="text-[10px] opacity-70 mt-0.5">Hit Test Events</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => updateConfig({ testMode: false })}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                    !config.testMode
                      ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-gray-50 dark:bg-slate-900/40 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <Zap size={16} strokeWidth={2.2} className="shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold leading-tight">Live Mode</div>
                    <div className="text-[10px] opacity-70 mt-0.5">Kirim secara live</div>
                  </div>
                </button>
              </div>

              {config.testMode && !config.testEventCode && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-800/40 rounded-xl">
                  <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" strokeWidth={2.2} />
                  <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                    Test Mode aktif tapi Test Event Code belum diisi. Event tidak akan muncul di Test Events.
                  </p>
                </div>
              )}

              <div>
                <span className={labelClass + " mb-2"}>Status Koneksi</span>
                {status === 'unconfigured' && (
                  <StatusCard variant="warn" icon={AlertCircle} title="Belum dikonfigurasi" desc="Isi Pixel ID dan Access Token lalu simpan." />
                )}
                {status === 'checking' && (
                  <StatusCard variant="info" icon={Loader2} spinning title="Memeriksa koneksi..." desc="Harap tunggu sebentar." />
                )}
                {status === 'connected' && (
                  <StatusCard variant="ok" icon={CheckCircle2} title="Connected" desc="Pixel aktif dan siap menerima event." />
                )}
                {status === 'error' && (
                  <StatusCard variant="err" icon={XCircle} title="Error" desc={statusErrorDesc} />
                )}
              </div>
            </div>
          </section>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:active:scale-100"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Menyimpan...</>
            ) : saved ? (
              <><CheckCircle2 size={18} strokeWidth={2.5} /> Tersimpan!</>
            ) : (
              <><Save size={16} strokeWidth={2.2} /> Simpan Konfigurasi</>
            )}
          </button>

          {/* Manual Purchase Replay Button */}
          <button
            type="button"
            onClick={handleManualPurchaseReplay}
            disabled={saving || replayingPurchases || !config.pixelId || !config.accessToken}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/25 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-50 dark:disabled:hover:bg-emerald-900/15"
          >
            {replayingPurchases ? (
              <Loader2 size={13} strokeWidth={2.2} className="animate-spin" />
            ) : (
              <RefreshCw size={13} strokeWidth={2.2} />
            )}
            Re-hit Purchase Jamaah
          </button>

          {/* Reset Button */}
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm('Apakah Anda yakin ingin mereset Pixel ID dan Access Token? Data akan dihapus permanen.')) return;
              setResetting(true);
              try {
                const res = await fetch(`/api/capi/${agentSlug}/config`, { method: 'DELETE', headers: getAuthHeaders() });
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
              } finally {
                setResetting(false);
              }
            }}
            disabled={resetting || saving}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-gray-400 dark:text-slate-500 border border-dashed border-gray-200 dark:border-slate-700 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800/40 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
          >
            {resetting ? (
              <Loader2 size={13} strokeWidth={2.2} className="animate-spin" />
            ) : (
              <Trash2 size={13} strokeWidth={2.2} />
            )}
            {resetting ? 'Mereset...' : 'Reset Pixel & Token'}
          </button>
        </>
      )}
    </div>
  );

  const ToastIcon = toast?.type === 'success' ? CheckCircle2 : AlertCircle;
  const toastNode = toast && (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 bottom-24 z-50 pointer-events-none flex max-w-[90vw] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-[11.5px] font-medium shadow-md ${
        toast.type === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-900/30 dark:text-emerald-200'
          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/40 dark:bg-red-900/30 dark:text-red-200'
      }`}
      style={{ animation: 'capi-toast-fade-in 150ms ease-out' }}
    >
      <ToastIcon size={13} strokeWidth={2.4} className="shrink-0" />
      <span className="min-w-0 overflow-hidden text-ellipsis">{toast.message}</span>
    </div>
  );

  if (hideHeader) {
    return (
      <>
        {toastNode}
        {inner}
      </>
    );
  }

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950">
        {toastNode}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <img src="/meta-logo.webp" alt="Meta" className="h-7 object-contain" loading="eager" />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleDark}
                title={isDark ? 'Light mode' : 'Dark mode'}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
              >
                {isDark ? <Sun size={16} strokeWidth={2.2} /> : <Moon size={16} strokeWidth={2.2} />}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut size={13} strokeWidth={2.2} />
                Logout
              </button>
            </div>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 pt-4 pb-8">
          {inner}
        </main>
      </div>
    </div>
  );
}

// ── Status Card Helper ──
function StatusCard({
  variant,
  icon: Icon,
  spinning = false,
  title,
  desc,
}: {
  variant: 'warn' | 'info' | 'ok' | 'err';
  icon: LucideIcon;
  spinning?: boolean;
  title: string;
  desc: string;
}) {
  const styles = {
    warn: {
      card: 'bg-amber-50 dark:bg-amber-900/15 border-amber-100 dark:border-amber-800/40',
      iconBg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
      title: 'text-amber-800 dark:text-amber-200',
      desc: 'text-amber-700/80 dark:text-amber-300/80',
    },
    info: {
      card: 'bg-blue-50 dark:bg-blue-900/15 border-blue-100 dark:border-blue-800/40',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
      title: 'text-blue-800 dark:text-blue-200',
      desc: 'text-blue-700/80 dark:text-blue-300/80',
    },
    ok: {
      card: 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-100 dark:border-emerald-800/40',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
      title: 'text-emerald-800 dark:text-emerald-200',
      desc: 'text-emerald-700/80 dark:text-emerald-300/80',
    },
    err: {
      card: 'bg-red-50 dark:bg-red-900/15 border-red-100 dark:border-red-800/40',
      iconBg: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
      title: 'text-red-800 dark:text-red-200',
      desc: 'text-red-700/80 dark:text-red-300/80',
    },
  }[variant];

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${styles.card}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${styles.iconBg}`}>
        <Icon size={16} strokeWidth={2.2} className={spinning ? 'animate-spin' : ''} />
      </div>
      <div className="min-w-0">
        <div className={`text-[13px] font-semibold leading-tight ${styles.title}`}>{title}</div>
        <div className={`text-[11px] mt-0.5 ${styles.desc}`}>{desc}</div>
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

/* ── Sub-tab Pill ── */
.capi-subtab-bar {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 16px 0;
  display: flex;
  gap: 4px;
  padding-bottom: 0;
}
.capi-subtab-bar-inner {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: #f3f4f6;
  border-radius: 12px;
  width: 100%;
}
.capi-subtab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.capi-subtab:hover { color: #6b7280; }
.capi-subtab-active {
  background: white;
  color: #059669;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.capi-dark .capi-subtab-bar-inner { background: #1e293b; }
.capi-dark .capi-subtab { color: #64748b; }
.capi-dark .capi-subtab:hover { color: #94a3b8; }
.capi-dark .capi-subtab-active { background: #334155; color: #34d399; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }

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
@keyframes capi-toast-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
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
