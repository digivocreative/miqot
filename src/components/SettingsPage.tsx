import { useState, useEffect, useRef } from 'react';
import { User, Send, Code } from 'lucide-react';
import DashboardProfile from './DashboardProfile';
import { TelegramSection } from './DashboardProfile';
import CapiPage from './CapiPage';
import { trackEvent } from '../utils/analytics';

interface AgentData {
  slug: string;
  name: string;
  website: string;
  phone: string;
  email: string;
  telegram_chat_id?: string;
  photo: string;
  role: string;
  card_variant?: string;
}

type SettingsTab = 'profil' | 'telegram' | 'capi';

const TAB_CONFIG: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'capi', label: 'CAPI', icon: Code },
];

export default function SettingsPage({ agent, onUpdated, initialTab }: { agent: AgentData; onUpdated: () => void; initialTab?: SettingsTab }) {
  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_settings'); mountTracked.current = true; } }, []);

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'profil');

  // Update tab on URL change (browser back/forward)
  const switchTab = (tab: SettingsTab) => {
    setActiveTab(tab);
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
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-full">
            {TAB_CONFIG.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all duration-200 active:opacity-70 ${
                    isActive
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-500 dark:text-emerald-400 font-semibold'
                      : 'bg-transparent text-gray-400 dark:text-slate-500 font-medium'
                  }`}
                  style={isActive ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : undefined}
                >
                  <Icon size={13} strokeWidth={2.2} />
                  <span className="text-[11px]">{tab.label}</span>
                </button>
              );
            })}
          </div>
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
          <CapiPage agentSlug={agent.slug} hideHeader embedded />
        )}
      </div>
    </div>
  );
}
