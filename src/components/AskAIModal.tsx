'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronDown, Info, Package, Sparkles, Zap,
  MapPin, Users, ArrowLeftRight, Map, Tag, BedDouble, CreditCard, FileCheck,
  Send,
} from 'lucide-react';
import { trackPublicEvent } from '../utils/analytics';

// ============================================
// Props & Types
// ============================================

interface AskAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageName: string;
  jadwalId: string;
  yearCode: string;
  agentSlug: string;
  agentName: string;
  agentPhone: string;
  agentPhoto?: string | null;
}

type Message =
  | { type: 'user'; content: string; id: number }
  | { type: 'typing'; id: number }
  | { type: 'ai'; content: string; note: string; questionKey?: string; id: number };

interface ChipDef {
  key: string;
  icon: typeof MapPin;
  label: string;
}

// ============================================
// Constants
// ============================================

const PRESET_CHIPS_DEFAULT: ChipDef[] = [
  { key: 'jarak-hotel', icon: MapPin, label: 'Jarak hotel ke Masjid berapa?' },
  { key: 'lansia', icon: Users, label: 'Cocok buat lansia ga?' },
  { key: 'compare', icon: ArrowLeftRight, label: 'Bandingkan sama paket lain' },
  { key: 'itinerary', icon: Map, label: 'Detail itinerary & aktivitas' },
];

const PRESET_CHIPS_EXTRA: ChipDef[] = [
  { key: 'harga', icon: Tag, label: 'Kenapa harga segini?' },
  { key: 'fasilitas', icon: BedDouble, label: 'Fasilitas hotelnya apa?' },
  { key: 'pembayaran', icon: CreditCard, label: 'Cara pembayaran & cicilan' },
  { key: 'dokumen', icon: FileCheck, label: 'Dokumen yang disiapkan' },
];

const CLIENT_QUERY_LIMIT = 8;          // max queries per modal session
const FETCH_TIMEOUT_MS = 15000;        // 15s
const SEND_DEBOUNCE_MS = 500;          // prevent double-submit

// ============================================
// Helpers
// ============================================

const WaIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function initialsOf(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderMultiline(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}

// ============================================
// Component
// ============================================

export default function AskAIModal({
  isOpen,
  onClose,
  packageName,
  jadwalId,
  yearCode,
  agentSlug,
  agentName,
  agentPhone,
  agentPhoto,
}: AskAIModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [queryCount, setQueryCount] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const lastSendAtRef = useRef(0);

  const agentFirstName = useMemo(() => (agentName || '').trim().split(/\s+/)[0] || 'Agen', [agentName]);
  const packageNameShort = useMemo(() => truncate(packageName || '', 40), [packageName]);
  const agentInitials = useMemo(() => initialsOf(agentName), [agentName]);

  const waMessage = useMemo(
    () => `Assalamualaikum, saya mau tanya soal paket ${packageName}`,
    [packageName]
  );
  const waUrl = useMemo(
    () => `https://wa.me/${agentPhone.replace(/\D/g, '')}?text=${encodeURIComponent(waMessage)}`,
    [agentPhone, waMessage]
  );

  const nextId = () => ++idRef.current;

  // ── Track modal open ──
  useEffect(() => {
    if (isOpen) {
      trackPublicEvent(agentSlug, 'ask_ai_opened', { jadwalId });
    }
  }, [isOpen, agentSlug, jadwalId]);

  // ── Reset state on close (delayed to let close animation finish) ──
  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => {
      setMessages([]);
      setExpanded(false);
      setInputText('');
      setIsTyping(false);
      setQueryCount(0);
      idRef.current = 0;
    }, 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  // ── Auto-scroll chat to bottom on messages change ──
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ── Core: send a query to backend ──
  async function sendQuery(question: string, chipKey?: string) {
    const q = question.trim();
    if (!q) return;

    const now = Date.now();
    if (now - lastSendAtRef.current < SEND_DEBOUNCE_MS) return;
    lastSendAtRef.current = now;

    const userMsg: Message = { type: 'user', content: q, id: nextId() };
    const typingMsg: Message = { type: 'typing', id: nextId() };
    setMessages(prev => [...prev, userMsg, typingMsg]);
    setIsTyping(true);
    setQueryCount(c => c + 1);

    let aiContent = '';
    let aiNote = '';
    try {
      const res = await fetch(`/api/ask-ai/${encodeURIComponent(agentSlug)}/${encodeURIComponent(jadwalId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, chipKey: chipKey || 'free', yearCode }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const data = await res.json().catch(() => null);
      if (data && typeof data.answer === 'string' && data.answer.trim()) {
        aiContent = data.answer;
        aiNote = typeof data.note === 'string' ? data.note : '';
      } else {
        aiContent = `Maaf, koneksi lagi lambat. Coba chat ${agentFirstName} langsung ya.`;
        aiNote = `${agentFirstName} biasanya respon cepat di WhatsApp.`;
      }
    } catch {
      aiContent = `Maaf, koneksi lagi lambat. Coba chat ${agentFirstName} langsung ya.`;
      aiNote = `${agentFirstName} biasanya respon cepat di WhatsApp.`;
    }

    const aiMsg: Message = {
      type: 'ai',
      content: aiContent,
      note: aiNote,
      questionKey: chipKey,
      id: nextId(),
    };
    setMessages(prev => prev.filter(m => m.id !== typingMsg.id).concat(aiMsg));
    setIsTyping(false);
  }

  // ── Chip tap ──
  function handleChipTap(chip: ChipDef) {
    if (queryCount >= CLIENT_QUERY_LIMIT) {
      showRateLimitWarning();
      return;
    }
    trackPublicEvent(agentSlug, 'ask_ai_chip_tapped', {
      chipKey: chip.key,
      jadwalId,
      agentSlug,
    });
    void sendQuery(chip.label, chip.key);
  }

  // ── Free input submit ──
  function handleFreeSubmit() {
    const q = inputText.trim();
    if (!q || isTyping) return;
    if (queryCount >= CLIENT_QUERY_LIMIT) {
      showRateLimitWarning();
      setInputText('');
      return;
    }
    trackPublicEvent(agentSlug, 'ask_ai_free_query', {
      jadwalId,
      agentSlug,
      questionLength: q.length,
    });
    setInputText('');
    void sendQuery(q, 'free');
  }

  function showRateLimitWarning() {
    const warnMsg: Message = {
      type: 'ai',
      content: `Kamu sudah tanya banyak 🙂 Chat ${agentName || agentFirstName} langsung yuk untuk info lebih lanjut.`,
      note: `${agentFirstName} bisa bantu lebih detail via WhatsApp.`,
      id: nextId(),
    };
    setMessages(prev => [...prev, warnMsg]);
  }

  // ── WA click (from nudge card) ──
  function handleWaClick(afterQuestionKey?: string) {
    trackPublicEvent(agentSlug, 'ask_ai_wa_clicked', {
      jadwalId,
      agentSlug,
      afterQuestionKey: afterQuestionKey || null,
    });
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  if (!isOpen && messages.length === 0 && !inputText && queryCount === 0) {
    // Still render portal for animation; AnimatePresence handles mount/unmount.
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 flex flex-col"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        >
          {/* Typing dots keyframe (scoped) */}
          <style>{`
            @keyframes askAiTyping {
              0%, 60%, 100% { opacity: .3; transform: translateY(0); }
              30% { opacity: 1; transform: translateY(-3px); }
            }
            .askai-dot { animation: askAiTyping 1.2s infinite ease-in-out; }
            .askai-dot-2 { animation-delay: 0.15s; }
            .askai-dot-3 { animation-delay: 0.3s; }
          `}</style>

          {/* ─── HEADER ─── */}
          <div className="flex-shrink-0 border-b border-gray-100 dark:border-slate-800">
            <div className="px-4 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center active:scale-95 transition-transform"
                aria-label="Tutup"
              >
                <ChevronLeft size={20} className="text-gray-700 dark:text-slate-300" />
              </button>

              <div className="flex-1 flex items-center gap-2.5 min-w-0">
                <div
                  className="relative w-10 h-10 rounded-full flex items-center justify-center shadow-md shadow-emerald-500/30 flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)' }}
                >
                  <Sparkles size={20} className="text-white" />
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                    Asisten {agentFirstName}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-slate-400 font-medium flex items-center gap-1">
                    <Zap size={10} className="fill-emerald-500 text-emerald-500" />
                    <span>AI · siap bantu jawab</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center active:scale-95 transition-transform"
                aria-label="Info"
              >
                <Info size={16} className="text-gray-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="px-4 pb-3 flex items-center gap-1.5 text-[10px]">
              <Package size={12} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
              <span className="font-medium text-gray-500 dark:text-slate-400">Bertanya tentang:</span>
              <span className="font-semibold text-gray-700 dark:text-slate-300 truncate">
                {packageName}
              </span>
            </div>
          </div>

          {/* ─── CHAT AREA ─── */}
          <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {/* Greeting */}
            <div className="flex gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)' }}
              >
                <Sparkles size={14} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="inline-block bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-full">
                  <p className="text-[13px] leading-relaxed text-gray-800 dark:text-slate-100">
                    Assalamualaikum 👋<br />
                    Saya asisten AI-nya {agentFirstName}. Ada yang mau ditanyakan soal paket {packageNameShort}?
                  </p>
                </div>
                <div className="text-[9px] text-gray-400 dark:text-slate-500 mt-1 ml-1">
                  Asisten AI · baru saja
                </div>
              </div>
            </div>

            {/* Preset chips (only before first message) */}
            {messages.length === 0 && (
              <div className="pl-9 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  Pertanyaan populer
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESET_CHIPS_DEFAULT.map(chip => {
                    const Icon = chip.icon;
                    return (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => handleChipTap(chip)}
                        className="text-left p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/15 active:scale-[0.96] transition-all"
                      >
                        <div className="flex items-start gap-1.5">
                          <Icon size={13} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                          <span className="text-[11px] font-medium text-gray-700 dark:text-slate-200 leading-snug">
                            {chip.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="grid grid-cols-2 gap-1.5 overflow-hidden"
                    >
                      {PRESET_CHIPS_EXTRA.map(chip => {
                        const Icon = chip.icon;
                        return (
                          <button
                            key={chip.key}
                            type="button"
                            onClick={() => handleChipTap(chip)}
                            className="text-left p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/15 active:scale-[0.96] transition-all"
                          >
                            <div className="flex items-start gap-1.5">
                              <Icon size={13} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                              <span className="text-[11px] font-medium text-gray-700 dark:text-slate-200 leading-snug">
                                {chip.label}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  onClick={() => setExpanded(e => !e)}
                  className="w-full flex items-center justify-center gap-1 py-2 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  <span>{expanded ? 'Tutup' : 'Lihat semua pertanyaan'}</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
            )}

            {/* Dynamic messages */}
            {messages.map(msg => {
              if (msg.type === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[85%] text-[13px] leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              if (msg.type === 'typing') {
                return (
                  <div key={msg.id} className="flex gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)' }}
                    >
                      <Sparkles size={14} className="text-white" />
                    </div>
                    <div className="inline-flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 items-center self-start">
                      <span className="askai-dot w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-slate-500" />
                      <span className="askai-dot askai-dot-2 w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-slate-500" />
                      <span className="askai-dot askai-dot-3 w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-slate-500" />
                    </div>
                  </div>
                );
              }
              // ai
              return (
                <div key={msg.id} className="flex gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)' }}
                  >
                    <Sparkles size={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="inline-block bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-3 max-w-full">
                      <p className="text-[13px] leading-relaxed text-gray-800 dark:text-slate-100 whitespace-pre-wrap break-words">
                        {renderMultiline(msg.content)}
                      </p>
                    </div>

                    {/* WA Nudge Card */}
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-slate-800/60 p-3">
                      <div className="flex items-center gap-2.5">
                        {agentPhoto ? (
                          <img
                            src={agentPhoto}
                            alt={agentName}
                            className="w-9 h-9 rounded-full object-cover border-2 border-white dark:border-slate-700 flex-shrink-0"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                            {agentInitials}
                          </div>
                        )}
                        <p className="flex-1 text-[11px] font-semibold text-gray-800 dark:text-white leading-snug">
                          💬 {msg.note || `Untuk detail lebih personal, ${agentFirstName} bisa bantu langsung.`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleWaClick(msg.questionKey)}
                        className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-bold shadow-md shadow-emerald-500/30 active:scale-[0.96] transition-all"
                      >
                        <WaIcon size={14} className="fill-white" />
                        <span>Chat {agentFirstName} di WhatsApp</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── FOOTER INPUT ─── */}
          <div className="flex-shrink-0 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value.slice(0, 500))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleFreeSubmit();
                  }
                }}
                placeholder="Tanya apa aja soal paket ini…"
                disabled={isTyping}
                maxLength={500}
                className="flex-1 min-w-0 px-3.5 py-2.5 bg-gray-100 dark:bg-slate-800 border-0 rounded-full text-[13px] text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleFreeSubmit}
                disabled={!inputText.trim() || isTyping}
                className="w-10 h-10 rounded-full flex items-center justify-center shadow-md shadow-emerald-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-transform"
                style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)' }}
                aria-label="Kirim"
              >
                <Send size={15} className="text-white" />
              </button>
            </div>
            <p className="text-center mt-1.5 text-[9px] text-gray-400 dark:text-slate-500">
              Jawaban AI bersifat informatif. Keputusan akhir selalu konfirmasi ke {agentFirstName}.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
