// Bani — asisten AI in-app untuk agent, halaman penuh di /dashboard/bani
// (header sub-page + tombol kembali dirender DashboardLayout).
//
// Percakapan bertahap: pertanyaan baru MENAMBAH giliran, tidak mengganti layar.
// Riwayat hidup di klien (localStorage, 24 jam, terikat slug) dan dikirim balik
// ke server tiap request — server Bani sendiri tetap tanpa state.
//
// Isi kartu TIDAK PERNAH ditulis model — server (lib/bani-orchestrator.js)
// meng-hydrate `cards` dari hasil tool, komponen ini hanya merendernya.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Send, Clock, Calendar, Wallet, Cake, Plane, ArrowUpRight,
  Users, CalendarRange, Trash2, Building2, Calculator,
  Loader2, Check, ChevronRight, Copy, ExternalLink, FileText, ZoomIn,
} from 'lucide-react';
import { getPackages } from '@/services';
import type { UmrohPackage } from '@/types';
import type { LucideIcon } from 'lucide-react';
import {
  pickBaniSuggestions,
  rememberBaniSuggestions,
  type BaniSuggestion,
  type BaniSuggestionIcon,
} from '@/lib/baniSuggestions';
import { isComplexBaniAnswer } from '@/lib/baniAnswer';
import BaniAvatar from './BaniAvatar';
import { getAuthHeaders } from '../LoginPage';
import {
  BaniPaketTable,
  BaniJamaahTable,
  type BaniCard,
  type BaniPackageCard,
  type BaniJamaahCard,
  type BaniColumns,
} from './BaniResultTable';

// Viewer media & hasil kalkulasi memakai komponen fitur ASLINYA — modal yang
// sama dengan "Brosur Paket"/"Itinerary" di Jadwal dan "Hasil Kalkulasi" di
// halaman Kalkulasi — bukan tiruan lokal. Lazy: ItineraryModal & KalkulasiResultModal
// menyeret react-pdf (berat), jadi baru diunduh saat benar-benar dibuka.
const BrochureModal = lazy(() => import('../BrochureModal').then((m) => ({ default: m.BrochureModal })));
const ItineraryModal = lazy(() => import('../ItineraryModal').then((m) => ({ default: m.ItineraryModal })));
const KalkulasiResultModal = lazy(() => import('../KalkulasiResultModal').then((m) => ({ default: m.KalkulasiResultModal })));

// Identitas agent untuk personalisasi modal itinerary & PDF quotation —
// strukturnya sengaja sama dengan AgentData (src/data/agents.ts).
export type BaniAgentInfo = { name: string; phone: string; photo: string; website: string };

type Phase = 'idle' | 'loading' | 'answer';
// 'unlinked' = Telegram agent belum terhubung; ditangani terpisah dari 'error'
// karena solusinya bukan "coba lagi" melainkan membuka Pengaturan.
type TelegramPhase = 'idle' | 'sending' | 'sent' | 'error' | 'unlinked';

const QUESTION_MAX_LEN = 500;
const THINKING_STEPS = ['Membaca pertanyaan…', 'Membuka data…', 'Menyusun jawaban…'];
const THINKING_INTERVAL_MS = 1_250;
const VISIBLE_SUGGESTION_COUNT = 4;

// Isi daftar saran + pengundinya ada di src/lib/baniSuggestions.js (teruji di
// tests/bani-suggestions.test.js), termasuk aturan yang menjaga daftar itu tetap
// sehat. Di sini tinggal pemetaan ikon dan ingatan "baru saja tampil".
const SUGGESTION_ICONS: Record<BaniSuggestionIcon, LucideIcon> = {
  plane: Plane,
  clock: Clock,
  wallet: Wallet,
  calculator: Calculator,
  building: Building2,
  users: Users,
  cake: Cake,
  calendar: Calendar,
  'calendar-range': CalendarRange,
};

const SUGGESTION_MEMORY_KEY = 'baniRecentSuggestions';

// Server yang belum di-deploy tidak mengirim `columns`. Fail-safe: pakai kolom
// netral yang sama dengan default server, bukan layar kosong.
const DEFAULT_COLUMNS: BaniColumns = { paket: ['berangkat', 'harga'], jamaah: ['berangkat'] };

// Media hasil validasi server (hydrateBaniMedia): url dijamin https, tapi data
// ini juga dibaca balik dari localStorage — saring lagi di sini.
export type BaniMediaItem = {
  type: 'brosur' | 'itinerary';
  jadwal_id: string | null;
  nama: string | null;
  url: string;
};

function readMedia(value: unknown): BaniMediaItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((m): m is BaniMediaItem => {
      const x = (m || {}) as Record<string, unknown>;
      return (x.type === 'brosur' || x.type === 'itinerary')
        && typeof x.url === 'string' && /^https:\/\//i.test(x.url);
    })
    .slice(0, 4);
}

