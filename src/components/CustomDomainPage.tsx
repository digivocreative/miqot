import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe, Loader2, Check, Copy, RefreshCw, ExternalLink,
  AlertCircle, Trash2, Info, Clock, Server, Lock, ArrowRight,
  Youtube, CirclePlay, X,
} from 'lucide-react';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';
import { useCustomDomain } from '../hooks/useCustomDomain';
import { isCustomDomainEnabledForAgent } from '../lib/customDomainAccess';
import type { CustomDomainConfig } from '../types/customDomain';

const CUSTOM_DOMAIN_TUTORIAL_URL = 'https://youtu.be/HU4MNof3kn8';
const CUSTOM_DOMAIN_TUTORIAL_EMBED_URL = 'https://www.youtube.com/embed/HU4MNof3kn8?autoplay=1&rel=0&modestbranding=1&playsinline=1';

interface Props {
  agent: { slug: string; name: string };
}

export default function CustomDomainPage({ agent }: Props) {
  const customDomainEnabled = isCustomDomainEnabledForAgent(agent.slug);
  const { config, loading, refetch } = useCustomDomain({ enabled: customDomainEnabled });
  const [showForm, setShowForm] = useState(false);

  const mountTracked = useRef(false);
  useEffect(() => { if (!mountTracked.current) { trackEvent('feature', 'open_custom_domain'); mountTracked.current = true; } }, []);

  if (!customDomainEnabled) return <DisabledState />;
  if (loading) return <PageSkeleton />;

  let body: React.ReactNode = null;
  if (!config?.domain && !showForm) {
    body = <EmptyState onAdd={() => setShowForm(true)} />;
  } else if (!config?.domain && showForm) {
    body = (
      <FormState
        onCancel={() => setShowForm(false)}
        onSubmitted={async () => {
          await refetch();
          setShowForm(false);
        }}
      />
    );
  } else if (config?.status === 'active') {
    body = <VerifiedState config={config} agentSlug={agent.slug} onDeleted={refetch} />;
  } else {
    body = <VerifyingState config={config!} onRefetch={refetch} />;
  }

  return (
    <div className="max-w-lg mx-auto pt-4 px-4 pb-20 space-y-3">
      {body}
      <VideoTutorialCard />
    </div>
  );
}

function DisabledState() {
  return (
    <div className="max-w-lg mx-auto pt-4 px-4 pb-20">
      <div className="rounded-2xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-5">
        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
          <Globe size={22} className="text-gray-400 dark:text-slate-500" strokeWidth={2.2} />
        </div>
        <h2 className="text-base font-bold text-gray-800 dark:text-white mt-4">
          Custom Domain Belum Tersedia
        </h2>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
          Untuk sementara fitur ini hanya aktif untuk agent Nikita.
        </p>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="max-w-lg mx-auto pt-4 px-4 space-y-3">
      <div className="h-40 bg-gray-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
      <div className="h-32 bg-gray-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
    </div>
  );
}

function VideoTutorialCard() {
  const tutorialReady = Boolean(CUSTOM_DOMAIN_TUTORIAL_URL);
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialClosing, setTutorialClosing] = useState(false);

  const closeTutorial = () => {
    setTutorialClosing(true);
    setTimeout(() => {
      setShowTutorial(false);
      setTutorialClosing(false);
    }, 200);
  };

  const content = (
    <>
      <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 flex items-center justify-center shrink-0">
        <Youtube size={18} className="text-red-500 dark:text-red-400" strokeWidth={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold text-gray-800 dark:text-white truncate">
            Video Tutorial
          </h2>
          <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
            tutorialReady
              ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
          }`}>
            {tutorialReady ? 'YouTube' : 'Segera Hadir'}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-snug mt-0.5">
          Panduan setup sampai domain aktif.
        </p>
      </div>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
        tutorialReady
          ? 'bg-gray-50 dark:bg-slate-900 text-gray-400 dark:text-slate-500 group-hover:text-red-500 dark:group-hover:text-red-400'
          : 'bg-gray-50 dark:bg-slate-900 text-gray-300 dark:text-slate-600'
      }`}>
        <CirclePlay size={14} strokeWidth={2.2} />
      </div>
    </>
  );

  if (!tutorialReady) {
    return (
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-3 flex items-center gap-3">
          {content}
        </div>
      </section>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowTutorial(true)}
        aria-label="Tonton video tutorial custom domain di YouTube"
        className="group w-full text-left bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden p-3 flex items-center gap-3 hover:border-red-100 dark:hover:border-red-800/40 transition-all active:scale-[0.99]"
      >
        {content}
      </button>
      {showTutorial && (
        <TutorialVideoModal
          closing={tutorialClosing}
          onClose={closeTutorial}
        />
      )}
    </>
  );
}

