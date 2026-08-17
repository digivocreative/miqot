import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import {
  Calculator, ArrowLeftRight, Settings,
  LogOut, Shield, Users, Moon, Sun, ChevronLeft,
  BarChart3, Loader2, Sparkles,
  CalendarRange, TrendingUp, Mic, CreditCard,
  DollarSign, ChevronRight, Globe, Share2, FileImage, Bot, MessagesSquare, Building2,
} from 'lucide-react';
import type { AuthSession } from './LoginPage';
import { clearSession, getAuthHeaders } from './LoginPage';
import type { Birthday } from './BirthdayWidget';
import { trackEvent } from '../utils/analytics';
import JamaahEditSkeleton from './JamaahEditSkeleton';
import HotelRouteSkeleton, { type HotelSkeletonKind } from './HotelSkeletons';
import { isCommunityEnabledForAgent } from '../lib/communityAccess';
import { isHotelDirectoryEnabledForAgent } from '../lib/hotelAccess';
import { parseTerasPath } from '../lib/terasRoutes';
import { readBrosurModeFromPath } from '../lib/brosur-mode';
import NotificationBell from './NotificationBell';
import { useTerasNotifications } from '../hooks/useTerasNotifications';
import TerasNotificationSettings from './TerasNotificationSettings';
import { useTerasNotificationPrefs } from '../hooks/useTerasNotificationPrefs';

function getLocalStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocalStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // unavailable storage should not block dashboard rendering
  }
}

