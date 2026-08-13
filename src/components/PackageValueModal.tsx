'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileImage,
  Loader2,
  MapPinned,
  RefreshCw,
  Share2,
  Wand2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getSessionAuthHeaders } from '@/utils/authUtils';
import { trackEvent } from '@/utils/analytics';
import FilterDropdown from './FilterDropdown';
import { buildImageAndPromptShareData, DESIGN_STYLES } from './brochure-prompt/buildBrochurePrompt';

interface PackageValueAdvantage {
  title: string;
  /** Copy pengalaman (emosional) — baris baca utama di daftar nilai plus */
  benefit?: string;
  /** Bukti faktual yang tampil di artwork */
  description: string;
  source: 'brosur' | 'itinerary';
  sourceRef: string;
}

interface PackageValueResult {
  headline: string;
  summary: string;
  visualIdea?: string;
  advantages: PackageValueAdvantage[];
  bestFor: string[];
  /** Arah desain yang dipakai prompt ini; dirotasi server per generate */
  style?: { id: string; name: string };
  bannerPrompt: string;
}

interface PackageValueModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  jadwalId: string;
  tier: string;
  agent?: {
    name: string;
    phone: string;
    photo: string;
  } | null;
}

interface AgentAttachment {
  file: File;
  url: string;
}

const LOADING_STEPS = [
  'Membaca fakta paket…',
  'Memilih nilai plus terkuat…',
  'Meracik gaya desain…',
  'Menyusun prompt banner…',
];

const labelCls = 'mb-1 block text-[11px] font-semibold text-gray-500 dark:text-slate-400';
const STYLE_OPTIONS = DESIGN_STYLES.map((style) => ({ value: style.value, label: style.label }));

async function copyPlainText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

function copyPlainTextSynchronously(text: string): boolean {
  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}

function safeAgentAttachmentFilename(name = ''): string {
  const slug = name.toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'agent';
  return `identitas-agent-${slug}.png`;
}

function packageValueErrorMessage(response: Response, data: Record<string, any>, rawBody: string): string {
  if (response.status === 429 && data.retryAfterMinutes) {
    return `Limit analisis tercapai. Coba lagi dalam ${data.retryAfterMinutes} menit.`;
  }
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  if (response.status === 404) {
    return 'Fitur Nilai Plus belum aktif di server. Muat ulang setelah pembaruan aplikasi selesai.';
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html') || /<!doctype|<html/i.test(rawBody)) {
    return 'Layanan Nilai Plus belum siap. Silakan muat ulang dan coba lagi.';
  }
  return 'Gagal menganalisis nilai plus paket. Silakan coba lagi.';
}