function TutorialVideoModal({
  closing,
  onClose,
}: { closing: boolean; onClose: () => void }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 ${closing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-2xl overflow-hidden ${closing ? 'dc-card-exit' : 'dc-card-enter'}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Video tutorial custom domain"
      >
        <div className="relative aspect-video bg-slate-950">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-2 right-2 z-10 w-8 h-8 rounded-xl flex items-center justify-center bg-black/45 text-white hover:bg-black/60 transition-colors active:scale-95"
            aria-label="Tutup video tutorial"
          >
            <X size={15} strokeWidth={2.4} />
          </button>
          <iframe
            src={CUSTOM_DOMAIN_TUTORIAL_EMBED_URL}
            title="Video tutorial custom domain"
            className="block w-full h-full bg-slate-950"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="p-3 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
          <a
            href={CUSTOM_DOMAIN_TUTORIAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95"
          >
            <Youtube size={15} className="text-red-500 dark:text-red-400" strokeWidth={2.2} />
            Tonton di YouTube
            <ExternalLink size={13} className="text-gray-400 dark:text-slate-500" strokeWidth={2.2} />
          </a>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-100 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/50 dark:from-emerald-950/30 dark:via-slate-800 dark:to-slate-800 shadow-sm">
      {/* Decorative blurred orbs (Dashboard Menu Card pattern) */}
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 opacity-20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-14 -left-10 w-28 h-28 rounded-full bg-teal-400 opacity-15 blur-3xl pointer-events-none" />
      {/* Soft white wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent dark:from-white/[0.02] pointer-events-none" />

      <div className="relative p-5">
        {/* Icon tile with gradient + glow (Dashboard Menu Card icon shell pattern) */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 dark:from-emerald-500 dark:to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/30 dark:shadow-emerald-900/40">
          <Globe size={26} className="text-white" strokeWidth={2.2} />
        </div>

        <h2 className="text-base font-bold text-gray-800 dark:text-white mt-4">
          Pakai Domain Sendiri
        </h2>
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
          Lebih profesional dengan nama domain sendiri.
        </p>

        {/* Mini browser URL bar — the visual hook */}
        <div className="mt-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-900/60">
            <span className="w-2 h-2 rounded-full bg-red-300 dark:bg-red-400/70" />
            <span className="w-2 h-2 rounded-full bg-amber-300 dark:bg-amber-400/70" />
            <span className="w-2 h-2 rounded-full bg-emerald-300 dark:bg-emerald-400/70" />
          </div>
          <div className="px-3 py-2.5 flex items-center gap-1.5">
            <Lock size={11} className="text-emerald-500 dark:text-emerald-400 shrink-0" strokeWidth={2.5} />
            <span className="text-xs font-mono text-gray-400 dark:text-slate-500">https://</span>
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 truncate">
            bagasnikita.com
            </span>
          </div>
        </div>

        <button
          onClick={onAdd}
          className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95"
        >
          Tambah Domain
          <ArrowRight size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

const DOMAIN_MAX_LENGTH = 50;
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  'ac.id',
  'biz.id',
  'co.id',
  'desa.id',
  'go.id',
  'my.id',
  'net.id',
  'or.id',
  'ponpes.id',
  'sch.id',
  'web.id',
]);

function isAllowedCustomDomainName(domain: string) {
  const parts = domain.split('.');
  if (parts.length === 2) return !MULTI_LABEL_PUBLIC_SUFFIXES.has(domain);
  if (parts.length === 3) {
    return MULTI_LABEL_PUBLIC_SUFFIXES.has(`${parts[1]}.${parts[2]}`);
  }
  return false;
}

function FormState({ onCancel, onSubmitted }: { onCancel: () => void; onSubmitted: () => Promise<void> | void }) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // touched = user has tried to submit OR finished interacting at least once.
  // focused = input currently has focus. We only flash red when touched && !focused —
  // i.e. they stopped typing.
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const localError = useMemo(() => {
    const v = value.trim().toLowerCase();
    if (!v) return null;
    if (v.includes(' ') || v.includes('/')) {
      return 'Tulis nama domainnya saja, tanpa "/" atau spasi';
    }
    if (v.startsWith('www.')) return 'Jangan pakai "www." di depan';
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)) return 'Format domain tidak valid';
    if (!isAllowedCustomDomainName(v)) {
      return 'Gunakan domain utama, tanpa subdomain';
    }
    return null;
  }, [value]);

  const handleSubmit = async () => {
    // Guard re-entry: the submit button is disabled while submitting, but the
    // input's Enter key calls handleSubmit directly and would double-POST.
    if (submitting) return;
    setTouched(true);
    if (localError || !value.trim()) {
      // Validation failed — blur to surface the red state to the user.
      inputRef.current?.blur();
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch('/api/agent/custom-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ domain: value.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json?.error || 'Gagal menyimpan domain');
        return;
      }
      await onSubmitted();
    } catch (err: any) {
      setServerError(err?.message || 'Gagal menyimpan domain');
    } finally {
      setSubmitting(false);
    }
  };

  // Server errors always show. Local errors only when the user has stopped typing
  // (touched && !focused) so they don't see red flash while still entering the domain.
  const errorText = serverError || (touched && !focused ? localError : null);

  return (
    <>
      {/* Form card — gradient continuity from EmptyState, but cleaner so input is the hero */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-100/70 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/60 via-white to-white dark:from-emerald-950/20 dark:via-slate-800 dark:to-slate-800 shadow-sm">
        <div className="absolute -top-14 -right-14 w-32 h-32 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 opacity-15 blur-3xl pointer-events-none" />

        <div className="relative p-5 space-y-4">
          {/* Compact header: icon + title only */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 dark:from-emerald-500 dark:to-teal-700 flex items-center justify-center shadow-md shadow-emerald-500/30 shrink-0">
              <Globe size={18} className="text-white" strokeWidth={2.2} />
            </div>
            <h2 className="text-sm font-bold text-gray-800 dark:text-white">
              Domain Anda
            </h2>
          </div>

          {/* Compact input with subtle lock leading icon */}
          <div>
            <div className={`relative flex items-center rounded-xl border bg-white dark:bg-slate-900 transition-all focus-within:ring-2 ${
              errorText
                ? 'border-red-400 dark:border-red-500 focus-within:ring-red-500/20 focus-within:border-red-500'
                : 'border-gray-200 dark:border-slate-700 focus-within:border-emerald-500 focus-within:ring-emerald-500/20'
            }`}>
              <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 dark:text-emerald-400 pointer-events-none" strokeWidth={2.5} />
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setServerError(null);
                  // Sanitize on the fly: lowercase, strip protocol/www, drop any
                  // character that isn't valid in a domain (a-z, 0-9, ., -), and cap
                  // length so even pasted URLs stay within 50 chars.
                  const cleaned = e.target.value
                    .toLowerCase()
                    .replace(/^https?:\/\//, '')
                    .replace(/^www\./, '')
                    .replace(/[^a-z0-9.-]/g, '')
                    .slice(0, DOMAIN_MAX_LENGTH);
                  setValue(cleaned);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => {
                  setFocused(false);
                  if (value.trim()) setTouched(true);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                placeholder="bagasnikita.com"
                maxLength={DOMAIN_MAX_LENGTH}
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 min-w-0 pl-9 pr-3 py-2.5 text-sm font-mono font-semibold bg-transparent text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 placeholder:font-normal outline-none"
              />
            </div>
            <p className={`text-[11px] mt-1.5 leading-relaxed flex items-start gap-1 ${
              errorText ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-slate-500'
            }`}>
              {errorText ? (
                <>
                  <AlertCircle size={11} className="mt-0.5 shrink-0" strokeWidth={2.2} />
                  {errorText}
                </>
              ) : (
                'Cukup nama domainnya saja — tanpa www.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Compact "belum punya domain?" pill */}
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/30">
        <Info size={12} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" strokeWidth={2.2} />
        <p className="text-[11px] text-blue-800 dark:text-blue-200 leading-snug">
          Belum punya domain? Beli dulu ya.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-3 rounded-xl text-sm font-bold border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition disabled:opacity-50 active:scale-95"
        >
          Batal
        </button>
        <button
          onClick={handleSubmit}
          disabled={!!localError || !value.trim() || submitting}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
          {submitting ? 'Memuat…' : 'Lanjutkan'}
        </button>
      </div>
    </>
  );
}

/** DNS record fields — Type + Host share a row, Value gets its own row with copy button. */
function DnsRecordList({ ip }: { ip: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!ip) return;
    try {
      await navigator.clipboard.writeText(ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const labelCls = 'text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-slate-400 mb-1.5';
  const fieldCls = 'block px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-sm font-mono font-bold text-gray-800 dark:text-slate-200';

  return (
    <div className="space-y-3">
      {/* Type + Host: side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={labelCls}>Type</div>
          <code className={fieldCls}>A</code>
        </div>
        <div>
          <div className={labelCls}>Host</div>
          <code className={fieldCls}>@</code>
        </div>
      </div>

      {/* Value: own row, full width, with copy button */}
      <div>
        <div className={labelCls}>Value (IP)</div>
        <div className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700">
          <code className="flex-1 min-w-0 text-sm font-mono font-bold text-gray-800 dark:text-slate-200 truncate">
            {ip || '—'}
          </code>
          <button
            onClick={handleCopy}
            aria-label="Salin IP"
            className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-xs font-semibold transition-all active:scale-90 ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/30'
            }`}
          >
            {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.2} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function VerifyingState({ config, onRefetch }: { config: CustomDomainConfig; onRefetch: () => Promise<void> | void }) {
  const [checking, setChecking] = useState(false);
  const [showChangeConfirm, setShowChangeConfirm] = useState(false);
  const [changeConfirmClosing, setChangeConfirmClosing] = useState(false);
  const [changing, setChanging] = useState(false);
  const domain = config.domain || '';
  const ip = config.ip_required || '';
  const resolvedMismatch = !!config.resolved_ip && config.resolved_ip !== ip;

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      await fetch('/api/agent/custom-domain/verify', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      await onRefetch();
    } finally {
      setChecking(false);
    }
  };

  // Two-phase close so the dc-card-exit / dc-backdrop-exit animation plays
  // before the modal unmounts (matches DashboardLayout disconnect-confirm pattern).
  const closeChangeConfirm = () => {
    setChangeConfirmClosing(true);
    setTimeout(() => {
      setShowChangeConfirm(false);
      setChangeConfirmClosing(false);
    }, 200);
  };

  const handleChangeDomain = async () => {
    setChanging(true);
    try {
      await fetch('/api/agent/custom-domain', {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      closeChangeConfirm();
      await onRefetch();
    } finally {
      setChanging(false);
    }
  };

  return (
    <>
      {/* Status bar — amber-tinted (DS Status Bar pattern) */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-white/70 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
          <Clock size={16} className="text-amber-600 dark:text-amber-400" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{domain}</p>
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              Menunggu Propagasi DNS
            </span>
          </div>
        </div>
      </div>

      {/* DNS instruction card — 3-row record list, one copy button on IP */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-2">
          <Server size={13} className="text-gray-500 dark:text-slate-400" strokeWidth={2.2} />
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">
            Setting DNS
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
            Login ke panel DNS provider domain Anda (Niagahoster, Cloudflare, dll),
            lalu tambahkan record berikut. Tunggu 5–30 menit untuk propagasi.
          </p>

          <DnsRecordList ip={ip} />

          {resolvedMismatch && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-800/30 rounded-xl flex gap-2.5">
              <Info size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                IP yang terdeteksi <span className="font-mono font-semibold">{config.resolved_ip}</span> — belum match.
                DNS biasanya butuh 5–15 menit untuk update.
              </div>
            </div>
          )}

          <button
            onClick={handleCheckNow}
            disabled={checking}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={2.5} />}
            {checking ? 'Mengecek DNS…' : 'Cek DNS sekarang'}
          </button>
        </div>
      </div>

      {/* Secondary action — ganti domain (subtle but recognizable as a button) */}
      <div className="flex justify-center pt-1">
        <button
          onClick={() => setShowChangeConfirm(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition active:scale-95"
        >
          <RefreshCw size={12} strokeWidth={2.2} />
          Ganti domain
        </button>
      </div>

      {showChangeConfirm && (
        <ChangeDomainConfirm
          domain={domain}
          loading={changing}
          closing={changeConfirmClosing}
          onCancel={closeChangeConfirm}
          onConfirm={handleChangeDomain}
        />
      )}
    </>
  );
}

function ChangeDomainConfirm({
  domain, loading, closing, onCancel, onConfirm,
}: { domain: string; loading: boolean; closing: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 w-full max-w-xs overflow-hidden ${closing ? 'dc-card-exit' : 'dc-card-enter'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 flex items-center justify-center mx-auto mb-3">
            <RefreshCw size={20} className="text-amber-600 dark:text-amber-400" strokeWidth={2} />
          </div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">
            Ganti domain?
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            <span className="font-mono font-semibold">{domain}</span> akan dihapus.
            Anda bisa memasukkan domain baru setelah ini.
          </p>
        </div>
        <div className="flex items-center gap-2 px-5 pb-5 pt-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : null}
            {loading ? 'Mengganti…' : 'Ya, ganti'}
          </button>
        </div>
      </div>
    </div>
  );
}

function VerifiedState({
  config, agentSlug, onDeleted,
}: { config: CustomDomainConfig; agentSlug: string; onDeleted: () => Promise<void> | void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmClosing, setConfirmClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const domain = config.domain || '';

  const closeConfirm = () => {
    setConfirmClosing(true);
    setTimeout(() => {
      setShowConfirm(false);
      setConfirmClosing(false);
    }, 200);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch('/api/agent/custom-domain', {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      closeConfirm();
      await onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const verifiedText = config.verified_at
    ? new Date(config.verified_at).toLocaleString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

  return (
    <>
      {/* Status bar — emerald-tinted Connected pattern */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-white/70 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
          <Check size={16} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{domain}</p>
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              Aktif
            </span>
          </div>
          <p className="text-[11px] text-gray-600 dark:text-slate-300 mt-1 leading-relaxed">
            Domain Anda sudah live dengan SSL otomatis dari Let's Encrypt.
          </p>
        </div>
      </div>

      {/* Detail card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 dark:border-slate-700/50">
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">
            Informasi
          </h3>
        </div>
        <dl className="p-5 space-y-2.5 text-xs">
          <div className="flex justify-between items-center gap-3">
            <dt className="text-gray-500 dark:text-slate-400 font-medium">SSL</dt>
            <dd className="text-gray-800 dark:text-white font-semibold">Aktif (Let's Encrypt)</dd>
          </div>
          <div className="flex justify-between items-center gap-3">
            <dt className="text-gray-500 dark:text-slate-400 font-medium">Diverifikasi</dt>
            <dd className="text-gray-800 dark:text-white font-semibold">{verifiedText}</dd>
          </div>
          <div className="flex justify-between items-center gap-3">
            <dt className="text-gray-500 dark:text-slate-400 font-medium">Fallback</dt>
            <dd className="text-gray-800 dark:text-white font-semibold truncate">alhijaz.co/{agentSlug}</dd>
          </div>
        </dl>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-800/30 rounded-xl flex gap-2.5">
        <Info size={14} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-[11px] text-blue-800 dark:text-blue-200 leading-relaxed">
          Setiap kunjungan ke <span className="font-mono font-semibold">alhijaz.co/{agentSlug}</span> akan auto-redirect
          ke <span className="font-mono font-semibold">{domain}</span>. Link share yang sudah Anda kirim sebelumnya tetap berfungsi.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <a
          href={`https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95"
        >
          <ExternalLink size={14} strokeWidth={2.2} />
          Lihat halaman
        </a>
        <button
          onClick={() => setShowConfirm(true)}
          className="inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold border border-red-200 dark:border-red-800/40 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95"
        >
          <Trash2 size={14} strokeWidth={2.2} />
          Hapus
        </button>
      </div>

      {showConfirm && (
        <DeleteConfirm
          domain={domain}
          agentSlug={agentSlug}
          deleting={deleting}
          closing={confirmClosing}
          onCancel={closeConfirm}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}

function DeleteConfirm({
  domain, agentSlug, deleting, closing, onCancel, onConfirm,
}: { domain: string; agentSlug: string; deleting: boolean; closing: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? 'dc-backdrop-exit' : 'dc-backdrop-enter'}`}
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 w-full max-w-xs overflow-hidden ${closing ? 'dc-card-exit' : 'dc-card-enter'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={22} className="text-red-500 dark:text-red-400" strokeWidth={2} />
          </div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">
            Hapus {domain}?
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            Halaman Anda akan kembali ke <span className="font-mono font-semibold">alhijaz.co/{agentSlug}</span>.
            SSL cert akan dihapus.
          </p>
        </div>
        <div className="flex items-center gap-2 px-5 pb-5 pt-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : null}
            {deleting ? 'Menghapus…' : 'Ya, hapus'}
          </button>
        </div>
      </div>
    </div>
  );
}
