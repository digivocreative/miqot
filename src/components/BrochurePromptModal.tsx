'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Wand2, Copy, ClipboardCheck, ExternalLink, ChevronDown, FileImage, Megaphone, Loader2, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import FilterDropdown from './FilterDropdown';
import { trackEvent } from '../utils/analytics';
import {
  buildBrochurePrompt,
  buildImageAndPromptShareData,
  buildNativeSharePrompt,
  DESIGN_STYLES,
  RATIOS,
  type BrochureVariant,
  type BrochureKind,
  type BrochurePromptPkg,
  type BrochurePromptSchedule,
} from './brochure-prompt/buildBrochurePrompt';

interface BrochurePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Info kontak agen — di-prefill (bisa diedit di dalam modal). */
  agent: { name: string; phone: string; website: string };
  /** URL publik brosur referensi. Jika ada, prompt akan mencoba memakai link tanpa upload manual. */
  referenceImageUrl?: string | null;
  /** Pembuat file brosur referensi untuk materi yang dirender di browser, seperti Brosur Jadwal. */
  getReferenceImageFile?: (() => Promise<File | null>) | null;
  /** Data paket sebagai sumber kebenaran. Null untuk brosur non-paket. */
  pkg?: BrochurePromptPkg | null;
  /** Data brosur jadwal/filter sebagai sumber kebenaran untuk banyak paket. */
  schedule?: BrochurePromptSchedule | null;
  /** Schedule mode: single general brochure prompt, fixed 9:16, contact comes from attached image. */
  context?: 'package' | 'schedule';
  /** Nama brosur/paket (header). */
  title: string;
}

declare const __APP_VERSION__: string;

const STYLE_OPTIONS = DESIGN_STYLES.map((s) => ({ value: s.value, label: s.label }));

/**
 * Bukti sisi-device untuk debugging share iOS: ringkasan payload TANPA isi
 * prompt/data sensitif, plus penanda bundle supaya log server bisa memastikan
 * versi mana yang benar-benar berjalan di HP pengguna.
 */
function describeSharePayload(shareData: ShareData, file: File) {
  return {
    payload_fields: Object.keys(shareData).sort().join(','),
    file_count: shareData.files?.length ?? 0,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    app_version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    display_mode: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    sw_controlled: typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller),
  };
}

const inputCls =
  'w-full px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-slate-900/60 border border-gray-200 ' +
  'dark:border-slate-700 text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition';
const labelCls = 'block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1';

function toAbsoluteUrl(url?: string | null): string | null {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (typeof window === 'undefined') return trimmed;
  try {
    return new URL(trimmed, window.location.origin).href;
  } catch {
    return trimmed;
  }
}

function safeImageFilename(title: string): string {
  const slug = (title || 'brosur')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'brosur';
  return `${slug}.png`;
}

