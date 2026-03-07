import { useState, useEffect, useCallback } from 'react';
import {
  Calculator, ArrowLeftRight, Settings,
  LogOut, Shield, Users, Moon, Sun, ChevronLeft, ChevronRight,
  Globe, Phone, LayoutGrid, User,
} from 'lucide-react';
import type { AuthSession } from './LoginPage';
import { clearSession, getAuthHeaders } from './LoginPage';
import KalkulasiPage from './KalkulasiPage';
import ComparePage from './ComparePage';
import CapiPage from './CapiPage';
import DashboardProfile from './DashboardProfile';
import JamaahPage from './JamaahPage';

type TabId = 'home' | 'profile' | 'kalkulasi' | 'compare' | 'caption' | 'capi' | 'agents' | 'jamaah';

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
}

const MENU_CARDS: MenuCard[] = [
  {
    id: 'profile', label: 'Edit Profil', desc: '',
    icon: User, color: 'text-blue-600 dark:text-blue-400',
    bgLight: 'bg-blue-50', bgDark: 'dark:bg-blue-900/20',
    borderLight: 'border-blue-100', borderDark: 'dark:border-blue-800/40',
    hidden: true,
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
    id: 'capi', label: 'Meta CAPI', desc: 'Pixel & access token',
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
    id: 'jamaah', label: 'Jamaah', desc: 'Data jamaah',
    icon: Users, color: 'text-amber-600 dark:text-amber-400',
    bgLight: 'bg-amber-50', bgDark: 'dark:bg-amber-900/20',
    borderLight: 'border-amber-100', borderDark: 'dark:border-amber-800/40',
  },
];

export default function DashboardLayout({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('home');
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
      }
    } catch { /* ignore */ }
  }, []);

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
              onClick={() => setActiveTab('home')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {activeCard && (
                <div className={`w-8 h-8 rounded-lg ${activeCard.bgLight} ${activeCard.bgDark} flex items-center justify-center border ${activeCard.borderLight} ${activeCard.borderDark}`}>
                  <activeCard.icon size={16} className={activeCard.color} />
                </div>
              )}
              <h1 className="text-sm font-bold text-gray-800 dark:text-white truncate">
                {activeCard?.label}
              </h1>
            </div>
          </div>
        </header>

        {/* Sub-page content */}
        <main className="max-w-lg mx-auto">
          {activeTab === 'profile' && (
            <div className="px-4 pt-4">
              <DashboardProfile agent={agentData} onUpdated={refreshAgent} />
            </div>
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
          {activeTab === 'capi' && (
            <CapiPage agentSlug={agentData.slug} hideHeader />
          )}
          {activeTab === 'agents' && isAdmin && (
            <div className="px-4 pt-4">
              <AgentsTab />
            </div>
          )}
          {activeTab === 'jamaah' && (
            <JamaahPage />
          )}
        </main>
      </div>
    );
  }

  // ── Home / Card Grid ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-950 transition-colors">
      {/* Minimal top bar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-gray-100 dark:border-slate-700/50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center border border-emerald-100 dark:border-emerald-800/40">
              <LayoutGrid size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-white">Dashboard</p>
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
        {/* ── Agent Profile Card ── */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm mb-5">
          <div className="flex items-center gap-3.5">
            <img
              src={agentData.photo}
              alt={agentData.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-emerald-100 dark:border-emerald-800/50 shadow-md shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(agentData.name)}&background=random`;
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[15px] font-bold text-gray-800 dark:text-white truncate">
                  {agentData.name}
                </h2>
                {isAdmin && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[9px] font-bold rounded-full uppercase shrink-0">
                    <Shield size={8} /> Admin
                  </span>
                )}
              </div>
              <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                <Globe size={11} className="shrink-0" /> {agentData.website || agentData.slug}
              </p>
              <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                <Phone size={11} className="shrink-0" /> {agentData.phone?.replace(/^62/, '0').replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3')}
              </p>
            </div>
            <button
              onClick={() => setActiveTab('profile')}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-400 dark:text-slate-500 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-slate-300 transition-all active:scale-95"
              title="Edit Profil"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* ── Feature Cards Grid ── */}
        <div className="grid grid-cols-3 gap-3">
          {visibleCards.map(card => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => setActiveTab(card.id)}
                className="group relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-gray-100 dark:border-slate-700 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.97]"
              >
                {/* Decorative gradient blob */}
                <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full ${card.bgLight} ${card.bgDark} opacity-60 blur-xl group-hover:opacity-80 transition-opacity`} />
                <div className="relative flex flex-col items-center text-center">
                  {card.id === 'capi' ? (
                    <div className="w-11 h-11 rounded-xl bg-gray-50 dark:bg-gray-800/30 flex items-center justify-center border border-gray-200 dark:border-gray-700/40 mb-2 group-hover:scale-110 transition-transform duration-200">
                      <img src="/logo-meta.png" alt="Meta" className="w-6 h-6 object-contain" />
                    </div>
                  ) : (
                    <div className={`w-11 h-11 rounded-xl ${card.bgLight} ${card.bgDark} flex items-center justify-center border ${card.borderLight} ${card.borderDark} mb-2 group-hover:scale-110 transition-transform duration-200`}>
                      <Icon size={22} className={card.color} strokeWidth={1.8} />
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
      </main>
    </div>
  );
}

// ── Agents Tab (Admin only) ──
function AgentsTab() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/agents', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAgents(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
          Semua Agent ({agents.length})
        </p>
      </div>
      {agents.map(a => (
        <div
          key={a.slug}
          className="bg-white dark:bg-slate-800 rounded-xl p-3 border border-gray-100 dark:border-slate-700 shadow-sm flex items-center gap-3"
        >
          <img
            src={a.photo}
            alt={a.name}
            className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-sm"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=random`;
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{a.name}</p>
              {a.role === 'admin' && (
                <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[9px] font-bold rounded-full">
                  ADMIN
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{a.slug} · {a.phone}</p>
          </div>
          <ChevronRight size={16} className="text-gray-300 dark:text-slate-600 shrink-0" />
        </div>
      ))}
    </div>
  );
}
