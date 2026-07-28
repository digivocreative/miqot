import { useState, useRef, useEffect } from 'react';
import { handleAgentPhotoError } from '../lib/agent-photo';
import { Save, Loader2, CheckCircle2, User, Globe, Phone, Mail, Send, X, Pencil, Lock, Eye, EyeOff, ChevronRight, AlertCircle, Unlink, LogIn, LogOut, Check, ShieldOff } from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import PhotoCropModal from './PhotoCropModal';
import PinInput from './PinInput';
import { validateName, validatePhone, validateEmail, validateWebsite, cleanPhone, cleanWebsite } from '../utils/validation';
import { trackEvent } from '../utils/analytics';
import { isCommunityEnabledForAgent } from '../lib/communityAccess';

interface AgentProfile {
  slug: string;
  name: string;
  website: string;
  phone: string;
  email: string;
  telegram_chat_id?: string;
  photo: string;
  role: string;
  awapi_code?: string;
  has_awapi_key?: boolean;
  email_alias?: string | null;
}

// ── Notification preference groups ──

const NOTIFICATION_GROUPS = [
  {
    label: 'Jamaah',
    items: [
      { key: 'jamaah_baru',     emoji: '🆕', label: 'Jamaah Baru',       desc: 'Jamaah baru yang sudah bayar saat sync' },
      { key: 'departure',       emoji: '🕋', label: 'Keberangkatan',     desc: 'Reminder H-14, H-7, H-3, H-1' },
      { key: 'paspor',          emoji: '📛', label: 'Paspor',            desc: 'Jamaah belum kumpul paspor' },
      { key: 'pelunasan',       emoji: '💰', label: 'Pelunasan',         desc: 'Deadline pembayaran mendekati' },
      { key: 'perlengkapan',    emoji: '📦', label: 'Perlengkapan',      desc: 'Jamaah belum lengkap perlengkapan' },
      { key: 'manasik',         emoji: '🕌', label: 'Manasik',           desc: 'H-3 sebelum jadwal manasik' },
      { key: 'birthday_digest', emoji: '🎂', label: 'Ucapan Ulang Tahun', desc: 'List jamaah yang ulang tahun' },
    ]
  },
  {
    label: 'Paket',
    items: [
      { key: 'seat_alert',       emoji: '🪑', label: 'Seat Alert',       desc: 'Seat paket tinggal sedikit' },
      { key: 'paket_baru',       emoji: '🆕', label: 'Paket Baru',       desc: 'Paket umroh baru ditambahkan' },
      { key: 'perubahan_harga',  emoji: '💲', label: 'Perubahan Harga',  desc: 'Harga paket berubah' },
    ]
  },
  {
    label: 'Lainnya',
    items: [
      { key: 'pembayaran_cicilan',   emoji: '💵', label: 'Cicilan Masuk',     desc: 'Pembayaran cicilan jamaah bertambah' },
      { key: 'pembayaran_pelunasan', emoji: '🎉', label: 'Pelunasan Masuk',   desc: 'Jamaah menyelesaikan pembayaran' },
      { key: 'ringkasan_mingguan', emoji: '📊', label: 'Ringkasan Mingguan', desc: 'Laporan mingguan setiap Senin' },
      { key: 'flight_status',      emoji: '✈️', label: 'Status Penerbangan', desc: 'Delay, pembatalan, gate berubah' },
      { key: 'kurs_dollar',        emoji: '🇺🇸', label: 'Kurs Dollar',         desc: 'Update kurs USD & SAR setiap pagi' },
      { key: 'community_mentions', emoji: '💬', label: 'Sebutan Teras',       desc: 'Saat agent lain menyebut (@) kamu di Teras' },
    ]
  },
];