function TerasPageSkeleton() {
  return (
    <div className="w-full bg-white pb-8 dark:bg-slate-900" aria-label="Memuat halaman Teras" aria-busy="true">
      <div className="animate-pulse border-b border-gray-100 bg-white px-4 py-2 motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-slate-700" />
          <div className="h-11 flex-1 rounded-full border border-gray-100 bg-white dark:border-slate-700 dark:bg-slate-900" />
          <div className="h-11 w-11 shrink-0 rounded-full bg-gray-100 dark:bg-slate-800" />
        </div>
      </div>

      {[0, 1, 2].map(item => (
        <div
          key={item}
          data-teras-skeleton-post
          className="relative animate-pulse border-b border-gray-100 bg-white px-4 py-3 motion-reduce:animate-none dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Stands in for the "…" menu button, which is transparent at rest — a
              filled circle here reads as a second agent photo while loading. */}
          <div className="absolute right-2 top-0 flex h-11 w-11 items-center justify-center">
            <div className="h-1 w-4 rounded-full bg-gray-100 dark:bg-slate-800" />
          </div>
          <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-slate-700" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 pr-10">
                <div className="h-3 w-28 rounded bg-gray-200 dark:bg-slate-700" />
                <div className="h-2.5 w-12 rounded bg-gray-100 dark:bg-slate-700/70" />
              </div>
              <div className="mt-2 space-y-2">
                <div className="h-3.5 w-full rounded bg-gray-100 dark:bg-slate-700/70" />
                <div className="h-3.5 w-5/6 rounded bg-gray-100 dark:bg-slate-700/70" />
                <div className="h-3.5 w-2/3 rounded bg-gray-100 dark:bg-slate-700/70" />
              </div>
              {item === 0 && (
                <div data-teras-skeleton-media className="mt-2 aspect-[4/3] max-h-[24rem] rounded-xl bg-gray-100 dark:bg-slate-800" />
              )}
              <div className="mt-1 flex gap-1 py-0.5">
                <div className="h-11 w-11 rounded-full bg-gray-100 dark:bg-slate-800" />
                <div className="h-11 w-11 rounded-full bg-gray-100 dark:bg-slate-800" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Heavy sub-pages are code-split: each becomes its own chunk, fetched on-demand
// the first time its tab renders. This keeps the initial bundle (and the JS that
// must be parsed on every reload) small. lazy/Suspense imported at top.
const KalkulasiPage = lazy(() => import('./KalkulasiPage'));
const ComparePage = lazy(() => import('./ComparePage'));
const JamaahPage = lazy(() => import('./JamaahPage'));
const StatistikPage = lazy(() => import('./StatistikPage'));
const AgentManagementPage = lazy(() => import('./AgentManagementPage'));
const AnalyticsPage = lazy(() => import('./AnalyticsPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const AIToolsPage = lazy(() => import('./AIToolsPage'));
const VoiceOverPage = lazy(() => import('./VoiceOverPage'));
const BusinessCardPage = lazy(() => import('./BusinessCardPage'));
const LandingPagePage = lazy(() => import('./LandingPagePage'));
const CustomDomainPage = lazy(() => import('./CustomDomainPage'));
const HajiPlusPage = lazy(() => import('./HajiPlusPage'));
const HajiPlusExportPage = lazy(() => import('./HajiPlusExportPage'));
const KursPage = lazy(() => import('./KursPage'));
const BrochureSchedulePage = lazy(() => import('./BrochureSchedulePage'));
const McpIntegrationPage = lazy(() => import('./McpIntegrationPage'));
const HotelPage = lazy(() => import('./HotelPage'));
const HotelKelolaPage = lazy(() => import('./HotelKelolaPage'));
const UmrahRegisterPage = lazy(() => import('./UmrahRegisterPage'));
const JamaahEditPage = lazy(() => import('./JamaahEditPage'));
const TerasPage = lazy(() => import('./TerasPage'));
// Home widgets — only mounted on the home tab; split out of the initial chunk
// so a deep-link to a non-home dashboard route doesn't pay for them.
const TerasCard = lazy(() => import('./TerasCard'));
const UpcomingSchedule = lazy(() => import('./UpcomingSchedule'));
const TelegramConnectBanner = lazy(() => import('./TelegramConnectBanner'));
const FlightStatusCard = lazy(() => import('./FlightStatusCard'));
const CuacaWidget = lazy(() => import('./CuacaWidget'));
const BirthdayWidget = lazy(() => import('./BirthdayWidget'));

const ShareKursModal = lazy(() => import('./ShareKursModal'));
const BirthdayDetailSheet = lazy(() => import('./BirthdayDetailSheet'));

type TabId = 'home' | 'settings' | 'brosur' | 'agents' | 'jamaah' | 'statistik' | 'analytics' | 'ai-tools' | 'teras' | 'hotels';

// URL slug ↔ TabId mapping
const SLUG_TO_TAB: Record<string, TabId> = {
  brosur: 'brosur',
  agents: 'agents',
  jamaah: 'jamaah',
  statistik: 'statistik',
  settings: 'settings',
  analytics: 'analytics',
  'ai-tools': 'ai-tools',
  teras: 'teras',
  hotels: 'hotels',
};

const TAB_TO_SLUG: Partial<Record<TabId, string>> = {
  brosur: 'brosur',
  agents: 'agents',
  jamaah: 'jamaah',
  statistik: 'statistik',
  settings: 'settings',
  analytics: 'analytics',
  'ai-tools': 'ai-tools',
  teras: 'teras',
  hotels: 'hotels',
};

function getTabFromPath(): TabId {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/{slug}
  if (segments.length >= 2 && segments[0] === 'dashboard') {
    return SLUG_TO_TAB[segments[1]] || 'home';
  }
  if (parseTerasPath(window.location.pathname)?.kind === 'profile') return 'teras';
  return 'home';
}

function getTerasPostIdFromPath(): string | null {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/teras/post/:id
  if (segments[0] === 'dashboard' && segments[1] === 'teras' && segments[2] === 'post' && segments[3]) {
    return decodeURIComponent(segments[3]);
  }
  return null;
}

function getTerasProfileSlugFromPath(): string | null {
  const route = parseTerasPath(window.location.pathname);
  return route?.kind === 'profile' ? route.slug : null;
}

function getSubTabFromPath(): 'umroh' | 'haji' | 'daftar' | 'edit' {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/jamaah/haji
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'jamaah' && segments[2] === 'haji') return 'haji';
  // /dashboard/jamaah/daftar
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'jamaah' && segments[2] === 'daftar') return 'daftar';
  // /dashboard/jamaah/edit/:id
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'jamaah' && segments[2] === 'edit') return 'edit';
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

function getStatistikTabFromPath(): 'umroh' | 'haji' | 'tren' {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'statistik') {
    if (segments[2] === 'haji') return 'haji';
    if (segments[2] === 'tren-daftar') return 'tren';
  }
  return 'umroh';
}

function getAIToolsSubFromPath(): string | null {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  // /dashboard/ai-tools/voice-over OR /dashboard/ai-tools/haji-plus/export
  if (segments.length >= 3 && segments[0] === 'dashboard' && segments[1] === 'ai-tools') {
    // Handle nested sub-paths like haji-plus/export, haji-plus/simulasi
    if (segments.length >= 4 && segments[2] === 'haji-plus' && segments[3] === 'export') {
      return 'haji-plus/export';
    }
    if (segments.length >= 4 && segments[2] === 'haji-plus' && segments[3] === 'simulasi') {
      return 'haji-plus/simulasi';
    }
    if (segments.length >= 4 && segments[2] === 'landing-page' && segments[3] === 'custom-domain') {
      return 'landing-page/custom-domain';
    }
    return segments[2];
  }
  return null;
}

// Sub-path Direktori Hotel: /dashboard/ai-tools/hotel[/:city[/:slug]].
// Label kota digandakan di sini (4 entri) agar chunk HotelPage tetap lazy.
const HOTEL_HEADER_CITY_LABELS: Record<string, string> = {
  mekkah: 'Mekkah', madinah: 'Madinah', turki: 'Turki', dubai: 'Dubai',
};

function getHotelPathInfo(): { city: string | null; slug: string | null; isMedia: boolean } {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments[0] === 'dashboard' && segments[1] === 'ai-tools' && segments[2] === 'hotel') {
    const city = decodeURIComponent(segments[3] || '');
    if (HOTEL_HEADER_CITY_LABELS[city]) {
      const slug = decodeURIComponent(segments[4] || '') || null;
      return { city, slug, isMedia: Boolean(slug) && segments[5] === 'media' };
    }
  }
  return { city: null, slug: null, isMedia: false };
}

function hotelHeaderLabel(): string {
  const { city, slug, isMedia } = getHotelPathInfo();
  if (isMedia) return 'Foto & Video';
  if (slug) return 'Detail Hotel';
  if (city) return `Hotel ${HOTEL_HEADER_CITY_LABELS[city]}`;
  return 'Direktori Hotel';
}

// Sub-view panel Kelola Hotel (/dashboard/hotels[/tambah|/edit/:slug]) —
// judul & back bertahap di header, tanpa baris back internal di halaman.
function getHotelsKelolaSub(): 'tambah' | 'edit' | null {
  const segments = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments[0] === 'dashboard' && segments[1] === 'hotels') {
    if (segments[2] === 'tambah') return 'tambah';
    if (segments[2] === 'edit' && segments[3]) return 'edit';
  }
  return null;
}

function hotelsHeaderLabel(): string {
  const sub = getHotelsKelolaSub();
  if (sub === 'tambah') return 'Tambah Hotel';
  if (sub === 'edit') return 'Edit Hotel';
  return 'Hotels';
}

const TAB_TITLES: Record<TabId, string> = {
  home: 'Dashboard',
  settings: 'Settings',
  brosur: 'Brosur',
  agents: 'Agents',
  jamaah: 'Jamaah',
  statistik: 'Statistik',
  analytics: 'Analytics',
  'ai-tools': 'Tools',
  teras: 'Teras',
  hotels: 'Hotels',
};

// Judul dokumen per sub-halaman Tools. SATU sumber: navigatePath memakainya
// lewat getCurrentDocumentTitle, jadi pemanggil cukup pindah URL tanpa ikut
// menyetel document.title sendiri (dulu tiap pemanggil menyalin judulnya —
// gampang melenceng).
const AI_TOOLS_TITLES: Record<string, string> = {
  'voice-over': 'Voice Over',
  'business-card': 'Kartu Nama',
  'landing-page': 'Landing Page',
  'landing-page/custom-domain': 'Custom Domain',
  'haji-plus': 'Haji Plus',
  'haji-plus/simulasi': 'Haji Plus',
  'haji-plus/export': 'Export Infografis',
  kurs: 'Kurs Hari Ini',
  compare: 'Compare',
  'brosur-jadwal': 'Brosur Jadwal',
  kalkulasi: 'Kalkulasi',
  mcp: 'AI Assistant (MCP)',
};

function getCurrentDocumentTitle(): string {
  const sub = getAIToolsSubFromPath();
  if (sub === 'hotel') return hotelHeaderLabel();
  if (sub && AI_TOOLS_TITLES[sub]) return AI_TOOLS_TITLES[sub];
  if (getHotelsKelolaSub()) return hotelsHeaderLabel();
  if (getTerasPostIdFromPath()) return 'Kiriman';
  if (getTerasProfileSlugFromPath()) return 'Teras';
  return TAB_TITLES[getTabFromPath()] || 'Dashboard';
}

// Bentuk skeleton Direktori Hotel yang dipakai selagi chunk halamannya diunduh.
function hotelRouteSkeletonKind(): HotelSkeletonKind {
  const { city, slug } = getHotelPathInfo();
  return slug ? 'detail' : city ? 'list' : 'kategori';
}

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
  // Vibrant styling for home grid cards
  cardBg: string;
  cardBorder: string;
  iconBg: string;
  iconShadow: string;
  hoverShadow: string;
  iconAnim: string;
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
    cardBg: 'bg-gradient-to-br from-emerald-50 via-white to-teal-100/70 dark:from-emerald-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-emerald-200/70 dark:border-emerald-800/40',
    iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-600 dark:from-emerald-500 dark:to-teal-700',
    iconShadow: 'shadow-lg shadow-emerald-500/30 dark:shadow-emerald-900/40',
    hoverShadow: 'hover:shadow-emerald-300/40 dark:hover:shadow-emerald-900/30',
    iconAnim: 'animate-icon-float',
    openExternal: true,
  },
  {
    id: 'jamaah', label: 'Jamaah', desc: 'Data jamaah',
    icon: Users, color: 'text-amber-600 dark:text-amber-400',
    bgLight: 'bg-amber-50', bgDark: 'dark:bg-amber-900/20',
    borderLight: 'border-amber-100', borderDark: 'dark:border-amber-800/40',
    cardBg: 'bg-gradient-to-br from-amber-50 via-white to-orange-100/70 dark:from-amber-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-amber-200/70 dark:border-amber-800/40',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500 dark:from-amber-500 dark:to-orange-600',
    iconShadow: 'shadow-lg shadow-amber-500/30 dark:shadow-amber-900/40',
    hoverShadow: 'hover:shadow-amber-300/40 dark:hover:shadow-amber-900/30',
    iconAnim: 'animate-icon-breathe',
  },
  {
    id: 'statistik', label: 'Statistik', desc: 'Ringkasan data',
    icon: BarChart3, color: 'text-emerald-600 dark:text-emerald-400',
    bgLight: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20',
    borderLight: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40',
    cardBg: 'bg-gradient-to-br from-green-50 via-white to-emerald-100/70 dark:from-green-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-green-200/70 dark:border-emerald-800/40',
    iconBg: 'bg-gradient-to-br from-green-400 to-emerald-600 dark:from-green-500 dark:to-emerald-700',
    iconShadow: 'shadow-lg shadow-green-500/30 dark:shadow-emerald-900/40',
    hoverShadow: 'hover:shadow-green-300/40 dark:hover:shadow-emerald-900/30',
    iconAnim: 'animate-icon-rise',
  },
  {
    id: 'brosur', label: 'Brosur', desc: 'Brosur paket umroh per bulan',
    icon: FileImage, color: 'text-rose-600 dark:text-rose-400',
    bgLight: 'bg-rose-50', bgDark: 'dark:bg-rose-900/20',
    borderLight: 'border-rose-100', borderDark: 'dark:border-rose-800/40',
    cardBg: 'bg-gradient-to-br from-rose-50 via-white to-pink-100/70 dark:from-rose-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-rose-200/70 dark:border-rose-800/40',
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-600 dark:from-rose-500 dark:to-pink-700',
    iconShadow: 'shadow-lg shadow-rose-500/30 dark:shadow-rose-900/40',
    hoverShadow: 'hover:shadow-rose-300/40 dark:hover:shadow-rose-900/30',
    iconAnim: 'animate-icon-wiggle',
  },
  {
    id: 'teras', label: 'Teras', desc: 'Ruang berbagi agent',
    icon: MessagesSquare, color: 'text-teal-600 dark:text-teal-400',
    bgLight: 'bg-teal-50', bgDark: 'dark:bg-teal-900/20',
    borderLight: 'border-teal-100', borderDark: 'dark:border-teal-800/40',
    cardBg: 'bg-gradient-to-br from-teal-50 via-white to-cyan-100/70 dark:from-teal-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-teal-200/70 dark:border-teal-800/40',
    iconBg: 'bg-gradient-to-br from-teal-400 to-cyan-600 dark:from-teal-500 dark:to-cyan-700',
    iconShadow: 'shadow-lg shadow-teal-500/30 dark:shadow-teal-900/40',
    hoverShadow: 'hover:shadow-teal-300/40 dark:hover:shadow-teal-900/30',
    iconAnim: 'animate-icon-breathe',
    hidden: true,
  },
  {
    id: 'ai-tools', label: 'Tools', desc: 'Voice over & AI lainnya',
    icon: Sparkles, color: 'text-purple-600 dark:text-purple-400',
    bgLight: 'bg-purple-50', bgDark: 'dark:bg-purple-900/20',
    borderLight: 'border-purple-100', borderDark: 'dark:border-purple-800/40',
    cardBg: 'bg-gradient-to-br from-fuchsia-50 via-white to-purple-100/70 dark:from-purple-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-fuchsia-200/70 dark:border-purple-800/40',
    iconBg: 'bg-gradient-to-br from-fuchsia-400 to-purple-600 dark:from-fuchsia-500 dark:to-purple-700',
    iconShadow: 'shadow-lg shadow-purple-500/30 dark:shadow-purple-900/40',
    hoverShadow: 'hover:shadow-fuchsia-300/40 dark:hover:shadow-purple-900/30',
    iconAnim: 'animate-icon-twinkle',
  },
  {
    id: 'settings', label: 'Settings', desc: 'Profil, Telegram & CAPI',
    icon: Settings, color: 'text-gray-600 dark:text-gray-400',
    bgLight: 'bg-gray-50', bgDark: 'dark:bg-gray-800/30',
    borderLight: 'border-gray-200', borderDark: 'dark:border-gray-700/40',
    cardBg: 'bg-gradient-to-br from-slate-100 via-white to-slate-200/70 dark:from-slate-700/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-slate-200/80 dark:border-slate-700/40',
    iconBg: 'bg-gradient-to-br from-slate-500 to-slate-700 dark:from-slate-600 dark:to-slate-800',
    iconShadow: 'shadow-lg shadow-slate-500/25 dark:shadow-slate-900/40',
    hoverShadow: 'hover:shadow-slate-300/40 dark:hover:shadow-slate-900/30',
    iconAnim: 'animate-icon-spin-slow',
  },
  {
    id: 'agents', label: 'Agents', desc: 'Lihat & edit agent',
    icon: Users, color: 'text-cyan-600 dark:text-cyan-400',
    bgLight: 'bg-cyan-50', bgDark: 'dark:bg-cyan-900/20',
    borderLight: 'border-cyan-100', borderDark: 'dark:border-cyan-800/40',
    cardBg: 'bg-gradient-to-br from-cyan-50 via-white to-teal-100/70 dark:from-cyan-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-cyan-200/70 dark:border-cyan-800/40',
    iconBg: 'bg-gradient-to-br from-cyan-400 to-teal-600 dark:from-cyan-500 dark:to-teal-700',
    iconShadow: 'shadow-lg shadow-cyan-500/30 dark:shadow-cyan-900/40',
    hoverShadow: 'hover:shadow-cyan-300/40 dark:hover:shadow-cyan-900/30',
    iconAnim: 'animate-icon-breathe',
    adminOnly: true,
  },
  {
    id: 'analytics', label: 'Analytics', desc: 'Statistik app',
    icon: TrendingUp, color: 'text-cyan-600 dark:text-cyan-400',
    bgLight: 'bg-cyan-50', bgDark: 'dark:bg-cyan-900/20',
    borderLight: 'border-cyan-100', borderDark: 'dark:border-cyan-800/40',
    cardBg: 'bg-gradient-to-br from-cyan-50 via-white to-sky-100/70 dark:from-cyan-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-cyan-200/70 dark:border-cyan-800/40',
    iconBg: 'bg-gradient-to-br from-cyan-400 to-sky-600 dark:from-cyan-500 dark:to-sky-700',
    iconShadow: 'shadow-lg shadow-cyan-500/30 dark:shadow-cyan-900/40',
    hoverShadow: 'hover:shadow-cyan-300/40 dark:hover:shadow-cyan-900/30',
    iconAnim: 'animate-icon-rise',
    adminOnly: true,
  },
  {
    // Pusat kelola konten Direktori Hotel — hanya admin dalam gate hotel
    // (filter adminCards) yang melihat kartu ini.
    id: 'hotels', label: 'Hotels', desc: 'Kelola konten hotel',
    icon: Building2, color: 'text-teal-600 dark:text-teal-400',
    bgLight: 'bg-teal-50', bgDark: 'dark:bg-teal-900/20',
    borderLight: 'border-teal-100', borderDark: 'dark:border-teal-800/40',
    cardBg: 'bg-gradient-to-br from-teal-50 via-white to-emerald-100/70 dark:from-teal-950/40 dark:via-slate-800 dark:to-slate-800',
    cardBorder: 'border-teal-200/70 dark:border-teal-800/40',
    iconBg: 'bg-gradient-to-br from-teal-400 to-emerald-600 dark:from-teal-500 dark:to-emerald-700',
    iconShadow: 'shadow-lg shadow-teal-500/30 dark:shadow-teal-900/40',
    hoverShadow: 'hover:shadow-teal-300/40 dark:hover:shadow-teal-900/30',
    iconAnim: 'animate-icon-breathe',
    adminOnly: true,
  },
];