// Kartu kalkulasi (hydrateBaniKalkulasi): angka dihitung server dari tool
// kalkulasi_harga — formula yang sama dengan halaman Kalkulasi. Data ini juga
// dibaca balik dari localStorage, jadi divalidasi ulang fail-closed di sini:
// satu item cacat membatalkan seluruh kartunya (rincian uang setengah jadi
// lebih menyesatkan daripada tidak ada).
export type BaniKalkulasiItem = {
  jadwal_id: string | null;
  nama: string | null;
  tier: string;
  items: { label: string; qty: number; harga_satuan: number; total: number; catatan: string | null }[];
  subtotal: number;
  diskon: number;
  grand_total: number;
};

function readKalkulasi(value: unknown): BaniKalkulasiItem[] {
  if (!Array.isArray(value)) return [];
  const out: BaniKalkulasiItem[] = [];
  for (const raw of value.slice(0, 2)) {
    const k = (raw || {}) as Record<string, unknown>;
    if (!Array.isArray(k.items) || !k.items.length || k.items.length > 12) continue;
    const money = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const subtotal = money(k.subtotal);
    const diskon = money(k.diskon);
    const grandTotal = money(k.grand_total);
    if (subtotal === null || diskon === null || grandTotal === null) continue;
    const items: BaniKalkulasiItem['items'] = [];
    for (const rawItem of k.items) {
      const x = (rawItem || {}) as Record<string, unknown>;
      const qty = typeof x.qty === 'number' && Number.isInteger(x.qty) && x.qty > 0 ? x.qty : null;
      const hargaSatuan = money(x.harga_satuan);
      const total = money(x.total);
      if (typeof x.label !== 'string' || !x.label.trim() || qty === null || hargaSatuan === null || total === null) {
        items.length = 0;
        break;
      }
      items.push({
        label: x.label,
        qty,
        harga_satuan: hargaSatuan,
        total,
        catatan: typeof x.catatan === 'string' && x.catatan ? x.catatan : null,
      });
    }
    if (!items.length) continue;
    out.push({
      jadwal_id: typeof k.jadwal_id === 'string' && k.jadwal_id ? k.jadwal_id : null,
      nama: typeof k.nama === 'string' && k.nama ? k.nama : null,
      tier: typeof k.tier === 'string' ? k.tier : '',
      items,
      subtotal,
      diskon,
      grand_total: grandTotal,
    });
  }
  return out;
}

function readColumns(value: unknown): BaniColumns {
  const raw = (value || {}) as Partial<Record<keyof BaniColumns, unknown>>;
  const list = (v: unknown, fallback: string[]) => (
    Array.isArray(v) && v.length ? v.filter((k): k is string => typeof k === 'string') : fallback
  );
  return {
    paket: list(raw.paket, DEFAULT_COLUMNS.paket),
    jamaah: list(raw.jamaah, DEFAULT_COLUMNS.jamaah),
  };
}

// Percakapan bertahan lintas kunjungan halaman. Bani di-unmount tiap pindah tab
// (DashboardLayout merender per activeTab), jadi tanpa ini jawaban hilang begitu
// agent menekan back — padahal yang barusan ditanyakan sering masih dibutuhkan.
//
// Kuncinya DIIKAT KE SLUG: satu perangkat bisa dipakai bergantian, dan jawaban
// Bani memuat nama serta nomor WA jamaah. Slug berbeda = percakapan tak terbaca.
const CONVERSATION_KEY = 'baniConversation';
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

export type BaniTurn = {
  question: string;
  answer: string;
  cards: BaniCard[];
  columns: BaniColumns;
  media: BaniMediaItem[];
  kalkulasi: BaniKalkulasiItem[];
  followUps: string[];
};

type StoredConversation = { slug: string; savedAt: number; turns: BaniTurn[] };

function readTurn(raw: unknown): BaniTurn | null {
  const t = (raw || {}) as Record<string, unknown>;
  if (typeof t.question !== 'string' || typeof t.answer !== 'string') return null;
  if (!t.question.trim() || !t.answer.trim()) return null;
  return {
    question: t.question,
    answer: t.answer,
    cards: Array.isArray(t.cards) ? (t.cards as BaniCard[]) : [],
    columns: readColumns(t.columns),
    media: readMedia(t.media),
    kalkulasi: readKalkulasi(t.kalkulasi),
    followUps: Array.isArray(t.followUps) ? t.followUps.filter((x): x is string => typeof x === 'string') : [],
  };
}

function readStoredTurns(slug: string): BaniTurn[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CONVERSATION_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return [];
    // Milik agent lain atau sudah basi → dihapus, bukan sekadar diabaikan.
    // Jawaban Bani memuat nama dan nomor WA jamaah; membiarkannya menunggu
    // tertimpa berarti data itu tetap ada di perangkat tanpa alasan.
    if (raw.slug !== slug || !Number.isFinite(raw.savedAt) || Date.now() - raw.savedAt > CONVERSATION_TTL_MS) {
      clearStoredConversation();
      return [];
    }
    const turns = Array.isArray(raw.turns) ? raw.turns.map(readTurn).filter(Boolean) : [];
    return turns as BaniTurn[];
  } catch {
    return [];
  }
}

