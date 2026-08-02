// Bani — asisten AI in-app untuk agent: FAB + bottom sheet tanya-jawab.
//
// Single-shot: SATU tanya, SATU jawab. Pertanyaan baru MENGGANTI layar, bukan
// menumpuk jadi thread, dan tidak ada riwayat yang disimpan di mana pun.
//
// Isi kartu TIDAK PERNAH ditulis model — server (lib/bani-orchestrator.js)
// meng-hydrate `cards` dari hasil tool, komponen ini hanya merendernya.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Send, X, Clock, ChevronRight, Calendar, Wallet, Cake, Plane,
  Users, CalendarRange, MessageCircle, RefreshCw, Search, Database, Sparkles,
  Building2, Calculator,
} from 'lucide-react';
import BaniAvatar from './BaniAvatar';
import { getAuthHeaders } from '../LoginPage';
import { normalizeWaNumber } from '../../utils/phone';

type BaniCard =
  | {
      type: 'package';
      jadwal_id: string | null;
      nama: string | null;
      berangkat_tgl: string | null;
      pulang_tgl: string | null;
      durasi_hari: number | null;
      maskapai: string | null;
      seat_sisa: number | null;
      sold_out: boolean | null;
      harga_mulai: number | null;
    }
  | {
      type: 'jamaah';
      jm_id: string | null;
      nama: string | null;
      jk: string | null;
      id_umroh: string | null;
      paket: string | null;
      tgl_berangkat: string | null;
      sisa: number | null;
      bayar: number | null;
      wa: string | null;
    }
  | { type: 'link'; target: 'jamaah' | 'calendar' | 'jadwal' };

type Phase = 'idle' | 'loading' | 'answer';

const QUESTION_MAX_LEN = 500;
const THINKING_STEPS = ['Membaca pertanyaan…', 'Membuka data…', 'Menyusun jawaban…'];
const THINKING_DETAILS = [
  'Memahami maksud pertanyaan Anda',
  'Mencocokkan paket dan data jamaah',
  'Merangkum temuan paling relevan',
] as const;
const THINKING_ICONS = [Search, Database, Sparkles] as const;
const THINKING_INTERVAL_MS = 1_250;
const SUGGESTION_INTERVAL_MS = 5_000;
const VISIBLE_SUGGESTION_COUNT = 4;
const FAB_TYPING_MS = 52;
const FAB_DELETING_MS = 28;
const FAB_HOLD_MS = 1_800;
const FAB_NEXT_MS = 280;
const FAB_REDUCED_MOTION_INTERVAL_MS = 4_800;

const FAB_PROMPTS = [
  'Ada yang ingin dicek?',
  'Cek paket bareng Bani',
  'Tanya soal jamaah',
  'Jadwal terdekat?',
  'Butuh info cepat?',
  'Bani siap membantu',
] as const;

