'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  Gem,
  Loader2,
  MapPinned,
  Palette,
  Paperclip,
  RefreshCw,
  Share2,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { getSessionAuthHeaders } from '@/utils/authUtils';
import { trackEvent } from '@/utils/analytics';
import { buildImageAndPromptShareData } from './brochure-prompt/buildBrochurePrompt';

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
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
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
    setPromptOpen(false);
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

  const requestPackageValue = async ({ refresh = false, excludeStyle = '' } = {}) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 50000);
    try {
      const response = await fetch('/api/package-value', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...getSessionAuthHeaders() },
        body: JSON.stringify({ jadwalId, tier, refresh, ...(excludeStyle ? { excludeStyle } : {}) }),
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
      trackEvent('feature', 'package_value_generate', {
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
      trackEvent('feature', 'package_value_error', { paket: jadwalId, refresh });
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  };

  // Ganti gaya desain tanpa analisis AI ulang: hasil analisis diambil dari
  // cache server, hanya arah desain pada prompt yang dirakit ulang.
  const changeStyle = async () => {
    if (loading || styleLoading || !result) return;
    const seq = requestSeqRef.current;
    setStyleLoading(true);
    setError(null);
    setCopied(false);
    try {
      const data = await requestPackageValue({ excludeStyle: result.style?.id || '' });
      if (seq !== requestSeqRef.current) return;
      applyResponse(data);
      trackEvent('feature', 'package_value_style_change', {
        paket: jadwalId,
        style: data.result?.style?.id || '',
        cached: data.cached === true,
      });
    } catch (err: any) {
      if (seq !== requestSeqRef.current) return;
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
    trackEvent('feature', 'package_value_agent_attachment_download', { paket: jadwalId });
  };

  const handleCopyPrompt = async () => {
    if (!result?.bannerPrompt) return;
    const promptCopied = await copyPlainText(result.bannerPrompt);
    if (promptCopied) showCopiedState();
    trackEvent('feature', 'package_value_prompt_copy', {
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
          trackEvent('feature', 'package_value_share_payload', {
            paket: jadwalId,
            file_count: 1,
            prompt_length: result.bannerPrompt.length,
            clipboard_backup: clipboardBackup,
          });
          await navigator.share(shareData);
          trackEvent('feature', 'package_value_share_chatgpt', { paket: jadwalId, tier: resolvedTier });
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
      trackEvent('feature', 'package_value_open_chatgpt', {
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
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
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
            className="relative flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
              <div className="flex min-w-0 items-center gap-2.5">
                <Gem size={16} className="shrink-0 text-purple-600 dark:text-purple-400" />
                <div className="min-w-0">
                  <h2 id="package-value-title" className="text-sm font-bold leading-tight text-gray-900 dark:text-white">Nilai Plus Paket</h2>
                  <p className="truncate text-[11px] text-gray-400 dark:text-slate-500">{subject}</p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                aria-label="Tutup"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {loading ? (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 py-6 text-center">
                  <div className="relative h-14 w-14">
                    <motion.div
                      className="absolute inset-0 rounded-full bg-gradient-to-tr from-purple-400 via-fuchsia-400 to-purple-400"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.25, 0.5, 0.25] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-purple-50 dark:bg-purple-900/40">
                      <Loader2 size={22} className="animate-spin text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
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
                  <div className="w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-left dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-gray-200 dark:bg-slate-700" />
                    <div className="mt-2 h-2.5 w-full animate-pulse rounded-full bg-gray-200 dark:bg-slate-700" />
                    {[0, 1, 2].map((row) => (
                      <div key={row} className="mt-4 flex items-start gap-2.5">
                        <div className="h-6 w-6 shrink-0 animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-gray-200 dark:bg-slate-700" />
                          <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-gray-200 dark:bg-slate-700" />
                        </div>
                      </div>
                    ))}
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
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 py-6 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/20">
                    <Gem size={22} className="text-purple-600 dark:text-purple-400" />
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
                    <Sparkles size={16} />
                    Analisis Nilai Plus
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
                      {error} Hasil sebelumnya tetap ditampilkan.
                    </div>
                  )}

                  <section aria-label="Hasil analisis nilai plus" className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700">
                    <div className="bg-gradient-to-r from-purple-50 to-fuchsia-50/60 px-4 py-3.5 dark:from-purple-900/20 dark:to-fuchsia-900/10">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {resolvedTier && (
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-purple-600 dark:bg-slate-800/70 dark:text-purple-300">Tier {resolvedTier}</span>
                        )}
                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-300">
                          {sourceAvailability.itinerary ? 'Brosur + Itinerary' : 'Hanya Brosur'}
                        </span>
                        {cached && (
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-300">Hasil Tersimpan</span>
                        )}
                      </div>
                      <h3 className="mt-2 text-base font-bold leading-snug text-gray-900 dark:text-white">“{result.headline}”</h3>
                      {result.summary && <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-slate-300">{result.summary}</p>}
                    </div>

                    <div className="divide-y divide-gray-50 bg-white dark:divide-slate-700/50 dark:bg-slate-800">
                      {result.advantages.map((item, index) => {
                        const SourceIcon = item.source === 'itinerary' ? MapPinned : FileImage;
                        return (
                          <div key={`${item.title}-${index}`} className="flex items-start gap-2.5 px-4 py-3">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${index === 0 ? 'bg-purple-600 text-white dark:bg-purple-500' : 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400'}`}>{index + 1}</span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h4 className="text-xs font-bold text-gray-900 dark:text-white">{item.title}</h4>
                                {index === 0 && (
                                  <span className="rounded-full bg-fuchsia-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-fuchsia-600 dark:bg-fuchsia-900/20 dark:text-fuchsia-400">Pesan Utama</span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs leading-relaxed text-gray-600 dark:text-slate-300">{item.benefit || item.description}</p>
                              <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-relaxed text-gray-400 dark:text-slate-500">
                                <SourceIcon size={12} className="mt-0.5 shrink-0" />
                                <span>{item.benefit ? item.description : item.sourceRef}</span>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {result.bestFor.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-50 bg-white px-4 py-2.5 dark:border-slate-700/50 dark:bg-slate-800">
                        <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Cocok untuk</span>
                        {result.bestFor.map((item) => (
                          <span key={item} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{item}</span>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-900/40">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fuchsia-50 dark:bg-fuchsia-900/20">
                        <Palette size={15} className="text-fuchsia-600 dark:text-fuchsia-400" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Gaya Desain</p>
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={result.style?.name || 'default'}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="truncate text-xs font-bold text-gray-900 dark:text-white"
                          >
                            {result.style?.name || 'Editorial Majalah'}
                          </motion.p>
                        </AnimatePresence>
                      </div>
                    </div>
                    <button
                      aria-label="Ganti gaya desain"
                      onClick={() => void changeStyle()}
                      disabled={styleLoading}
                      className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-purple-600 transition-colors hover:bg-purple-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:text-purple-400 dark:hover:bg-purple-900/20"
                    >
                      {styleLoading ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} />} Ganti Gaya
                    </button>
                  </section>

                  <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                    <button
                      type="button"
                      aria-expanded={promptOpen}
                      onClick={() => setPromptOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-2 bg-gray-50 px-3.5 py-2.5 text-left dark:bg-slate-900/60"
                    >
                      <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                        Prompt untuk ChatGPT
                        <span className="block text-[10px] font-normal text-gray-400 dark:text-slate-500">Sudah berisi hook, nilai plus, dan gaya desain</span>
                      </span>
                      <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform duration-200 dark:text-slate-500 ${promptOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {promptOpen && (
                      <div className="p-3">
                        <textarea
                          readOnly
                          aria-label="Teks prompt banner"
                          value={result.bannerPrompt}
                          onFocus={(event) => event.currentTarget.select()}
                          className="h-44 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
                        />
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border border-gray-100 p-3.5 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip size={15} className="shrink-0 text-purple-600 dark:text-purple-400" />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-gray-800 dark:text-slate-100">Lampiran Identitas Agent</h4>
                          <p className="truncate text-[10px] text-gray-400 dark:text-slate-500">Foto, nama, WhatsApp, website & logo Alhijaz — ditempel ChatGPT ke banner</p>
                        </div>
                      </div>
                      {agentAttachment && (
                        <button
                          onClick={downloadAgentAttachment}
                          className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold text-purple-600 transition-colors hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                        >
                          <Download size={12} /> Unduh PNG
                        </button>
                      )}
                    </div>

                    {attachmentLoading ? (
                      <div className="mt-3 aspect-[40/21] w-full animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700" />
                    ) : agentAttachment ? (
                      <img
                        src={agentAttachment.url}
                        alt="Lampiran identitas agent untuk ChatGPT"
                        className="mt-3 aspect-[40/21] w-full rounded-lg border border-gray-200 object-cover dark:border-slate-700"
                      />
                    ) : (
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-medium text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
                        <span>{attachmentError || 'Lampiran belum tersedia.'}</span>
                        <button
                          onClick={() => setAttachmentRetry((value) => value + 1)}
                          className="min-h-8 shrink-0 rounded-lg px-2.5 py-2 text-[11px] font-bold transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        >
                          Coba lagi
                        </button>
                      </div>
                    )}
                  </section>

                  <button
                    onClick={() => generate(true)}
                    disabled={styleLoading}
                    className="mx-auto flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-purple-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-purple-400"
                  >
                    <RefreshCw size={14} /> Analisis Ulang
                  </button>
                </div>
              )}
            </div>

            {(result || loading) && (
              <div className="flex gap-2 border-t border-gray-200 px-4 py-3 dark:border-slate-700">
                <button
                  onClick={() => void handleCopyPrompt()}
                  disabled={loading || !result}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-700 transition-all duration-200 hover:bg-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {copied ? <><ClipboardCheck size={17} className="text-emerald-500" /> Tersalin</> : <><Copy size={17} /> Salin Prompt</>}
                </button>
                <button
                  onClick={() => void handleUseInChatGPT()}
                  disabled={loading || !result || attachmentLoading || isSharing}
                  className="flex flex-[1.35] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition-all duration-200 hover:bg-emerald-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {attachmentLoading || isSharing ? (
                    <><Loader2 size={16} className="animate-spin" /> Menyiapkan…</>
                  ) : canNativeShareWithFile ? (
                    <><Share2 size={16} /> Bagikan + Lampiran</>
                  ) : (
                    <><ExternalLink size={16} /> Buka ChatGPT</>
                  )}
                </button>
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