// ── Exported Telegram Section for SettingsPage ──
export function TelegramSection({ agent }: { agent: AgentProfile }) {
  const [telegramStatus, setTelegramStatus] = useState<{ connected: boolean; chatId: string | null; hasCredentials: boolean }>({ connected: false, chatId: null, hasCredentials: true });
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [prefsLoading, setPrefsLoading] = useState(true);
  // Teras-only prefs (e.g. mentions) are hidden from agents without community access.
  const notificationGroups = NOTIFICATION_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(
        item => item.key !== 'community_mentions' || isCommunityEnabledForAgent(agent.slug),
      ),
    }))
    .filter(group => group.items.length > 0);
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [closingDisconnect, setClosingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  // Internal system login (for agents without credentials)
  const [sysUsername, setSysUsername] = useState('');
  const [sysPassword, setSysPassword] = useState('');
  const [showSysPassword, setShowSysPassword] = useState(false);
  const [sysLoginError, setSysLoginError] = useState('');
  const [sysLoginLoading, setSysLoginLoading] = useState(false);

  useEffect(() => {
    const checkTelegramStatus = async () => {
      try {
        const res = await fetch('/api/telegram/status', { headers: { ...getAuthHeaders() } });
        const json = await res.json();
        if (json.success) {
          setTelegramStatus(json.data);
          setTelegramLoading(false);
        }
      } catch { /* ignore */ }
      setStatusLoading(false);
    };
    checkTelegramStatus();
    const onVisible = () => { if (document.visibilityState === 'visible') checkTelegramStatus(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Fetch prefs when connected
  useEffect(() => {
    if (telegramStatus.connected) {
      (async () => {
        try {
          const res = await fetch('/api/telegram/prefs', { headers: { ...getAuthHeaders() } });
          const json = await res.json();
          if (json.success) setPrefs(json.data);
        } catch { /* ignore */ }
        setPrefsLoading(false);
      })();
    }
  }, [telegramStatus.connected]);

  // Scroll lock for disconnect dialog
  useEffect(() => {
    if (showDisconnect) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showDisconnect]);

  const handleToggle = async (key: string) => {
    const newValue = !prefs[key];
    setPrefs(prev => ({ ...prev, [key]: newValue }));
    trackEvent('action', 'update_notif_prefs', { pref: key, value: newValue });
    try {
      const res = await fetch('/api/telegram/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ [key]: newValue }),
      });
      const json = await res.json();
      if (!json.success) setPrefs(prev => ({ ...prev, [key]: !newValue }));
    } catch {
      setPrefs(prev => ({ ...prev, [key]: !newValue }));
    }
  };

  const handleCloseDisconnect = () => {
    setClosingDisconnect(true);
    setTimeout(() => {
      setClosingDisconnect(false);
      setShowDisconnect(false);
    }, 150);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/telegram/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } });
      const json = await res.json();
      if (json.success) {
        setTelegramStatus({ connected: false, chatId: null, hasCredentials: true });
        trackEvent('action', 'disconnect_telegram');
      }
    } catch { /* ignore */ }
    setDisconnecting(false);
    setShowDisconnect(false);
  };

  // Skeleton rows helper
  const SkeletonRow = ({ isLast }: { isLast: boolean }) => (
    <div className={`px-4 py-3 flex items-center justify-between${isLast ? '' : ' border-b border-gray-100 dark:border-slate-700'}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="h-3 w-28 bg-gray-200 dark:bg-slate-700 rounded-md animate-pulse" />
          <div className="h-2.5 w-20 bg-gray-200 dark:bg-slate-700 rounded-md animate-pulse mt-1.5" />
        </div>
      </div>
      <div className="w-9 h-5 rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse flex-shrink-0" />
    </div>
  );

  const SkeletonGroup = ({ rows }: { rows: number }) => (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-700 overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} isLast={i === rows - 1} />
      ))}
    </div>
  );

  const NotificationPrefsSkeleton = () => (
    <div>
      <div className="h-3 w-16 bg-gray-200 dark:bg-slate-700 rounded-md animate-pulse mt-5 mb-2 ml-1" />
      <SkeletonGroup rows={7} />

      <div className="h-3 w-12 bg-gray-200 dark:bg-slate-700 rounded-md animate-pulse mt-5 mb-2 ml-1" />
      <SkeletonGroup rows={3} />

      <div className="h-3 w-16 bg-gray-200 dark:bg-slate-700 rounded-md animate-pulse mt-5 mb-2 ml-1" />
      <SkeletonGroup rows={5} />
    </div>
  );

  return (
    <div>
      {!statusLoading && telegramStatus.hasCredentials && (
        <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">NOTIFIKASI TELEGRAM</p>
      )}

      {statusLoading ? (
        /* ── Skeleton Loading ── */
        <div>
          <div className="h-3 w-32 bg-gray-200 dark:bg-slate-700 rounded-md animate-pulse mb-3" />
          {/* Status badge skeleton */}
          <div className="h-14 w-full rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />

          <NotificationPrefsSkeleton />
        </div>
      ) : telegramStatus.connected ? (
        <>
          {/* Telegram brand status badge */}
          <style>{`
            @keyframes tgFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
            @keyframes tgPulseGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.6); } 50% { box-shadow: 0 0 0 4px rgba(74,222,128,0); } }
          `}</style>
          <div
            className="flex items-center gap-3 px-3.5 py-3 rounded-2xl relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #2AABEE, #229ED9)' }}
          >
            {/* Background ornament */}
            <svg
              width="90" height="90" viewBox="0 0 24 24"
              className="absolute -right-[15px] -bottom-[25px] pointer-events-none"
              style={{ fill: 'rgba(255,255,255,0.05)', transform: 'rotate(-20deg)' }}
            >
              <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.53 8.09l-1.83 8.63c-.13.62-.5.77-.99.48l-2.75-2.03-1.33 1.27c-.15.15-.27.27-.55.27l.2-2.8 5.07-4.58c.22-.2-.05-.3-.34-.12L8.83 13.3l-2.7-.84c-.59-.18-.6-.59.12-.87l10.55-4.07c.49-.18.92.12.73.87z"/>
            </svg>

            {/* Floating icon with glow ring */}
            <div
              className="flex-shrink-0 w-9 h-9 rounded-full bg-white/20 flex items-center justify-center relative z-10"
              style={{ boxShadow: '0 0 0 3px rgba(255,255,255,0.1)', animation: 'tgFloat 3s ease-in-out infinite' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.53 8.09l-1.83 8.63c-.13.62-.5.77-.99.48l-2.75-2.03-1.33 1.27c-.15.15-.27.27-.55.27l.2-2.8 5.07-4.58c.22-.2-.05-.3-.34-.12L8.83 13.3l-2.7-.84c-.59-.18-.6-.59.12-.87l10.55-4.07c.49-.18.92.12.73.87z"/></svg>
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0 relative z-10">
              <p className="text-[13px] font-bold text-white">Telegram Aktif</p>
              <p className="text-[10px] text-white/75">Notifikasi dikirim ke akun kamu</p>
            </div>

            {/* Pulse-glow green dot */}
            <div
              className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 relative z-10"
              style={{ animation: 'tgPulseGlow 2s ease-in-out infinite' }}
            />
          </div>

          {/* Toggle list — notification preferences */}
          {prefsLoading ? (
            <NotificationPrefsSkeleton />
          ) : notificationGroups.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2 mt-5 px-1">
                  {group.label}
                </p>
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
                  {group.items.map((item, idx) => (
                    <div
                      key={item.key}
                      className={`px-4 py-3 flex items-center justify-between ${
                        idx < group.items.length - 1 ? 'border-b border-gray-50 dark:border-slate-700/50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-base flex-shrink-0 mt-0.5">{item.emoji}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">{item.label}</p>
                          <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggle(item.key)}
                        className={`w-10 h-6 rounded-full transition-colors duration-200 cursor-pointer relative flex-shrink-0 ${
                          prefs[item.key] !== false ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-600'
                        }`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform duration-200 ${
                            prefs[item.key] !== false ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {/* Putuskan Koneksi — at the bottom */}
          <button
            type="button"
            onClick={() => setShowDisconnect(true)}
            className="flex items-center justify-center gap-1.5 w-full py-3 mt-8 text-xs font-medium text-red-500 dark:text-red-400 active:opacity-70 transition-colors"
          >
            <Unlink size={14} />
            Putuskan Koneksi
          </button>

          {/* Disconnect Confirmation Dialog */}
          {showDisconnect && (
            <>
              <style>{`
                @keyframes dcOverlayIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes dcOverlayOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes dcModalIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
                @keyframes dcModalOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.92); } }
              `}</style>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                style={{ animation: closingDisconnect ? 'dcOverlayOut 0.15s ease forwards' : 'dcOverlayIn 0.2s ease' }}
                onClick={handleCloseDisconnect}
              />
              {/* Centered wrapper */}
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
                <div
                  className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl p-5 text-center pointer-events-auto"
                  style={{
                    animation: closingDisconnect ? 'dcModalOut 0.15s ease forwards' : 'dcModalIn 0.25s cubic-bezier(0.16,1,0.3,1)',
                  }}
                >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40">
                  <Unlink size={20} className="text-red-500" />
                </div>
                {/* Title */}
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Putuskan Telegram?</p>
                {/* Description */}
                <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mb-4 mt-1">
                  Kamu tidak akan menerima notifikasi keberangkatan dan alert lainnya.
                </p>
                {/* Buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCloseDisconnect}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 active:scale-95 transition-all"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-red-500 text-white active:scale-95 transition-all disabled:opacity-70"
                  >
                    {disconnecting ? 'Memutus...' : 'Putuskan'}
                  </button>
                </div>
              </div>
              </div>
            </>
          )}
        </>
      ) : !telegramStatus.hasCredentials ? (
        /* ── No credentials — inline login form (matches JamaahPage exactly) ── */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 text-center border-b border-gray-50 dark:border-slate-700/50">
            <img
              src="/logo-alhijaz.webp"
              alt="Alhijaz"
              className="h-auto mx-auto mb-3 rounded-xl object-contain"
              style={{ width: '8rem' }}
            />
            <h2 className="text-[15px] font-bold text-gray-800 dark:text-white">AIW Agent Login</h2>
            <p className="text-[12px] text-gray-500 dark:text-slate-500 mt-0.5">Login untuk mengaktifkan notifikasi Telegram.</p>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            setSysLoginError('');
            if (!sysUsername || !sysPassword) { setSysLoginError('Username dan password wajib diisi'); return; }
            if (sysUsername.length < 3 || !sysUsername.startsWith('SM')) { setSysLoginError('Username tidak valid (contoh: SM12345)'); return; }
            setSysLoginLoading(true);
            try {
              const res = await fetch('/api/laporan/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ username: sysUsername, password: sysPassword, kantor: '2' }),
              });
              const result = await res.json();
              if (!res.ok || !result.success) {
                setSysLoginError(result.error || 'Login gagal');
                setSysLoginLoading(false);
                return;
              }
              setSysPassword('');
              setTelegramStatus(prev => ({ ...prev, hasCredentials: true }));
            } catch {
              setSysLoginError('Gagal menghubungi server');
            }
            setSysLoginLoading(false);
          }} className="p-5 space-y-4">
            {/* Username */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                <User size={12} /> Username
              </label>
              <input
                type="text"
                value={sysUsername}
                onChange={e => { setSysUsername(e.target.value.toUpperCase()); setSysLoginError(''); }}
                placeholder="SM12345"
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect="off"
                className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
              />
            </div>

            {/* Password */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                <Lock size={12} /> Password
              </label>
              <div className="relative">
                <input
                  type={showSysPassword ? 'text' : 'password'}
                  value={sysPassword}
                  onChange={e => { setSysPassword(e.target.value); setSysLoginError(''); }}
                  placeholder="Kata Sandi"
                  className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowSysPassword(!showSysPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showSysPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {sysLoginError && (
              <div className="flex items-center justify-center gap-1.5 py-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <span className="text-xs font-medium text-red-500">{sysLoginError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={sysLoginLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95"
            >
              {sysLoginLoading ? (
                <><Loader2 size={16} className="animate-spin" /> Login...</>
              ) : (
                <><LogIn size={16} /> Login</>
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-[#2AABEE]/10 dark:bg-[#2AABEE]/20 mx-auto mb-3 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#2AABEE"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.53 8.09l-1.83 8.63c-.13.62-.5.77-.99.48l-2.75-2.03-1.33 1.27c-.15.15-.27.27-.55.27l.2-2.8 5.07-4.58c.22-.2-.05-.3-.34-.12L8.83 13.3l-2.7-.84c-.59-.18-.6-.59.12-.87l10.55-4.07c.49-.18.92.12.73.87z"/></svg>
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">Hubungkan Telegram</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Terima notifikasi keberangkatan jamaah langsung di Telegram.</p>
          <button
            type="button"
            disabled={telegramLoading}
            onClick={async () => {
              setTelegramLoading(true);
              try {
                const res = await fetch('/api/telegram/link', { headers: { ...getAuthHeaders() } });
                const json = await res.json();
                if (!res.ok && json.error === 'CREDENTIALS_REQUIRED') {
                  if (confirm('Kamu perlu login ke sistem internal terlebih dahulu.\n\nBuka halaman Jamaah sekarang?')) {
                    window.location.hash = '#jamaah';
                  }
                  setTelegramLoading(false);
                  return;
                }
                if (json.success) {
                  trackEvent('action', 'connect_telegram');
                  window.location.href = json.data.deepLink;
                } else {
                  setTelegramLoading(false);
                }
              } catch {
                setTelegramLoading(false);
              }
            }}
            className={`mt-4 w-full py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
              telegramLoading
                ? 'bg-[#2AABEE]/70 cursor-wait shadow-[#2AABEE]/10'
                : 'bg-gradient-to-r from-[#2AABEE] to-[#229ED9] hover:shadow-[#2AABEE]/30 shadow-[#2AABEE]/20'
            }`}
          >
            {telegramLoading ? (
              <><Loader2 size={16} className="animate-spin" /> Menghubungkan...</>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.53 8.09l-1.83 8.63c-.13.62-.5.77-.99.48l-2.75-2.03-1.33 1.27c-.15.15-.27.27-.55.27l.2-2.8 5.07-4.58c.22-.2-.05-.3-.34-.12L8.83 13.3l-2.7-.84c-.59-.18-.6-.59.12-.87l10.55-4.07c.49-.18.92.12.73.87z"/></svg>
                Hubungkan Telegram
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}




// ── Email Alias field (inline di bawah input Email pada form profil) ──
// Alias dipilih agent SEKALI dan permanen — server menolak perubahan (ALIAS_LOCKED).
function EmailAliasField() {
  const [status, setStatus] = useState<{ configured: boolean; alias: string | null; enabled: boolean; destination: string } | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/agent/email-alias', { headers: { ...getAuthHeaders() } });
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
  };
  useEffect(() => { fetchStatus(); }, []);

  if (!status || !status.configured) return null;

  if (status.alias) {
    return (
      <div className="mt-3">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
          <Mail size={12} /> Email Alias
        </label>
        <div className="relative">
          <input
            type="text"
            value={status.alias}
            readOnly
            onFocus={e => e.target.select()}
            className="w-full pl-3 pr-9 py-2.5 bg-gray-50 dark:bg-slate-800/40 border border-gray-200/80 dark:border-slate-700/80 rounded-xl text-sm text-gray-500 dark:text-slate-400 select-all cursor-default focus:outline-none focus:ring-1 focus:ring-gray-200 dark:focus:ring-slate-700 transition-shadow"
          />
          <Lock size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-600 pointer-events-none" />
        </div>
        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">Alias permanen — email yang masuk diteruskan ke email kamu.</p>
      </div>
    );
  }

  const valid = /^[a-z]{3,25}$/.test(aliasInput);

  const handleCreate = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/agent/email-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ alias: aliasInput }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || 'Gagal membuat alias');
      } else {
        trackEvent('action', 'set_email_alias');
        await fetchStatus();
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setSaving(false);
  };

  return (
    <div className="mt-3">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
        <Mail size={12} /> Email Alias <span className="normal-case font-normal text-gray-400 dark:text-slate-500">(opsional)</span>
      </label>
      <div className="relative">
        <input
          type="text"
          value={aliasInput}
          onChange={e => { setAliasInput(e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 25)); setError(''); }}
          maxLength={25}
          placeholder="namakamu"
          className="w-full pl-3 pr-24 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 focus:ring-emerald-500 focus:border-emerald-500 rounded-xl text-sm focus:ring-2 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-slate-500 pointer-events-none">@alhijaz.co</span>
      </div>
      {error && (
        <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{error}</p>
      )}
      <button
        type="button"
        disabled={!valid || saving}
        onClick={() => setShowConfirm(true)}
        className={`mt-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
          valid && !saving
            ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
            : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
        }`}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <><Mail size={14} /> Buat Email Alias</>}
      </button>
      <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
        <span className="font-semibold">Hanya bisa dibuat sekali, tidak bisa diganti.</span>
      </p>

      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6" onClick={() => setShowConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="w-11 h-11 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 mx-auto flex items-center justify-center">
              <Mail size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-3 text-sm font-bold text-gray-800 dark:text-white text-center">Buat Email Alias?</p>
            <p className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 text-center break-all">{aliasInput}@alhijaz.co</p>
            <p className="mt-2 text-xs text-gray-400 dark:text-slate-500 text-center">Alias hanya bisa dibuat sekali dan tidak bisa diganti lagi.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors active:scale-95"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => { setShowConfirm(false); handleCreate(); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95"
              >
                Ya, Buat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Password Change Modal ──
function PasswordModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwError, setPwError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);

  // Scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const reset = () => {
    setPw(''); setConfirmPw(''); setShowPw(false); setShowConfirm(false);
    setPwError(''); setConfirmError(''); setServerError('');
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      reset();
      onClose();
    }, 150);
  };

  const handleSave = async () => {
    setPwError(''); setConfirmError(''); setServerError('');
    let valid = true;
    if (!pw) { setPwError('Password wajib diisi'); valid = false; }
    else if (pw.length < 6) { setPwError('Password minimal 6 karakter'); valid = false; }
    if (!confirmPw) { setConfirmError('Konfirmasi password wajib diisi'); valid = false; }
    else if (pw !== confirmPw) { setConfirmError('Password tidak cocok'); valid = false; }
    if (!valid) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setServerError(data.error || 'Gagal mengubah password');
        setSaving(false);
        return;
      }
      setSaving(false);
      reset();
      onClose();
      onSuccess();
    } catch {
      setServerError('Gagal menghubungi server');
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const animStyle = closing
    ? { animation: 'pwModalOut 0.15s ease forwards' }
    : { animation: 'pwModalIn 0.15s ease' };
  const overlayAnim = closing
    ? { animation: 'pwOverlayOut 0.15s ease forwards' }
    : { animation: 'pwOverlayIn 0.15s ease' };

  return (
    <>
      <style>{`
        @keyframes pwOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pwOverlayOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes pwModalIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        @keyframes pwModalOut { from { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } }
      `}</style>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        style={overlayAnim}
        onClick={handleClose}
      />
      {/* Modal */}
      <div
        className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl"
        style={{ ...animStyle, transform: 'translate(-50%, -50%)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-1">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400 mx-auto mb-2">
            <Lock size={20} />
          </div>
          <p className="text-sm font-bold text-gray-800 dark:text-white text-center">Ubah Password</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center mt-1">Masukkan password baru kamu</p>
        </div>

        {/* Form */}
        <div className="px-5 pt-4 space-y-3">
          {/* Password Baru */}
          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 block">Password Baru</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={pw}
                onChange={e => { setPw(e.target.value); setPwError(''); }}
                placeholder="Minimal 6 karakter"
                autoFocus
                className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {pwError && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">{pwError}</p>}
          </div>

          {/* Konfirmasi Password */}
          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 block">Konfirmasi Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); setConfirmError(''); }}
                placeholder="Ketik ulang password baru"
                className="w-full px-3 py-2.5 pr-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirmError && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">{confirmError}</p>}
          </div>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="mx-5 mt-3 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium text-center">
            {serverError}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pt-4 pb-5 flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors active:scale-95"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Menyimpan...</>
            ) : (
              <><Save size={16} /> Simpan</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Internal System (AIW) Credentials Section ──
function InternalSystemSection() {
  const [status, setStatus] = useState<{ hasCredentials: boolean; username: string | null; syncHealth: string; lastSync: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [closingConfirm, setClosingConfirm] = useState(false);
  // Re-login form (shown when credentials were rejected upstream → syncHealth 'stale')
  const [reloginOpen, setReloginOpen] = useState(false);
  const [reloginPw, setReloginPw] = useState('');
  const [reloginErr, setReloginErr] = useState('');
  const [reloginBusy, setReloginBusy] = useState(false);
  const [reloginPwVisible, setReloginPwVisible] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/laporan/status', { headers: { ...getAuthHeaders() } });
      const json = await res.json();
      if (json.success) {
        setStatus({
          hasCredentials: json.data.hasCredentials,
          username: json.data.username || null,
          syncHealth: json.data.syncHealth || 'ok',
          lastSync: json.data.lastSync || null,
        });
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  // Re-login with the (new) internal-system password. On success the backend
  // re-accepts the credentials and rediscovers the AWAPI key, so background sync
  // resumes; reflect 'ok' optimistically (lastSync updates on the next cycle).
  const handleRelogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setReloginErr('');
    if (!reloginPw) { setReloginErr('Password wajib diisi'); return; }
    setReloginBusy(true);
    try {
      const res = await fetch('/api/laporan/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ username: status?.username, password: reloginPw, kantor: '2' }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setReloginErr(result.error || 'Login gagal — periksa kembali password');
        setReloginBusy(false);
        return;
      }
      setReloginPw('');
      setReloginOpen(false);
      setReloginBusy(false);
      setStatus(prev => prev ? { ...prev, syncHealth: 'ok' } : prev);
    } catch {
      setReloginErr('Gagal menghubungi server');
      setReloginBusy(false);
    }
  };

  // Relative time label for the last successful sync, e.g. "29 hari lalu".
  const relTime = (iso: string | null): string | null => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return null;
    const days = Math.floor(ms / 86400000);
    if (days >= 1) return `${days} hari lalu`;
    const hours = Math.floor(ms / 3600000);
    if (hours >= 1) return `${hours} jam lalu`;
    return `${Math.max(Math.floor(ms / 60000), 1)} menit lalu`;
  };

  useEffect(() => {
    if (showConfirm) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [showConfirm]);

  const handleCloseConfirm = () => {
    setClosingConfirm(true);
    setTimeout(() => {
      setClosingConfirm(false);
      setShowConfirm(false);
    }, 150);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch('/api/laporan/credentials', { method: 'DELETE', headers: { ...getAuthHeaders() } });
      setStatus({ hasCredentials: false, username: null, syncHealth: 'no_credentials', lastSync: null });
    } catch { /* ignore */ }
    setDeleting(false);
    setShowConfirm(false);
  };

  if (loading) {
    return (
      <div className="border-t border-gray-100 dark:border-slate-700/50 pt-4 mt-4">
        <div className="h-3 w-32 bg-gray-200 dark:bg-slate-700 rounded-md animate-pulse mb-3" />
        <div className="h-14 w-full bg-gray-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!status?.hasCredentials) return null;

  return (
    <div className="border-t border-gray-100 dark:border-slate-700/50 pt-4 mt-4">
      <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">SISTEM INTERNAL</p>

      {status.syncHealth === 'stale' ? (
        /* ── Credentials rejected upstream — sync frozen, needs re-login ── */
        <div className="relative overflow-hidden rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 to-amber-100/70 dark:from-amber-900/20 dark:to-amber-800/15">
          <div className="relative px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-amber-200 dark:border-amber-700/50 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={18} className="text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{status.username || 'Sistem internal'}</p>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              </div>
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400/80">
                Sinkronisasi terhenti{relTime(status.lastSync) ? ` · terakhir ${relTime(status.lastSync)}` : ''}
              </p>
            </div>
            {!reloginOpen && (
              <button
                onClick={() => { setReloginOpen(true); setReloginErr(''); }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-white/80 dark:bg-slate-800/70 border border-amber-300/60 dark:border-amber-700/40 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-all flex-shrink-0 active:scale-95"
              >
                <LogIn size={11} />
                Login ulang
              </button>
            )}
          </div>

          {reloginOpen && (
            <form onSubmit={handleRelogin} className="px-4 pb-3.5 space-y-2">
              <p className="text-[11px] leading-snug text-amber-700/90 dark:text-amber-300/70">
                Password sistem internal kemungkinan berubah. Masukkan password terbaru untuk <span className="font-semibold">{status.username}</span> agar data jamaah kembali tersinkron.
              </p>
              <div className="relative">
                <input
                  type={reloginPwVisible ? 'text' : 'password'}
                  value={reloginPw}
                  onChange={e => { setReloginPw(e.target.value); setReloginErr(''); }}
                  placeholder="Password sistem internal"
                  autoFocus
                  className="w-full pl-3 pr-9 py-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400"
                />
                <button type="button" onClick={() => setReloginPwVisible(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  {reloginPwVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {reloginErr && <p className="text-[11px] font-medium text-red-500">{reloginErr}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setReloginOpen(false); setReloginPw(''); setReloginErr(''); }}
                  className="flex-1 py-2 rounded-xl text-[12px] font-semibold text-gray-600 dark:text-slate-300 bg-white/70 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={reloginBusy}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-70 flex items-center justify-center gap-1.5"
                >
                  {reloginBusy ? <><Loader2 size={13} className="animate-spin" /> Menghubungkan…</> : 'Hubungkan ulang'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : status.syncHealth === 'pending' ? (
        /* ── Connected, first background sync not recorded yet ── */
        <div className="relative overflow-hidden rounded-2xl border border-sky-100 dark:border-sky-800/40 bg-gradient-to-br from-sky-50 to-sky-100/70 dark:from-sky-900/20 dark:to-sky-800/15">
          <div className="relative px-4 py-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-sky-200 dark:border-sky-700/50 flex items-center justify-center flex-shrink-0">
              <Loader2 size={18} className="text-sky-500 animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{status.username || 'Terhubung'}</p>
              <p className="text-[11px] text-sky-700/80 dark:text-sky-400/70">Menunggu sinkronisasi pertama…</p>
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-500 dark:text-red-400 bg-white/70 dark:bg-slate-800/70 border border-red-200/60 dark:border-red-800/40 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all flex-shrink-0 active:scale-95"
            >
              <Unlink size={11} />
              Putuskan
            </button>
          </div>
        </div>
      ) : (
      /* Branded card — healthy (connected & syncing) */
      <div
        className="relative overflow-hidden rounded-2xl border border-emerald-100 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20"
      >

        {/* Decorative pattern */}
        <div className="absolute -right-3 -top-3 w-20 h-20 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #10b981 0%, transparent 70%)' }} />

        <div className="relative px-4 py-3.5 flex items-center gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-emerald-200 dark:border-emerald-700/50 flex items-center justify-center flex-shrink-0">
            <img src="/logo-alhijaz.webp" alt="AIW" className="w-6 h-6 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>'; }} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{status.username || 'Terhubung'}</p>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            </div>
            <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/60">Terhubung</p>
          </div>

          {/* Disconnect */}
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-red-500 dark:text-red-400 bg-white/70 dark:bg-slate-800/70 border border-red-200/60 dark:border-red-800/40 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all flex-shrink-0 active:scale-95"
          >
            <Unlink size={11} />
            Putuskan
          </button>
        </div>
      </div>
      )}

      {/* Confirmation dialog — matches DashboardLayout disconnect style */}
      {showConfirm && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center px-6 ${closingConfirm ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
          onClick={handleCloseConfirm}
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        >
          <div
            className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 w-full max-w-xs overflow-hidden ${closingConfirm ? 'dc-card-exit' : 'dc-card-enter'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <LogOut size={18} className="text-red-500" />
              </div>
              <p className="text-sm font-bold text-gray-800 dark:text-white">Disconnect Account?</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Anda akan kehilangan akses ke data jamaah dan fitur pendukung lainnya.</p>
            </div>
            <div className="flex border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={handleCloseConfirm}
                className="flex-1 py-3 text-sm font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                Batal
              </button>
              <div className="w-px bg-gray-100 dark:bg-slate-700" />
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-70"
              >
                {deleting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Profile Component ──
export default function DashboardProfile({ agent, onUpdated, mode = 'standalone' }: { agent: AgentProfile; onUpdated: () => void; mode?: 'standalone' | 'embedded' }) {
  const [name, setName] = useState(agent.name);
  const [website, setWebsite] = useState(agent.website);
  const [phone, setPhone] = useState(agent.phone);
  const [email, setEmail] = useState(agent.email || '');
  const [telegramStatus, setTelegramStatus] = useState<{ connected: boolean; chatId: string | null }>({ connected: false, chatId: null });
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(agent.photo);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [slugValue, setSlugValue] = useState(agent.slug);
  const [editingSlug, setEditingSlug] = useState(false);
  const [closingSlugModal, setClosingSlugModal] = useState(false);
  const [slugError, setSlugError] = useState('');
  const [slugCooldown, setSlugCooldown] = useState<{ canChange: boolean; nextChangeDate: string | null; isAdmin?: boolean }>({ canChange: true, nextChangeDate: null });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch slug cooldown on mount ──
  useEffect(() => {
    fetch('/api/auth/slug-cooldown', { headers: { ...getAuthHeaders() } })
      .then(r => r.json())
      .then(data => {
        if (data.canChange !== undefined) setSlugCooldown({ canChange: data.canChange, nextChangeDate: data.nextChangeDate, isAdmin: data.isAdmin });
        if (data.currentSlug) setSlugValue(data.currentSlug);
      })
      .catch(() => {});
  }, []);

  // ── PIN Security state ──
  const [hasPIN, setHasPIN] = useState(false);
  const [pinLoading, setPinLoading] = useState(true);
  const [showPINSetup, setShowPINSetup] = useState(false);
  const [pinStep, setPinStep] = useState<0 | 1 | 2>(1);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [closingPINSetup, setClosingPINSetup] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [closingDisable, setClosingDisable] = useState(false);
  const [disableStep, setDisableStep] = useState<'confirm' | 'otp'>('confirm');
  const [disableOTP, setDisableOTP] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpTelegramName, setOtpTelegramName] = useState('');

  // ── Fetch PIN status on mount ──
  useEffect(() => {
    const fetchPinStatus = async () => {
      try {
        const res = await fetch('/api/auth/pin-status', { headers: { ...getAuthHeaders() } });
        const data = await res.json();
        setHasPIN(data.hasPIN);
      } catch { /* silent */ }
      finally { setPinLoading(false); }
    };
    fetchPinStatus();
  }, []);

  // ── Scroll lock for PIN dialogs ──
  useEffect(() => {
    if (showPINSetup || showDisableDialog) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showPINSetup, showDisableDialog]);

  // ── Scroll to PIN section if hash is #pin-keamanan ──
  useEffect(() => {
    if (pinLoading) return;
    if (window.location.hash === '#pin-keamanan') {
      const el = document.getElementById('pin-keamanan');
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-emerald-500/30', 'rounded-xl', '-mx-2', 'px-2', 'transition-all');
          setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-500/30', 'rounded-xl', '-mx-2', 'px-2'), 2500);
          window.history.replaceState(null, '', window.location.pathname);
        }, 300);
      }
    }
  }, [pinLoading]);

  // ── Check Telegram status on mount + when returning from Telegram ──
  useEffect(() => {
    const checkTelegramStatus = async () => {
      try {
        const res = await fetch('/api/telegram/status', { headers: { ...getAuthHeaders() } });
        const json = await res.json();
        if (json.success) {
          setTelegramStatus(json.data);
          setTelegramLoading(false);
        }
      } catch { /* ignore */ }
    };
    checkTelegramStatus();

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkTelegramStatus();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── Field error helpers ──
  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleBlur = (key: string, value: string) => {
    let err: string | null = null;
    if (key === 'name') err = validateName(value);
    else if (key === 'phone') err = validatePhone(value);
    else if (key === 'email') err = validateEmail(value);
    else if (key === 'website') err = validateWebsite(value);
    if (err) setFieldErrors(prev => ({ ...prev, [key]: err! }));
    else clearFieldError(key);
  };

  const validateAll = (): boolean => {
    const errs: Record<string, string> = {};
    const nameErr = validateName(name); if (nameErr) errs.name = nameErr;
    const phoneErr = validatePhone(phone); if (phoneErr) errs.phone = phoneErr;
    const emailErr = validateEmail(email); if (emailErr) errs.email = emailErr;
    const websiteErr = validateWebsite(website); if (websiteErr) errs.website = websiteErr;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Input class with error state ──
  const inputCls = (key: string) =>
    `w-full px-3 py-2.5 bg-white dark:bg-slate-900 border ${
      fieldErrors[key]
        ? 'border-red-300 dark:border-red-700 focus:ring-red-500 focus:border-red-500'
        : 'border-gray-200 dark:border-slate-700 focus:ring-emerald-500 focus:border-emerald-500'
    } rounded-xl text-sm focus:ring-2 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500`;

  const handleSave = async () => {
    setError('');
    if (!validateAll()) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { name, website, phone, email };
      const res = await fetch('/api/admin/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Gagal menyimpan');
        setSaving(false);
        return;
      }
      setSaving(false);
      setSaved(true);
      setSavedMessage('Profil disimpan.');
      trackEvent('action', 'update_profil');
      onUpdated();
      setTimeout(() => { setSaved(false); setSavedMessage(''); }, 2500);
    } catch {
      setError('Gagal menghubungi server');
      setSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate type
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Format foto harus JPG atau PNG');
      e.target.value = '';
      return;
    }
    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran foto maksimal 5MB');
      e.target.value = '';
      return;
    }
    setCropImage(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleCropSave = async (croppedBase64: string) => {
    // Cleanup object URL
    if (cropImage) URL.revokeObjectURL(cropImage);
    setCropImage(null);
    setUploadingPhoto(true);
    try {
      const res = await fetch('/api/admin/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ image: croppedBase64 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPhotoUrl(data.photo);
        onUpdated();
      } else {
        setError(data.error || 'Gagal upload foto');
      }
    } catch {
      setError('Gagal menghubungi server');
    }
    setUploadingPhoto(false);
  };

  const handleCropClose = () => {
    if (cropImage) URL.revokeObjectURL(cropImage);
    setCropImage(null);
  };


  const hasChanges = name !== agent.name || website !== agent.website || phone !== agent.phone || email !== (agent.email || '');
  const requiredMissing = !name.trim() || !phone.trim();
  const hasErrors = Object.keys(fieldErrors).length > 0;

  return (
    <div className="space-y-4">
      {/* Crop Modal */}
      <PhotoCropModal
        isOpen={!!cropImage}
        imageUrl={cropImage || ''}
        onClose={handleCropClose}
        onCropComplete={handleCropSave}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Avatar + Info Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm !mt-0">
        <div className="flex flex-col items-center mb-6">
          {/* Photo with edit button */}
          <div className="relative inline-block mb-3">
            {uploadingPhoto && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-full">
                <Loader2 size={24} className="animate-spin text-white" />
              </div>
            )}
            <img
              src={photoUrl}
              alt={agent.name}
              className="w-[90px] h-[90px] rounded-full object-cover"
              style={{ border: '3px solid #e5e7eb' }}
              onError={(e) => handleAgentPhotoError(e.currentTarget, agent.name, 180)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-[30px] h-[30px] rounded-full flex items-center justify-center cursor-pointer"
              style={{
                background: '#065f46',
                border: '3px solid #ffffff',
                padding: 0,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#064e3b')}
              onMouseLeave={e => (e.currentTarget.style.background = '#065f46')}
              title="Ganti Foto"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#ffffff" strokeWidth="2">
                <path d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/>
                <path d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/>
              </svg>
            </button>
          </div>
          {/* Name only */}
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{agent.name}</h2>
          {/* URL slug badge + pencil icon */}
          <div className="flex flex-col items-center mt-2 gap-1">
            <button
              type="button"
              onClick={() => { if (slugCooldown.canChange) { setSlugValue(agent.slug); setSlugError(''); setEditingSlug(true); } }}
              disabled={!slugCooldown.canChange}
              className={`flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-full transition-all duration-200 group ${slugCooldown.canChange ? 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30 active:scale-95 cursor-pointer' : 'cursor-default'}`}
            >
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">alhijaz.co/{slugValue}</span>
              {slugCooldown.canChange && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 dark:text-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              )}
            </button>
            {!slugCooldown.isAdmin && (
              <p className="text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                {slugCooldown.canChange
                  ? 'Hanya bisa diubah 1x per bulan'
                  : `Bisa diganti lagi pada ${slugCooldown.nextChangeDate ? new Date(slugCooldown.nextChangeDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'}`
                }
              </p>
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <User size={12} /> Nama Lengkap
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); clearFieldError('name'); }}
              onBlur={() => handleBlur('name', name)}
              className={inputCls('name')}
            />
            {fieldErrors.name && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors.name}</p>}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Globe size={12} /> Website
            </label>
            <input
              type="text"
              value={website}
              onChange={e => { setWebsite(cleanWebsite(e.target.value)); clearFieldError('website'); }}
              onBlur={() => handleBlur('website', website)}
              placeholder="contoh: alhijaz.co/nikita"
              className={inputCls('website')}
            />
            {fieldErrors.website && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors.website}</p>}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Phone size={12} /> Nomor HP
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => { setPhone(cleanPhone(e.target.value)); clearFieldError('phone'); }}
              onBlur={() => handleBlur('phone', phone)}
              placeholder="628xxxxxxxxxx"
              className={inputCls('phone')}
            />
            {fieldErrors.phone && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors.phone}</p>}
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              <Mail size={12} /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearFieldError('email'); }}
              onBlur={() => handleBlur('email', email)}
              placeholder="agent@email.com"
              className={inputCls('email')}
            />
            {fieldErrors.email && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={10} />{fieldErrors.email}</p>}
            <EmailAliasField />
          </div>

        {/* Telegram Section — only shown in standalone mode */}
        {mode === 'standalone' && (
        <div className="border-t border-gray-100 dark:border-slate-700/50 pt-4 mt-4">
          <TelegramSection agent={agent} />
        </div>
        )}

        {/* Separator + Password Section */}
        <div className="border-t border-gray-100 dark:border-slate-700/50 pt-4 mt-4">
          <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">KATA SANDI</p>
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="flex items-center justify-between w-full px-3 py-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-gray-500 dark:text-slate-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-slate-200">Ubah Password</span>
            </div>
            <ChevronRight size={16} className="text-gray-400 dark:text-slate-500" />
          </button>
        </div>

        {/* Internal System (AIW) Credentials */}
        <InternalSystemSection />

        {/* ── PIN Keamanan Statistik ── */}
        {!pinLoading && (
        <div id="pin-keamanan" className="border-t border-gray-100 dark:border-slate-700/50 pt-4 mt-4">
          <p className="text-[10px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">PIN KEAMANAN</p>

          {/* Idle: belum ada PIN */}
          {!hasPIN && !showPINSetup && (
            <>
              <div className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 mb-3">
                <Lock size={16} className="text-gray-400 dark:text-slate-500 shrink-0" />
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400">PIN keamanan belum aktif</span>
              </div>
              <button
                type="button"
                onClick={() => { setShowPINSetup(true); setPinStep(1); setPin1(''); setPin2(''); setPinError(''); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-gray-700 dark:text-slate-200 active:scale-95 transition-all"
              >
                <Lock size={16} />
                Atur PIN Statistik
              </button>
              <p className="text-xs text-gray-400 dark:text-slate-500 text-center mt-2.5">Lindungi data Statistik & komisi dengan PIN 6 digit</p>
            </>
          )}

          {/* PIN Aktif */}
          {hasPIN && !showPINSetup && (
            <>
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 mb-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">PIN aktif</p>
                  <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70">Statistik dilindungi · unlock 1 jam</p>
                </div>
                <Check size={16} className="text-emerald-500 shrink-0" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowPINSetup(true); setPinStep(0); setCurrentPinInput(''); setPin1(''); setPin2(''); setPinError(''); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-600 dark:text-slate-300 active:scale-95 transition-all"
                >
                  <Pencil size={14} />
                  Ubah PIN
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDisableDialog(true); setDisableStep('confirm'); setDisableOTP(''); setDisableError(''); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-200/60 dark:border-red-800/30 text-xs font-semibold text-red-500 dark:text-red-400 active:scale-95 transition-all"
                >
                  <X size={14} />
                  Nonaktifkan
                </button>
              </div>
            </>
          )}

        </div>
        )}

        {/* ── PIN Setup Popup ── */}
        {showPINSetup && (
          <>
            <style>{`
              @keyframes pinOverlayIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes pinOverlayOut { from { opacity: 1; } to { opacity: 0; } }
              @keyframes pinModalIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
              @keyframes pinModalOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.92); } }
            `}</style>
            <div
              className="fixed -top-12 left-0 right-0 -bottom-12 z-50 bg-black/50 backdrop-blur-sm"
              style={{ animation: closingPINSetup ? 'pinOverlayOut 0.15s ease forwards' : 'pinOverlayIn 0.2s ease' }}
              onClick={() => {
                setClosingPINSetup(true);
                setTimeout(() => { setClosingPINSetup(false); setShowPINSetup(false); }, 150);
              }}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center px-6 pointer-events-none">
              <div
                className="w-full max-w-xs bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl p-4 pointer-events-auto"
                style={{ animation: closingPINSetup ? 'pinModalOut 0.15s ease forwards' : 'pinModalIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}
                onClick={e => e.stopPropagation()}
              >

                {/* Step 0: Current PIN (ubah PIN flow) */}
                {pinStep === 0 && (
                  <div className="space-y-3">
                    <button type="button" onClick={() => {
                      setClosingPINSetup(true);
                      setTimeout(() => { setClosingPINSetup(false); setShowPINSetup(false); }, 150);
                    }} className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 cursor-pointer">
                      ← Batal
                    </button>
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 mx-auto flex items-center justify-center mb-2">
                        <Lock size={18} className="text-emerald-500" />
                      </div>
                      <p className="text-sm font-bold text-gray-800 dark:text-white">Masukkan PIN lama</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 mb-3">Verifikasi PIN saat ini</p>
                    </div>
                    <PinInput value={currentPinInput} onChange={async (v) => {
                      setCurrentPinInput(v);
                      setPinError('');
                      if (v.length === 6) {
                        setPinSaving(true);
                        try {
                          const res = await fetch('/api/auth/verify-pin', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                            body: JSON.stringify({ pin: v }),
                          });
                          const data = await res.json();
                          if (res.ok && data.success) {
                            setPinStep(1); setPin1(''); setPinError('');
                          } else {
                            setPinError(data.error || 'PIN salah');
                            setTimeout(() => setCurrentPinInput(''), 600);
                          }
                        } catch {
                          setPinError('Gagal memverifikasi PIN');
                          setTimeout(() => setCurrentPinInput(''), 600);
                        }
                        setPinSaving(false);
                      }
                    }} autoFocus error={!!pinError} />
                    {pinError && <p className="text-xs text-red-500 dark:text-red-400 text-center mt-1">{pinError}</p>}
                    <button
                      type="button"
                      disabled={currentPinInput.length < 6 || pinSaving}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${currentPinInput.length === 6 && !pinSaving ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 opacity-40'}`}
                    >
                      {pinSaving ? <><Loader2 size={16} className="animate-spin" /> Memverifikasi...</> : 'Lanjut'}
                    </button>
                  </div>
                )}

                {/* Step 1: Buat PIN baru */}
                {pinStep === 1 && (
                  <div className="space-y-3">
                    <button type="button" onClick={() => {
                      if (hasPIN) { setPinStep(0); setCurrentPinInput(''); setPin1(''); setPinError(''); }
                      else { setClosingPINSetup(true); setTimeout(() => { setClosingPINSetup(false); setShowPINSetup(false); }, 150); }
                    }} className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 cursor-pointer">
                      ← {hasPIN ? 'Kembali' : 'Batal'}
                    </button>
                    <div className="flex justify-center gap-1.5">
                      <div className="w-5 h-1.5 rounded-full bg-emerald-500" />
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 mt-px" />
                    </div>
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 mx-auto flex items-center justify-center mb-2">
                        <Lock size={18} className="text-emerald-500" />
                      </div>
                      <p className="text-sm font-bold text-gray-800 dark:text-white">Buat PIN baru</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 mb-3">Masukkan 6 digit angka</p>
                    </div>
                    <PinInput value={pin1} onChange={v => {
                      setPin1(v); setPinError('');
                      if (v.length === 6) { setPinStep(2); setPin2(''); setPinError(''); }
                    }} autoFocus />
                    {pinError && <p className="text-xs text-red-500 dark:text-red-400 text-center mt-1">{pinError}</p>}
                    <button
                      type="button"
                      disabled={pin1.length < 6}
                      onClick={() => { setPinStep(2); setPin2(''); setPinError(''); }}
                      className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${pin1.length === 6 ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 opacity-40'}`}
                    >
                      Lanjut
                    </button>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 text-center">PIN akan diminta saat membuka Statistik</p>
                  </div>
                )}

                {/* Step 2: Konfirmasi PIN */}
                {pinStep === 2 && (
                  <div className="space-y-3">
                    <button type="button" onClick={() => { setPinStep(1); setPin2(''); setPinError(''); }} className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 cursor-pointer">
                      ← Kembali
                    </button>
                    <div className="flex justify-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-px" />
                      <div className="w-5 h-1.5 rounded-full bg-emerald-500" />
                    </div>
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/20 mx-auto flex items-center justify-center mb-2">
                        <Lock size={18} className="text-emerald-500" />
                      </div>
                      <p className="text-sm font-bold text-gray-800 dark:text-white">Konfirmasi PIN</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 mb-3">Masukkan ulang PIN yang sama</p>
                    </div>
                    <PinInput value={pin2} onChange={async (v) => {
                      setPin2(v); setPinError('');
                      if (v.length === 6) {
                        if (pin1 !== v) {
                          setPinError('PIN tidak cocok');
                          setTimeout(() => setPin2(''), 600);
                          return;
                        }
                        setPinSaving(true);
                        try {
                          const body: Record<string, string> = { pin: pin1 };
                          if (hasPIN) body.currentPin = currentPinInput;
                          const res = await fetch('/api/auth/set-pin', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                            body: JSON.stringify(body),
                          });
                          const data = await res.json();
                          if (res.ok && data.success) {
                            setHasPIN(true);
                            setClosingPINSetup(true);
                            setTimeout(() => { setClosingPINSetup(false); setShowPINSetup(false); }, 150);
                            setSaved(true);
                            setSavedMessage(hasPIN ? 'PIN berhasil diubah.' : 'PIN berhasil diaktifkan.');
                            setTimeout(() => { setSaved(false); setSavedMessage(''); }, 2500);
                          } else {
                            setPinError(data.error || 'Gagal menyimpan PIN');
                            setTimeout(() => setPin2(''), 600);
                          }
                        } catch {
                          setPinError('Gagal menyimpan PIN');
                          setTimeout(() => setPin2(''), 600);
                        }
                        setPinSaving(false);
                      }
                    }} autoFocus error={!!pinError} />
                    {pinError && <p className="text-xs text-red-500 dark:text-red-400 text-center mt-1">{pinError}</p>}
                    <button
                      type="button"
                      disabled={pin2.length < 6 || pinSaving}
                      className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${pin2.length === 6 && !pinSaving ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 opacity-40'}`}
                    >
                      {pinSaving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan...</> : <><Check size={14} /> Aktifkan PIN</>}
                    </button>
                  </div>
                )}

              </div>
            </div>
          </>
        )}

        {/* ── Disable PIN Dialog ── */}
        {showDisableDialog && (
          <>
            <style>{`
              @keyframes pinOverlayIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes pinOverlayOut { from { opacity: 1; } to { opacity: 0; } }
              @keyframes pinModalIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
              @keyframes pinModalOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.92); } }
            `}</style>
            <div
              className="fixed -top-12 left-0 right-0 -bottom-12 z-50 bg-black/50 backdrop-blur-sm"
              style={{ animation: closingDisable ? 'pinOverlayOut 0.15s ease forwards' : 'pinOverlayIn 0.2s ease' }}
              onClick={() => {
                setClosingDisable(true);
                setTimeout(() => { setClosingDisable(false); setShowDisableDialog(false); setDisableStep('confirm'); setDisableOTP(''); setDisableError(''); }, 150);
              }}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center px-6 pointer-events-none">
              <div
                className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl p-5 text-center pointer-events-auto"
                style={{ animation: closingDisable ? 'pinModalOut 0.15s ease forwards' : 'pinModalIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}
                onClick={e => e.stopPropagation()}
              >

                {/* Step 1: Confirm */}
                {disableStep === 'confirm' && (
                  <>
                    <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 mx-auto flex items-center justify-center">
                      <ShieldOff size={22} className="text-red-500" />
                    </div>
                    <p className="text-sm font-bold text-gray-800 dark:text-white mt-3">Nonaktifkan PIN?</p>
                    {telegramStatus.connected ? (
                      <>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Kode verifikasi akan dikirim ke Telegram kamu</p>
                        <div className="flex items-center justify-center gap-1.5 mt-3">
                          <Send size={14} className="text-emerald-500" />
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Telegram terhubung</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Perlu verifikasi via Telegram untuk nonaktifkan PIN</p>
                        <div className="flex items-center justify-center gap-1.5 mt-3">
                          <Unlink size={14} className="text-amber-500" />
                          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Telegram belum terhubung</span>
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">Hubungkan Telegram di tab Telegram terlebih dahulu</p>
                      </>
                    )}
                    {disableError && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{disableError}</p>}
                    <div className="flex gap-2 mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setClosingDisable(true);
                          setTimeout(() => { setClosingDisable(false); setShowDisableDialog(false); setDisableStep('confirm'); setDisableOTP(''); setDisableError(''); }, 150);
                        }}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-500 dark:text-slate-400 active:scale-95 transition-all"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={disableLoading || !telegramStatus.connected}
                        onClick={async () => {
                          setDisableLoading(true);
                          setDisableError('');
                          try {
                            const res = await fetch('/api/auth/pin-reset-request', {
                              method: 'POST',
                              headers: { ...getAuthHeaders() },
                            });
                            const data = await res.json();
                            if (res.ok) {
                              setDisableStep('otp');
                              if (data.telegramName) setOtpTelegramName(data.telegramName);
                              setOtpCooldown(60);
                              const interval = setInterval(() => {
                                setOtpCooldown(prev => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
                              }, 1000);
                            } else {
                              setDisableError(data.error || 'Gagal mengirim kode');
                            }
                          } catch {
                            setDisableError('Gagal mengirim kode');
                          }
                          setDisableLoading(false);
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${disableLoading || !telegramStatus.connected ? 'bg-red-200 dark:bg-red-900/30 text-red-300 dark:text-red-500/50' : 'bg-red-500 text-white'}`}
                      >
                        {disableLoading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Kirim Kode'}
                      </button>
                    </div>
                  </>
                )}

                {/* Step 2: OTP Input */}
                {disableStep === 'otp' && (
                  <>
                    <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 mx-auto flex items-center justify-center">
                      <Send size={22} className="text-blue-500" />
                    </div>
                    <p className="text-sm font-bold text-gray-800 dark:text-white mt-3">Cek OTP di Telegram</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 mb-4">6 digit kode dikirim ke {otpTelegramName || 'Telegram kamu'}</p>
                    <PinInput
                      value={disableOTP}
                      onChange={async (val) => {
                        setDisableOTP(val);
                        setDisableError('');
                        if (val.length === 6) {
                          setDisableLoading(true);
                          try {
                            const res = await fetch('/api/auth/pin-reset-verify', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                              body: JSON.stringify({ code: val }),
                            });
                            const data = await res.json();
                            if (res.ok && data.success) {
                              setHasPIN(false);
                              setClosingDisable(true);
                              setTimeout(() => { setClosingDisable(false); setShowDisableDialog(false); setDisableStep('confirm'); setDisableOTP(''); }, 150);
                              sessionStorage.removeItem('pin_unlocked');
                              setSaved(true);
                              setSavedMessage('PIN dinonaktifkan.');
                              setTimeout(() => { setSaved(false); setSavedMessage(''); }, 2500);
                            } else {
                              setDisableError(data.error || 'Kode salah');
                              setTimeout(() => setDisableOTP(''), 600);
                            }
                          } catch {
                            setDisableError('Gagal memverifikasi kode');
                            setTimeout(() => setDisableOTP(''), 600);
                          }
                          setDisableLoading(false);
                        }
                      }}
                      autoFocus
                      error={!!disableError}
                    />
                    {disableError && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{disableError}</p>}
                    <button
                      type="button"
                      disabled
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all mt-4 ${disableLoading ? 'bg-red-500 text-white' : 'bg-red-200 dark:bg-red-900/30 text-red-300 dark:text-red-500/50'}`}
                    >
                      {disableLoading ? <><Loader2 size={14} className="animate-spin" /> Memverifikasi...</> : 'Nonaktifkan PIN'}
                    </button>
                    <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-3">
                      {otpCooldown > 0 ? (
                        <>Kirim ulang ({otpCooldown}s)</>
                      ) : (
                        <>Belum dapat kode?{' '}
                          <button
                            type="button"
                            onClick={async () => {
                              setDisableError('');
                              setResendLoading(true);
                              try {
                                const res = await fetch('/api/auth/pin-reset-request', {
                                  method: 'POST',
                                  headers: { ...getAuthHeaders() },
                                });
                                if (res.ok) {
                                  setOtpCooldown(60);
                                  const interval = setInterval(() => {
                                    setOtpCooldown(prev => { if (prev <= 1) { clearInterval(interval); return 0; } return prev - 1; });
                                  }, 1000);
                                } else {
                                  const data = await res.json().catch(() => ({}));
                                  setDisableError(data.error || 'Gagal mengirim kode');
                                }
                              } catch {
                                setDisableError('Gagal mengirim kode');
                              } finally {
                                setResendLoading(false);
                              }
                            }}
                            disabled={resendLoading || disableLoading}
                            className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2 disabled:opacity-50"
                          >
                            {resendLoading ? <><Loader2 size={12} className="animate-spin inline" /> Mengirim...</> : 'Kirim ulang'}
                          </button>
                        </>
                      )}
                    </p>
                  </>
                )}

              </div>
            </div>
          </>
        )}

        {/* Password Change Modal */}
        <PasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onSuccess={() => {
            setSaved(true);
            setSavedMessage('Password berhasil diubah.');
            setTimeout(() => { setSaved(false); setSavedMessage(''); }, 2500);
          }}
        />

        {/* Slug Change Modal */}
        {editingSlug && (
          <>
            <style>{`
              @keyframes slugOverlayIn { from { opacity: 0 } to { opacity: 1 } }
              @keyframes slugOverlayOut { from { opacity: 1 } to { opacity: 0 } }
              @keyframes slugModalIn { from { opacity: 0; transform: scale(0.92) } to { opacity: 1; transform: scale(1) } }
              @keyframes slugModalOut { from { opacity: 1; transform: scale(1) } to { opacity: 0; transform: scale(0.92) } }
            `}</style>
            <div
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              style={{ animation: `${closingSlugModal ? 'slugOverlayOut' : 'slugOverlayIn'} 250ms cubic-bezier(0.16,1,0.3,1) forwards` }}
              onClick={() => {
                setClosingSlugModal(true);
                setTimeout(() => { setEditingSlug(false); setClosingSlugModal(false); setSlugValue(agent.slug); setSlugError(''); }, 200);
              }}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
              <div
                className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl pointer-events-auto"
                style={{ animation: `${closingSlugModal ? 'slugModalOut' : 'slugModalIn'} 250ms cubic-bezier(0.16,1,0.3,1) forwards` }}
              >
                {/* Header */}
                <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800 dark:text-white">Ubah Username</h3>
                  <button onClick={() => {
                    setClosingSlugModal(true);
                    setTimeout(() => { setEditingSlug(false); setClosingSlugModal(false); setSlugValue(agent.slug); setSlugError(''); }, 200);
                  }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                {/* Body */}
                <div className="p-5">
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">URL lama akan otomatis redirect ke username baru.</p>

                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5 uppercase tracking-wide">Username</label>
                  <div className="flex items-center rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all">
                    <span className="text-sm text-gray-400 dark:text-slate-500 pl-3 pr-0.5 py-2.5 select-none whitespace-nowrap">alhijaz.co/</span>
                    <input
                      type="text"
                      value={slugValue}
                      onChange={e => {
                        setSlugValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                        setSlugError('');
                      }}
                      className="flex-1 w-full px-1 py-2.5 bg-white dark:bg-slate-900 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 outline-none"
                      placeholder={agent.slug}
                      maxLength={30}
                      autoFocus
                    />
                  </div>
                  {slugError ? (
                    <p className="text-xs font-medium text-red-500 dark:text-red-400 mt-1.5">{slugError}</p>
                  ) : (
                    <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5 font-medium">Huruf kecil, angka, dan strip. 2–30 karakter.</p>
                  )}

                  {/* Preview */}
                  {slugValue && slugValue !== agent.slug && slugValue.length >= 2 && (
                    <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-xl">
                      <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-0.5">Preview URL</p>
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">alhijaz.co/{slugValue}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setClosingSlugModal(true);
                        setTimeout(() => { setEditingSlug(false); setClosingSlugModal(false); setSlugValue(agent.slug); setSlugError(''); }, 200);
                      }}
                      className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-all duration-200 active:scale-95"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={!slugValue || slugValue === agent.slug || slugValue.length < 2 || saving}
                      onClick={async () => {
                        if (slugValue.length < 2) { setSlugError('Minimal 2 karakter'); return; }
                        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slugValue) && slugValue.length > 1) { setSlugError('Format tidak valid'); return; }
                        setSaving(true);
                        try {
                          const res = await fetch('/api/admin/profile', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                            body: JSON.stringify({ slug: slugValue }),
                          });
                          const data = await res.json();
                          if (!res.ok || !data.success) {
                            setSlugError(data.error === 'SLUG_COOLDOWN' ? data.message : (data.error || 'Gagal menyimpan'));
                            setSaving(false);
                            return;
                          }
                          if (data.newToken) {
                            const stored = localStorage.getItem('auth_session') || sessionStorage.getItem('auth_session');
                            if (stored) {
                              const session = JSON.parse(stored);
                              session.token = data.newToken;
                              if (data.user) session.user = { ...session.user, ...data.user };
                              const storage = localStorage.getItem('auth_session') ? localStorage : sessionStorage;
                              storage.setItem('auth_session', JSON.stringify(session));
                            }
                            setSlugCooldown({ canChange: false, nextChangeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
                          }
                          setSaving(false);
                          setClosingSlugModal(true);
                          setTimeout(() => { setEditingSlug(false); setClosingSlugModal(false); }, 200);
                          setSaved(true);
                          setSavedMessage('Username berhasil diubah.');
                          onUpdated();
                          setTimeout(() => { setSaved(false); setSavedMessage(''); }, 2500);
                        } catch {
                          setSlugError('Gagal menghubungi server');
                          setSaving(false);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
                    >
                      {saving ? (
                        <><svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Menyimpan...</>
                      ) : 'Simpan'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        {/* Saved toast message */}
        {saved && savedMessage && (
          <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {savedMessage}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || saved || !hasChanges || requiredMissing || hasErrors}
          className={`mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 active:scale-95 ${
            saved
              ? 'bg-emerald-500 text-white'
              : hasChanges && !requiredMissing && !hasErrors
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {saving ? (
            <><Loader2 size={18} className="animate-spin" /> Menyimpan...</>
          ) : saved ? (
            <><CheckCircle2 size={18} /> Tersimpan!</>
          ) : (
            <><Save size={18} /> Simpan Perubahan</>
          )}
        </button>
      </div>
    </div>
  );
}
