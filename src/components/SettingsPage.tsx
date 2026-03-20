import { useState, useEffect } from 'react';
import { User, Send, Code } from 'lucide-react';
import DashboardProfile from './DashboardProfile';
import { TelegramSection } from './DashboardProfile';
import CapiPage from './CapiPage';

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

export default function SettingsPage({ agent, onUpdated }: { agent: AgentData; onUpdated: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const hash = window.location.hash.replace('#', '') as SettingsTab;
    if (['profil', 'telegram', 'capi'].includes(hash)) return hash;
    return 'profil';
  });

  // Update hash on tab change
  const switchTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `/dashboard/settings${tab !== 'profil' ? '#' + tab : ''}`);
    // Scroll to top on tab switch
    window.scrollTo({ top: 0 });
  };

  // Listen for hash changes
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '') as SettingsTab;
      if (['profil', 'telegram', 'capi'].includes(hash)) setActiveTab(hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
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