function writeStoredTurns(slug: string, turns: BaniTurn[]) {
  try {
    const value: StoredConversation = { slug, savedAt: Date.now(), turns };
    window.localStorage.setItem(CONVERSATION_KEY, JSON.stringify(value));
  } catch {
    // Mode privat / storage penuh: percakapan tetap tampil, hanya tidak awet.
  }
}

function clearStoredConversation() {
  try {
    window.localStorage.removeItem(CONVERSATION_KEY);
  } catch {
    // noop — sama seperti di atas.
  }
}

function readRecentSuggestions(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SUGGESTION_MEMORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

// Undi 4 saran lalu catat yang tampil. Tanpa catatan ini undian murni acak
// mengulang 1–2 saran yang sama tiap kunjungan (4 dari 4 grup), dan Bani terasa
// menawarkan pertanyaan yang itu-itu saja.
function drawSuggestions(): BaniSuggestion[] {
  const recent = readRecentSuggestions();
  const picked = pickBaniSuggestions(VISIBLE_SUGGESTION_COUNT, recent);
  try {
    window.localStorage.setItem(
      SUGGESTION_MEMORY_KEY,
      JSON.stringify(rememberBaniSuggestions(recent, picked)),
    );
  } catch {
    // Mode privat / storage penuh: undian tetap jalan, hanya tanpa ingatan.
  }
  return picked;
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
    blocks.push(`<p class="mt-2 first:mt-0">${paragraph.map(applyBold).join('<br>')}</p>`);
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

export default function BaniPage({ slug, agent = null, onNavigate }: {
  slug: string;
  agent?: BaniAgentInfo | null;
  onNavigate: (path: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  // Dibaca sekali saat mount: percakapan terakhir (maksimal 24 jam) langsung
  // tampil, jadi back lalu masuk lagi tidak menghapus apa pun.
  const [turns, setTurns] = useState<BaniTurn[]>(() => readStoredTurns(slug));
  const [input, setInput] = useState('');
  // Pertanyaan yang sedang diproses; ditampilkan sebagai gelembung sendiri di
  // ujung percakapan supaya agent melihat apa yang barusan dikirim.
  const [pending, setPending] = useState<string | null>(null);
  // Percobaan yang gagal BUKAN giliran: tidak ada jawaban untuk dikirim sebagai
  // riwayat, jadi disimpan terpisah dan hilang begitu pertanyaan berikutnya masuk.
  const [failed, setFailed] = useState<{ question: string; error: string } | null>(null);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [telegramPhase, setTelegramPhase] = useState<TelegramPhase>('idle');
  const [telegramError, setTelegramError] = useState('');
  // Diundi ulang tiap kunjungan halaman DAN tiap percakapan dibersihkan — halaman
  // ini di-unmount saat pindah tab (DashboardLayout merender per activeTab), jadi
  // initializer ini memang berjalan lagi setiap Bani dibuka.
  const [suggestions, setSuggestions] = useState<BaniSuggestion[]>(drawSuggestions);

  const phase: Phase = pending ? 'loading' : (turns.length || failed) ? 'answer' : 'idle';
  const lastTurn = turns.length ? turns[turns.length - 1] : null;

  const abortRef = useRef<AbortController | null>(null);

  // Respons yang datang setelah halaman ditinggalkan diabaikan (guard di ask()).
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const clearConversation = useCallback(() => {
    clearStoredConversation();
    setTurns([]);
    setPending(null);
    setFailed(null);
    setTelegramPhase('idle');
    setTelegramError('');
    setInput('');
    // Layar kosong berarti agent memulai dari nol — saran yang barusan dipakai
    // tidak perlu disodorkan lagi.
    setSuggestions(drawSuggestions());
  }, []);

  // Microcopy "berpikir" murni klien — server v1 tidak streaming.
  useEffect(() => {
    if (phase !== 'loading') return;
    setThinkingStep(0);
    const t = setInterval(() => setThinkingStep((s) => (s + 1) % THINKING_STEPS.length), THINKING_INTERVAL_MS);
    return () => clearInterval(t);
  }, [phase]);

  // Percakapan tumbuh ke bawah, jadi yang dikejar ujung terbaru — bukan puncak
  // halaman seperti waktu Bani masih satu tanya satu jawab. Kunjungan pertama
  // memakai lompatan langsung: memutar animasi menyusuri percakapan kemarin
  // hanya membuat halaman terasa berkedut saat dibuka.
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrolledOnceRef = useRef(false);
  useEffect(() => {
    if (phase === 'idle') return;
    bottomRef.current?.scrollIntoView({
      behavior: scrolledOnceRef.current && !reduceMotion ? 'smooth' : 'auto',
      block: 'end',
    });
    scrolledOnceRef.current = true;
  }, [turns.length, pending, failed, phase, reduceMotion]);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim().slice(0, QUESTION_MAX_LEN);
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Riwayat yang dikirim diambil dari state SAAT INI lewat updater, bukan dari
    // closure: dua pertanyaan beruntun tanpa ini akan mengirim riwayat yang sama.
    let historyForRequest: BaniTurn[] = [];
    setTurns((prev) => { historyForRequest = prev; return prev; });

    setInput('');
    setFailed(null);
    setPending(trimmed);
    setTelegramPhase('idle');
    setTelegramError('');

    try {
      const res = await fetch('/api/bani/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          question: trimmed,
          // Teks + REFERENSI kartu yang tampil (id & nama saja): tanpa ini,
          // "paket ini" tidak punya jangkar dan model menebak paket lain. Isi
          // kartu tetap TIDAK dikirim balik — data selalu dari tool putaran ini.
          history: historyForRequest.map((t) => ({
            question: t.question,
            answer: t.answer,
            shown: t.cards.slice(0, 6).map((c) => (
              c.type === 'package'
                ? { type: 'package', id: c.jadwal_id, nama: c.nama }
                : { type: 'jamaah', id: c.jm_id, nama: c.nama }
            )),
          })),
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (controller.signal.aborted) return; // halaman ditinggalkan saat menunggu

      const fail = (error: string) => setFailed({ question: trimmed, error });

      if (res.status === 429) {
        const minutes = Math.max(1, Math.ceil(Number(data?.retryAfterSeconds || 0) / 60));
        fail(`Batas tanya Bani tercapai. Coba lagi dalam ±${minutes} menit ya.`);
      } else if (!res.ok || !data || data.success === false) {
        fail(data?.error || 'Bani lagi tidak bisa menjawab. Coba lagi sebentar lagi.');
      } else {
        const turn: BaniTurn = {
          question: trimmed,
          answer: String(data.answer || ''),
          cards: Array.isArray(data.cards) ? data.cards : [],
          columns: readColumns(data.columns),
          media: readMedia(data.media),
          kalkulasi: readKalkulasi(data.kalkulasi),
          followUps: Array.isArray(data.follow_ups)
            ? data.follow_ups.filter((t: unknown): t is string => typeof t === 'string' && Boolean(t.trim()))
            : [],
        };
        setTurns((prev) => {
          const next = [...prev, turn];
          // Hanya percakapan berhasil yang diawetkan; layar error tidak perlu
          // hidup lagi besok pagi.
          writeStoredTurns(slug, next);
          return next;
        });
      }
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
      setFailed({ question: trimmed, error: 'Koneksinya sedang bermasalah. Coba tanya lagi sebentar lagi ya.' });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPending(null);
      }
    }
  }, [slug]);

  const openPackage = useCallback((jadwalId: string | null) => {
    if (!jadwalId) return;
    window.open(`/${slug}/${jadwalId}`, '_blank', 'noopener,noreferrer');
  }, [slug]);

  // Tombol aksi & saran lanjutan menempel di UJUNG percakapan dan bekerja pada
  // giliran terakhir — itu yang barusan dibaca agent.
  const canSendTelegram = useMemo(
    () => Boolean(lastTurn) && isComplexBaniAnswer(lastTurn!.answer, lastTurn!.cards),
    [lastTurn],
  );

  // Saran lanjutan dari model kadang kosong (format gagal, atau memang tidak ada
  // yang wajar ditanyakan). Undian generik lebih berguna daripada ruang kosong.
  const followUpChips = useMemo(() => {
    if (!lastTurn) return [];
    if (lastTurn.followUps.length) return lastTurn.followUps;
    return pickBaniSuggestions(3, turns.map((t) => t.question)).map((s) => s.text);
  }, [lastTurn, turns]);

  const sendToTelegram = useCallback(async () => {
    if (!lastTurn) return;
    setTelegramPhase('sending');
    setTelegramError('');
    try {
      const res = await fetch('/api/bani/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ question: lastTurn.question, answer: lastTurn.answer, cards: lastTurn.cards }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        setTelegramPhase('sent');
        return;
      }
      if (data?.code === 'telegram_not_connected') {
        setTelegramPhase('unlinked');
        setTelegramError(data?.error || 'Telegram Anda belum terhubung.');
        return;
      }
      setTelegramPhase('error');
      setTelegramError(data?.error || 'Gagal mengirim ke Telegram. Coba lagi sebentar lagi.');
    } catch {
      setTelegramPhase('error');
      setTelegramError('Koneksinya sedang bermasalah. Coba kirim lagi sebentar lagi.');
    }
  }, [lastTurn]);

  return (
    <div className="flex w-full flex-1 flex-col">
      {/* Konten */}
      <div className="flex-1 px-4 py-4">
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
            {/* Gaya disamakan dengan chip "Pertanyaan populer" di AskAIModal
                (Diskusi AI di Jadwal): kartu emerald, diam selama tampil —
                pergantian saran terjadi saat diundi ulang, bukan beranimasi
                sendiri di depan mata. */}
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-400">
                Coba tanyakan
              </div>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((suggestion) => {
                  const Icon = SUGGESTION_ICONS[suggestion.icon];
                  return (
                    <button
                      key={suggestion.text}
                      type="button"
                      onClick={() => ask(suggestion.text)}
                      className="text-left p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/15 active:scale-[0.96] transition-all"
                    >
                      <div className="flex items-start gap-1.5">
                        <Icon size={13} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span className="text-[11px] font-medium text-gray-700 dark:text-slate-200 leading-snug">
                          {suggestion.text}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {phase !== 'idle' && (
          <div className="space-y-3">
            {turns.map((turn, idx) => (
              <BaniTurnView key={idx} turn={turn} slug={slug} agent={agent} onOpenPackage={openPackage} />
            ))}

            {pending && (
              <div className="space-y-3">
                <BaniAskedBubble text={pending} />
                <BaniThinkingState step={thinkingStep} reduceMotion={Boolean(reduceMotion)} />
              </div>
            )}

            {/* Percobaan gagal tampil di tempatnya sebagai giliran semu, lalu
                lenyap saat pertanyaan berikutnya dikirim — tidak ikut jadi
                riwayat karena tidak ada jawaban yang bisa dirujuk. */}
            {failed && (
              <div className="space-y-3">
                <BaniAskedBubble text={failed.question} />
                <BaniBubble>
                  <span className="text-gray-700 dark:text-slate-200">{failed.error}</span>
                </BaniBubble>
              </div>
            )}

            {!pending && (lastTurn || failed) && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canSendTelegram && (
                  <button
                    type="button"
                    onClick={sendToTelegram}
                    disabled={telegramPhase === 'sending' || telegramPhase === 'sent'}
                    className="mr-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-200 bg-white px-3 py-2 text-[11px] font-semibold text-sky-700 shadow-sm transition-colors hover:bg-sky-50 active:scale-95 disabled:opacity-60 dark:border-sky-800/60 dark:bg-slate-800 dark:text-sky-400 dark:shadow-none dark:hover:bg-slate-700"
                  >
                    {telegramPhase === 'sending' ? <Loader2 size={12} strokeWidth={2.4} className="animate-spin" />
                      : telegramPhase === 'sent' ? <Check size={12} strokeWidth={2.6} />
                        : <Send size={12} strokeWidth={2.4} />}
                    {telegramPhase === 'sending' ? 'Mengirim…'
                      : telegramPhase === 'sent' ? 'Terkirim ke Telegram'
                        : 'Kirim ke Telegram'}
                  </button>
                )}

                {/* Percakapan bertahan 24 jam, jadi yang dibutuhkan bukan
                    "mulai lagi" melainkan cara membuangnya. */}
                <button
                  type="button"
                  onClick={clearConversation}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-600 shadow-sm transition-colors hover:bg-gray-50 active:scale-95 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:shadow-none dark:hover:bg-slate-700"
                >
                  <Trash2 size={12} strokeWidth={2.4} />
                  Bersihkan percakapan
                </button>
              </div>
            )}

            {telegramError && (
              <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-gray-500 dark:text-slate-400">
                <span>{telegramError}</span>
                {telegramPhase === 'unlinked' && (
                  <button
                    type="button"
                    onClick={() => onNavigate('/dashboard/settings/telegram')}
                    className="font-semibold text-sky-600 underline underline-offset-2 dark:text-sky-400"
                  >
                    Hubungkan Telegram
                  </button>
                )}
              </div>
            )}

            {/* Menggantikan tombol "Tanya yang lain": setelah membaca jawaban,
                yang berguna bukan mengosongkan layar melainkan tahu apa lagi
                yang bisa ditanyakan. Isinya dari model (nyangkut ke jawaban
                barusan), jatuh ke undian generik bila kosong. */}
            {!pending && !failed && followUpChips.length > 0 && (
              <div className="pt-1">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-400">
                  Lanjutkan dengan
                </div>
                <div className="flex flex-col gap-1.5">
                  {followUpChips.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => ask(text)}
                      className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-left transition-all active:scale-[0.96] dark:border-emerald-800/40 dark:bg-emerald-900/15"
                    >
                      <ArrowUpRight size={14} className="mt-[3px] flex-shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <span className="text-[12.5px] font-medium leading-snug text-gray-700 dark:text-slate-200">{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar — sticky di dasar halaman: saat jawaban panjang di-scroll
          tetap terlihat, dan saat konten pendek tertahan di bawah oleh flex-1
          pada area konten. */}
      <div
        className="sticky bottom-0 border-t border-gray-100 bg-white px-4 pt-2.5 dark:border-slate-700 dark:bg-slate-900"
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      >
        <form
          onSubmit={(e) => { e.preventDefault(); if (phase === 'loading') return; ask(input); }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={QUESTION_MAX_LEN}
            // readOnly, BUKAN disabled: men-disable input yang sedang
            // fokus membuat iOS membongkar lalu memasang ulang keyboard
            // tiap kali kirim — viewport melompat sekali per submit.
            // Guard aslinya pindah ke onSubmit + tombol kirim.
            readOnly={phase === 'loading'}
            aria-disabled={phase === 'loading'}
            // Diperpendek karena input di perangkat sentuh 16px (aturan
            // anti-zoom global di index.css): placeholder yang panjang
            // terpotong di tengah kata. Kalimat penuhnya ada di aria-label.
            placeholder="Tanya paket & jamaah…"
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
    </div>
  );
}

// Satu giliran percakapan: pertanyaan agent, jawaban Bani, lalu tabelnya.
// Kolom tabel ikut giliran masing-masing — pertanyaan keberangkatan dan
// pertanyaan pelunasan di percakapan yang sama boleh punya kolom berbeda.
function BaniTurnView({ turn, slug, agent, onOpenPackage }: {
  turn: BaniTurn;
  slug: string;
  agent: BaniAgentInfo | null;
  onOpenPackage: (jadwalId: string | null) => void;
}) {
  const answerHtml = useMemo(() => (turn.answer ? renderBaniMarkdown(turn.answer) : ''), [turn.answer]);
  const paketRows = useMemo(
    () => turn.cards.filter((c): c is BaniPackageCard => c.type === 'package'),
    [turn.cards],
  );
  const jamaahRows = useMemo(
    () => turn.cards.filter((c): c is BaniJamaahCard => c.type === 'jamaah'),
    [turn.cards],
  );
  const [popupMedia, setPopupMedia] = useState<BaniMediaItem | null>(null);

  return (
    <div className="space-y-3">
      <BaniAskedBubble text={turn.question} />
      <BaniBubble>
        <span dangerouslySetInnerHTML={{ __html: answerHtml }} />
      </BaniBubble>

      {/* Media yang DIMINTA agent ("minta brosur", "tampilkan itinerary") —
          pratinjaunya tampil langsung, bukan sekadar tombol kecil di baris
          tabel. Brosur = gambar inline (ketuk → lightbox); itinerary = tombol
          Lihat Itinerary (ketuk → popup web view /:slug/:jadwalId/itinerary). */}
      {turn.media.length > 0 && (
        <div className="flex flex-col gap-2">
          {turn.media.map((m, i) => (
            m.type === 'brosur' ? (
              <button
                key={`media-${m.type}-${m.jadwal_id}-${i}`}
                type="button"
                onClick={() => setPopupMedia(m)}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm transition-transform active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:shadow-none"
              >
                <img
                  src={m.url}
                  alt={`Brosur ${m.nama || 'paket'}`}
                  loading="lazy"
                  className="max-h-[360px] w-full bg-gray-50 object-contain dark:bg-slate-900"
                />
                <span className="flex items-center gap-1.5 border-t border-gray-100 px-3 py-2 dark:border-slate-700">
                  <ZoomIn size={13} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-700 dark:text-slate-200">
                    Brosur — {m.nama || m.jadwal_id}
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-400 dark:text-slate-500">ketuk untuk memperbesar</span>
                </span>
              </button>
            ) : (
              <button
                key={`media-${m.type}-${m.jadwal_id}-${i}`}
                type="button"
                onClick={() => setPopupMedia(m)}
                className="flex min-h-[48px] items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:shadow-none dark:hover:bg-slate-700/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
                  <FileText size={16} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-bold text-gray-800 dark:text-white">Lihat Itinerary</span>
                  <span className="block truncate text-[10px] text-gray-500 dark:text-slate-400">{m.nama || m.jadwal_id}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-gray-300 dark:text-slate-600" />
              </button>
            )
          ))}
        </div>
      )}

      {(paketRows.length > 0 || jamaahRows.length > 0) && (
        <div className="flex flex-col gap-2">
          {paketRows.length > 0 && (
            <BaniPaketTable
              rows={paketRows}
              columns={turn.columns.paket}
              onOpen={onOpenPackage}
              // Tombol brosur di ekor baris membuka BrochureModal yang sama
              // dengan blok media — bukan tab baru berisi file mentah.
              onOpenBrosur={(row) => {
                if (row.brosur_url) {
                  setPopupMedia({ type: 'brosur', jadwal_id: row.jadwal_id, nama: row.nama, url: row.brosur_url });
                }
              }}
            />
          )}
          {jamaahRows.length > 0 && <BaniJamaahTable rows={jamaahRows} columns={turn.columns.jamaah} />}
        </div>
      )}

      {/* Hasil kalkulasi_harga — kartu rincian + aksi yang menyambung ke fitur
          Kalkulasi yang sudah ada (teks WA & PDF quotation yang sama persis). */}
      {turn.kalkulasi.length > 0 && (
        <div className="flex flex-col gap-2">
          {turn.kalkulasi.map((k, i) => (
            <BaniKalkulasiCard key={`kalkulasi-${k.jadwal_id}-${k.tier}-${i}`} item={k} slug={slug} agent={agent} />
          ))}
        </div>
      )}

      {/* Viewer media = komponen fitur aslinya, pola yang sama dengan lampiran
          AskAIModal: brosur → BrochureModal (zoom + Bagikan/Download), itinerary
          → ItineraryModal (render PDF + salin link share /:slug/:jadwalId/itinerary). */}
      {popupMedia?.type === 'brosur' && (
        <Suspense fallback={null}>
          <BrochureModal
            isOpen={true}
            onClose={() => setPopupMedia(null)}
            imageUrl={popupMedia.url}
            title={popupMedia.nama || popupMedia.jadwal_id || 'Paket'}
          />
        </Suspense>
      )}
      {popupMedia?.type === 'itinerary' && (
        <Suspense fallback={null}>
          <ItineraryModal
            isOpen={true}
            onClose={() => setPopupMedia(null)}
            fileUrl={popupMedia.url}
            title={popupMedia.nama || popupMedia.jadwal_id || 'Itinerary'}
            jadwalId={popupMedia.jadwal_id}
            agentSlug={slug}
            agentName={agent?.name || null}
            agentPhone={agent?.phone || null}
            agentPhoto={agent?.photo || null}
          />
        </Suspense>
      )}
    </div>
  );
}

// Kartu hasil kalkulasi. Angka datang dari server (tool kalkulasi_harga) dan
// sudah divalidasi readKalkulasi; kartu tinggal menyajikan + menyambungkan ke
// fitur Kalkulasi yang ada: Salin WA memakai buildKalkulasiWaText, tombol Hasil
// membuka KalkulasiResultModal (Copy/Share/PDF quotation persis halaman
// Kalkulasi), dan link Ubah membuka /:slug/kalkulasi?paket=… terprasetel.
const rupiahPenuh = (v: number) => 'Rp ' + v.toLocaleString('id-ID');

function BaniKalkulasiCard({ item, slug, agent }: { item: BaniKalkulasiItem; slug: string; agent: BaniAgentInfo | null }) {
  // Paket lengkap (penerbangan/hotel) memperkaya teks WA, header modal, dan PDF.
  // Diambil dari cache getPackages — kalau paketnya sudah hilang dari API, semua
  // aksi tetap jalan tanpa blok paket (pkg null aman di ketiganya).
  const [pkg, setPkg] = useState<UmrohPackage | null>(null);
  const [copied, setCopied] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // Modal baru di-mount setelah pernah dibuka: chunk react-pdf tidak ikut
  // terunduh untuk agent yang cuma membaca angkanya di kartu.
  const [modalMounted, setModalMounted] = useState(false);
  const pdfBlobRef = useRef<Blob | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!item.jadwal_id) return;
    let alive = true;
    getPackages()
      .then((r) => {
        if (alive && r.success) setPkg(r.packages.find((p) => p.jadwalId === item.jadwal_id) ?? null);
      })
      .catch(() => { /* tanpa pkg kartu tetap berfungsi */ });
    return () => { alive = false; };
  }, [item.jadwal_id]);

  // Bentuk summary yang dipakai KalkulasiResultModal/QuotationDocument
  // (unitPrice/note/discount) — kunci server memakai gaya harga_satuan/catatan.
  const summary = useMemo(() => ({
    items: item.items.map((x) => ({
      label: x.label,
      qty: x.qty,
      unitPrice: x.harga_satuan,
      total: x.total,
      note: x.catatan ?? undefined,
    })),
    subtotal: item.subtotal,
    discount: item.diskon,
    grandTotal: item.grand_total,
  }), [item]);

  const handleCopyWa = useCallback(async () => {
    try {
      const { buildKalkulasiWaText } = await import('../KalkulasiResultModal');
      await navigator.clipboard.writeText(buildKalkulasiWaText({ pkg, tier: item.tier, summary }));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard/chunk gagal — biarkan tombol kembali diam */ }
  }, [pkg, item.tier, summary]);

  const handleGeneratePdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      const { generateQuotationPdfBlob } = await import('../KalkulasiResultModal');
      const blob = await generateQuotationPdfBlob({
        pkg,
        tier: item.tier,
        summary,
        namaLengkap: '',
        agent,
        discountLabel: '',
      });
      pdfBlobRef.current = blob;
      setPdfNumPages(null);
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [pkg, item.tier, summary, agent]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-3 py-2.5 dark:border-slate-700">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white">
          <Calculator size={16} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold text-gray-800 dark:text-white">Kalkulasi Harga</span>
          <span className="block truncate text-[10px] text-gray-500 dark:text-slate-400">
            {item.nama || item.jadwal_id || 'Paket'}{item.tier ? ` · ${item.tier}` : ''}
          </span>
        </span>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        {item.items.map((x, i) => (
          <div key={i}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] font-semibold text-gray-700 dark:text-slate-200">{x.label}</span>
              <span className="text-[11.5px] font-bold tabular-nums text-gray-800 dark:text-white">{rupiahPenuh(x.total)}</span>
            </div>
            <div className="text-[10.5px] text-gray-500 dark:text-slate-400">
              {rupiahPenuh(x.harga_satuan)} × {x.qty} pax
            </div>
          </div>
        ))}
        {item.diskon > 0 && (
          <>
            <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-gray-200 pt-2 dark:border-slate-600">
              <span className="text-[10.5px] text-gray-500 dark:text-slate-400">Subtotal</span>
              <span className="text-[10.5px] tabular-nums text-gray-600 dark:text-slate-300">{rupiahPenuh(item.subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10.5px] text-emerald-700 dark:text-emerald-400">Potongan Diskon</span>
              <span className="text-[10.5px] tabular-nums text-emerald-700 dark:text-emerald-400">- {rupiahPenuh(item.diskon)}</span>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between gap-2 border-t border-gray-200 pt-2 dark:border-slate-600">
          <span className="text-[11px] font-bold text-gray-600 dark:text-slate-300">TOTAL</span>
          <span className="text-[14px] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">{rupiahPenuh(item.grand_total)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2.5 dark:border-slate-700">
        <button
          type="button"
          onClick={handleCopyWa}
          className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-[11.5px] font-bold text-emerald-700 transition-all active:scale-[0.97] dark:border-slate-600 dark:bg-slate-800 dark:text-emerald-400"
        >
          {copied ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={2.2} />}
          {copied ? 'Tersalin' : 'Salin WA'}
        </button>
        <button
          type="button"
          onClick={() => { setModalMounted(true); setModalOpen(true); }}
          className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-[11.5px] font-bold text-white shadow-sm transition-all active:scale-[0.97]"
        >
          <FileText size={14} strokeWidth={2.2} />
          Hasil & PDF
        </button>
      </div>

      {item.jadwal_id && (
        <a
          href={`/${slug}/kalkulasi?paket=${encodeURIComponent(item.jadwal_id)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 border-t border-gray-100 px-3 py-2 text-[10.5px] font-semibold text-gray-500 transition-colors hover:text-emerald-700 dark:border-slate-700 dark:text-slate-400 dark:hover:text-emerald-400"
        >
          <ExternalLink size={11} strokeWidth={2.2} />
          Ubah di halaman Kalkulasi
        </a>
      )}

      {modalMounted && (
        <Suspense fallback={null}>
          <KalkulasiResultModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            pkg={pkg}
            tier={item.tier}
            summary={summary}
            catatan=""
            namaLengkap=""
            discountLabel=""
            onGeneratePDF={handleGeneratePdf}
            pdfBlobRef={pdfBlobRef}
            pdfPreviewUrl={pdfPreviewUrl}
            pdfLoading={pdfLoading}
            pdfNumPages={pdfNumPages}
            setPdfNumPages={setPdfNumPages}
            pdfEnabled={true}
          />
        </Suspense>
      )}
    </div>
  );
}

function BaniAskedBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      {/* emerald-700, bukan emerald-500: putih di atas emerald-500 cuma 2,6:1 —
          di bawah ambang WCAG AA (4,5:1) untuk teks 12,5px. emerald-700 memberi
          5,5:1 dan tetap terbaca sebagai "terkirim" di kedua mode. */}
      <div className="max-w-[88%] rounded-2xl rounded-br-md bg-emerald-700 px-3.5 py-2.5 text-[13.5px] font-medium leading-relaxed text-white">
        {text}
      </div>
    </div>
  );
}

function BaniThinkingState({ step, reduceMotion }: { step: number; reduceMotion: boolean }) {
  const safeStep = Math.max(0, Math.min(step, THINKING_STEPS.length - 1));

  return (
    <div className="flex gap-2" aria-live="polite">
      <BaniAvatar className="mt-0.5 h-7 w-7 shrink-0" state="thinking" />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:shadow-none">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-slate-500"
              animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
            />
          ))}
        </span>
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={safeStep}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="text-[12px] text-gray-500 dark:text-slate-400"
          >
            {THINKING_STEPS[safeStep]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

function BaniBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <BaniAvatar className="mt-0.5 h-7 w-7 shrink-0" />
      {/* Putih bertepi, BUKAN bg-gray-100: latar halaman Bani adalah gradien
          gray-50 → gray-100, jadi gelembung abu melebur ke halaman di bagian
          bawah layar. Di mode gelap slate-800 vs slate-900 sudah terpisah. */}
      {/* 13,5px, bukan 12,5px seperti sisa dashboard: ini satu-satunya prosa
          panjang di halaman, dan bacaannya menurun tajam di bawah 13px. Angka
          dan label tetap kecil supaya tabel tidak ikut membengkak. */}
      <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-gray-200 bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-gray-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:shadow-none">
        {children}
      </div>
    </div>
  );
}