export default function DashboardLayout({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>(getTabFromPath);

  // pathTick bumps whenever we change URL via pushState without full navigation,
  // so JSX that reads location (getSubTabFromPath, getAIToolsSubFromPath, etc.)
  // re-evaluates. Avoids window.location.reload(), which would hit the cached
  // index.html in the service worker and load the previous bundle.
  const [, setPathTick] = useState(0);

  // Jamaah session persistence across tab switches
  const [jamaahConnected, setJamaahConnected] = useState(false);
  const [jamaahUser, setJamaahUser] = useState('');
  const [jamaahRefreshKey, setJamaahRefreshKey] = useState(0);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnectClosing, setDisconnectClosing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  // Statistik header slot for year dropdown
  const [statistikHeaderRight, setStatistikHeaderRight] = useState<React.ReactNode>(null);
  const [jamaahHeaderRight, setJamaahHeaderRight] = useState<React.ReactNode>(null);
  const [jamaahEditHeader, setJamaahEditHeader] = useState<{ label: string; title: string } | null>(null);
  // Brosur "kolom ke-3" mode lives here (next to isDarkMode) so the header toggle
  // reads live state — guarantees the active highlight updates on click. Passed
  // down to BrochureSchedulePage as a prop. Persisted like the dark-mode pref.
  const [brosurDisplayMode, setBrosurDisplayMode] = useState<'hari' | 'seat'>(() => {
    try { return localStorage.getItem('brosurDisplayMode') === 'seat' ? 'seat' : 'hari'; }
    catch { return 'hari'; }
  });
  const chooseBrosurDisplayMode = (mode: 'hari' | 'seat') => {
    setBrosurDisplayMode(mode);
    try { localStorage.setItem('brosurDisplayMode', mode); } catch { /* private mode: ignore */ }
  };
  // Mode halaman Brosur (jadwal/paket) sengaja TIDAK disimpan sebagai state di
  // sini: sumber kebenarannya URL, dan dibaca saat render seperti
  // getSubTabFromPath/getAIToolsSubFromPath. State salinan akan basi satu frame
  // setiap kali halaman Brosur di-remount. Tick ini hanya pemicu re-render,
  // karena BrochureSchedulePage berganti mode lewat replaceState yang tidak
  // melewati navigatePath sehingga pathTick tidak ikut naik.
  const [, setBrosurModeTick] = useState(0);
  const handleBrosurModeChange = useCallback(() => setBrosurModeTick(t => t + 1), []);
  // Jamaah status: lazy check on Statistik click
  const [checkingStatistik, setCheckingStatistik] = useState(false);
  const [showStatAlert, setShowStatAlert] = useState(false);
  const [statAlertClosing, setStatAlertClosing] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  // Analytics header slot for month dropdown
  const [analyticsHeaderRight, setAnalyticsHeaderRight] = useState<React.ReactNode>(null);
  // Flight status position
  const [flightCount, setFlightCount] = useState(-1); // -1 = not loaded yet

  // Kurs widget state
  const [kursData, setKursData] = useState<{
    usd: number | null;
    sar: number | null;
    updatedAt: string;
  } | null>(null);
  const [showShareKurs, setShowShareKurs] = useState(false);
  const [selectedBirthday, setSelectedBirthday] = useState<Birthday | null>(null);

  useEffect(() => {
    fetch('/api/kurs')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          const rates = d.data.rates || {};
          const usdRate = rates.USD ?? null;
          const sarRate = rates.SAR ?? null;
          if (usdRate !== null) {
            // Parse "DD/MM/YY HH:MM WIB" → "Minggu, 5 April 2026 • 09:51 WIB"
            let formattedDate = d.data.updatedAt || '';
            const m = formattedDate.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})\s*WIB/);
            if (m) {
              const dt = new Date(2000 + parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
              const dayName = dt.toLocaleDateString('id-ID', { weekday: 'long' });
              const monthName = dt.toLocaleDateString('id-ID', { month: 'long' });
              formattedDate = `${dayName}, ${dt.getDate()} ${monthName} ${dt.getFullYear()}`;
            }

            setKursData({
              usd: usdRate,
              sar: sarRate,
              updatedAt: formattedDate,
            });
          }
        }
      })
      .catch(() => {}); // silent fail — widget tidak muncul kalau gagal
  }, []);

  const formatKurs = (rate: number): string => {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(rate);
  };
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
      setDisconnecting(false);
    }, 200);
  }, []);

  // Navigate tab + update URL
  const navigateTab = useCallback((tab: TabId, replace = false) => {
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

  // Navigate to an arbitrary in-app path without a full page reload.
  // Used for sub-routes like /dashboard/jamaah/daftar where the SW would
  // otherwise serve a stale index.html on reload.
  const navigatePath = useCallback((path: string, opts?: { replace?: boolean; state?: Record<string, unknown> }) => {
    const state = opts?.state || {};
    if (opts?.replace) {
      window.history.replaceState(state, '', path);
    } else {
      window.history.pushState(state, '', path);
    }
    const tab = getTabFromPath();
    setActiveTab(tab);
    document.title = getCurrentDocumentTitle();
    setPathTick(t => t + 1);
  }, []);

  // Listen for browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const tab = getTabFromPath();
      setActiveTab(tab);
      document.title = getCurrentDocumentTitle();
      setPathTick(t => t + 1);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Set initial history state on mount
  useEffect(() => {
    window.history.replaceState({ tab: activeTab }, '', window.location.pathname + window.location.search + window.location.hash);
    document.title = getCurrentDocumentTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isDarkMode, setIsDarkMode] = useState(() => getLocalStorageItem('darkMode') === 'true');
  const [agentData, setAgentData] = useState(session.user);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    setLocalStorageItem('darkMode', isDarkMode.toString());
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
  const terasEnabled = isCommunityEnabledForAgent(agentData.slug);
  const hotelEnabled = isHotelDirectoryEnabledForAgent(agentData.slug);
  const notifications = useTerasNotifications(terasEnabled);
  const notifPrefs = useTerasNotificationPrefs(terasEnabled);
  const openNotificationPost = (postId: string) => {
    navigatePath(`/dashboard/teras/post/${encodeURIComponent(postId)}`);
  };
  const visibleCards = MENU_CARDS.filter(c => !c.hidden && !c.adminOnly && (c.id !== 'teras' || terasEnabled));
  const adminCards = isAdmin ? MENU_CARDS.filter(c => !c.hidden && c.adminOnly && (c.id !== 'hotels' || hotelEnabled)) : [];

  // Link /teras/<slug> pasti beredar antar-agent lewat WhatsApp. Agent yang
  // login tapi bukan anggota Teras harus melihat pesan "tidak tersedia"
  // (spec profil publik Teras), bukan dilempar diam-diam ke /dashboard —
  // itu justru jalan buntu tanpa penjelasan. Rute /dashboard/teras sendiri
  // (satu cabang kode yang sama) sengaja dibiarkan seperti semula: redirect.
  const terasProfileRouteSlug = activeTab === 'teras' ? getTerasProfileSlugFromPath() : null;

  useEffect(() => {
    if (activeTab === 'teras' && !terasEnabled && !terasProfileRouteSlug) {
      navigatePath('/dashboard', { replace: true });
    }
  }, [activeTab, terasEnabled, terasProfileRouteSlug, navigatePath]);

  if (activeTab === 'teras' && !terasEnabled) {
    if (terasProfileRouteSlug) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100 px-6 text-center dark:bg-slate-950">
          <h1 className="text-base font-bold text-gray-800 dark:text-white">Halaman ini tidak tersedia</h1>
          <p className="max-w-xs text-sm text-gray-500 dark:text-slate-400">
            Profil Teras hanya bisa dibuka oleh anggota Teras.
          </p>
          <button
            type="button"
            onClick={() => navigatePath('/dashboard')}
            className="mt-1 min-h-11 rounded-xl bg-emerald-500 px-5 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95"
          >
            Kembali ke Dashboard
          </button>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 bg-gray-100 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  // ── Sub-page view with dashboard header ──
  if (activeTab !== 'home') {
    const activeCard = MENU_CARDS.find(c => c.id === activeTab);
    const jamaahSub = activeTab === 'jamaah' ? getSubTabFromPath() : null;
    const isJamaahEdit = activeTab === 'jamaah' && jamaahSub === 'edit';
    const isHotelRoute = activeTab === 'ai-tools' && hotelEnabled && getAIToolsSubFromPath() === 'hotel';
    const terasPostId = activeTab === 'teras' ? getTerasPostIdFromPath() : null;
    const terasProfileSlug = activeTab === 'teras' ? getTerasProfileSlugFromPath() : null;
    // Teras: header dipadatkan agar feed dapat ruang layar lebih banyak
    // Header ramping: dipakai halaman yang isinya mengisi tinggi layar penuh
    // (feed Teras), supaya baris judul tidak memakan ruang baca. Mengatur satu
    // paket sekaligus — lebar wadah, padding, chip tombol, ukuran ikon, dan
    // judul.
    const compactHeader = activeTab === 'teras';
    return (
      <div className={`min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 transition-colors dark:from-slate-900 dark:to-slate-950 ${activeTab === 'teras' ? 'flex min-h-[100dvh] flex-col' : ''}`}>
        {/* Sub-page header.
            Tingginya (varian normal, non-compact) dicatat sebagai
            DASHBOARD_SUBPAGE_HEADER_H di src/constants/dashboard-chrome.ts —
            dipakai halaman anak untuk menempelkan sub-bar sticky-nya. Mengubah
            padding, ukuran chip back, atau border di bawah ini WAJIB diikuti
            ukur ulang angka tersebut di browser. */}
        <header
          className={`sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-900/90 ${activeTab === 'teras' ? 'shrink-0' : ''}`}
        >
          <div className={`${compactHeader ? 'max-w-2xl gap-2 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]' : 'max-w-lg gap-3 py-3'} mx-auto flex items-center px-4`}>
            <button
              type="button"
              aria-label={(terasPostId || terasProfileSlug) ? 'Kembali ke Teras' : 'Kembali ke dashboard'}
              title={(terasPostId || terasProfileSlug) ? 'Kembali ke Teras' : 'Kembali ke dashboard'}
              onClick={() => {
                // Detail kiriman Teras / profil agent → kembali ke feed (header = breadcrumb)
                if (terasPostId || terasProfileSlug) {
                  if (window.history.state?.terasFromFeed) window.history.back();
                  else navigatePath('/dashboard/teras', { replace: true });
                  return;
                }
                // Jamaah sub-pages → back to /dashboard/jamaah list
                if (activeTab === 'jamaah' && (jamaahSub === 'daftar' || jamaahSub === 'edit')) {
                  navigatePath('/dashboard/jamaah');
                  setJamaahRefreshKey(k => k + 1);
                  return;
                }
                // If on AI Tools sub-page, go back appropriately
                if (activeTab === 'ai-tools' && getAIToolsSubFromPath()) {
                  const aiSub = getAIToolsSubFromPath();
                  // Direktori Hotel: mundur bertahap detail → daftar kota → kategori → Tools
                  if (aiSub === 'hotel') {
                    const hotelPath = getHotelPathInfo();
                    if (hotelPath.isMedia && hotelPath.slug && hotelPath.city) {
                      navigatePath(`/dashboard/ai-tools/hotel/${hotelPath.city}/${encodeURIComponent(hotelPath.slug)}`);
                      return;
                    }
                    if (hotelPath.slug && hotelPath.city) {
                      navigatePath(`/dashboard/ai-tools/hotel/${hotelPath.city}`);
                      return;
                    }
                    if (hotelPath.city) {
                      navigatePath('/dashboard/ai-tools/hotel');
                      return;
                    }
                  }
                  // Export/Simulasi page → go back to haji-plus
                  if (aiSub === 'haji-plus/export') {
                    navigatePath('/dashboard/ai-tools/haji-plus');
                    return;
                  }
                  // Custom Domain → go back to landing-page (parent of custom-domain)
                  if (aiSub === 'landing-page/custom-domain') {
                    navigatePath('/dashboard/ai-tools/landing-page/umroh');
                    return;
                  }
                  navigatePath('/dashboard/ai-tools');
                  return;
                }
                // Panel Kelola Hotel: form tambah/edit → daftar kelola
                if (activeTab === 'hotels' && getHotelsKelolaSub()) {
                  navigatePath('/dashboard/hotels');
                  return;
                }
                navigateTab('home');
              }}
              // Hit-area 44px (aturan a11y desain) dengan chip visual tetap
              // 32/36px (d7d97bf): tombol transparan 44px membungkus chip;
              // margin negatif menjaga tinggi/jarak header tidak berubah.
              className={`group flex h-11 w-11 shrink-0 items-center justify-center ${compactHeader ? '-m-1.5' : '-m-1'}`}
            >
              <span className={`flex shrink-0 items-center justify-center bg-gray-100/80 text-gray-600 transition-all group-hover:bg-gray-200 group-active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:group-hover:bg-slate-700 ${compactHeader ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl'}`}>
                <ChevronLeft size={16} strokeWidth={2.5} />
              </span>
            </button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {(() => {
                const aiSub = activeTab === 'ai-tools' ? getAIToolsSubFromPath() : null;
                // Override icon/color for AI Tools sub-pages
                const AI_SUB_STYLES: Record<string, { icon: React.ElementType; bg: string; bgDark: string; border: string; borderDark: string; color: string; label: string }> = {
                  'voice-over': { icon: Mic, bg: 'bg-purple-50', bgDark: 'dark:bg-purple-900/20', border: 'border-purple-100', borderDark: 'dark:border-purple-800/40', color: 'text-purple-600 dark:text-purple-400', label: 'Voice Over' },
                  'business-card': { icon: CreditCard, bg: 'bg-teal-50', bgDark: 'dark:bg-teal-900/20', border: 'border-teal-100', borderDark: 'dark:border-teal-800/40', color: 'text-teal-600 dark:text-teal-400', label: 'Kartu Nama' },
                  'landing-page': { icon: Globe, bg: 'bg-purple-50', bgDark: 'dark:bg-purple-900/20', border: 'border-purple-100', borderDark: 'dark:border-purple-800/40', color: 'text-purple-600 dark:text-purple-400', label: 'Landing Page' },
                  'landing-page/custom-domain': { icon: Globe, bg: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20', border: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40', color: 'text-emerald-600 dark:text-emerald-400', label: 'Custom Domain' },
                  'haji-plus': { icon: BarChart3, bg: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20', border: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40', color: 'text-emerald-600 dark:text-emerald-400', label: 'Haji Plus' },
                  'haji-plus/export': { icon: BarChart3, bg: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20', border: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40', color: 'text-emerald-600 dark:text-emerald-400', label: 'Export Infografis' },
                  'haji-plus/simulasi': { icon: BarChart3, bg: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20', border: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40', color: 'text-emerald-600 dark:text-emerald-400', label: 'Haji Plus' },
                  'kurs': { icon: TrendingUp, bg: 'bg-emerald-50', bgDark: 'dark:bg-emerald-900/20', border: 'border-emerald-100', borderDark: 'dark:border-emerald-800/40', color: 'text-emerald-600 dark:text-emerald-400', label: 'Kurs Hari Ini' },
                  'compare': { icon: ArrowLeftRight, bg: 'bg-violet-50', bgDark: 'dark:bg-violet-900/20', border: 'border-violet-100', borderDark: 'dark:border-violet-800/40', color: 'text-violet-600 dark:text-violet-400', label: 'Compare' },
                  'brosur-jadwal': { icon: FileImage, bg: 'bg-rose-50', bgDark: 'dark:bg-rose-900/20', border: 'border-rose-100', borderDark: 'dark:border-rose-800/40', color: 'text-rose-600 dark:text-rose-400', label: 'Brosur Jadwal' },
                  'kalkulasi': { icon: Calculator, bg: 'bg-blue-50', bgDark: 'dark:bg-blue-900/20', border: 'border-blue-100', borderDark: 'dark:border-blue-800/40', color: 'text-blue-600 dark:text-blue-400', label: 'Kalkulasi' },
                  'mcp': { icon: Bot, bg: 'bg-teal-50', bgDark: 'dark:bg-teal-900/20', border: 'border-teal-100', borderDark: 'dark:border-teal-800/40', color: 'text-teal-600 dark:text-teal-400', label: 'AI Assistant (MCP)' },
                  'hotel': { icon: Building2, bg: 'bg-teal-50', bgDark: 'dark:bg-teal-900/20', border: 'border-teal-100', borderDark: 'dark:border-teal-800/40', color: 'text-teal-600 dark:text-teal-400', label: 'Direktori Hotel' },
                };
                const sub = aiSub && AI_SUB_STYLES[aiSub] ? AI_SUB_STYLES[aiSub] : null;
                if (isJamaahEdit) {
                  return (
                    <>
                      {activeCard && (
                        <div className={`w-8 h-8 rounded-lg ${activeCard.bgLight} ${activeCard.bgDark} flex items-center justify-center border ${activeCard.borderLight} ${activeCard.borderDark}`}>
                          <activeCard.icon size={16} className={activeCard.color} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium text-gray-400 dark:text-slate-500 truncate">
                          {jamaahEditHeader?.label || 'Edit Data Jamaah'}
                        </p>
                        <h1 className="text-sm font-bold text-gray-800 dark:text-white truncate">
                          {jamaahEditHeader?.title || 'Memuat jamaah...'}
                        </h1>
                      </div>
                    </>
                  );
                }
                if (terasPostId || terasProfileSlug) {
                  return (
                    <>
                      {activeCard && (
                        <div className={`w-7 h-7 rounded-lg ${activeCard.bgLight} ${activeCard.bgDark} flex items-center justify-center border ${activeCard.borderLight} ${activeCard.borderDark}`}>
                          <activeCard.icon size={14} className={activeCard.color} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[9px] font-medium leading-tight text-gray-400 dark:text-slate-500 truncate">Teras</p>
                        <h1 className="text-[13px] font-bold leading-tight text-gray-800 dark:text-white truncate">{terasPostId ? 'Kiriman' : 'Profil'}</h1>
                      </div>
                    </>
                  );
                }
                if (sub) {
                  const SubIcon = sub.icon;
                  return (
                    <>
                      <div className={`w-8 h-8 rounded-lg ${sub.bg} ${sub.bgDark} flex items-center justify-center border ${sub.border} ${sub.borderDark}`}>
                        <SubIcon size={16} className={sub.color} />
                      </div>
                      <h1 className="text-sm font-bold text-gray-800 dark:text-white truncate">
                        {aiSub === 'hotel' ? hotelHeaderLabel() : sub.label}
                      </h1>
                    </>
                  );
                }
                return (
                  <>
                    {activeCard && (
                      <div className={`${compactHeader ? 'w-7 h-7' : 'w-8 h-8'} rounded-lg ${activeCard.bgLight} ${activeCard.bgDark} flex items-center justify-center border ${activeCard.borderLight} ${activeCard.borderDark}`}>
                        <activeCard.icon size={compactHeader ? 14 : 16} className={activeCard.color} />
                      </div>
                    )}
                    <h1 className={`${compactHeader ? 'text-[13px]' : 'text-sm'} font-bold text-gray-800 dark:text-white truncate`}>{activeTab === 'hotels' ? hotelsHeaderLabel() : activeCard?.label}</h1>
                  </>
                );
              })()}
            </div>
            {/* Per-tab selectors render to the LEFT of the dark-mode toggle */}
            {activeTab === 'statistik' && statistikHeaderRight}
            {activeTab === 'analytics' && analyticsHeaderRight}
            {activeTab === 'jamaah' && jamaahSub !== 'daftar' && jamaahSub !== 'edit' && jamaahHeaderRight}
            {/* Mode Paket menampilkan brosur resmi apa adanya — tidak ada kolom
                ke-3 yang bisa diubah, jadi toggle-nya disembunyikan. */}
            {activeTab === 'brosur' && readBrosurModeFromPath() === 'jadwal' && (
              <div className="flex items-center h-9 rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5 shrink-0">
                {(['hari', 'seat'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => chooseBrosurDisplayMode(mode)}
                    aria-pressed={brosurDisplayMode === mode}
                    className={`h-7 m-0.5 px-2.5 inline-flex items-center justify-center rounded-md text-[10px] font-bold leading-none tracking-wide transition-colors ${
                      brosurDisplayMode === mode
                        ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                        : 'text-gray-400 dark:text-slate-500'
                    }`}
                  >
                    {mode === 'hari' ? 'HARI' : 'SEAT'}
                  </button>
                ))}
              </div>
            )}

            {terasEnabled && (
              <NotificationBell
                size={compactHeader ? 'compact' : 'header'}
                unread={notifications.unread}
                open={notifications.open}
                items={notifications.items}
                loading={notifications.loading}
                error={notifications.error}
                onOpen={notifications.openPanel}
                onClose={notifications.closePanel}
                onOpenPost={openNotificationPost}
                onMarkAllRead={notifications.markAllRead}
                onClearAll={notifications.clearAll}
                onOpenSettings={notifPrefs.openSheet}
              />
            )}

            {terasEnabled && (
              <TerasNotificationSettings
                prefs={notifPrefs.prefs}
                telegramConnected={notifPrefs.telegramConnected}
                open={notifPrefs.open}
                loading={notifPrefs.loading}
                loaded={notifPrefs.loaded}
                error={notifPrefs.error}
                onClose={notifPrefs.closeSheet}
                onToggle={notifPrefs.toggle}
                onRetry={notifPrefs.reload}
              />
            )}

            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={() => setIsDarkMode(p => !p)}
              aria-label={isDarkMode ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
              title={isDarkMode ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
              // Pola hit-area yang sama dengan tombol back di atas.
              className={`group flex h-11 w-11 shrink-0 items-center justify-center ${compactHeader ? '-m-1.5' : '-m-1'}`}
            >
              <span className={`flex shrink-0 items-center justify-center bg-gray-100/80 text-gray-500 transition-colors group-hover:bg-gray-200 group-active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:group-hover:bg-slate-700 ${compactHeader ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl'}`}>
                {isDarkMode ? <Sun size={compactHeader ? 14 : 16} /> : <Moon size={compactHeader ? 14 : 16} />}
              </span>
            </button>
          </div>
        </header>

        {/* Disconnect confirm modal */}
        {showDisconnectConfirm && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center px-6 ${disconnectClosing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
            onClick={disconnecting ? undefined : closeDisconnect}
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
                  disabled={disconnecting}
                  className="flex-1 py-3 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <div className="w-px bg-gray-100 dark:bg-slate-700" />
                <button
                  onClick={async () => {
                    setDisconnecting(true);
                    try {
                      await fetch('/api/laporan/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
                      await fetch('/api/laporan/credentials', { method: 'DELETE', headers: { ...getAuthHeaders() } });
                    } catch {} finally {
                      setJamaahConnected(false);
                      setJamaahUser('');
                      // disconnecting di-reset di dalam timeout closeDisconnect,
                      // agar tombol tetap disabled selama animasi exit (anti double-fetch)
                      closeDisconnect();
                    }
                  }}
                  disabled={disconnecting}
                  className="flex-1 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                >
                  {disconnecting ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 size={14} className="animate-spin" />Memutuskan...
                    </span>
                  ) : 'Disconnect'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-page content */}
        <main className={`${activeTab === 'teras'
          ? 'mx-auto w-full max-w-2xl flex-1 bg-white sm:border-x sm:border-gray-100 dark:bg-slate-900 dark:sm:border-slate-800'
          : 'max-w-lg mx-auto'
        }`}>
          <Suspense fallback={
            isJamaahEdit ? <JamaahEditSkeleton />
              : activeTab === 'teras' ? <TerasPageSkeleton />
              // Kerangka yang sama persis dengan yang dipakai HotelPage saat
              // datanya belum tiba — jadi masuk halaman ini hanya punya SATU
              // tampilan tunggu, bukan spinner lalu skeleton lalu isi.
              : isHotelRoute ? <HotelRouteSkeleton kind={hotelRouteSkeletonKind()} />
              : <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-emerald-500" /></div>
          }>
          {activeTab === 'settings' && (
            <SettingsPage agent={agentData} onUpdated={refreshAgent} initialTab={getSettingsTabFromPath()} />
          )}
          {activeTab === 'brosur' && (
            <BrochureSchedulePage agent={{
              slug: agentData.slug,
              name: agentData.name,
              phone: agentData.phone,
              photo: agentData.photo || '',
              website: agentData.website || '',
            }} displayMode={brosurDisplayMode} onModeChange={handleBrosurModeChange} />
          )}
          {activeTab === 'teras' && terasEnabled && (
            <TerasPage
              agent={{
                slug: agentData.slug,
                name: agentData.name,
                photo: agentData.photo,
                role: agentData.role,
              }}
              postId={terasPostId}
              profileSlug={terasProfileSlug}
              onNavigate={navigatePath}
            />
          )}
          {activeTab === 'agents' && isAdmin && (
            <div className="px-4 pt-4">
              <AgentManagementPage />
            </div>
          )}
          {activeTab === 'statistik' && (
            <StatistikPage agentSlug={agentData.slug} role={agentData.role} onHeaderRight={setStatistikHeaderRight} initialStatTab={getStatistikTabFromPath()} />
          )}
          {activeTab === 'jamaah' && (
            jamaahSub === 'daftar' ? (
              <UmrahRegisterPage
                agentSlug={agentData.slug}
                onBack={() => {
                  navigatePath('/dashboard/jamaah');
                  setJamaahRefreshKey(k => k + 1);
                }}
                onNavigate={navigatePath}
              />
            ) : jamaahSub === 'edit' ? (
              <JamaahEditPage
                onBack={() => {
                  navigatePath('/dashboard/jamaah');
                  setJamaahRefreshKey(k => k + 1);
                }}
                onNavigate={(path) => {
                  navigatePath(path);
                  setJamaahRefreshKey(k => k + 1);
                }}
                onHeaderTitle={setJamaahEditHeader}
              />
            ) : (
              <JamaahPage
                key={jamaahRefreshKey}
                agentSlug={agentData.slug}
                jamaahConnected={jamaahConnected}
                jamaahUser={jamaahUser}
                initialSubTab={jamaahSub === 'haji' ? 'haji' : 'umroh'}
                onConnectionChange={(connected, user) => {
                  setJamaahConnected(connected);
                  setJamaahUser(user);
                }}
                onHeaderRight={setJamaahHeaderRight}
                onNavigate={navigatePath}
              />
            )
          )}

          {activeTab === 'analytics' && isAdmin && (
            <AnalyticsPage onHeaderRight={setAnalyticsHeaderRight} />
          )}

          {activeTab === 'hotels' && isAdmin && hotelEnabled && (
            <HotelKelolaPage onNavigate={navigatePath} />
          )}

          {activeTab === 'ai-tools' && (() => {
            const sub = getAIToolsSubFromPath();
            if (sub === 'brosur-jadwal') return <BrochureSchedulePage agent={{
              slug: agentData.slug,
              name: agentData.name,
              phone: agentData.phone,
              photo: agentData.photo || '',
              website: agentData.website || '',
            }} />;
            if (sub === 'kalkulasi') return <KalkulasiPage agent={{
              name: agentData.name, website: agentData.website,
              phone: agentData.phone, photo: agentData.photo,
            }} hideHeader />;
            if (sub === 'compare') return <ComparePage agent={{
              name: agentData.name, website: agentData.website,
              phone: agentData.phone, photo: agentData.photo,
            }} agentSlug={agentData.slug} hideHeader />;
            // Di luar gate → jatuh ke daftar Tools. Panel kelola pindah ke tab
            // top-level 'hotels' (kartu admin dashboard), bukan lagi di sini.
            if (sub === 'hotel' && hotelEnabled) {
              return <HotelPage onNavigate={navigatePath} />;
            }
            if (sub === 'kurs') return <KursPage />;
            if (sub === 'mcp') return <McpIntegrationPage />;
            if (sub === 'voice-over') return <VoiceOverPage />;
            if (sub === 'business-card') return <BusinessCardPage agent={agentData} />;
            if (sub === 'landing-page/custom-domain') return <CustomDomainPage agent={{ slug: agentData.slug, name: agentData.name }} />;
            if (sub === 'landing-page') return <LandingPagePage agent={{ slug: agentData.slug, name: agentData.name, photo: agentData.photo, phone: agentData.phone, role: agentData.role }} onNavigate={navigatePath} />;
            if (sub === 'haji-plus/export') return <HajiPlusExportPage agent={agentData} />;
            if (sub === 'haji-plus/simulasi') return <HajiPlusPage agent={agentData} initialTab="simulasi" onExport={() => {
              navigatePath('/dashboard/ai-tools/haji-plus/export');
            }} />;
            if (sub === 'haji-plus') return <HajiPlusPage agent={agentData} onExport={() => {
              navigatePath('/dashboard/ai-tools/haji-plus/export');
            }} />;
            return (
              <AIToolsPage
                agentSlug={agentData.slug}
                onNavigate={(toolId) => navigatePath(`/dashboard/ai-tools/${toolId}`)}
              />
            );
          })()}
          </Suspense>
        </main>
      </div>
    );
  }

  const renderMenuCard = (card: MenuCard) => {
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
            window.location.href = `/${agentData.slug}`;
            return;
          }
          if (card.id === 'statistik') {
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
          // 'open_*' feature events are fired on each destination page's mount
          // (single source of truth) so deep-links / refreshes count too and the
          // same open isn't double-counted. 'jadwal' is the exception (openExternal
          // above) because it leaves the SPA before any page mounts.
          navigateTab(card.id);
        }}
        className={`group relative overflow-hidden ${card.cardBg} rounded-2xl p-3.5 border ${card.cardBorder} shadow-sm ${card.hoverShadow} hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.97]`}
      >
        <div className={`pointer-events-none absolute -top-6 -right-6 w-20 h-20 rounded-full ${card.iconBg} opacity-20 blur-2xl group-hover:opacity-30 transition-opacity`} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent dark:from-white/5" />
        <div className="relative flex flex-col items-center text-center">
          <div className={`w-11 h-11 rounded-xl ${card.iconBg} ${card.iconShadow} flex items-center justify-center mb-2 ring-1 ring-white/40 dark:ring-white/10 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-200`}>
            {card.id === 'statistik' && checkingStatistik
              ? <Loader2 size={22} className="text-white" strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
              : <Icon size={22} className={`text-white ${card.iconAnim}`} strokeWidth={2} />}
          </div>
          <p className="text-[12px] font-bold text-gray-800 dark:text-white leading-tight">
            {card.label}
          </p>
        </div>
      </button>
    );
  };

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
                onError={(e) => handleAgentPhotoError(e.currentTarget, agentData.name, 72)}
              />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{agentData.name}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {terasEnabled && (
              <NotificationBell
                size="home"
                unread={notifications.unread}
                open={notifications.open}
                items={notifications.items}
                loading={notifications.loading}
                error={notifications.error}
                onOpen={notifications.openPanel}
                onClose={notifications.closePanel}
                onOpenPost={openNotificationPost}
                onMarkAllRead={notifications.markAllRead}
                onClearAll={notifications.clearAll}
                onOpenSettings={notifPrefs.openSheet}
              />
            )}
            {terasEnabled && (
              <TerasNotificationSettings
                prefs={notifPrefs.prefs}
                telegramConnected={notifPrefs.telegramConnected}
                open={notifPrefs.open}
                loading={notifPrefs.loading}
                loaded={notifPrefs.loaded}
                error={notifPrefs.error}
                onClose={notifPrefs.closeSheet}
                onToggle={notifPrefs.toggle}
                onRetry={notifPrefs.reload}
              />
            )}
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

        <Suspense fallback={null}>
          {/* ── Telegram Connect Banner ── */}
          <TelegramConnectBanner
            onConnect={() => {
              navigateTab('settings');
              window.history.replaceState({}, '', '/dashboard/settings/telegram');
            }}
          />
        </Suspense>

        {/* ── Feature Cards Grid ── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Baris Teras: kartu Jendela Teras mengambil lebar penuh. */}
          {terasEnabled && (
            <div className="col-span-3">
              <Suspense fallback={<div className="h-[88px] animate-pulse rounded-2xl border border-gray-100 bg-white dark:border-slate-700 dark:bg-slate-800" />}>
                <TerasCard onOpen={() => navigateTab('teras')} />
              </Suspense>
            </div>
          )}
          {visibleCards.map(renderMenuCard)}
        </div>

        {/* ── Flight Status + Kurs + Birthday + Upcoming Schedule + Cuaca (flight card goes above when has flights) ── */}
        <div className="flex flex-col mt-4 gap-4">
          <div style={{ order: flightCount > 0 ? 0 : 5 }}>
            <Suspense fallback={null}><FlightStatusCard onFlightCount={setFlightCount} /></Suspense>
          </div>
          <div style={{ order: 1 }} className="empty:hidden">
            <Suspense fallback={null}><BirthdayWidget onSelectJamaah={setSelectedBirthday} /></Suspense>
          </div>
          <div style={{ order: 2 }}>
            <Suspense fallback={null}><UpcomingSchedule agentSlug={agentData.slug} /></Suspense>
          </div>
          <div style={{ order: 4 }}>
            <Suspense fallback={null}><CuacaWidget /></Suspense>
          </div>

          {/* ── Kurs Hari Ini Widget ── */}
          {kursData && (
            <div style={{ order: 3 }} className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-3.5">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                    <DollarSign size={14} strokeWidth={2.2} className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-800 dark:text-white">Kurs Hari Ini</div>
                    <div className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">
                      {kursData.updatedAt}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {kursData.usd !== null && (
                    <button
                      onClick={() => setShowShareKurs(true)}
                      aria-label="Bagikan kurs"
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
                    >
                      <Share2 size={10} strokeWidth={2.5} />
                      Share
                    </button>
                  )}
                  <button
                    onClick={() => navigatePath('/dashboard/ai-tools/kurs')}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
                  >
                    Kurs
                    <ChevronRight size={10} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Rate Pills */}
              <div className="flex gap-2">
                {/* USD */}
                <div className="flex-1 bg-gray-50 dark:bg-slate-900 rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🇺🇸</span>
                    <span className="text-sm font-bold text-gray-500 dark:text-slate-400">USD</span>
                  </div>
                  <span className="text-[15px] font-bold text-gray-800 dark:text-white">
                    {formatKurs(kursData.usd!)}
                  </span>
                </div>

                {/* SAR — hanya tampil kalau ada data SAR */}
                {kursData.sar && (
                  <div className="flex-1 bg-gray-50 dark:bg-slate-900 rounded-xl px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🇸🇦</span>
                      <span className="text-sm font-bold text-gray-500 dark:text-slate-400">SAR</span>
                    </div>
                    <span className="text-[15px] font-bold text-gray-800 dark:text-white">
                      {formatKurs(kursData.sar)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Admin-Only Cards (bottom of dashboard) ── */}
        {adminCards.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {adminCards.map(renderMenuCard)}
          </div>
        )}

        {/* ── Share Kurs Modal ── */}
        {kursData && kursData.usd !== null && (
          <Suspense fallback={null}>
            <ShareKursModal
              open={showShareKurs}
              onClose={() => setShowShareKurs(false)}
              kurs={{ usd: kursData.usd, updatedAt: kursData.updatedAt }}
              agent={{
                name: agentData.name,
                phone: agentData.phone,
                photo: agentData.photo,
                slug: agentData.slug,
                website: agentData.website,
              }}
            />
          </Suspense>
        )}

        {/* ── Birthday Detail Sheet ── */}
        <Suspense fallback={null}>
          {selectedBirthday && (
            <BirthdayDetailSheet
              jamaah={selectedBirthday}
              onClose={() => setSelectedBirthday(null)}
              agentName={agentData.name}
              agentPhone={agentData.phone}
              agentPhoto={agentData.photo}
              agentSlug={agentData.slug}
            />
          )}
        </Suspense>

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
