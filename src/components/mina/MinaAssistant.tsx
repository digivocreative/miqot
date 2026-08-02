// Mina — asisten AI in-app untuk agent: FAB + bottom sheet tanya-jawab.
//
// Single-shot: SATU tanya, SATU jawab. Pertanyaan baru MENGGANTI layar, bukan
// menumpuk jadi thread, dan tidak ada riwayat yang disimpan di mana pun.
//
// Isi kartu TIDAK PERNAH ditulis model — server (lib/mina-orchestrator.js)
// meng-hydrate `cards` dari hasil tool, komponen ini hanya merendernya.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tent, Send, X, Clock, ChevronRight, Calendar, Wallet, Cake, Plane,
  Users, CalendarRange, MessageCircle, RefreshCw,
} from 'lucide-react';
import { getAuthHeaders } from '../LoginPage';
import { normalizeWaNumber } from '../../utils/phone';

type MinaCard =
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
const THINKING_INTERVAL_MS = 850;

const SUGGESTIONS = [
  { icon: Calendar, text: 'Paket apa saja yang tahun baru 2027-nya di Mekkah?', tone: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { icon: Wallet, text: 'Siapa saja yang belum lunas?', tone: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  { icon: Cake, text: 'Ada jamaah ulang tahun minggu ini?', tone: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/20' },
  { icon: Plane, text: 'Berapa jamaah saya berangkat bulan ini?', tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
];

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

export function renderMinaMarkdown(text: string): string {
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

export default function MinaAssistant({ slug, onNavigate }: { slug: string; onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [input, setInput] = useState('');
  const [asked, setAsked] = useState('');
  const [answer, setAnswer] = useState('');
  const [cards, setCards] = useState<MinaCard[]>([]);
  const [sourceNote, setSourceNote] = useState('');
  const [errorText, setErrorText] = useState('');
  const [thinkingStep, setThinkingStep] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportTop, setViewportTop] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const closeSheet = useCallback(() => {
    // Respons yang datang setelah sheet ditutup diabaikan (lihat guard di ask()).
    abortRef.current?.abort();
    abortRef.current = null;
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
    const update = () => {
      if (vv) {
        setViewportHeight(vv.height);
        setViewportTop(vv.offsetTop);
      } else {
        setViewportHeight(window.innerHeight);
        setViewportTop(0);
      }
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
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
      const res = await fetch('/api/mina/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (controller.signal.aborted) return; // sheet ditutup saat menunggu

      if (res.status === 429) {
        const minutes = Math.max(1, Math.ceil(Number(data?.retryAfterSeconds || 0) / 60));
        setErrorText(`Batas tanya Mina tercapai. Coba lagi dalam ±${minutes} menit ya.`);
      } else if (!res.ok || !data) {
        setErrorText(data?.error || 'Mina lagi tidak bisa menjawab. Coba lagi sebentar lagi.');
      } else if (data.success === false) {
        setErrorText(data.error || 'Mina lagi tidak bisa menjawab. Coba lagi sebentar lagi.');
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

  const answerHtml = useMemo(() => (answer ? renderMinaMarkdown(answer) : ''), [answer]);

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
        <span className="rounded-full border border-gray-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Tanya Mina
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka Mina, asisten AI"
          tabIndex={open ? -1 : undefined}
          className="relative flex h-[60px] w-[60px] items-center justify-center active:scale-95 transition-transform"
        >
          {/* Cincin conic berputar (animasi mati saat prefers-reduced-motion). */}
          <span
            aria-hidden="true"
            className="mina-fab-ring absolute inset-[-2.5px] rounded-full"
            style={{ background: 'conic-gradient(#d946ef, #a855f7, #34d399, #d946ef)' }}
          />
          <span className="relative flex h-[60px] w-[60px] items-center justify-center rounded-full border-[2.5px] border-gray-100 bg-gradient-to-br from-fuchsia-600 to-purple-800 shadow-lg shadow-purple-500/30 dark:border-slate-950">
            <Tent size={26} strokeWidth={2.1} className="text-white" />
          </span>
          <span className="absolute right-0.5 top-0.5 z-10 h-3 w-3 rounded-full border-2 border-gray-100 bg-emerald-400 animate-pulse motion-reduce:animate-none dark:border-slate-950" />
        </button>
      </div>

      {/* ── Sheet ── */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="mina-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              onClick={closeSheet}
              className="fixed inset-0 z-[9980] bg-slate-950/60 backdrop-blur-[2px]"
            />
            <div
              className="pointer-events-none fixed left-0 right-0 z-[9990] flex items-end justify-center"
              style={{ top: viewportTop, height: sheetHeight }}
            >
              <motion.div
                key="mina-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Mina, asisten agent"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto flex h-[min(92dvh,780px)] max-h-full w-full max-w-lg flex-col rounded-t-3xl border border-b-0 border-gray-100 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              >
                {/* Header */}
                <div className="shrink-0 rounded-t-3xl px-4 pb-3 pt-2">
                  <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200 dark:bg-slate-700" />
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 to-purple-800">
                        <Tent size={19} strokeWidth={2.1} className="text-white" />
                      </div>
                      <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400 dark:border-slate-900" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-gray-800 dark:text-white">Mina</div>
                      <div className="truncate text-[10.5px] text-gray-500 dark:text-slate-500">
                        Asisten Miqot · tahu paket &amp; data jamaah Anda
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeSheet}
                      aria-label="Tutup Mina"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100/80 text-gray-600 transition-colors hover:bg-gray-200 active:scale-95 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {/* Konten */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4">
                  {phase === 'idle' && (
                    <div className="space-y-4">
                      <MinaBubble>
                        <span
                          dangerouslySetInnerHTML={{
                            __html: renderMinaMarkdown(
                              "Assalamu'alaikum! Saya **Mina**, asisten Anda di Miqot. Tanyakan apa saja soal **paket** atau **jamaah Anda** — saya carikan datanya.",
                            ),
                          }}
                        />
                      </MinaBubble>
                      <div>
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                          Coba tanyakan
                        </div>
                        <div className="flex flex-col gap-2">
                          {SUGGESTIONS.map(({ icon: Icon, text, tone, bg }) => (
                            <button
                              key={text}
                              type="button"
                              onClick={() => ask(text)}
                              className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-2.5 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/60"
                            >
                              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                                <Icon size={15} strokeWidth={2.2} className={tone} />
                              </span>
                              <span className="flex-1 text-[12px] font-medium text-gray-700 dark:text-slate-200">{text}</span>
                              <ChevronRight size={15} className="shrink-0 text-gray-300 dark:text-slate-600" />
                            </button>
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
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-slate-400">
                            <span>{THINKING_STEPS[thinkingStep]}</span>
                            <span className="flex gap-1">
                              {[0, 1, 2].map((i) => (
                                <span
                                  key={i}
                                  className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-bounce motion-reduce:animate-none"
                                  style={{ animationDelay: `${i * 140}ms` }}
                                />
                              ))}
                            </span>
                          </div>
                          {[0, 1].map((i) => (
                            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100 motion-reduce:animate-none dark:bg-slate-800" />
                          ))}
                        </div>
                      )}

                      {phase === 'answer' && (
                        <div className="space-y-3">
                          <MinaBubble>
                            {errorText
                              ? <span className="text-gray-700 dark:text-slate-200">{errorText}</span>
                              : <span dangerouslySetInnerHTML={{ __html: answerHtml }} />}
                          </MinaBubble>

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
                                      className="w-full rounded-2xl border border-gray-100 bg-white p-3 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/60"
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
                                      <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2 dark:border-slate-700">
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
                                      className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
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
                                    className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-gray-300 bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-600 dark:hover:bg-slate-800/60"
                                  >
                                    <LinkIcon size={15} className="shrink-0 text-gray-400 dark:text-slate-500" />
                                    <span className="flex-1 text-[11.5px] font-semibold text-gray-600 dark:text-slate-300">{linkMeta.label}</span>
                                    <ChevronRight size={14} className="shrink-0 text-gray-300 dark:text-slate-600" />
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {sourceNote && !errorText && (
                            <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500">
                              <Clock size={10} />
                              <span>{sourceNote}</span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={resetToIdle}
                            className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 px-3 py-1.5 text-[11px] font-semibold text-purple-600 transition-colors hover:bg-purple-50 active:scale-95 dark:border-purple-800/60 dark:text-purple-400 dark:hover:bg-purple-900/20"
                          >
                            <RefreshCw size={12} strokeWidth={2.4} />
                            Tanya yang lain
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Input bar */}
                <div
                  className="shrink-0 border-t border-gray-100 bg-white px-4 pt-3 dark:border-slate-700 dark:bg-slate-900"
                  style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                >
                  <form
                    onSubmit={(e) => { e.preventDefault(); ask(input); }}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      maxLength={QUESTION_MAX_LEN}
                      disabled={phase === 'loading'}
                      placeholder="Tanyakan paket atau jamaah Anda…"
                      aria-label="Pertanyaan untuk Mina"
                      className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-[12.5px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
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

function MinaBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-600 to-purple-800">
        <Tent size={14} strokeWidth={2.1} className="text-white" />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-gray-100 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-gray-700 dark:bg-slate-800 dark:text-slate-200">
        {children}
      </div>
    </div>
  );
}
