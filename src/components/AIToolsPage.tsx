import { useEffect, useRef } from 'react';
import { Mic, CreditCard, BarChart3, Banknote, ArrowLeftRight, Globe, FileImage, Calculator, Bot } from 'lucide-react';
import { trackEvent } from '../utils/analytics';

interface AIToolsPageProps {
  onNavigate: (sub: string) => void;
  agentSlug: string;
}

interface Tool {
  id: string;
  name: string;
  desc: string;
  icon: typeof Mic;
  color: string;
  route: string;
  active: boolean;
  restrictedTo?: string[];
}

const TOOLS: Tool[] = [
  {
    id: 'brosur-jadwal',
    name: 'Brosur Jadwal',
    desc: 'Brosur paket umroh per bulan, siap share',
    icon: FileImage,
    color: 'rose',
    route: 'brosur-jadwal',
    active: true,
  },
  {
    id: 'kalkulasi',
    name: 'Kalkulasi',
    desc: 'Hitung harga paket umroh',
    icon: Calculator,
    color: 'blue',
    route: 'kalkulasi',
    active: true,
  },
  {
    id: 'compare',
    name: 'Bandingkan Paket',
    desc: 'Temukan perbedaan dari 2 paket umroh',
    icon: ArrowLeftRight,
    color: 'violet',
    route: 'compare',
    active: true,
  },
  {
    id: 'kurs',
    name: 'Kurs Hari Ini',
    desc: 'Cek & Hitung Kurs Valas hari ini',
    icon: Banknote,
    color: 'amber',
    route: 'kurs',
    active: true,
  },
  {
    id: 'haji-plus',
    name: 'Simulasi Haji Plus',
    desc: 'Buat penawaran untuk calon jamaah haji',
    icon: BarChart3,
    color: 'emerald',
    route: 'haji-plus',
    active: true,
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    desc: 'Atur SEO & link preview saat link dibagikan',
    icon: Globe,
    color: 'purple',
    route: 'landing-page',
    active: true,
  },
  {
    id: 'voice-over',
    name: 'Voice Over Generator',
    desc: 'Buat voice over promosi paket umroh & haji',
    icon: Mic,
    color: 'purple',
    route: 'voice-over',
    active: true,
  },
  {
    id: 'mcp',
    name: 'AI Assistant (MCP)',
    desc: 'Sambungkan asisten AI pribadimu ke data jamaah & paket',
    icon: Bot,
    color: 'teal',
    route: 'mcp',
    active: true,
  },
  {
    id: 'business-card',
    name: 'Kartu Nama Digital',
    desc: 'Dengan 5 pilihan desain, lengkap dengan QR code.',
    icon: CreditCard,
    color: 'teal',
    route: 'business-card',
    active: false,
  },
];

const iconStyles: Record<string, { bg: string; text: string }> = {
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-600 dark:text-purple-400',
  },
  teal: {
    bg: 'bg-teal-50 dark:bg-teal-900/20',
    text: 'text-teal-600 dark:text-teal-400',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    text: 'text-violet-600 dark:text-violet-400',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    text: 'text-rose-600 dark:text-rose-400',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-600 dark:text-blue-400',
  },
};

export default function AIToolsPage({ onNavigate, agentSlug }: AIToolsPageProps) {
  const tracked = useRef(false);
  useEffect(() => { if (!tracked.current) { trackEvent('feature', 'open_ai_tools'); tracked.current = true; } }, []);

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex flex-col gap-3">
        {TOOLS.map(tool => {
          const Icon = tool.icon;
          const { bg, text } = iconStyles[tool.color];
          const restricted = !!tool.restrictedTo && !tool.restrictedTo.includes(agentSlug);
          const enabled = tool.active && !restricted;
          return (
            <div
              key={tool.id}
              onClick={() => enabled && tool.route && onNavigate(tool.route)}
              className={`relative bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4 transition-all ${
                enabled
                  ? 'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] cursor-pointer'
                  : 'opacity-60 cursor-default'
              }`}
            >
              {!tool.active && (
                <span className="absolute top-3 right-3 text-[8px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 px-2 py-0.5 rounded-full">
                  Segera Hadir
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={20} className={text} />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-white mt-3">{tool.name}</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{tool.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
