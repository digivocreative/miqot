import { useState, useEffect, useCallback } from 'react';
import {
  Calculator, ArrowLeftRight, Settings,
  LogOut, Shield, Users, Moon, Sun, ChevronLeft,
  BarChart3, Loader2, Sparkles, UserPlus, ChevronRight,
  CalendarRange, ExternalLink, TrendingUp, Mic, CreditCard,
} from 'lucide-react';
import type { AuthSession } from './LoginPage';
import { clearSession, getAuthHeaders } from './LoginPage';
import KalkulasiPage from './KalkulasiPage';
import ComparePage from './ComparePage';
import JamaahPage from './JamaahPage';
import StatistikPage from './StatistikPage';
import AgentManagementPage from './AgentManagementPage';
import UpcomingSchedule from './UpcomingSchedule';
import CalendarInsight from './CalendarInsight';
import AnalyticsPage from './AnalyticsPage';
import SettingsPage from './SettingsPage';
import AIToolsPage from './AIToolsPage';
import VoiceOverPage from './VoiceOverPage';
import BusinessCardPage from './BusinessCardPage';
import HajiPlusPage from './HajiPlusPage';
import HajiPlusExportPage from './HajiPlusExportPage';
import LeadsPage from './LeadsPage';
import { trackEvent } from '../utils/analytics';

type TabId = 'home' | 'settings' | 'kalkulasi' | 'compare' | 'caption' | 'agents' | 'jamaah' | 'statistik' | 'analytics' | 'ai-tools' | 'leads';

// URL slug ↔ TabId mapping
const SLUG_TO_TAB: Record<string, TabId> = {
  kalkulasi: 'kalkulasi',
  compare: 'compare',
  agents: 'agents',
  jamaah: 'jamaah',
  statistik: 'statistik',
  settings: 'settings',
  analytics: 'analytics',
  'ai-tools': 'ai-tools',
  leads: 'leads',
};

const TAB_TO_SLUG: Partial<Record<TabId, string>> = {
  kalkulasi: 'kalkulasi',
  compare: 'compare',
  agents: 'agents',
  jamaah: 'jamaah',
  statistik: 'statistik',
  settings: 'settings',
  analytics: 'analytics',
  'ai-tools': 'ai-tools',
  leads: 'leads',
};

function getTabFromPath(): TabId {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/{slug}
  if (segments.length >= 2 && segments[0] === 'dashboard') {
    return SLUG_TO_TAB[segments[1]] || 'home';
  }
  return 'home';
}

function getSubTabFromPath(): 'umroh' | 'haji' {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/jamaah/haji
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'jamaah' && segments[2] === 'haji') return 'haji';
  return 'umroh';
}

function getSettingsTabFromPath(): 'profil' | 'telegram' | 'capi' {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/settings/telegram or /dashboard/settings/capi
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'settings') {
    const sub = segments[2] as 'profil' | 'telegram' | 'capi';
    if (['profil', 'telegram', 'capi'].includes(sub)) return sub;
  }
  return 'profil';
}

function getAIToolsSubFromPath(): string | null {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/ai-tools/voice-over OR /dashboard/ai-tools/haji-plus/export
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'ai-tools') {
    // Handle nested sub-paths like haji-plus/export
    if (segments.length >= 4 && segments[2] === 'haji-plus' && segments[3] === 'export') {
      return 'haji-plus/export';
    }
    return segments[2];
  }
  return null;
}

const TAB_TITLES: Record<TabId, string> = {
  home: 'Dashboard',
  settings: 'Settings',
  kalkulasi: 'Kalkulasi',
  compare: 'Compare',
  caption: 'Caption',
  agents: 'Agents',
  jamaah: 'Jamaah',
  statistik: 'Statistik',
  analytics: 'Analytics',
  'ai-tools': 'Tools',
  leads: 'Leads',
};