export function PackageValueModal({ isOpen, onClose, subject, jadwalId, tier, agent }: PackageValueModalProps) {
  const [result, setResult] = useState<PackageValueResult | null>(null);
  const [sourceAvailability, setSourceAvailability] = useState({ brochure: true, itinerary: false });
  const [resolvedTier, setResolvedTier] = useState(tier);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [styleLoading, setStyleLoading] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState('modern');
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [agentAttachment, setAgentAttachment] = useState<AgentAttachment | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentRetry, setAttachmentRetry] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  // Penjaga respons basi: request yang selesai setelah paket/tier berganti
  // tidak boleh menimpa state paket yang sedang tampil.
  const requestSeqRef = useRef(0);
  const copiedTimerRef = useRef<number | undefined>(undefined);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    requestSeqRef.current += 1;
    setResult(null);
    setError(null);
    setCopied(false);
    setCached(false);
    setDetailsOpen(true);
    setSelectedStyle('modern');
    setResolvedTier(tier);
    setIsSharing(false);
    setLoading(false);
    setStyleLoading(false);
  }, [jadwalId, subject, tier]);

  // Fokus awal + tutup via Escape; kembalikan fokus ke pemicu saat modal tutup.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setAgentAttachment(null);
      setAttachmentError(null);
      setAttachmentLoading(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setAgentAttachment(null);
    setAttachmentError(null);
    setAttachmentLoading(true);

    void (async () => {
      try {
        const response = await fetch('/api/package-value/agent-card', {
          signal: controller.signal,
          headers: getSessionAuthHeaders(),
        });
        if (!response.ok) throw new Error('agent-card-unavailable');
        const blob = await response.blob();
        if (!blob.type.startsWith('image/') || blob.size === 0) throw new Error('agent-card-invalid');
        const file = new File([blob], safeAgentAttachmentFilename(agent?.name), { type: 'image/png' });
        objectUrl = URL.createObjectURL(blob);
        setAgentAttachment({ file, url: objectUrl });
      } catch (err: any) {
        if (err?.name !== 'AbortError') setAttachmentError('Lampiran identitas belum berhasil disiapkan.');
      } finally {
        if (!controller.signal.aborted) setAttachmentLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, attachmentRetry, agent?.name]);

  useEffect(() => {
    if (!loading) return;
    setLoadingStep(0);
    const timer = window.setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, LOADING_STEPS.length - 1));
    }, 1600);
    return () => window.clearInterval(timer);
  }, [loading]);

  // Label share hanya menjanjikan lampiran bila payload sesungguhnya bisa
  // di-share file oleh browser ini (desktop Chrome → fallback Buka ChatGPT).
  const canNativeShareWithFile = useMemo(() => {
    if (!agentAttachment || !result?.bannerPrompt) return false;
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare(buildImageAndPromptShareData(agentAttachment.file, result.bannerPrompt));
    } catch {
      return false;
    }
  }, [agentAttachment, result?.bannerPrompt]);

  const requestPackageValue = async ({ refresh = false, styleId = selectedStyle } = {}) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 50000);
    try {
      const response = await fetch('/api/package-value', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...getSessionAuthHeaders() },
        body: JSON.stringify({ jadwalId, tier, refresh, style: styleId }),
      });
      const rawBody = await response.text();
      let data: Record<string, any> = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        data = {};
      }
      if (!response.ok) {
        throw new Error(packageValueErrorMessage(response, data, rawBody));
      }
      if (
        !data.result
        || typeof data.result.bannerPrompt !== 'string'
        || !data.result.bannerPrompt.trim()
        || !Array.isArray(data.result.advantages)
        || data.result.advantages.length === 0
      ) {
        throw new Error('Prompt banner belum lengkap. Silakan buat ulang.');
      }
      return data;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const applyResponse = (data: Record<string, any>) => {
    setResult(data.result);
    setSourceAvailability({
      brochure: data.sourceAvailability?.brochure !== false,
      itinerary: data.sourceAvailability?.itinerary === true,
    });
    setResolvedTier(typeof data.tier === 'string' ? data.tier : tier);
    setCached(data.cached === true);
    if (typeof data.result?.style?.id === 'string') setSelectedStyle(data.result.style.id);
  };

  const generate = async (refresh = false) => {
    if (loading || styleLoading) return;
    const seq = requestSeqRef.current;
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const data = await requestPackageValue({ refresh });
      if (seq !== requestSeqRef.current) return;
      applyResponse(data);
      trackEvent('action', 'package_value_generate', {
        paket: jadwalId,
        tier: typeof data.tier === 'string' ? data.tier : tier,
        cached: data.cached === true,
        style: data.result?.style?.id || '',
        itinerary_available: data.sourceAvailability?.itinerary === true,
        point_count: data.result.advantages.length,
        prompt_length: data.result.bannerPrompt.length,
      });
    } catch (err: any) {
      if (seq !== requestSeqRef.current) return;
      const message = err?.name === 'AbortError'
        ? 'Penyusunan prompt memerlukan waktu terlalu lama. Silakan coba lagi.'
        : err?.message || 'Gagal menyusun prompt banner';
      setError(message);
      trackEvent('action', 'package_value_error', { paket: jadwalId, refresh });
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  };

  // Ganti gaya desain tanpa analisis AI ulang: hasil analisis diambil dari
  // cache server, hanya arah desain pada prompt yang dirakit ulang.
  const changeStyle = async (nextStyle: string) => {
    if (loading || styleLoading || !result) return;
    const seq = requestSeqRef.current;
    const previousStyle = selectedStyle;
    setSelectedStyle(nextStyle);
    setStyleLoading(true);
    setError(null);
    setCopied(false);
    try {
      const data = await requestPackageValue({ styleId: nextStyle });
      if (seq !== requestSeqRef.current) return;
      applyResponse(data);
      trackEvent('action', 'package_value_style_change', {
        paket: jadwalId,
        style: data.result?.style?.id || '',
        cached: data.cached === true,
      });
    } catch (err: any) {
      if (seq !== requestSeqRef.current) return;
      setSelectedStyle(previousStyle);
      const message = err?.name === 'AbortError'
        ? 'Penggantian gaya memerlukan waktu terlalu lama. Silakan coba lagi.'
        : err?.message || 'Gagal mengganti gaya desain';
      setError(message);
    } finally {
      if (seq === requestSeqRef.current) setStyleLoading(false);
    }
  };

  const showCopiedState = () => {
    window.clearTimeout(copiedTimerRef.current);
    setCopied(true);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2500);
  };

  const downloadAgentAttachment = () => {
    if (!agentAttachment) return;
    const link = document.createElement('a');
    link.href = agentAttachment.url;
    link.download = agentAttachment.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    trackEvent('action', 'package_value_agent_attachment_download', { paket: jadwalId });
  };

  const handleCopyPrompt = async () => {
    if (!result?.bannerPrompt) return;
    const promptCopied = await copyPlainText(result.bannerPrompt);
    if (promptCopied) showCopiedState();
    trackEvent('action', 'package_value_prompt_copy', {
      paket: jadwalId,
      tier: resolvedTier,
      copied: promptCopied,
    });
  };

  const handleUseInChatGPT = async () => {
    if (!result?.bannerPrompt || isSharing) return;
    setIsSharing(true);

    try {
      if (agentAttachment && canNativeShareWithFile) {
        try {
          const shareData = buildImageAndPromptShareData(agentAttachment.file, result.bannerPrompt);
          const clipboardBackup = copyPlainTextSynchronously(result.bannerPrompt);
          if (clipboardBackup) showCopiedState();
          trackEvent('action', 'package_value_share_payload', {
            paket: jadwalId,
            file_count: 1,
            prompt_length: result.bannerPrompt.length,
            clipboard_backup: clipboardBackup,
          });
          await navigator.share(shareData);
          trackEvent('action', 'package_value_share_chatgpt', { paket: jadwalId, tier: resolvedTier });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
          console.warn('[PackageValue] Native share failed, using browser fallback:', err);
        }
      }

      // Desktop/browser fallback: open ChatGPT immediately while user activation
      // is still available, copy the prompt, and download the identity reference.
      window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
      if (agentAttachment) downloadAgentAttachment();
      const promptCopied = await copyPlainText(result.bannerPrompt);
      if (promptCopied) showCopiedState();
      trackEvent('action', 'package_value_open_chatgpt', {
        paket: jadwalId,
        attachment_downloaded: Boolean(agentAttachment),
        prompt_copied: promptCopied,
      });
    } finally {
      setIsSharing(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div aria-hidden="true" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="package-value-title"
            className="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
              <div className="flex min-w-0 items-center gap-2">
                <Wand2 size={16} className="shrink-0 text-emerald-500" />
                <div className="min-w-0">
                  <h2 id="package-value-title" className="text-sm font-bold leading-tight text-gray-900 dark:text-white">Nilai Plus Paket (AI)</h2>
                  <p className="truncate text-[11px] text-gray-400 dark:text-slate-500">{subject}</p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {loading ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 py-6 text-center">
                  <Loader2 size={28} className="animate-spin text-emerald-500" />
                  <div role="status" aria-live="polite">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={loadingStep}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="text-sm font-medium text-gray-500 dark:text-slate-400"
                      >
                        {LOADING_STEPS[loadingStep]}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                </div>
              ) : error && !result ? (
                <div className="flex min-h-[320px] flex-col justify-center gap-3 py-6">
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                    {error}
                  </div>
                  <button
                    onClick={() => generate(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95"
                  >
                    <RefreshCw size={16} /> Coba Lagi
                  </button>
                </div>
              ) : !result ? (
                // State idle sengaja compact (tanpa min-h): sebelum tombol
                // Analisis diklik, modal tidak perlu setinggi state hasil.
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                    <Wand2 size={20} className="text-emerald-500" />
                  </span>
                  <div className="max-w-[300px]">
                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-100">Temukan nilai plus paket ini</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
                      AI membaca brosur dan itinerary, memilih keunggulan yang paling menjual, lalu menyiapkan prompt banner siap ditempel ke ChatGPT.
                    </p>
                  </div>
                  <button
                    onClick={() => generate(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95"
                  >
                    <Wand2 size={16} /> Analisis Nilai Plus
                  </button>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                      {error} Hasil sebelumnya tetap ditampilkan.
                    </div>
                  )}

                  <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                    <button
                      type="button"
                      aria-expanded={detailsOpen}
                      onClick={() => setDetailsOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-2 bg-gray-50 px-3 py-2.5 text-left dark:bg-slate-900/60"
                    >
                      <span className="min-w-0 text-xs font-semibold text-gray-600 dark:text-slate-300">
                        Nilai plus yang ditonjolkan
                        <span className="block truncate text-[10px] font-normal text-gray-400 dark:text-slate-500">
                          {result.headline} · {result.advantages.length} poin
                        </span>
                      </span>
                      <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {detailsOpen && (
                      <div className="divide-y divide-gray-100 dark:divide-slate-700">
                        <div className="px-3 py-3">
                          <p className="text-sm font-bold leading-snug text-gray-900 dark:text-white">“{result.headline}”</p>
                          {result.summary && <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">{result.summary}</p>}
                        </div>
                        {result.advantages.map((item, index) => {
                          const SourceIcon = item.source === 'itinerary' ? MapPinned : FileImage;
                          return (
                            <div key={`${item.title}-${index}`} className="flex items-start gap-2.5 px-3 py-2.5">
                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${index === 0 ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>{index + 1}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">{item.title}</p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500 dark:text-slate-400">{item.benefit || item.description}</p>
                                <p className="mt-1 flex items-start gap-1 text-[10px] leading-relaxed text-gray-400 dark:text-slate-500">
                                  <SourceIcon size={11} className="mt-0.5 shrink-0" />
                                  <span>{item.benefit ? item.description : item.sourceRef}</span>
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        {result.bestFor.length > 0 && (
                          <div className="px-3 py-2.5 text-[10px] text-gray-400 dark:text-slate-500">
                            Cocok untuk: {result.bestFor.join(' · ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <span className={labelCls}>Gaya desain</span>
                    <FilterDropdown
                      value={selectedStyle}
                      onChange={(value) => void changeStyle(value)}
                      options={STYLE_OPTIONS}
                      ariaLabel="Gaya desain banner nilai plus"
                      variant="compact"
                      widthClass="w-full"
                      disabled={styleLoading}
                      portal
                      portalZClass="z-[10002]"
                      searchable={false}
                    />
                  </div>

                  <div>
                    <span className={labelCls}>Prompt (siap salin)</span>
                    <textarea
                      readOnly
                      aria-label="Teks prompt banner"
                      value={result.bannerPrompt}
                      onFocus={(event) => event.currentTarget.select()}
                      className="h-40 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs leading-relaxed text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
                    />
                  </div>

                </>
              )}
            </div>

            {(result || loading) && (
              <div className="border-t border-gray-200 px-4 py-3 dark:border-slate-700">
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleCopyPrompt()}
                    disabled={loading || !result}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copied ? <><ClipboardCheck size={17} /> Tersalin</> : <><Copy size={17} /> Salin Prompt</>}
                  </button>
                  <button
                    onClick={() => void handleUseInChatGPT()}
                    disabled={loading || !result || attachmentLoading || isSharing}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 transition-all duration-200 active:scale-95 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-700/60 dark:bg-slate-700/60 dark:text-emerald-300"
                  >
                    {attachmentLoading || isSharing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : canNativeShareWithFile ? (
                      <Share2 size={16} />
                    ) : (
                      <ExternalLink size={16} />
                    )}
                    <span>{attachmentLoading || isSharing ? 'Sebentar...' : 'ChatGPT'}</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default PackageValueModal;
