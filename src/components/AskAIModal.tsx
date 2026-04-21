'use client';

import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronDown, Info, Package, Sparkles, Zap,
  MapPin, Users, ArrowLeftRight, Map, Tag, BedDouble, CreditCard, FileCheck,
  Send, Square, FileText, Maximize2, Image as ImageIcon,
  Route, Clock, Plane, PlaneTakeoff, Luggage, BookOpen, UserCheck,
  Baby, HelpCircle, Globe, PlusCircle, Stamp, Heart, Thermometer, Utensils,
  Wifi, Gift, ShieldCheck, Camera,
} from 'lucide-react';
import { trackPublicEvent } from '../utils/analytics';

// Lazy-load the fullscreen viewers only when the user opens an attachment.
const BrochureModal = lazy(() => import('./BrochureModal').then(m => ({ default: m.BrochureModal })));
const ItineraryModal = lazy(() => import('./ItineraryModal').then(m => ({ default: m.ItineraryModal })));

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

interface Attachment {
  type: 'brosur' | 'itinerary';
  url: string;
  title: string;
}

type Message =
  | { type: 'user'; content: string; id: number }
  | { type: 'typing'; id: number }
  | {
      type: 'ai';
      content: string;
      note: string;
      questionKey?: string;
      showWaNudge: boolean;
      attachment: Attachment | null;
      id: number;
    };

interface ChipDef {
  key: string;
  icon: typeof MapPin;
  label: string;
}

// ============================================
// Constants
// ============================================

// ~24 question variants across major topics. Each modal open reshuffles
// and picks 4 default + 4 extras, so users don't see the same suggestions
// every time they reopen.
const CHIP_POOL: ChipDef[] = [
  // Hotel & kamar
  { key: 'jarak-hotel', icon: MapPin, label: 'Jarak hotel ke Masjid berapa?' },
  { key: 'fasilitas', icon: BedDouble, label: 'Fasilitas hotelnya apa aja?' },
  { key: 'kamar', icon: Users, label: 'Kamar berdua/bertiga gimana?' },
  { key: 'makanan', icon: Utensils, label: 'Menu makanan di hotel?' },
  { key: 'wifi', icon: Wifi, label: 'Ada Wi-Fi di hotel?' },
  // Penerbangan & logistik
  { key: 'urutan-perjalanan', icon: Route, label: 'Umroh dulu atau Madinah dulu?' },
  { key: 'durasi', icon: Clock, label: 'Berapa hari totalnya?' },
  { key: 'maskapai', icon: Plane, label: 'Pakai maskapai apa?' },
  { key: 'transit', icon: PlaneTakeoff, label: 'Transit di kota mana?' },
  { key: 'bagasi', icon: Luggage, label: 'Bagasi berapa kilo?' },
  // Ibadah
  { key: 'itinerary', icon: Map, label: 'Detail itinerary & aktivitas' },
  { key: 'manasik', icon: BookOpen, label: 'Ada manasik sebelum berangkat?' },
  { key: 'pembimbing', icon: UserCheck, label: 'Siapa pembimbing rombongan?' },
  { key: 'kota-tambahan', icon: Globe, label: 'Mampir ke kota mana aja?' },
  // Cocok untuk
  { key: 'lansia', icon: Users, label: 'Cocok buat lansia ga?' },
  { key: 'anak', icon: Baby, label: 'Bisa bawa anak kecil?' },
  { key: 'pemula', icon: HelpCircle, label: 'Cocok buat yang pertama kali?' },
  // Harga & pembayaran
  { key: 'harga', icon: Tag, label: 'Kenapa harga segini?' },
  { key: 'pembayaran', icon: CreditCard, label: 'Cara pembayaran gimana?' },
  { key: 'dp-booking', icon: CreditCard, label: 'DP berapa buat booking?' },
  { key: 'pelunasan', icon: CreditCard, label: 'Kapan harus lunas?' },
  { key: 'cicilan', icon: CreditCard, label: 'Bisa cicilan syariah ga?' },
  { key: 'biaya-tambahan', icon: PlusCircle, label: 'Ada biaya tambahan?' },
  { key: 'promo', icon: Gift, label: 'Ada promo atau diskon?' },
  // Admin
  { key: 'dokumen', icon: FileCheck, label: 'Dokumen yang disiapkan' },
  { key: 'visa', icon: Stamp, label: 'Visa urus sendiri atau dibantu?' },
  // Kenyamanan & info
  { key: 'kesehatan', icon: Heart, label: 'Persiapan kesehatan apa?' },
  { key: 'cuaca', icon: Thermometer, label: 'Cuacanya gimana saat trip?' },
  { key: 'asuransi', icon: ShieldCheck, label: 'Ada asuransi perjalanan?' },
  { key: 'foto', icon: Camera, label: 'Dokumentasi/foto disediakan?' },
  // Compare
  { key: 'compare', icon: ArrowLeftRight, label: 'Bandingkan sama paket lain' },
];