interface MenuCard {
  id: TabId;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  bgLight: string;
  bgDark: string;
  borderLight: string;
  borderDark: string;
  adminOnly?: boolean;
  hidden?: boolean;
  openExternal?: boolean;
  comingSoon?: boolean;
}

const MENU_CARDS: MenuCard[] = [
  {
    id: 'home', label: 'Jadwal', desc: 'Lihat paket',
    icon: CalendarRange, color: 'text-emerald-600 dark:text-emerald-400',
    bgLight: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20',
    borderLight: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40',
    openExternal: true,
  },
  {
    id: 'jamaah', label: 'Jamaah', desc: 'Data jamaah',
    icon: Users, color: 'text-amber-600 dark:text-amber-400',
    bgLight: 'bg-amber-50', bgDark: 'dark:bg-amber-900/20',
    borderLight: 'border-amber-100', borderDark: 'dark:border-amber-800/40',
  },
  {
    id: 'statistik', label: 'Statistik', desc: 'Ringkasan data',
    icon: BarChart3, color: 'text-emerald-600 dark:text-emerald-400',
    bgLight: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20',
    borderLight: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40',
  },
  {
    id: 'leads', label: 'Leads', desc: 'Data calon jamaah',
    icon: UserPlus, color: 'text-blue-600 dark:text-blue-400',
    bgLight: 'bg-blue-50', bgDark: 'dark:bg-blue-900/20',
    borderLight: 'border-blue-100', borderDark: 'dark:border-blue-800/40',
  },
  {
    id: 'kalkulasi', label: 'Kalkulasi', desc: 'Hitung harga paket',
    icon: Calculator, color: 'text-blue-600 dark:text-blue-400',
    bgLight: 'bg-blue-50', bgDark: 'dark:bg-blue-900/20',
    borderLight: 'border-blue-100', borderDark: 'dark:border-blue-800/40',
  },
  {
    id: 'compare', label: 'Compare', desc: 'Bandingkan 2 paket',
    icon: ArrowLeftRight, color: 'text-violet-600 dark:text-violet-400',
    bgLight: 'bg-violet-50', bgDark: 'dark:bg-violet-900/20',
    borderLight: 'border-violet-100', borderDark: 'dark:border-violet-800/40',
  },
  {
    id: 'ai-tools', label: 'Tools', desc: 'Voice over & AI lainnya',
    icon: Sparkles, color: 'text-purple-600 dark:text-purple-400',
    bgLight: 'bg-purple-50', bgDark: 'dark:bg-purple-900/20',
    borderLight: 'border-purple-100', borderDark: 'dark:border-purple-800/40',
  },
  {
    id: 'settings', label: 'Settings', desc: 'Profil, Telegram & CAPI',
    icon: Settings, color: 'text-gray-600 dark:text-gray-400',
    bgLight: 'bg-gray-50', bgDark: 'dark:bg-gray-800/30',
    borderLight: 'border-gray-200', borderDark: 'dark:border-gray-700/40',
  },
  {
    id: 'agents', label: 'Agents', desc: 'Lihat & edit agent',
    icon: Users, color: 'text-cyan-600 dark:text-cyan-400',
    bgLight: 'bg-cyan-50', bgDark: 'dark:bg-cyan-900/20',
    borderLight: 'border-cyan-100', borderDark: 'dark:border-cyan-800/40',
    adminOnly: true,
  },
  {
    id: 'analytics', label: 'Analytics', desc: 'Statistik app',
    icon: TrendingUp, color: 'text-cyan-600 dark:text-cyan-400',
    bgLight: 'bg-cyan-50', bgDark: 'dark:bg-cyan-900/20',
    borderLight: 'border-cyan-100', borderDark: 'dark:border-cyan-800/40',
    adminOnly: true,
  },
];

