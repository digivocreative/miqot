import { useState, useEffect, useRef } from 'react';
import { User, Send, Code, Lock, Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import DashboardProfile from './DashboardProfile';
import { TelegramSection } from './DashboardProfile';
import CapiPage from './CapiPage';
import { trackEvent } from '../utils/analytics';
import { getAuthHeaders } from './LoginPage';
import SegmentedControl from './common/SegmentedControl';

interface AgentData {
  slug: string;
  name: string;
  website: string;
  phone: string;
  email: string;
  telegram_chat_id?: string;
  photo: string;
  role: string;
}

type SettingsTab = 'profil' | 'telegram' | 'capi';

const TAB_CONFIG: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'capi', label: 'CAPI', icon: Code },
];

const TAB_OPEN_EVENT: Record<SettingsTab, string> = {
  profil: 'open_profil',
  telegram: 'open_telegram',
  capi: 'open_capi',
};

export default function SettingsPage({ agent, onUpdated, initialTab }: { agent: AgentData; onUpdated: () => void; initialTab?: SettingsTab }) {
  const mountTracked = useRef(false);
  useEffect(() => {
    if (!mountTracked.current) {
      trackEvent('feature', 'open_settings');
      // Fire the open event for whichever sub-tab is active on first mount;
      // switchTab handles every later change, so this won't double-fire.
      trackEvent('feature', TAB_OPEN_EVENT[initialTab || 'profil']);
      mountTracked.current = true;
    }
  }, []);

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'profil');

  // Update tab on URL change (browser back/forward)
  const switchTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    trackEvent('feature', TAB_OPEN_EVENT[tab]);
    const url = `/dashboard/settings/${tab}`;
    window.history.pushState(null, '', url);
    window.scrollTo({ top: 0 });
  };

  // Listen for popstate (browser back/forward)
  useEffect(() => {
    const onPopState = () => {
      const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
      if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'settings') {
        const sub = segments[2] as SettingsTab;
        if (['profil', 'telegram', 'capi'].includes(sub)) {
          setActiveTab(sub);
          return;
        }
      }
      setActiveTab('profil');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Set initial URL if it's just /dashboard/settings (no sub-tab)
  useEffect(() => {
    const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (segments.length === 2 && segments[0] === 'dashboard' && segments[1] === 'settings') {
      window.history.replaceState(null, '', `/dashboard/settings/${activeTab}`);
    }
  }, []);

  return (
    <div>
      {/* Segmented Control Tab Bar */}
      <div className="sticky top-[53px] z-20 bg-white dark:bg-slate-800 border-b border-gray-100 dark:border-slate-700">
        <div className="max-w-lg mx-auto px-4 py-2">
          <SegmentedControl
            options={TAB_CONFIG.map(t => ({ value: t.id, label: t.label, icon: t.icon }))}
            value={activeTab}
            onChange={switchTab}
            accent="emerald"
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-lg mx-auto">
        {activeTab === 'profil' && (
          <div className="px-4 pt-4 pb-8">
            <DashboardProfile agent={agent} onUpdated={onUpdated} mode="embedded" />
          </div>
        )}
        {activeTab === 'telegram' && (
          <div className="px-4 pt-4 pb-8">
            <TelegramSection agent={agent} />
          </div>
        )}
        {activeTab === 'capi' && (
          <div className="px-4 pt-4 pb-8">
            <InternalLoginGate description="Login untuk mengatur Meta CAPI.">
              <CapiPage agentSlug={agent.slug} hideHeader embedded />
            </InternalLoginGate>
          </div>
        )}
      </div>
    </div>
  );
}

function InternalLoginGate({ description, children }: { description: string; children: React.ReactNode }) {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/laporan/status', { headers: { ...getAuthHeaders() } });
        const result = await res.json();
        if (!cancelled) setHasCredentials(!!(result.success && result.data?.hasCredentials));
      } catch {
        if (!cancelled) setHasCredentials(false);
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loadingStatus) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-8 flex justify-center">
        <Loader2 size={20} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  if (hasCredentials) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !password) { setError('Username dan password wajib diisi'); return; }
    if (username.length < 3 || !username.startsWith('SM')) { setError('Username tidak valid (contoh: SM12345)'); return; }
    setLoginLoading(true);
    try {
      const res = await fetch('/api/laporan/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ username, password, kantor: '2' }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setError(result.error || 'Login gagal');
        setLoginLoading(false);
        return;
      }
      setPassword('');
      setHasCredentials(true);
    } catch {
      setError('Gagal menghubungi server');
    }
    setLoginLoading(false);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4 text-center border-b border-gray-50 dark:border-slate-700/50">
        <img
          src="/logo-alhijaz.webp"
          alt="Alhijaz"
          className="h-auto mx-auto mb-3 rounded-xl object-contain"
          style={{ width: '8rem' }}
        />
        <h2 className="text-[15px] font-bold text-gray-800 dark:text-white">AIW Agent Login</h2>
        <p className="text-[12px] text-gray-500 dark:text-slate-500 mt-0.5">{description}</p>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
            <User size={12} /> Username
          </label>
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value.toUpperCase()); setError(''); }}
            placeholder="SM12345"
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect="off"
            className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
            <Lock size={12} /> Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Kata Sandi"
              className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center justify-center gap-1.5 py-2">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
              <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span className="text-xs font-medium text-red-500">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loginLoading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95"
        >
          {loginLoading ? (
            <><Loader2 size={16} className="animate-spin" /> Login...</>
          ) : (
            <><LogIn size={16} /> Login</>
          )}
        </button>
      </form>
    </div>
  );
}