// Fisher-Yates shuffle (non-mutating)
function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const CLIENT_QUERY_LIMIT = 8;          // max queries per modal session
const FETCH_TIMEOUT_MS = 15000;        // 15s
const SEND_DEBOUNCE_MS = 500;          // prevent double-submit
const WA_NUDGE_INTERVAL = 3;           // show WA nudge on 1st & every 3rd AI msg
const COUNTER_SHOW_THRESHOLD = 250;    // show char counter when >= this many chars
const TYPEWRITER_WORD_MS = 22;         // interval between word reveals

// ============================================
// Helpers
// ============================================

const WaIcon = ({ size = 14, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

function initialsOf(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Render inline **bold** / *italic* / __underline__. Safe — emits JSX, no dangerouslySetInnerHTML.
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: match ** before * so "**bold**" isn't mis-read as "*italic italic*".
  const re = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\*([^*\n]+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={k++}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      out.push(
        <span
          key={k++}
          className="underline decoration-emerald-500 decoration-2 underline-offset-[3px] font-medium"
        >
          {m[2]}
        </span>
      );
    } else if (m[3] !== undefined) {
      out.push(<em key={k++}>{m[3]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : [text];
}

// Strip trailing unmatched markdown tokens so partial reveal doesn't show stray
// "**" or "*" characters while the typewriter is still revealing the closing pair.
function stripUnmatchedMarkdown(s: string): string {
  let out = s;
  // Remove trailing "__" or "_" that has no partner later (we're partial-streaming)
  out = out.replace(/__[^_\n]*$/g, m => m.slice(2));
  out = out.replace(/\*\*[^*\n]*$/g, m => m.slice(2));
  out = out.replace(/\*[^*\n]*$/g, m => m.slice(1));
  return out;
}

// Rich rendering: bullets as block rows, blank lines as spacer. For finished messages.
// Emits divs, so must be placed inside a <div> (not <p>).
function renderMessage(text: string): ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const listMatch = /^\s*[-*•]\s+(.+)$/.exec(line);
    if (listMatch) {
      return (
        <div key={i} className="flex gap-1.5">
          <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">•</span>
          <span className="flex-1">{renderInline(listMatch[1])}</span>
        </div>
      );
    }
    if (line.trim() === '') {
      return <div key={i} className="h-1.5" />;
    }
    return <div key={i}>{renderInline(line)}</div>;
  });
}

// Inline-only rendering (no block-level divs) for partial/typewriter state so the
// cursor can sit immediately after the last word without layout jumping.
function renderMessageInline(text: string): ReactNode[] {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push(<br key={`br-${i}`} />);
    if (line.trim() === '') return;
    // For list items during typing: show bullet inline, keeps flow simple.
    const listMatch = /^\s*[-*•]\s+(.+)$/.exec(line);
    if (listMatch) {
      out.push(
        <Fragment key={i}>
          <span className="text-emerald-600 dark:text-emerald-400">• </span>
          {renderInline(listMatch[1])}
        </Fragment>
      );
      return;
    }
    out.push(<Fragment key={i}>{renderInline(line)}</Fragment>);
  });
  return out;
}