export default function DashboardLayout({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>(getTabFromPath);

  // Jamaah session persistence across tab switches
  const [jamaahConnected, setJamaahConnected] = useState(false);
  const [jamaahUser, setJamaahUser] = useState('');
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnectClosing, setDisconnectClosing] = useState(false);
  // Statistik header slot for year dropdown
  const [statistikHeaderRight, setStatistikHeaderRight] = useState<React.ReactNode>(null);
  // Jamaah status: lazy check on Statistik click
  const [checkingStatistik, setCheckingStatistik] = useState(false);
  const [showStatAlert, setShowStatAlert] = useState(false);
  const [statAlertClosing, setStatAlertClosing] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  // Analytics header slot for month dropdown
  const [analyticsHeaderRight, setAnalyticsHeaderRight] = useState<React.ReactNode>(null);
  // Leads widget state
  const [leadsNewCount, setLeadsNewCount] = useState(0);
  const [leadsNewItems, setLeadsNewItems] = useState<{ id: string; nama: string; budget: string; departure: string; created_at: string }[]>([]);

  // Fetch leads count for badge + widget (hybrid: only count leads after last_seen)
  const fetchLeadsBadge = useCallback(async () => {
    const lastSeen = localStorage.getItem(`leads_last_seen_${session.user.slug}`) || '';
    const afterParam = lastSeen ? `&after=${encodeURIComponent(lastSeen)}` : '';
    try {
      const res = await fetch(`/api/leads/stats${lastSeen ? `?after=${encodeURIComponent(lastSeen)}` : ''}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) setLeadsNewCount(json.data.new_since ?? json.data.baru ?? 0);
    } catch { /* silent */ }
    try {
      const res = await fetch(`/api/leads?status=baru${afterParam}&limit=2`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success && json.data) {
        setLeadsNewItems(json.data.map((l: any) => ({
          id: l.id,
          nama: l.nama,
          budget: l.answers?.budget || '-',
          departure: l.answers?.departure || '-',
          created_at: l.created_at,
        })));
      }
    } catch { /* silent */ }
  }, [session.user.slug]);

  useEffect(() => { fetchLeadsBadge(); }, [fetchLeadsBadge]);

  const closeStatAlert = useCallback(() => {
    setStatAlertClosing(true);
    setTimeout(() => {
      setShowStatAlert(false);
      setStatAlertClosing(false);
    }, 200);
  }, []);

  const closeDisconnect = useCallback(() => {
    setDisconnectClosing(true);
    setTimeout(() => {
      setShowDisconnectConfirm(false);
      setDisconnectClosing(false);
    }, 200);
  }, []);

  // Navigate tab + update URL
  const navigateTab = useCallback((tab: TabId, replace = false) => {
    // When navigating to leads, mark as seen → reset badge
    if (tab === 'leads') {
      localStorage.setItem(`leads_last_seen_${session.user.slug}`, new Date().toISOString());
      setLeadsNewCount(0);
      setLeadsNewItems([]);
    }
    setActiveTab(tab);
    document.title = TAB_TITLES[tab] || 'Dashboard';
    const slug = TAB_TO_SLUG[tab];
    const url = slug ? `/dashboard/${slug}` : '/dashboard';
    if (replace) {
      window.history.replaceState({ tab }, '', url);
    } else {
      window.history.pushState({ tab }, '', url);
    }
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const tab = getTabFromPath();
      setActiveTab(tab);
      document.title = TAB_TITLES[tab] || 'Dashboard';
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Set initial history state on mount
  useEffect(() => {
    window.history.replaceState({ tab: activeTab }, '', window.location.pathname);
    const aiSub = getAIToolsSubFromPath();
    document.title = (activeTab === 'ai-tools' && aiSub === 'voice-over')
      ? 'Voice Over'
      : (activeTab === 'ai-tools' && aiSub === 'business-card')
      ? 'Kartu Nama'
      : (activeTab === 'ai-tools' && (aiSub === 'haji-plus' || aiSub === 'haji-plus/export'))
      ? (aiSub === 'haji-plus/export' ? 'Export Infografis' : 'Haji Plus')
      : TAB_TITLES[activeTab] || 'Dashboard';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [agentData, setAgentData] = useState(session.user);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  const refreshAgent = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setAgentData(data);
        // Persist updated agent data to localStorage session
        const raw = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session');
        if (raw) {
          try {
            const sess = JSON.parse(raw);
            sess.user = { ...sess.user, ...data };
            const storage = localStorage.getItem('auth_session') ? localStorage : sessionStorage;
            storage.setItem('auth_session', JSON.stringify(sess));
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Refresh agent data on mount to get latest photo/profile from server
  useEffect(() => { refreshAgent(); }, [refreshAgent]);

  const handleLogout = () => {
    clearSession();
    onLogout();
  };

  const isAdmin = agentData.role === 'admin';
  const visibleCards = MENU_CARDS.filter(c => !c.hidden && (!c.adminOnly || isAdmin));

  // ── Sub-page view with dashboard header ──
  if (activeTab !== 'home') {
    const activeCard = MENU_CARDS.find(c => c.id === activeTab);
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950 transition-colors">
        {/* Sub-page header */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => {
                // If on AI Tools sub-page, go back appropriately
                if (activeTab === 'ai-tools' && getAIToolsSubFromPath()) {
                  const aiSub = getAIToolsSubFromPath();
                  // Export page → go back to haji-plus
                  if (aiSub === 'haji-plus/export') {
                    window.history.pushState({}, '', '/dashboard/ai-tools/haji-plus');
                    document.title = 'Haji Plus';
                    setActiveTab('home');
                    setTimeout(() => setActiveTab('ai-tools'), 0);
                    return;
                  }
                  window.history.pushState({}, '', '/dashboard/ai-tools');
                  setActiveTab('home');
                  setTimeout(() => setActiveTab('ai-tools'), 0);
                  return;
                }
                navigateTab('home');
              }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {(() => {
                const aiSub = activeTab === 'ai-tools' ? getAIToolsSubFromPath() : null;
                // Override icon/color for AI Tools sub-pages
                const AI_SUB_STYLES: Record<string, { icon: React.ElementType; bg: string; bgDark: string; border: string; borderDark: string; color: string; label: string }> = {
                  'voice-over': { icon: Mic, bg: 'bg-purple-50', bgDark: 'dark:bg-purple-900/20', border: 'border-purple-100', borderDark: 'dark:border-purple-800/40', color: 'text-purple-600 dark:text-purple-400', label: 'Voice Over' },
                  'business-card': { icon: CreditCard, bg: 'bg-teal-50', bgDark: 'dark:bg-teal-900/20', border: 'border-teal-100', borderDark: 'dark:border-teal-800/40', color: 'text-teal-600 dark:text-teal-400', label: 'Kartu Nama' },
                  'haji-plus': { icon: BarChart3, bg: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20', border: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40', color: 'text-emerald-600 dark:text-emerald-400', label: 'Haji Plus' },
                  'haji-plus/export': { icon: BarChart3, bg: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20', border: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40', color: 'text-emerald-600 dark:text-emerald-400', label: 'Export Infografis' },
                };
                const sub = aiSub && AI_SUB_STYLES[aiSub] ? AI_SUB_STYLES[aiSub] : null;
                if (sub) {
                  const SubIcon = sub.icon;
                  return (
                    <>
                      <div className={`w-8 h-8 rounded-lg ${sub.bg} ${sub.bgDark} flex items-center justify-center border ${sub.border} ${sub.borderDark}`}>
                        <SubIcon size={16} className={sub.color} />
                      </div>
                      <h1 className="text-sm font-bold text-gray-800 dark:text-white truncate">{sub.label}</h1>
                    </>
                  );
                }
                return (
                  <>
                    {activeCard && (
                      <div className={`w-8 h-8 rounded-lg ${activeCard.bgLight} ${activeCard.bgDark} flex items-center justify-center border ${activeCard.borderLight} ${activeCard.borderDark}`}>
                        <activeCard.icon size={16} className={activeCard.color} />
                      </div>
                    )}
                    <h1 className="text-sm font-bold text-gray-800 dark:text-white truncate">{activeCard?.label}</h1>
                  </>
                );
              })()}
            </div>
            {/* Dark mode toggle */}
            <button
              onClick={() => setIsDarkMode(p => !p)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors active:scale-95 shrink-0"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {/* Jamaah disconnect button in header */}
            {activeTab === 'jamaah' && jamaahConnected && jamaahUser && (
              <div className="flex items-center shrink-0">
                <button
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors active:scale-95"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
            {/* Statistik year selector in header */}
            {activeTab === 'statistik' && statistikHeaderRight}
            {/* Analytics month selector in header */}
            {activeTab === 'analytics' && analyticsHeaderRight}
          </div>
        </header>

        {/* Disconnect confirm modal */}
        {showDisconnectConfirm && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center px-6 ${disconnectClosing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
            onClick={closeDisconnect}
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          >
            <div
              className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 w-full max-w-xs overflow-hidden ${disconnectClosing ? 'dc-card-exit' : 'dc-card-enter'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 pt-5 pb-3 text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                  <LogOut size={18} className="text-red-500" />
                </div>
                <p className="text-sm font-bold text-gray-800 dark:text-white">Disconnect Account?</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Anda perlu login ulang untuk mengakses data jamaah.</p>
              </div>
              <div className="flex border-t border-gray-100 dark:border-slate-700">
                <button
                  onClick={closeDisconnect}
                  className="flex-1 py-3 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  Batal
                </button>
                <div className="w-px bg-gray-100 dark:bg-slate-700" />
                <button
                  onClick={async () => {
                    closeDisconnect();
                    try {
                      await fetch('/api/laporan/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
                      await fetch('/api/laporan/credentials', { method: 'DELETE', headers: { ...getAuthHeaders() } });
                    } catch {}
                    setJamaahConnected(false);
                    setJamaahUser('');
                  }}
                  className="flex-1 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-page content */}
        <main className="max-w-lg mx-auto">
          {activeTab === 'settings' && (
            <SettingsPage agent={agentData} onUpdated={refreshAgent} initialTab={getSettingsTabFromPath()} />
          )}
          {activeTab === 'kalkulasi' && (
            <KalkulasiPage agent={{
              name: agentData.name, website: agentData.website,
              phone: agentData.phone, photo: agentData.photo,
            }} hideHeader />
          )}
          {activeTab === 'compare' && (
            <ComparePage agent={{
              name: agentData.name, website: agentData.website,
              phone: agentData.phone, photo: agentData.photo,
            }} hideHeader />
          )}
          {activeTab === 'agents' && isAdmin && (
            <div className="px-4 pt-4">
              <AgentManagementPage />
            </div>
          )}
          {activeTab === 'statistik' && (
            <StatistikPage agentSlug={agentData.slug} onHeaderRight={setStatistikHeaderRight} />
          )}
          {activeTab === 'jamaah' && (
            <JamaahPage
              jamaahConnected={jamaahConnected}
              jamaahUser={jamaahUser}
              initialSubTab={getSubTabFromPath()}
              onConnectionChange={(connected, user) => {
                setJamaahConnected(connected);
                setJamaahUser(user);
              }}
            />
          )}

          {activeTab === 'leads' && (
            <LeadsPage />
          )}

          {activeTab === 'analytics' && isAdmin && (
            <AnalyticsPage onHeaderRight={setAnalyticsHeaderRight} />
          )}

          {activeTab === 'ai-tools' && (() => {
            const sub = getAIToolsSubFromPath();
            if (sub === 'voice-over') return <VoiceOverPage />;
            if (sub === 'business-card') return <BusinessCardPage agent={agentData} />;
            if (sub === 'haji-plus/export') return <HajiPlusExportPage agent={agentData} />;
            if (sub === 'haji-plus') return <HajiPlusPage agent={agentData} onExport={() => {
              window.history.pushState({}, '', '/dashboard/ai-tools/haji-plus/export');
              document.title = 'Export Infografis';
              setActiveTab('home');
              setTimeout(() => setActiveTab('ai-tools'), 0);
            }} />;
            return (
              <AIToolsPage
                onNavigate={(toolId) => {
                  window.history.pushState({}, '', `/dashboard/ai-tools/${toolId}`);
                  document.title = toolId === 'voice-over' ? 'Voice Over' : toolId === 'business-card' ? 'Kartu Nama' : toolId === 'haji-plus' ? 'Haji Plus' : 'Tools';
                  // Force re-render by toggling tab
                  setActiveTab('home');
                  setTimeout(() => setActiveTab('ai-tools'), 0);
                }}
              />
            );
          })()}
        </main>
      </div>
    );
  }

  // ── Home / Card Grid ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950 transition-colors">
      {/* Header with avatar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigateTab('settings')}
              className="relative shrink-0 active:scale-95 transition-transform"
              title="Settings"
            >
              <img
                src={agentData.photo}
                alt={agentData.name}
                className="w-9 h-9 rounded-full object-cover border-2 border-emerald-200 dark:border-emerald-700 shadow-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(agentData.name)}&background=random&size=72`;
                }}
              />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{agentData.name}</p>
                {isAdmin && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[9px] font-bold rounded-full uppercase shrink-0">
                    <Shield size={8} /> Admin
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsDarkMode(p => !p)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={handleLogout}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-500 dark:text-slate-300 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors active:scale-95"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 pt-5 pb-8">

        {/* ── AI Insight Alert Bar ── */}
        <CalendarInsight />

        {/* ── Leads Widget ── */}
        {leadsNewCount > 0 && (
          <div className="mb-4 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-3.5 py-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 flex items-center justify-center">
                <UserPlus size={16} className="text-blue-500" />
              </div>
              <span className="text-sm font-bold text-gray-800 dark:text-white flex-1">Lead Baru</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold">{leadsNewCount}</span>
            </div>
            <div className="px-3.5 pb-2 space-y-2">
              {leadsNewItems.map(item => (
                <div key={item.id} className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[11px] font-bold">{item.nama.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{item.nama}</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">{item.budget} · {item.departure}</p>
                  </div>
                  <span className="text-[10px] text-gray-300 dark:text-slate-600 flex-shrink-0">
                    {(() => {
                      const diff = Date.now() - new Date(item.created_at).getTime();
                      const mins = Math.floor(diff / 60000);
                      if (mins < 60) return `${mins}m`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h`;
                      return `${Math.floor(hrs / 24)}d`;
                    })()}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigateTab('leads')}
              className="w-full flex items-center justify-center gap-1 py-2.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border-t border-gray-50 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
            >
              Lihat Semua <ChevronRight size={12} />
            </button>
          </div>
        )}

        {/* ── Feature Cards Grid ── */}
        <div className="grid grid-cols-3 gap-3">
          {visibleCards.map(card => {
            const Icon = card.icon;
            return (
              <button
                key={card.id + (card.comingSoon ? '-cs' : '')}
                onClick={async () => {
                  if (card.comingSoon) {
                    setShowComingSoon(true);
                    setTimeout(() => setShowComingSoon(false), 2000);
                    return;
                  }
                  if (card.openExternal) {
                    trackEvent('feature', 'open_jadwal');
                    window.open(`/${agentData.slug}`, '_blank');
                    return;
                  }
                  if (card.id === 'statistik') {
                    trackEvent('feature', 'open_statistik');
                    setCheckingStatistik(true);
                    try {
                      const res = await fetch('/api/laporan/status', { headers: getAuthHeaders() });
                      const result = await res.json();
                      const d = result.success ? result.data : {};
                      if (d.hasCredentials || d.lastSync) {
                        navigateTab('statistik');
                      } else {
                        setShowStatAlert(true);
                      }
                    } catch {
                      navigateTab('statistik');
                    } finally {
                      setCheckingStatistik(false);
                    }
                    return;
                  }
                  const eventMap: Record<string, string> = {
                    jamaah: 'open_jamaah', kalkulasi: 'open_kalkulasi', compare: 'open_compare',
                    settings: 'open_settings', analytics: 'open_analytics', 'ai-tools': 'open_ai_tools',
                    leads: 'open_leads',
                  };
                  if (eventMap[card.id]) trackEvent('feature', eventMap[card.id]);
                  navigateTab(card.id);
                }}
                className="group relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.97]"
              >
                {/* Decorative gradient blob */}
                <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full ${card.bgLight} ${card.bgDark} opacity-60 blur-xl group-hover:opacity-80 transition-opacity`} />
                {/* External link indicator */}
                {card.openExternal && (
                  <ExternalLink size={10} className="absolute top-2 right-2 text-gray-300 dark:text-slate-500" />
                )}
                {/* Leads notification badge */}
                {card.id === 'leads' && leadsNewCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center z-10">{leadsNewCount > 9 ? '9+' : leadsNewCount}</span>
                )}
                <div className="relative flex flex-col items-center text-center">
                  {card.id === 'settings' ? (
                    <div className="w-11 h-11 rounded-xl bg-gray-50 dark:bg-gray-800/30 flex items-center justify-center border border-gray-200 dark:border-gray-700/40 mb-2 group-hover:scale-110 transition-transform duration-200">
                      <Settings size={22} className="text-gray-600 dark:text-gray-400" strokeWidth={1.8} />
                    </div>
                  ) : (
                    <div className={`w-11 h-11 rounded-xl ${card.bgLight} ${card.bgDark} flex items-center justify-center border ${card.borderLight} ${card.borderDark} mb-2 group-hover:scale-110 transition-transform duration-200`}>
                      {card.id === 'statistik' && checkingStatistik
                        ? <Loader2 size={22} className={card.color} strokeWidth={1.8} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Icon size={22} className={card.color} strokeWidth={1.8} />}
                    </div>
                  )}
                  <p className="text-[12px] font-bold text-gray-800 dark:text-white leading-tight">
                    {card.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Upcoming Schedule ── */}
        <div className="mt-4">
          <UpcomingSchedule />
        </div>

        {/* ── Statistik Not Ready Alert ── */}
        {showStatAlert && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center px-4 ${statAlertClosing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
            onClick={closeStatAlert}
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          >
            <div
              className={`w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl p-5 ${statAlertClosing ? 'dc-card-exit' : 'dc-card-enter'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center">
                <BarChart3 size={24} className="text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-gray-800 dark:text-white text-center mt-3">
                Statistik Belum Tersedia
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 text-center mt-1.5 leading-relaxed">
                Login di halaman Jamaah terlebih dahulu untuk melihat statistik.
              </p>
              <button
                onClick={() => { closeStatAlert(); setTimeout(() => navigateTab('jamaah'), 200); }}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 mt-4"
              >
                Login Sekarang
              </button>
              <button
                onClick={closeStatAlert}
                className="w-full py-2 rounded-xl text-xs font-semibold text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors mt-2"
              >
                Nanti
              </button>
            </div>
          </div>
        )}

        {/* ── Coming Soon Toast ── */}
        {showComingSoon && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-gray-800 dark:bg-slate-700 text-white rounded-2xl shadow-xl text-sm font-semibold"
            style={{ animation: 'comingSoonIn 0.3s ease-out' }}>
            Segera hadir! 🚀
          </div>
        )}
        <style>{`
          @keyframes comingSoonIn {
            from { opacity: 0; transform: translate(-50%, 10px); }
            to { opacity: 1; transform: translate(-50%, 0); }
          }
        `}</style>
      </main>
    </div>
  );
}

// ── Agents Tab (Admin only) ──
