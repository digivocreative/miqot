'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Wand2, Copy, ClipboardCheck, ExternalLink, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import FilterDropdown from './FilterDropdown';
import { trackEvent } from '../utils/analytics';
import {
  buildBrochurePrompt,
  VARIANTS,
  DESIGN_STYLES,
  RATIOS,
  type BrochureVariant,
  type BrochurePromptPkg,
} from './brochure-prompt/buildBrochurePrompt';

interface BrochurePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Info kontak agen — di-prefill (bisa diedit di dalam modal). */
  agent: { name: string; phone: string; website: string };
  /** Data paket sebagai sumber kebenaran. Null untuk brosur non-paket. */
  pkg?: BrochurePromptPkg | null;
  /** Nama brosur/paket (header). */
  title: string;
}

const STYLE_OPTIONS = DESIGN_STYLES.map((s) => ({ value: s.value, label: s.label }));

const inputCls =
  'w-full px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-slate-900/60 border border-gray-200 ' +
  'dark:border-slate-700 text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 transition';
const labelCls = 'block text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-1';

/**
 * Prompt Generator — merakit prompt ChatGPT untuk membuat ulang brosur dengan
 * strip kontak agen. Tanpa panggilan API: prompt dirakit live di client, instan
 * & gratis. Agen menyalin prompt, buka ChatGPT, lampirkan brosur ini, tempel.
 */
export function BrochurePromptModal({ isOpen, onClose, agent, pkg, title }: BrochurePromptModalProps) {
  const [variant, setVariant] = useState<BrochureVariant>('keep');
  const [style, setStyle] = useState('asli');
  const [ratio, setRatio] = useState('4:5');
  const [reserveQr, setReserveQr] = useState(true);

  // Info kontak — di-prefill dari profil, bisa diedit per kampanye
  const [name, setName] = useState(agent.name);
  const [phone, setPhone] = useState(agent.phone);
  const [website, setWebsite] = useState(agent.website);
  const [instagram, setInstagram] = useState('');
  const [alamat, setAlamat] = useState('');
  const [note, setNote] = useState('');
  const [contactOpen, setContactOpen] = useState(false);

  const [copied, setCopied] = useState(false);

  // Reset info kontak ke profil setiap kali modal dibuka (hindari data basi)
  useEffect(() => {
    if (!isOpen) return;
    setName(agent.name);
    setPhone(agent.phone);
    setWebsite(agent.website);
    setCopied(false);
  }, [isOpen, agent.name, agent.phone, agent.website]);

  const prompt = useMemo(
    () =>
      buildBrochurePrompt({
        agent: { name, phone, website },
        pkg,
        extra: { instagram, alamat, note },
        variant,
        style,
        ratio,
        reserveQr,
      }),
    [name, phone, website, instagram, alamat, note, variant, style, ratio, reserveQr, pkg],
  );

  const isStory = variant === 'story';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    trackEvent('feature', 'brochure_prompt_copy', { variant });
  };

  const openChatGPT = () => {
    trackEvent('feature', 'brochure_prompt_open_chatgpt', { variant });
    window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
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
                <Wand2 size={16} className="text-violet-500 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">Buat Ulang Brosur (AI)</h2>
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
              {/* Perlakuan (segmented) */}
              <div>
                <span className={labelCls}>Perlakuan</span>
                <div className="bg-gray-100 dark:bg-slate-900/60 rounded-xl p-1 flex gap-1">
                  {VARIANTS.map((v) => (
                    <button
                      key={v.value}
                      onClick={() => setVariant(v.value)}
                      className={`flex-1 py-2 px-1 rounded-lg text-[11px] transition-all duration-200 ${
                        v.value === variant
                          ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-300 font-semibold shadow-sm'
                          : 'text-gray-400 dark:text-slate-500 font-medium active:opacity-70'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gaya desain + Rasio */}
              <div className="grid grid-cols-2 gap-3">
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
                    portalZClass="z-[10000]"
                  />
                </div>
                <div>
                  <span className={labelCls}>Rasio</span>
                  <FilterDropdown
                    value={isStory ? '9:16' : ratio}
                    onChange={setRatio}
                    options={RATIOS}
                    ariaLabel="Rasio brosur"
                    variant="compact"
                    widthClass="w-full"
                    portal
                    portalZClass="z-[10000]"
                    disabled={isStory}
                  />
                </div>
              </div>

              {/* Toggle QR */}
              <button
                type="button"
                role="switch"
                aria-checked={reserveQr}
                onClick={() => setReserveQr((q) => !q)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 text-left"
              >
                <span className="text-xs text-gray-600 dark:text-slate-300">
                  Sisakan kotak untuk QR
                  <span className="block text-[10px] text-gray-400 dark:text-slate-500">QR ditempel manual — ChatGPT tak bisa buat QR valid</span>
                </span>
                <span
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                    reserveQr ? 'bg-violet-500' : 'bg-gray-300 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      reserveQr ? 'translate-x-4' : ''
                    }`}
                  />
                </span>
              </button>

              {/* Info kontak (disclosure) */}
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

              {/* Preview prompt */}
              <div>
                <span className={labelCls}>Prompt (siap salin)</span>
                <textarea
                  readOnly
                  value={prompt}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full h-40 px-3 py-2 rounded-xl text-xs leading-relaxed font-mono resize-none bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                />
              </div>

              {/* Langkah singkat */}
              <ol className="text-[11px] text-gray-500 dark:text-slate-400 space-y-1 list-decimal list-inside">
                <li>Salin prompt di atas</li>
                <li>Buka ChatGPT</li>
                <li><span className="font-semibold">Lampirkan brosur ini</span> ke chat</li>
                <li>Tempel prompt &amp; kirim</li>
              </ol>

              {/* Pengingat WA */}
              <p className="text-[11px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2">
                ⚠️ Periksa nomor WhatsApp pada hasil sebelum dibagikan — model gambar kadang keliru menulis angka.
              </p>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 shadow-md shadow-violet-500/20 transition-all duration-200 active:scale-95"
              >
                {copied ? (
                  <><ClipboardCheck size={17} /><span>Tersalin</span></>
                ) : (
                  <><Copy size={17} /><span>Salin Prompt</span></>
                )}
              </button>
              <button
                onClick={openChatGPT}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-slate-700/60 border border-violet-200 dark:border-violet-700/60 transition-all duration-200 active:scale-95"
              >
                <ExternalLink size={16} />
                <span>Buka ChatGPT</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default BrochurePromptModal;