// Match BrochureModal/ItineraryModal URL handling: keep CDN URLs as-is,
// rewrite legacy alhijaz/miqot paths to the current proxy path.
function normalizeAssetUrl(url: string): string {
  if (!url) return '';
  const clean = url.replace(/^http:\/\//i, 'https://');
  const isCdn = clean.includes('.b-cdn.net') || clean.includes('bunnycdn');
  if (isCdn) return clean;
  return clean.replace(/^https?:\/\/(?:jadwal\.(?:miqot\.com|alhijaz\.co)|115\.124\.86\.220)/i, '');
}

function AttachmentCard({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  const displayUrl = useMemo(() => normalizeAssetUrl(attachment.url), [attachment.url]);

  if (attachment.type === 'brosur') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="block w-full max-w-[260px] rounded-2xl overflow-hidden border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-slate-800 shadow-sm active:scale-[0.98] transition-all"
      >
        <div className="relative aspect-[3/4] bg-gray-100 dark:bg-slate-900 overflow-hidden">
          {!imgErr ? (
            <img
              src={displayUrl}
              alt={attachment.title}
              className="w-full h-full object-cover"
              onError={() => setImgErr(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon size={32} className="text-gray-300 dark:text-slate-600" />
            </div>
          )}
          <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <Maximize2 size={12} className="text-white" />
          </div>
        </div>
        <div className="px-3 py-2 flex items-center gap-1.5 border-t border-gray-100 dark:border-slate-700/60">
          <ImageIcon size={12} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span className="flex-1 text-[11px] font-semibold text-gray-700 dark:text-slate-200 truncate text-left">
            Brosur Paket
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            Lihat
          </span>
        </div>
      </button>
    );
  }

  // itinerary
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 w-full max-w-[260px] px-3 py-3 rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-white dark:bg-slate-800 shadow-sm active:scale-[0.98] transition-all"
    >
      <div className="w-11 h-12 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/40 flex items-center justify-center flex-shrink-0">
        <FileText size={22} className="text-red-500 dark:text-red-400" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-[12px] font-bold text-gray-900 dark:text-white truncate">Itinerary</div>
        <div className="text-[10px] text-gray-500 dark:text-slate-400 truncate">PDF · Tap untuk full screen</div>
      </div>
      <Maximize2 size={14} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
    </button>
  );
}

// Progressive word-by-word reveal for AI messages. Auto-scrolls self into view
// on each tick so the user follows the typing. Strips unmatched markdown during
// the partial state to avoid flashing stray "**".
function TypewriterMessage({ text }: { text: string }) {
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  const [idx, setIdx] = useState(0);
  const selfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdx(0);
    const total = tokens.length;
    if (total === 0) return;
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      if (current >= total) {
        setIdx(total);
        clearInterval(interval);
      } else {
        setIdx(current);
      }
    }, TYPEWRITER_WORD_MS);
    return () => clearInterval(interval);
  }, [tokens]);

  useEffect(() => {
    selfRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
  }, [idx]);

  const done = idx >= tokens.length;
  if (done) {
    return <div ref={selfRef}>{renderMessage(text)}</div>;
  }
  const partial = stripUnmatchedMarkdown(tokens.slice(0, idx).join(''));
  return (
    <div ref={selfRef}>
      {renderMessageInline(partial)}
      <span
        aria-hidden="true"
        className="inline-block w-[2px] h-3.5 bg-emerald-500 ml-0.5 align-middle animate-pulse"
      />
    </div>
  );
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
  const [aiMsgCount, setAiMsgCount] = useState(0);
  const [askedKeys, setAskedKeys] = useState<Set<string>>(() => new Set());
  const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null);
  // Reshuffle chip suggestions every time the modal opens, so users don't
  // see the same 4+4 questions across different packages.
  const [chipShuffle, setChipShuffle] = useState<ChipDef[]>(() => shuffleArray(CHIP_POOL));
  const chatRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const lastSendAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Default / extra chips derived from the current session's shuffle.
  const defaultChips = useMemo(() => chipShuffle.slice(0, 4), [chipShuffle]);
  const extraChips = useMemo(() => chipShuffle.slice(4, 8), [chipShuffle]);

  // Follow-up suggestions under the latest AI reply: prefer unasked chips
  // from the remaining shuffle pool, max 3.
  const followUps = useMemo(() => {
    return chipShuffle
      .filter(c => !askedKeys.has(c.key))
      .slice(0, 3);
  }, [chipShuffle, askedKeys]);

  const agentFirstName = useMemo(() => (agentName || '').trim().split(/\s+/)[0] || 'Konsultan', [agentName]);
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

  // ── Track modal open + reshuffle chip suggestions ──
  useEffect(() => {
    if (isOpen) {
      trackPublicEvent(agentSlug, 'ask_ai_opened', { jadwalId });
      setChipShuffle(shuffleArray(CHIP_POOL));
    }
  }, [isOpen, agentSlug, jadwalId]);

  // ── Reset state on close (delayed to let close animation finish) ──
  useEffect(() => {
    if (isOpen) return;
    abortRef.current?.abort();
    abortRef.current = null;
    const t = setTimeout(() => {
      setMessages([]);
      setExpanded(false);
      setInputText('');
      setIsTyping(false);
      setQueryCount(0);
      setAiMsgCount(0);
      setAskedKeys(new Set());
      setActiveAttachment(null);
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

    if (chipKey && chipKey !== 'free') {
      setAskedKeys(prev => {
        const next = new Set(prev);
        next.add(chipKey);
        return next;
      });
    }

    const userMsg: Message = { type: 'user', content: q, id: nextId() };
    const typingMsg: Message = { type: 'typing', id: nextId() };
    setMessages(prev => [...prev, userMsg, typingMsg]);
    setIsTyping(true);
    setQueryCount(c => c + 1);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let aiContent = '';
    let aiNote = '';
    let aiAttachment: Attachment | null = null;
    let isFallback = false;
    try {
      const res = await fetch(`/api/ask-ai/${encodeURIComponent(agentSlug)}/${encodeURIComponent(jadwalId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, chipKey: chipKey || 'free', yearCode }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (data && typeof data.answer === 'string' && data.answer.trim()) {
        aiContent = data.answer;
        aiNote = typeof data.note === 'string' ? data.note : '';
        isFallback = Boolean(data.fallback);
        if (data.attachment && (data.attachment.type === 'brosur' || data.attachment.type === 'itinerary') && typeof data.attachment.url === 'string') {
          aiAttachment = {
            type: data.attachment.type,
            url: data.attachment.url,
            title: typeof data.attachment.title === 'string' ? data.attachment.title : '',
          };
        }
      } else {
        aiContent = `Waduh, koneksinya lagi lambat, Kak 😅 Coba chat **${agentFirstName}** langsung aja ya.`;
        aiNote = `**${agentFirstName}** cepet kok balesnya di WhatsApp 🙂`;
        isFallback = true;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted && abortRef.current !== controller) {
        // user clicked stop or closed modal
        setMessages(prev => prev.filter(m => m.id !== typingMsg.id));
        setIsTyping(false);
        return;
      }
      aiContent = `Waduh, koneksinya lagi lambat, Kak 😅 Coba chat **${agentFirstName}** langsung aja ya.`;
      aiNote = `**${agentFirstName}** cepet kok balesnya di WhatsApp 🙂`;
      isFallback = true;
    }
    clearTimeout(timeoutId);
    if (abortRef.current === controller) abortRef.current = null;

    // WA nudge shown on: 1st AI msg, fallback, or every Nth (WA_NUDGE_INTERVAL)
    const nextAiCount = aiMsgCount + 1;
    const showWaNudge = isFallback || nextAiCount === 1 || nextAiCount % WA_NUDGE_INTERVAL === 0;
    setAiMsgCount(nextAiCount);

    const aiMsg: Message = {
      type: 'ai',
      content: aiContent,
      note: aiNote,
      questionKey: chipKey,
      showWaNudge,
      attachment: aiAttachment,
      id: nextId(),
    };
    setMessages(prev => prev.filter(m => m.id !== typingMsg.id).concat(aiMsg));
    setIsTyping(false);
  }

  // ── Stop current AI request ──
  function handleStop() {
    const ctrl = abortRef.current;
    if (!ctrl) return;
    abortRef.current = null; // marks "user-requested abort"
    ctrl.abort();
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
      content: `Udah banyak yang ditanyain, Kak 🙂 Enaknya sekarang lanjut ngobrol langsung sama **${agentFirstName}** aja yuk di WhatsApp — biar info-nya lebih pas buat Kakak.`,
      note: `**${agentFirstName}** siap bantu lebih detail di WhatsApp 🙂`,
      showWaNudge: true,
      attachment: null,
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
              <span className="font-medium text-gray-500 dark:text-slate-400">Paket:</span>
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
                  <div className="text-[13px] leading-relaxed text-gray-800 dark:text-slate-100 space-y-0.5">
                    <div>Assalamualaikum 👋</div>
                    <div>Saya asisten AI-nya <strong>{agentFirstName}</strong>. Ada yang mau ditanyain soal paket ini, Kak? 🙂</div>
                  </div>
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
                <div className="flex flex-col gap-1.5">
                  {defaultChips.map(chip => {
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
                      className="flex flex-col gap-1.5 overflow-hidden"
                    >
                      {extraChips.map(chip => {
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
            {messages.map((msg, idx) => {
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
              const isLastAi = idx === messages.length - 1;
              return (
                <div key={msg.id} className="flex gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)' }}
                  >
                    <Sparkles size={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <div className="inline-block bg-gray-100 dark:bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-3 max-w-full">
                        <div className="text-[13px] leading-relaxed text-gray-800 dark:text-slate-100 break-words space-y-1">
                          <TypewriterMessage text={msg.content} />
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-400 dark:text-slate-500 mt-1 ml-1">
                        Asisten AI · baru saja
                      </div>
                    </div>

                    {/* Inline attachment preview (brosur image / itinerary PDF) */}
                    {msg.attachment && (
                      <AttachmentCard
                        attachment={msg.attachment}
                        onOpen={() => setActiveAttachment(msg.attachment)}
                      />
                    )}

                    {/* WA Nudge Card — only on 1st AI / fallback / every Nth */}
                    {msg.showWaNudge && (
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
                            💬 {renderInline(msg.note || `Untuk detail lebih personal, **${agentFirstName}** bisa bantu langsung.`)}
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
                    )}

                    {/* Follow-up suggestions — only on LAST AI msg, not during typing */}
                    {isLastAi && !isTyping && followUps.length > 0 && queryCount < CLIENT_QUERY_LIMIT && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {followUps.map(chip => {
                          const Icon = chip.icon;
                          return (
                            <button
                              key={chip.key}
                              type="button"
                              onClick={() => handleChipTap(chip)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium active:scale-[0.96] transition-all"
                            >
                              <Icon size={11} />
                              <span>{chip.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
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
              {isTyping ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 active:scale-95 transition-all"
                  aria-label="Stop"
                >
                  <Square size={13} className="text-gray-700 dark:text-slate-200 fill-gray-700 dark:fill-slate-200" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFreeSubmit}
                  disabled={!inputText.trim()}
                  className="w-10 h-10 rounded-full flex items-center justify-center shadow-md shadow-emerald-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-transform"
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)' }}
                  aria-label="Kirim"
                >
                  <Send size={15} className="text-white" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <p className="text-[9px] text-gray-400 dark:text-slate-500 flex-1">
                Jawaban AI sifatnya informasi aja, Kak. Konfirmasi akhir ke {agentFirstName} ya 🙂
              </p>
              {inputText.length >= COUNTER_SHOW_THRESHOLD && (
                <span
                  className={`text-[9px] font-medium ml-2 flex-shrink-0 ${
                    inputText.length >= 480
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-gray-400 dark:text-slate-500'
                  }`}
                >
                  {inputText.length}/500
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}
      {/* Fullscreen viewers — mounted outside the Ask AI sheet so they overlay it */}
      {activeAttachment?.type === 'brosur' && (
        <Suspense fallback={null}>
          <BrochureModal
            isOpen={true}
            onClose={() => setActiveAttachment(null)}
            imageUrl={activeAttachment.url}
            title={activeAttachment.title}
          />
        </Suspense>
      )}
      {activeAttachment?.type === 'itinerary' && (
        <Suspense fallback={null}>
          <ItineraryModal
            isOpen={true}
            onClose={() => setActiveAttachment(null)}
            fileUrl={activeAttachment.url}
            title={activeAttachment.title}
            agentSlug={agentSlug}
            agentName={agentName}
            agentPhone={agentPhone}
            agentPhoto={agentPhoto || null}
          />
        </Suspense>
      )}
    </AnimatePresence>,
    document.body
  );
}