// Setiap baris DIUJI end-to-end lewat orchestrator + data nyata sebelum masuk
// daftar: yang dijawab "data tidak ditemukan" atau dijawab ambigu dibuang, sebab
// saran yang gagal lebih merugikan daripada tidak ada saran.
//
// Dua aturan yang menjaga daftar ini tetap sehat:
//  1. TANPA tahun/bulan hardcoded ("Desember 2026", "keberangkatan Agustus") —
//     pertanyaan begitu basi sendiri. Pakai kata relatif; tanggal hari ini sudah
//     disuntikkan ke system prompt (lib/bani-orchestrator.js).
//  2. Selalu dari sudut pandang agent ("jamaah saya"). "Berapa pax di
//     keberangkatan terdekat?" dibuang karena dijawab dari kalender = KUOTA
//     NASIONAL, bukan jamaah agent ybs.
const SUGGESTION_POOL = [
  // paket & harga
  { icon: Plane, text: 'Paket terdekat dengan seat tersisa apa saja?', tone: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-900/25' },
  { icon: Wallet, text: 'Paket promo di bawah Rp30 juta masih ada?', tone: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/25' },
  { icon: Clock, text: 'Paket 9 hari termurah berangkat kapan?', tone: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/25' },
  { icon: CalendarRange, text: 'Paket akhir tahun ini yang masih ada seat?', tone: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/25' },
  { icon: Building2, text: 'Hotel Mekkah dan Madinah di paket terdekat apa?', tone: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/25' },
  { icon: Calculator, text: 'Hitung biaya 2 jamaah kamar quad di paket terdekat', tone: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/25' },
  // pembayaran
  { icon: Wallet, text: 'Siapa yang belum lunas dan berangkat bulan ini?', tone: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/25' },
  { icon: Wallet, text: 'Total outstanding keberangkatan bulan depan berapa?', tone: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/25' },
  { icon: Wallet, text: 'Siapa yang belum bayar DP tapi berangkat 30 hari lagi?', tone: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/25' },
  { icon: Wallet, text: 'Berapa total tagihan jamaah saya yang belum lunas?', tone: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/25' },
  // jamaah
  { icon: Users, text: 'Berapa jamaah lunas untuk keberangkatan bulan depan?', tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/25' },
  { icon: Users, text: 'Berapa jamaah saya di keberangkatan terdekat?', tone: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/25' },
  { icon: Plane, text: 'Berapa jamaah yang berangkat 7 hari ke depan?', tone: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/25' },
  { icon: Users, text: 'Siapa jamaah dengan jadwal berangkat terdekat?', tone: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/25' },
  { icon: Cake, text: 'Siapa yang ulang tahun 7 hari ke depan?', tone: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/25' },
  // agenda
  { icon: Calendar, text: 'Ada agenda manasik dalam 7 hari ke depan?', tone: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/25' },
] as const;

type BaniSuggestion = (typeof SUGGESTION_POOL)[number];

function pickRandomSuggestions(count: number): BaniSuggestion[] {
  const shuffled = [...SUGGESTION_POOL];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// Rotasi bergilir (slot 0→1→2→3), bukan slot acak: dengan slot acak satu baris
// bisa berganti dua kali beruntun sementara baris lain diam, dan mata membaca
// itu sebagai kedipan, bukan pergantian.
function replaceSuggestionAt(current: BaniSuggestion[], slot: number): BaniSuggestion[] {
  const visibleTexts = new Set(current.map(({ text }) => text));
  const candidates = SUGGESTION_POOL.filter(({ text }) => !visibleTexts.has(text));
  if (!candidates.length || !current.length) return current;

  const replacement = candidates[Math.floor(Math.random() * candidates.length)];
  const replaceAt = ((slot % current.length) + current.length) % current.length;
  return current.map((suggestion, index) => (index === replaceAt ? replacement : suggestion));
}

// ── markdown-mini ────────────────────────────────────────────────────────────
// Jawaban model adalah teks tak tepercaya. Escape SEMUA HTML dulu, baru terapkan
// subset penanda yang diizinkan (**tebal**, baris "- ", newline). Urutan ini
// yang membuat `<b>halo</b>` di jawaban tampil literal, bukan ter-render.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]
  ));
}

function applyBold(value: string): string {
  return value.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-white">$1</strong>');
}

export function renderBaniMarkdown(text: string): string {
  const lines = escapeHtml(String(text || '')).split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map(applyBold).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(`<ul class="my-1 list-disc space-y-0.5 pl-4">${bullets.map((b) => `<li>${applyBold(b)}</li>`).join('')}</ul>`);
    bullets = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      flushParagraph();
      bullets.push(trimmed.slice(2).trim());
      continue;
    }
    flushBullets();
    if (trimmed) paragraph.push(trimmed);
  }
  flushBullets();
  flushParagraph();
  return blocks.join('');
}

const rupiah = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? `Rp${value.toLocaleString('id-ID')}` : null
);

const tanggalPendek = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(m[3])} ${bulan[Number(m[2]) - 1]} ${m[1]}`;
};

const initials = (nama: string | null | undefined) => (
  String(nama || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
);

export default function BaniAssistant({ slug, onNavigate }: { slug: string; onNavigate: (path: string) => void }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [input, setInput] = useState('');
  const [asked, setAsked] = useState('');
  const [answer, setAnswer] = useState('');
  const [cards, setCards] = useState<BaniCard[]>([]);
  const [sourceNote, setSourceNote] = useState('');
  const [errorText, setErrorText] = useState('');
  const [thinkingStep, setThinkingStep] = useState(0);
  const [fabPromptIndex, setFabPromptIndex] = useState(0);
  const [fabPromptText, setFabPromptText] = useState('');
  const [fabPromptDeleting, setFabPromptDeleting] = useState(false);
  const [suggestions, setSuggestions] = useState<BaniSuggestion[]>(() => (
    pickRandomSuggestions(VISIBLE_SUGGESTION_COUNT)
  ));
  const [suggestionsPaused, setSuggestionsPaused] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportTop, setViewportTop] = useState(0);

  const suggestionSlotRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Tinggi visual viewport SAAT sheet dibuka — acuan untuk menebak keyboard
  // sedang terbuka. Wajib nilai beku, bukan window.innerHeight live: index.html
  // memakai `interactive-widget=resizes-content`, jadi innerHeight ikut menyusut
  // dan selisihnya jadi ~0 (heuristiknya terbalik).
  const baseViewportRef = useRef(0);

  const closeSheet = useCallback(() => {
    // Respons yang datang setelah sheet ditutup diabaikan (lihat guard di ask()).
    abortRef.current?.abort();
    abortRef.current = null;
    setSuggestionsPaused(false);
    setOpen(false);
  }, []);

  const resetToIdle = useCallback(() => {
    setPhase('idle');
    setAsked('');
    setAnswer('');
    setCards([]);
    setSourceNote('');
    setErrorText('');
    setInput('');
  }, []);

  const openSheet = useCallback(() => {
    setOpen(true);
  }, []);

  // Bersihkan state setelah animasi tutup selesai — menutup sheet saat loading
  // tidak boleh menyisakan jawaban lama saat dibuka lagi.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(resetToIdle, 380);
    return () => clearTimeout(t);
  }, [open, resetToIdle]);

  // ── Body scroll lock + pinning ke visual viewport ──
  // Pola sama dengan AskAIModal.tsx: iOS Safari menggeser layout viewport saat
  // input fokus; kunci body position:fixed lalu ikuti rect visualViewport supaya
  // input bar tidak tertutup keyboard.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevBody = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    const prevHtml = { overflow: html.style.overflow };
    const scrollY = window.scrollY;

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    baseViewportRef.current = Math.round(vv ? vv.height : window.innerHeight);

    // Selama keyboard iOS beranimasi, resize+scroll bisa datang beberapa kali
    // per frame. Tanpa koalesensi tiap event jadi commit React sendiri (batching
    // React 18 tidak melintasi event), dan pembulatan + bail-out mencegah commit
    // untuk perubahan sub-pixel yang tak terlihat.
    let raf = 0;
    let lastHeight = -1;
    let lastTop = -1;
    const read = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // Kedua nilai dibaca pada titik waktu yang SAMA, bukan saat dispatch
        // event — kalau tidak, top dan height bisa berasal dari frame berbeda.
        const h = Math.round(vv ? vv.height : window.innerHeight);
        const t = Math.round(vv ? vv.offsetTop : 0);
        if (h !== lastHeight) { lastHeight = h; setViewportHeight(h); }
        if (t !== lastTop) { lastTop = t; setViewportTop(t); }
      });
    };
    // Koreksi auto-scroll iOS sengaja TIDAK dipasang di listener 'scroll':
    // memanggil scrollTo dari sana memutasi angka yang jadi sumber bacaan kita
    // sendiri. Cukup saat resize & saat input mendapat fokus.
    const unscroll = () => { if (window.scrollY !== 0) window.scrollTo(0, 0); };
    const onResize = () => { unscroll(); read(); };

    read();
    vv?.addEventListener('resize', onResize);
    vv?.addEventListener('scroll', read);
    window.addEventListener('resize', onResize);
    document.addEventListener('focusin', unscroll);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', onResize);
      vv?.removeEventListener('scroll', read);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('focusin', unscroll);
      body.style.position = prevBody.position;
      body.style.top = prevBody.top;
      body.style.width = prevBody.width;
      body.style.overflow = prevBody.overflow;
      html.style.overflow = prevHtml.overflow;
      window.scrollTo(0, scrollY);
      setViewportHeight(null);
      setViewportTop(0);
    };
  }, [open]);

  // Escape menutup sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeSheet]);

  // Microcopy "berpikir" murni klien — server v1 tidak streaming.
  useEffect(() => {
    if (phase !== 'loading') return;
    setThinkingStep(0);
    const t = setInterval(() => setThinkingStep((s) => (s + 1) % THINKING_STEPS.length), THINKING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [phase]);

  // Selama layar saran terbuka, ganti SATU baris setiap interval. Kandidat
  // selalu diambil dari luar empat baris yang sedang tampil agar tidak ada
  // duplikat atau perubahan semu.
  //
  // Rotasi BERHENTI selama jari/kursor menyentuh daftar: tanpa jeda ini, baris
  // bisa berganti persis saat pengguna mengarah ke sana dan yang tereksekusi
  // adalah pertanyaan yang tidak diniatkan.
  useEffect(() => {
    if (!open || phase !== 'idle' || suggestionsPaused) return;
    const interval = window.setInterval(() => {
      suggestionSlotRef.current += 1;
      setSuggestions((current) => replaceSuggestionAt(current, suggestionSlotRef.current));
    }, SUGGESTION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [open, phase, suggestionsPaused]);

  // Ketik → tahan → hapus → lanjut ke ajakan berikutnya. Pill mengikuti lebar
  // teks; avatar tetap stabil karena seluruh FAB ditambatkan dari sisi kanan.
  useEffect(() => {
    if (open) return;

    const fullPrompt = FAB_PROMPTS[fabPromptIndex];
    if (reduceMotion) {
      setFabPromptText(fullPrompt);
      const timeout = window.setTimeout(() => {
        setFabPromptIndex((index) => (index + 1) % FAB_PROMPTS.length);
      }, FAB_REDUCED_MOTION_INTERVAL_MS);
      return () => window.clearTimeout(timeout);
    }

    const complete = fabPromptText === fullPrompt;
    const empty = fabPromptText.length === 0;
    const delay = !fabPromptDeleting && complete
      ? FAB_HOLD_MS
      : fabPromptDeleting && empty
        ? FAB_NEXT_MS
        : fabPromptDeleting
          ? FAB_DELETING_MS
          : FAB_TYPING_MS;

    const timeout = window.setTimeout(() => {
      if (!fabPromptDeleting && complete) {
        setFabPromptDeleting(true);
      } else if (fabPromptDeleting && empty) {
        setFabPromptDeleting(false);
        setFabPromptIndex((index) => (index + 1) % FAB_PROMPTS.length);
      } else {
        const nextLength = fabPromptText.length + (fabPromptDeleting ? -1 : 1);
        setFabPromptText(fullPrompt.slice(0, nextLength));
      }
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [fabPromptDeleting, fabPromptIndex, fabPromptText, open, reduceMotion]);

  useEffect(() => {
    if (phase === 'answer') scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase]);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim().slice(0, QUESTION_MAX_LEN);
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAsked(trimmed);
    setInput('');
    setAnswer('');
    setCards([]);
    setSourceNote('');
    setErrorText('');
    setPhase('loading');

    try {
      const res = await fetch('/api/bani/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (controller.signal.aborted) return; // sheet ditutup saat menunggu

      if (res.status === 429) {
        const minutes = Math.max(1, Math.ceil(Number(data?.retryAfterSeconds || 0) / 60));
        setErrorText(`Batas tanya Bani tercapai. Coba lagi dalam ±${minutes} menit ya.`);
      } else if (!res.ok || !data) {
        setErrorText(data?.error || 'Bani lagi tidak bisa menjawab. Coba lagi sebentar lagi.');
      } else if (data.success === false) {
        setErrorText(data.error || 'Bani lagi tidak bisa menjawab. Coba lagi sebentar lagi.');
      } else {
        setAnswer(String(data.answer || ''));
        setCards(Array.isArray(data.cards) ? data.cards : []);
        setSourceNote(String(data.source_note || ''));
      }
      setPhase('answer');
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
      setErrorText('Koneksinya sedang bermasalah. Coba tanya lagi sebentar lagi ya.');
      setPhase('answer');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const answerHtml = useMemo(() => (answer ? renderBaniMarkdown(answer) : ''), [answer]);

  const openPackage = useCallback((jadwalId: string | null) => {
    if (!jadwalId) return;
    window.open(`/${slug}/${jadwalId}`, '_blank', 'noopener,noreferrer');
  }, [slug]);

  const goToJamaah = useCallback(() => {
    closeSheet();
    onNavigate('/dashboard/jamaah');
  }, [closeSheet, onNavigate]);

  const openLinkTarget = useCallback((target: 'jamaah' | 'calendar' | 'jadwal') => {
    if (target === 'jamaah') { goToJamaah(); return; }
    // Tidak ada halaman kalender tersendiri — widget UpcomingSchedule ada di
    // tab home (dikonfirmasi 2 Agt 2026).
    if (target === 'calendar') { closeSheet(); onNavigate('/dashboard'); return; }
    // Daftar paket hidup di halaman publik agent, bukan di dalam dashboard.
    if (target === 'jadwal') window.open(`/${slug}`, '_blank', 'noopener,noreferrer');
  }, [goToJamaah, closeSheet, onNavigate, slug]);

  const sheetHeight = viewportHeight != null ? `${viewportHeight}px` : '100dvh';
  // SATU otoritas tinggi untuk sheet. Sebelumnya sheet punya `h-[min(92dvh,780px)]`
  // (CSS, sinkron) DI SAMPING `max-h-full` yang mewarisi tinggi wrapper dari state
  // React (telat ≥1 frame). Saat keyboard iOS beranimasi, pemenang min() berpindah
  // dari suku CSS ke suku state di tengah jalan — itulah sumber kedipnya.
  // `dvh` kini hanya dipakai bila visualViewport tidak tersedia sama sekali.
  const sheetMaxHeight = viewportHeight != null
    ? `${Math.min(Math.round(viewportHeight * 0.92), 780)}px`
    : 'min(92dvh, 780px)';
  // Keyboard terbuka bila viewport menyusut jauh dari tinggi saat sheet dibuka.
  const keyboardOpen = viewportHeight != null
    && baseViewportRef.current > 0
    && viewportHeight < baseViewportRef.current - 100;

  return (
    <>
      {/* ── FAB ── */}
      <div
        // Saat sheet terbuka FAB hanya di-fade (bukan di-unmount) supaya
        // animasinya mulus — tapi elemen ber-opacity-0 masih bisa di-fokus
        // keyboard & dibaca screen reader, jadi ikut disembunyikan dari a11y
        // tree dan dikeluarkan dari urutan tab.
        aria-hidden={open}
        className={`fixed bottom-[1.35rem] z-40 flex items-center gap-2 transition-all duration-300 ${
          open ? 'pointer-events-none scale-75 opacity-0' : 'scale-100 opacity-100'
        }`}
        style={{ right: 'max(1rem, calc(50% - 16rem + 1rem))' }}
      >
        <span
          aria-hidden="true"
          className="inline-flex min-h-[26px] max-w-[calc(100vw-7rem)] items-center overflow-hidden rounded-full border border-slate-950 bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white shadow-md shadow-slate-950/15 dark:border-white dark:bg-white dark:text-slate-950 dark:shadow-black/30"
        >
          <span className="min-w-0 truncate whitespace-nowrap">{fabPromptText}</span>
          <span className="ml-0.5 inline-block h-3 w-px shrink-0 animate-pulse bg-current align-middle motion-reduce:hidden" />
        </span>
        <button
          type="button"
          onClick={openSheet}
          aria-label="Buka Bani, asisten AI"
          tabIndex={open ? -1 : undefined}
          className="relative flex h-[60px] w-[60px] items-center justify-center active:scale-95 transition-transform"
        >
          {/* Cincin conic berputar (animasi mati saat prefers-reduced-motion). */}
          <span
            aria-hidden="true"
            className="bani-fab-ring absolute inset-[-2.5px] rounded-full"
            style={{ background: 'conic-gradient(#2563eb, #60a5fa, #f59e0b, #2563eb)' }}
          />
          <span className="relative flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-full border-[2.5px] border-gray-100 shadow-lg shadow-blue-500/25 dark:border-slate-950">
            <BaniAvatar className="h-full w-full" />
          </span>
          <span className="absolute right-0.5 top-0.5 z-10 h-3 w-3 rounded-full border-2 border-gray-100 bg-emerald-400 animate-pulse motion-reduce:animate-none dark:border-slate-950" />
        </button>
      </div>

      {/* ── Sheet ── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="bani-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              onClick={closeSheet}
              // Di-pin ke rect visual viewport yang SAMA dengan sheet. Dulu
              // `inset-0` + backdrop-blur: lapisan blur seukuran layar yang
              // tidak ikut bergerak saat keyboard naik memicu flash di WebKit.
              className="fixed left-0 right-0 z-[9980] bg-slate-950/60"
              style={{ top: viewportTop, height: sheetHeight }}
            />
            <div
              className="pointer-events-none fixed left-0 right-0 z-[9990] flex items-end justify-center"
              style={{ top: viewportTop, height: sheetHeight }}
            >
              <motion.div
                key="bani-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Bani, asisten agent"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                // h-auto: sheet setinggi isinya (idle tidak lagi menyisakan
                // ~260px kosong), dibatasi satu maxHeight dari sumber yang sama
                // dengan wrapper. JANGAN tambahkan prop `layout` framer-motion
                // untuk meredam pertumbuhan tinggi idle→jawaban: itu mengukur &
                // menganimasikan tiap perubahan tinggi dan kedipnya kembali.
                className="pointer-events-auto flex h-auto w-full max-w-lg flex-col rounded-t-3xl border border-b-0 border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                style={{ maxHeight: sheetMaxHeight }}
              >
                {/* Header */}
                <div className="shrink-0 rounded-t-3xl px-4 pb-2 pt-2">
                  <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-gray-200 dark:bg-slate-700" />
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <BaniAvatar className="h-10 w-10" state={phase === 'loading' ? 'thinking' : 'idle'} />
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400 dark:border-slate-900" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-gray-800 dark:text-white">Bani</div>
                      <div className="truncate text-[10.5px] text-gray-500 dark:text-slate-500">
                        Siap bantu segala kebutuhan Anda
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeSheet}
                      aria-label="Tutup Bani"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100/80 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {/* Konten */}
                {/* min-h-0 WAJIB berpasangan dengan h-auto di atas: tanpa itu
                    anak flex menolak menyusut, overflow-y-auto mati, dan sheet
                    menembus maxHeight sampai menutupi input bar. */}
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
                  {phase === 'idle' && (
                    <div className="space-y-3">
                      <BaniBubble>
                        <span
                          dangerouslySetInnerHTML={{
                            __html: renderBaniMarkdown(
                              "Assalamu'alaikum! Saya **Bani**, asisten Anda di Alhijaz.co. Tanyakan apa saja soal **paket** atau **jamaah Anda** — saya carikan datanya.",
                            ),
                          }}
                        />
                      </BaniBubble>
                      <div>
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                          Coba tanyakan
                        </div>
                        {/* Satu SLOT tetap per baris, tinggi dikunci, dan baris
                            lama/baru sama-sama absolute di dalamnya. Ini yang
                            menghilangkan lompatan: versi sebelumnya memakai
                            AnimatePresence mode="popLayout" + `layout` di level
                            daftar, sehingga baris yang keluar langsung lepas dari
                            alur dan TIGA baris lain ikut bergeser naik-turun
                            setiap 5 detik. Sekarang hanya slot yang bersangkutan
                            yang berganti; tetangganya diam total. */}
                        <div
                          className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-800"
                          onPointerEnter={() => setSuggestionsPaused(true)}
                          onPointerDown={() => setSuggestionsPaused(true)}
                          onPointerLeave={() => setSuggestionsPaused(false)}
                          onPointerUp={() => setSuggestionsPaused(false)}
                          onPointerCancel={() => setSuggestionsPaused(false)}
                          onFocusCapture={() => setSuggestionsPaused(true)}
                          onBlurCapture={() => setSuggestionsPaused(false)}
                        >
                          {suggestions.map((suggestion, slot) => (
                            <div
                              key={slot}
                              className="relative h-14 border-b border-gray-100 last:border-b-0 dark:border-slate-800"
                            >
                              {/* initial={false}: empat baris pertama muncul
                                  bersama sheet, tidak perlu dianimasikan lagi. */}
                              <AnimatePresence initial={false}>
                                <motion.button
                                  key={suggestion.text}
                                  type="button"
                                  onClick={() => ask(suggestion.text)}
                                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
                                  transition={reduceMotion
                                    ? { duration: 0 }
                                    : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                                  className="absolute inset-0 flex w-full items-center gap-3 rounded-xl px-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-slate-800/70 dark:active:bg-slate-800"
                                >
                                  <motion.span
                                    initial={reduceMotion ? false : { scale: 0.72 }}
                                    animate={{ scale: 1 }}
                                    transition={reduceMotion
                                      ? { duration: 0 }
                                      : { type: 'spring', stiffness: 440, damping: 26, delay: 0.05 }}
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${suggestion.bg}`}
                                  >
                                    {/* member-expression JSX: ikon dibaca langsung
                                        dari entri pool, tanpa alias per-baris. */}
                                    <suggestion.icon size={15} strokeWidth={2.2} className={suggestion.tone} />
                                  </motion.span>
                                  <span className="flex-1 text-[12px] font-medium leading-snug text-gray-700 dark:text-slate-200">
                                    {suggestion.text}
                                  </span>
                                </motion.button>
                              </AnimatePresence>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {phase !== 'idle' && (
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-500 px-3.5 py-2 text-[12.5px] font-medium text-white">
                          {asked}
                        </div>
                      </div>

                      {phase === 'loading' && (
                        <BaniThinkingState step={thinkingStep} reduceMotion={Boolean(reduceMotion)} />
                      )}

                      {phase === 'answer' && (
                        <div className="space-y-3">
                          <BaniBubble>
                            {errorText
                              ? <span className="text-gray-700 dark:text-slate-200">{errorText}</span>
                              : <span dangerouslySetInnerHTML={{ __html: answerHtml }} />}
                          </BaniBubble>

                          {cards.length > 0 && (
                            <div className="flex flex-col gap-2">
                              {cards.map((card, idx) => {
                                if (card.type === 'package') {
                                  const tgl = tanggalPendek(card.berangkat_tgl);
                                  const harga = rupiah(card.harga_mulai);
                                  return (
                                    <button
                                      key={`pkg-${card.jadwal_id}-${idx}`}
                                      type="button"
                                      onClick={() => openPackage(card.jadwal_id)}
                                      className="w-full rounded-2xl border border-gray-100 bg-white px-3 py-2.5 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/60"
                                    >
                                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                        {tgl && (
                                          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                                            {tgl}{card.durasi_hari ? ` · ${card.durasi_hari} hari` : ''}
                                          </span>
                                        )}
                                        {card.sold_out ? (
                                          <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">Sold out</span>
                                        ) : typeof card.seat_sisa === 'number' ? (
                                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                                            sisa {card.seat_sisa} seat
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="text-[12.5px] font-bold leading-snug text-gray-800 dark:text-white">{card.nama || card.jadwal_id}</div>
                                      {card.maskapai && (
                                        <div className="mt-0.5 text-[10.5px] text-gray-500 dark:text-slate-400">{card.maskapai}</div>
                                      )}
                                      <div className="mt-1.5 flex items-center gap-2 border-t border-gray-100 pt-1.5 dark:border-slate-700">
                                        {harga && <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">mulai {harga}</span>}
                                        <span className="ml-auto text-[9.5px] font-medium text-gray-400 dark:text-slate-500">{card.jadwal_id}</span>
                                        <ChevronRight size={14} className="text-gray-300 dark:text-slate-600" />
                                      </div>
                                    </button>
                                  );
                                }

                                if (card.type === 'jamaah') {
                                  const waNumber = normalizeWaNumber(card.wa);
                                  const sisa = typeof card.sisa === 'number' && card.sisa > 0 ? rupiah(card.sisa) : null;
                                  const isFemale = String(card.jk || '').toUpperCase().startsWith('P') || String(card.jk || '').toUpperCase() === 'F';
                                  return (
                                    <div
                                      key={`jm-${card.jm_id}-${idx}`}
                                      className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
                                    >
                                      <button
                                        type="button"
                                        onClick={goToJamaah}
                                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:scale-[0.99]"
                                      >
                                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-600 ring-2 dark:bg-slate-700 dark:text-slate-200 ${isFemale ? 'ring-pink-300' : 'ring-blue-300'}`}>
                                          {initials(card.nama)}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-[12.5px] font-bold text-gray-800 dark:text-white">{card.nama || card.jm_id}</span>
                                          <span className="block truncate text-[10px] text-gray-500 dark:text-slate-400">
                                            {card.id_umroh || '—'}
                                            {tanggalPendek(card.tgl_berangkat) ? ` · brgkt ${tanggalPendek(card.tgl_berangkat)}` : ''}
                                          </span>
                                        </span>
                                      </button>
                                      {sisa && (
                                        <span className="shrink-0 text-right">
                                          <span className="block text-[8.5px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">Sisa</span>
                                          <span className="block text-[11.5px] font-bold text-amber-600 dark:text-amber-400">{sisa}</span>
                                        </span>
                                      )}
                                      {waNumber && (
                                        <a
                                          href={`https://wa.me/${waNumber}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          aria-label={`Chat WhatsApp ${card.nama || ''}`}
                                          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-colors hover:bg-emerald-600 active:scale-95"
                                        >
                                          <MessageCircle size={15} strokeWidth={2.3} />
                                        </a>
                                      )}
                                    </div>
                                  );
                                }

                                const linkMeta = {
                                  jamaah: { icon: Users, label: 'Buka daftar jamaah' },
                                  calendar: { icon: CalendarRange, label: 'Buka kalender di dashboard' },
                                  jadwal: { icon: Plane, label: 'Buka daftar paket' },
                                }[card.target];
                                if (!linkMeta) return null;
                                const LinkIcon = linkMeta.icon;
                                return (
                                  <button
                                    key={`link-${card.target}-${idx}`}
                                    type="button"
                                    onClick={() => openLinkTarget(card.target)}
                                    className="flex min-h-[44px] w-full items-center gap-2.5 rounded-2xl border border-dashed border-gray-300 bg-transparent px-3 py-2 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-600 dark:hover:bg-slate-800/60"
                                  >
                                    <LinkIcon size={15} className="shrink-0 text-gray-400 dark:text-slate-500" />
                                    <span className="flex-1 text-[11.5px] font-semibold text-gray-600 dark:text-slate-300">{linkMeta.label}</span>
                                    <ChevronRight size={14} className="shrink-0 text-gray-300 dark:text-slate-600" />
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Catatan sumber + tombol reset berbagi satu baris:
                              keduanya metadata/aksi sekunder yang muat
                              berdampingan. flex-wrap menjaga perilaku turun
                              baris di layar sangat sempit. */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {sourceNote && !errorText ? (
                              <div className="flex min-w-0 items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500">
                                <Clock size={10} className="shrink-0" />
                                <span className="truncate">{sourceNote}</span>
                              </div>
                            ) : <span />}

                            <button
                              type="button"
                              onClick={resetToIdle}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-purple-200 px-3 py-2 text-[11px] font-semibold text-purple-600 transition-colors hover:bg-purple-50 active:scale-95 dark:border-purple-800/60 dark:text-purple-400 dark:hover:bg-purple-900/20"
                            >
                              <RefreshCw size={12} strokeWidth={2.4} />
                              Tanya yang lain
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Input bar */}
                <div
                  className="shrink-0 border-t border-gray-100 bg-white px-4 pt-2.5 dark:border-slate-700 dark:bg-slate-900"
                  // Saat keyboard terbuka, home-indicator tidak ada di bawah bar
                  // ini — env(safe-area-inset-bottom) yang ikut berubah justru
                  // jadi sumber reflow ketiga. Dibekukan, bukan dibuang.
                  style={{ paddingBottom: keyboardOpen ? '0.625rem' : 'max(0.625rem, env(safe-area-inset-bottom))' }}
                >
                  <form
                    onSubmit={(e) => { e.preventDefault(); if (phase === 'loading') return; ask(input); }}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      maxLength={QUESTION_MAX_LEN}
                      // readOnly, BUKAN disabled: men-disable input yang sedang
                      // fokus membuat iOS membongkar lalu memasang ulang keyboard
                      // tiap kali kirim — viewport melompat sekali per submit.
                      // Guard aslinya pindah ke onSubmit + tombol kirim.
                      readOnly={phase === 'loading'}
                      aria-disabled={phase === 'loading'}
                      placeholder="Tanyakan paket atau jamaah Anda…"
                      aria-label="Pertanyaan untuk Bani"
                      className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12.5px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 read-only:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={phase === 'loading' || !input.trim()}
                      aria-label="Kirim pertanyaan"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 to-purple-800 text-white shadow-md shadow-purple-500/25 transition-transform active:scale-95 disabled:opacity-40"
                    >
                      <Send size={17} strokeWidth={2.2} />
                    </button>
                  </form>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function BaniThinkingState({ step, reduceMotion }: { step: number; reduceMotion: boolean }) {
  const safeStep = Math.max(0, Math.min(step, THINKING_STEPS.length - 1));
  const StepIcon = THINKING_ICONS[safeStep];

  return (
    <div className="flex items-start gap-2" aria-live="polite">
      <div className="relative mt-1 shrink-0">
        {!reduceMotion && (
          <motion.span
            aria-hidden="true"
            className="absolute -inset-1 rounded-full border border-fuchsia-400/50"
            animate={{ scale: [0.92, 1.2], opacity: [0.65, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <BaniAvatar className="relative h-8 w-8" state="thinking" />
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl rounded-tl-md border border-fuchsia-100 bg-gradient-to-br from-white via-fuchsia-50/60 to-emerald-50/70 px-3.5 py-3 shadow-sm dark:border-fuchsia-900/40 dark:from-slate-800 dark:via-fuchsia-950/20 dark:to-emerald-950/20">
        {!reduceMotion && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/5"
            animate={{ x: ['0%', '400%'] }}
            transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        )}

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={safeStep}
            initial={reduceMotion ? false : { opacity: 0, y: 7, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -7, filter: 'blur(4px)' }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex items-center gap-2.5"
          >
            <motion.span
              initial={reduceMotion ? false : { scale: 0.65, rotate: -16 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 480, damping: 24 }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-700 text-white shadow-sm shadow-fuchsia-500/25"
            >
              <StepIcon size={15} strokeWidth={2.3} />
            </motion.span>
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-gray-800 dark:text-white">
                {THINKING_STEPS[safeStep]}
              </div>
              <div className="mt-0.5 truncate text-[10.5px] text-gray-500 dark:text-slate-400">
                {THINKING_DETAILS[safeStep]}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="relative z-10 mt-3 flex gap-1.5" aria-hidden="true">
          {THINKING_STEPS.map((_, index) => (
            <span key={index} className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200/80 dark:bg-slate-700">
              <motion.span
                className="block h-full origin-left rounded-full bg-gradient-to-r from-fuchsia-500 to-emerald-400"
                initial={false}
                animate={{ scaleX: index <= safeStep ? 1 : 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BaniBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <BaniAvatar className="mt-0.5 h-7 w-7 shrink-0" />
      <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-gray-100 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-gray-700 dark:bg-slate-800 dark:text-slate-200">
        {children}
      </div>
    </div>
  );
}