async function blobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;

  const blobUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('reference-image-load-failed'));
    });
    img.src = blobUrl;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas-context-unavailable');
    ctx.drawImage(img, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => {
        if (png && png.size > 0) resolve(png);
        else reject(new Error('png-conversion-failed'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function fetchReferenceImageFile(url: string, title: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`reference-image-fetch-${res.status}`);
  const sourceBlob = await res.blob();
  const pngBlob = await blobToPng(sourceBlob);
  return new File([pngBlob], safeImageFilename(title), { type: 'image/png' });
}

async function writeTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback di bawah untuk browser/webview yang membatasi Clipboard API.
  }

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}

function copyTextSynchronously(text: string): boolean {
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

/**
 * Prompt Generator — merakit prompt ChatGPT untuk membuat ulang brosur dengan
 * strip kontak agen. Tanpa panggilan API: prompt dirakit live di client. Native
 * share mengirim gambar + prompt; browser yang tidak mendukung memakai copy + buka web.
 */
export function BrochurePromptModal({ isOpen, onClose, agent, referenceImageUrl, getReferenceImageFile, pkg, schedule, context = 'package', title }: BrochurePromptModalProps) {
  // Perilaku tetap "rancang ulang" (poster premium yg benar2 berubah); akurasi dijaga lewat
  // data acuan + pengingat cek WA. Tanpa pilihan tab.
  const variant: BrochureVariant = 'redesign';
  const isScheduleContext = context === 'schedule';
  const [kind, setKind] = useState<BrochureKind>('brosur');
  const [style, setStyle] = useState('modern');
  const [ratio, setRatio] = useState('4:5');

  // Info kontak — di-prefill dari profil, bisa diedit per kampanye
  const [name, setName] = useState(agent.name);
  const [phone, setPhone] = useState(agent.phone);
  const [website, setWebsite] = useState(agent.website);
  const [instagram, setInstagram] = useState('');
  const [alamat, setAlamat] = useState('');
  const [note, setNote] = useState('');
  const [contactOpen, setContactOpen] = useState(false);

  const [copied, setCopied] = useState(false);
  const [isOpeningChatGPT, setIsOpeningChatGPT] = useState(false);
  const [preparedReferenceFile, setPreparedReferenceFile] = useState<File | null>(null);
  const [nativeSharePreparationFailed, setNativeSharePreparationFailed] = useState(false);

  // Reset info kontak ke profil setiap kali modal dibuka (hindari data basi)
  useEffect(() => {
    if (!isOpen) return;
    setName(agent.name);
    setPhone(agent.phone);
    setWebsite(agent.website);
    setCopied(false);
  }, [isOpen, agent.name, agent.phone, agent.website]);

  const prompt = useMemo(
    () => {
      const promptKind: BrochureKind = isScheduleContext ? 'brosur' : kind;
      const promptRatio = isScheduleContext ? '9:16' : ratio;
      return buildBrochurePrompt({
        agent: { name, phone, website },
        pkg,
        schedule,
        referenceImageUrl: isScheduleContext ? null : toAbsoluteUrl(referenceImageUrl),
        contactSource: isScheduleContext ? 'attached' : 'explicit',
        extra: { instagram, alamat, note },
        variant,
        kind: promptKind,
        style,
        ratio: promptRatio,
        reserveQr: false,
      });
    },
    [name, phone, website, instagram, alamat, note, variant, kind, style, ratio, pkg, schedule, isScheduleContext, referenceImageUrl],
  );

  const nativeSharePrompt = useMemo(
    () => {
      const promptKind: BrochureKind = isScheduleContext ? 'brosur' : kind;
      const promptRatio = isScheduleContext ? '9:16' : ratio;
      return buildNativeSharePrompt({
        agent: { name, phone, website },
        pkg,
        schedule,
        contactSource: isScheduleContext ? 'attached' : 'explicit',
        extra: { instagram, alamat, note },
        variant,
        kind: promptKind,
        style,
        ratio: promptRatio,
        reserveQr: false,
      });
    },
    [name, phone, website, instagram, alamat, note, variant, kind, style, ratio, pkg, schedule, isScheduleContext],
  );

  const handleCopy = async () => {
    const promptCopied = await writeTextToClipboard(prompt);
    setCopied(promptCopied);
    if (promptCopied) setTimeout(() => setCopied(false), 2000);
    trackEvent('feature', 'brochure_prompt_copy', { variant, kind: isScheduleContext ? 'schedule' : kind });
  };

  const canTryNativeChatGPTShare =
    Boolean(toAbsoluteUrl(referenceImageUrl) || getReferenceImageFile) &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function';

  // Siapkan file saat modal terbuka. Dengan begitu navigator.share() bisa dipanggil
  // langsung dari klik pengguna tanpa menunggu capture/fetch yang dapat menghabiskan
  // transient user activation di Safari iOS.
  useEffect(() => {
    let cancelled = false;

    if (!isOpen || !canTryNativeChatGPTShare) {
      setPreparedReferenceFile(null);
      setNativeSharePreparationFailed(false);
      return () => { cancelled = true; };
    }

    const absoluteReferenceUrl = toAbsoluteUrl(referenceImageUrl);
    setPreparedReferenceFile(null);
    setNativeSharePreparationFailed(false);

    void (async () => {
      try {
        const file = getReferenceImageFile
          ? await getReferenceImageFile()
          : absoluteReferenceUrl
            ? await fetchReferenceImageFile(absoluteReferenceUrl, title)
            : null;
        if (!cancelled) {
          setPreparedReferenceFile(file);
          setNativeSharePreparationFailed(!file);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[brochure-prompt] native share image preparation failed:', err);
          setPreparedReferenceFile(null);
          setNativeSharePreparationFailed(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, canTryNativeChatGPTShare, getReferenceImageFile, referenceImageUrl, title]);

  const canUseNativeChatGPTShare = canTryNativeChatGPTShare && Boolean(preparedReferenceFile);
  const isNativeSharePending =
    isOpen && canTryNativeChatGPTShare && !preparedReferenceFile && !nativeSharePreparationFailed;

  // Web Share tidak dapat memilih aplikasi tujuan secara otomatis. Payload ini
  // membuat ChatGPT tersedia sebagai pilihan OS (bila terpasang) dan membawa
  // gambar + prompt sekaligus. Clipboard dipakai hanya sebagai cadangan.
  const openChatGPT = async () => {
    if (isOpeningChatGPT) return;
    setIsOpeningChatGPT(true);
    let nativePromptCopied = false;

    if (canUseNativeChatGPTShare) {
      // Run this before the first await while the click activation is still
      // active. This also avoids consuming Safari's share activation with an
      // asynchronous Clipboard API call.
      nativePromptCopied = copyTextSynchronously(nativeSharePrompt);
      setCopied(nativePromptCopied);
      if (nativePromptCopied) setTimeout(() => setCopied(false), 3000);
    }

    try {
      if (canUseNativeChatGPTShare && preparedReferenceFile) {
        try {
          const file = preparedReferenceFile;
          const shareData = buildImageAndPromptShareData(file, nativeSharePrompt);
          const payloadSummary = describeSharePayload(shareData, file);
          // Dicatat SEBELUM navigator.share supaya bukti payload tetap ada
          // walau pengguna membatalkan share sheet atau share-nya gagal.
          console.info('[brochure-share] payload:', payloadSummary);
          trackEvent('feature', 'brochure_prompt_share_payload', {
            ...payloadSummary,
            variant,
            kind: isScheduleContext ? 'schedule' : kind,
            prompt_length: nativeSharePrompt.length,
            prompt_transport: 'share_text',
            clipboard_backup: nativePromptCopied,
          });
          if (!navigator.canShare?.(shareData)) throw new Error('native-share-data-unsupported');
          await navigator.share(shareData);
          trackEvent('feature', 'brochure_prompt_share_chatgpt', {
            variant,
            kind: isScheduleContext ? 'schedule' : kind,
            file_count: shareData.files?.length || 0,
            prompt_length: nativeSharePrompt.length,
            prompt_transport: 'share_text',
            clipboard_backup: nativePromptCopied,
            payload_fields: payloadSummary.payload_fields,
            app_version: payloadSummary.app_version,
          });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            trackEvent('feature', 'brochure_prompt_share_cancelled', { kind: isScheduleContext ? 'schedule' : kind });
            return;
          }
          console.warn('[brochure-prompt] native share failed, falling back to ChatGPT link:', err);
        }
      }

      const promptCopied = await writeTextToClipboard(prompt);
      setCopied(promptCopied);
      if (promptCopied) setTimeout(() => setCopied(false), 2000);
      trackEvent('feature', 'brochure_prompt_open_chatgpt', { variant, kind: isScheduleContext ? 'schedule' : kind });
      window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
    } finally {
      setIsOpeningChatGPT(false);
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2 min-w-0">
                <Wand2 size={16} className="text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{!isScheduleContext && kind === 'banner' ? 'Buat Banner Ads (AI)' : 'Buat Ulang Brosur (AI)'}</h2>
                  <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{title}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors shrink-0"
                aria-label="Tutup"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Tab jenis materi */}
              {!isScheduleContext && (
                <div className="bg-gray-100 dark:bg-slate-900/60 rounded-xl p-1 flex gap-1">
                  {([
                    { k: 'brosur', label: 'Brosur', Icon: FileImage },
                    { k: 'banner', label: 'Banner Ads', Icon: Megaphone },
                  ] as const).map((t) => (
                    <button
                      key={t.k}
                      onClick={() => setKind(t.k)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-xs transition-all duration-200 ${
                        kind === t.k
                          ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-300 font-semibold shadow-sm'
                          : 'text-gray-400 dark:text-slate-500 font-medium active:opacity-70'
                      }`}
                    >
                      <t.Icon size={15} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Gaya desain + Rasio */}
              <div className={isScheduleContext ? '' : 'grid grid-cols-2 gap-3'}>
                <div>
                  <span className={labelCls}>Gaya desain</span>
                  <FilterDropdown
                    value={style}
                    onChange={setStyle}
                    options={STYLE_OPTIONS}
                    ariaLabel="Gaya desain brosur"
                    variant="compact"
                    widthClass="w-full"
                    portal
                    portalZClass="z-[10002]"
                    searchable={false}
                  />
                </div>
                {!isScheduleContext && (
                  <div>
                    <span className={labelCls}>Rasio</span>
                    <FilterDropdown
                      value={ratio}
                      onChange={setRatio}
                      options={RATIOS}
                      ariaLabel="Rasio brosur"
                      variant="compact"
                      widthClass="w-full"
                      portal
                      portalZClass="z-[10002]"
                    />
                  </div>
                )}
              </div>

              {/* Info kontak (disclosure) */}
              {!isScheduleContext && (
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setContactOpen((o) => !o)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left bg-gray-50 dark:bg-slate-900/60"
                  >
                    <span className="text-xs font-semibold text-gray-600 dark:text-slate-300">
                      Info kontak
                      <span className="block text-[10px] font-normal text-gray-400 dark:text-slate-500 truncate">
                        {[name, phone, website].filter(Boolean).join(' · ') || 'Lengkapi info kontak'}
                      </span>
                    </span>
                    <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${contactOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {contactOpen && (
                    <div className="p-3 space-y-2.5">
                      <div>
                        <label className={labelCls}>Nama</label>
                        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama agen" />
                      </div>
                      <div>
                        <label className={labelCls}>WhatsApp</label>
                        <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812..." inputMode="tel" />
                      </div>
                      <div>
                        <label className={labelCls}>Website</label>
                        <input className={inputCls} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="alhijaz.co/..." />
                      </div>
                      <div>
                        <label className={labelCls}>Instagram <span className="font-normal text-gray-400">(opsional)</span></label>
                        <input className={inputCls} value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@username" />
                      </div>
                      <div>
                        <label className={labelCls}>Alamat <span className="font-normal text-gray-400">(opsional)</span></label>
                        <input className={inputCls} value={alamat} onChange={(e) => setAlamat(e.target.value)} placeholder="Alamat kantor" />
                      </div>
                      <div>
                        <label className={labelCls}>Instruksi tambahan <span className="font-normal text-gray-400">(opsional)</span></label>
                        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. tonjolkan promo early bird" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Preview prompt */}
              <div>
                <span className={labelCls}>Prompt (siap salin)</span>
                <textarea
                  readOnly
                  value={prompt}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full h-40 px-3 py-2 rounded-xl text-xs leading-relaxed font-mono resize-none bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700">
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95"
                >
                  {copied ? (
                    <><ClipboardCheck size={17} /><span>Tersalin</span></>
                  ) : (
                    <><Copy size={17} /><span>Salin Prompt</span></>
                  )}
                </button>
                <button
                  onClick={openChatGPT}
                  disabled={isOpeningChatGPT || isNativeSharePending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-slate-700/60 border border-emerald-200 dark:border-emerald-700/60 transition-all duration-200 active:scale-95 disabled:cursor-wait disabled:opacity-70"
                >
                  {isOpeningChatGPT || isNativeSharePending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : canUseNativeChatGPTShare ? (
                    <Share2 size={16} />
                  ) : (
                    <ExternalLink size={16} />
                  )}
                  <span>{
                    isOpeningChatGPT
                      ? 'Memproses...'
                      : isNativeSharePending
                        ? 'Menyiapkan...'
                        : 'ChatGPT'
                  }</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default BrochurePromptModal;
