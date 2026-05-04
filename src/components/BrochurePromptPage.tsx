import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Image, Copy, RefreshCw, Sparkles, WandSparkles, Palette,
  FileText, Check, Package, MonitorSmartphone, Loader2,
} from 'lucide-react';
import { trackEvent } from '../utils/analytics';
import { normalizeWaNumber, formatWaDisplay } from '../utils/phone';
import { getPackages } from '@/services';
import type { UmrohPackage } from '@/types';

/**
 * Render a phone number in local Indonesian format (starts with `0…`) for use
 * in marketing prompts. Strips the `62` country code so AI image generators
 * don't render an unfamiliar international prefix.
 */
function formatAgentWa(phone?: string | null): string {
  const canonical = normalizeWaNumber(phone);
  if (canonical) return formatWaDisplay(canonical);
  // Best-effort fallback: strip a leading +62 / 62 manually and prepend `0`
  // when needed, so we still avoid the country-code prefix.
  const cleaned = String(phone || '').replace(/[^\d]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('62')) return '0' + cleaned.slice(2);
  if (cleaned.startsWith('0')) return cleaned;
  if (cleaned.startsWith('8')) return '0' + cleaned;
  return cleaned;
}

interface BrochurePromptPageProps {
  agent: { slug: string; name: string; phone: string; email?: string; photo?: string; website: string };
}

// ── Option catalogues ──────────────────────────────────────────────

const DESIGN_TYPES = [
  'Banner Sosmed',
  'Brosur Digital',
  'Story / Status WA',
  'Poster Paket',
  'Personal Branding Agent',
] as const;

const ASPECT_RATIOS = [
  '1:1 Instagram Feed',
  '4:5 Feed Portrait',
  '9:16 Story / Status WA',
  '16:9 Landscape',
  'A4 Portrait',
] as const;

const PACKAGE_MODES = ['Tanpa Paket', 'Pilih Paket', 'Isi Manual'] as const;

const CONCEPTS: { id: string; label: string; description: string; background: string; headline: string }[] = [
  {
    id: 'premium-elegan',
    label: 'Premium Elegan',
    description: 'desain bersih, mewah, islami, cocok untuk promosi utama',
    background: "Masjidil Haram atau Ka'bah dengan soft blur, gold glow, ornamen islami minimalis",
    headline: 'Umroh Nyaman Bersama Alhijaz',
  },
  {
    id: 'promo-dp-ringan',
    label: 'Promo DP Ringan',
    description: 'fokus pada penawaran DP, urgency, dan CTA yang kuat',
    background: "background Ka'bah dengan badge promo besar, visual kontras, area headline dominan",
    headline: 'DP Ringan, Niat Umroh Jangan Ditunda',
  },
  {
    id: 'spiritual',
    label: 'Spiritual Menyentuh',
    description: 'visual emosional, tenang, menguatkan niat ibadah',
    background: "jamaah berdoa di depan Ka'bah, cahaya lembut, suasana haru dan tenang",
    headline: 'Saatnya Menjawab Panggilan Baitullah',
  },
  {
    id: 'keluarga',
    label: 'Keluarga Bahagia',
    description: 'cocok untuk jamaah keluarga, orang tua, dan pasangan',
    background: 'keluarga muslim tersenyum dengan koper, latar Masjidil Haram atau Masjid Nabawi',
    headline: 'Ajak Keluarga Berangkat ke Tanah Suci',
  },
  {
    id: 'luxury',
    label: 'Luxury 5-Star',
    description: 'cocok untuk paket bintang 5, Haji Plus, VIP',
    background: "hotel mewah, Ka'bah, interior premium, aksen gold dan navy/black",
    headline: 'Umroh Premium dengan Layanan Terbaik',
  },
  {
    id: 'plus-extension',
    label: 'Plus Turki / Kairo',
    description: 'gabungkan nuansa Tanah Suci dan destinasi extension',
    background: "gabungkan Ka'bah dengan landmark Turki/Kairo seperti Hagia Sophia, Blue Mosque, Piramida, atau Cairo skyline",
    headline: 'Umroh Plus Destinasi Impian',
  },
  {
    id: 'last-seat',
    label: 'Last Seat Urgency',
    description: 'fokus seat terbatas, keberangkatan dekat, cepat daftar',
    background: 'visual seat terbatas, koper siap berangkat, countdown atau urgency badge',
    headline: 'Seat Terbatas, Amankan Jadwal Umroh Anda',
  },
  {
    id: 'agent-branding',
    label: 'Agent Personal Branding',
    description: 'tonjolkan nama agent dan kepercayaan personal',
    background: 'ruang khusus untuk foto/nama agent, desain personal, trust-building, profesional',
    headline: 'Konsultasi Umroh Lebih Mudah Bersama [Agent Name]',
  },
];

const COLOR_TONES: { id: string; label: string; description: string }[] = [
  { id: 'emerald-gold', label: 'Emerald Gold', description: 'premium islami, sesuai brand Alhijaz' },
  { id: 'white-gold', label: 'White Gold', description: 'bersih, mewah, high trust' },
  { id: 'maroon-gold', label: 'Maroon Gold', description: 'elegan, kuat, cocok untuk promo' },
  { id: 'navy-gold', label: 'Navy Gold', description: 'executive, luxury, cocok Haji Plus' },
  { id: 'desert-sand', label: 'Desert Sand', description: 'warm, spiritual, lembut' },
  { id: 'black-gold', label: 'Black Gold', description: 'VIP, eksklusif, premium' },
  { id: 'soft-green', label: 'Soft Green', description: 'friendly, aman, nyaman' },
  { id: 'rose-gold', label: 'Rose Gold', description: 'lembut, personal branding, cocok agent perempuan' },
];

const COPY_STYLES: { id: string; label: string; subheadline: string }[] = [
  { id: 'soft-selling', label: 'Soft Selling', subheadline: 'Diskusikan rencana umroh Anda dengan agent Alhijaz secara santai dan jelas.' },
  { id: 'hard-selling', label: 'Hard Selling', subheadline: 'Segera daftar sebelum seat penuh dan harga berubah.' },
  { id: 'emotional', label: 'Emotional', subheadline: 'Semoga tahun ini menjadi waktu terbaik untuk bersujud langsung di Tanah Suci.' },
  { id: 'elegant-premium', label: 'Elegant Premium', subheadline: 'Nikmati perjalanan ibadah yang nyaman, tertata, dan didampingi tim berpengalaman.' },
  { id: 'urgency', label: 'Urgency / Scarcity', subheadline: 'Kuota terbatas untuk jadwal pilihan. Amankan seat sebelum kehabisan.' },
  { id: 'edukatif', label: 'Edukatif', subheadline: 'Pilih jadwal, cek fasilitas, dan konsultasikan kebutuhan perjalanan Anda dengan agent resmi.' },
  { id: 'personal-agent', label: 'Personal Agent', subheadline: 'Saya siap bantu jelaskan jadwal, fasilitas, dan estimasi biaya sampai Anda yakin berangkat.' },
];

const CTAS = [
  'Konsultasi Gratis Sekarang',
  'Chat WhatsApp Sekarang',
  'Tanya Paket ke Agent',
  'Booking Seat Sekarang',
  'Minta Brosur Lengkap',
  'Cek Jadwal Umroh',
] as const;

// ── Helpers ────────────────────────────────────────────────────────

const fmtRp = (n: number) => 'Rp' + Math.round(n).toLocaleString('id-ID');

function getMinPrice(pkg: UmrohPackage): number {
  let min = Infinity;
  for (const tier of Object.values(pkg.harga)) {
    for (const p of [tier.Quard, tier.Triple, tier.Double]) {
      if (p) {
        const v = parseInt(p, 10);
        if (v > 0 && v < min) min = v;
      }
    }
  }
  return min === Infinity ? 0 : min;
}

function getFirstHotel(pkg: UmrohPackage): { mekkah?: string; madinah?: string } {
  const tiers = Object.keys(pkg.hotel);
  if (!tiers.length) return {};
  const h = pkg.hotel[tiers[0]] as unknown as Record<string, string>;
  return { mekkah: h?.mekkah_hotel, madinah: h?.madinah_hotel };
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

interface ManualPackage {
  name: string;
  date: string;
  airline: string;
  hotel: string;
  startingPrice: string;
  remainingSeats: string;
}

const EMPTY_MANUAL: ManualPackage = {
  name: '', date: '', airline: '', hotel: '', startingPrice: '', remainingSeats: '',
};

interface PromptParams {
  designType: string;
  aspectRatio: string;
  packageMode: typeof PACKAGE_MODES[number];
  selectedPackage: UmrohPackage | null;
  manualPackage: ManualPackage;
  conceptId: string;
  colorToneId: string;
  copyStyleId: string;
  cta: string;
  agent: BrochurePromptPageProps['agent'];
  notes: string;
}

function buildPackageBlock(p: PromptParams): string {
  if (p.packageMode === 'Tanpa Paket') return '(tanpa detail paket — buat desain promosi umum Alhijaz)';

  if (p.packageMode === 'Pilih Paket' && p.selectedPackage) {
    const pkg = p.selectedPackage;
    const hotel = getFirstHotel(pkg);
    const minPrice = getMinPrice(pkg);
    const hotelLine = [hotel.mekkah && `Mekkah: ${hotel.mekkah}`, hotel.madinah && `Madinah: ${hotel.madinah}`]
      .filter(Boolean)
      .join(' · ') || '-';
    return [
      `- Nama Paket: ${pkg.nama}`,
      `- Tanggal Berangkat: ${fmtDate(pkg.keberangkatan?.tgl || '')}`,
      `- Maskapai: ${pkg.maskapai || '-'}`,
      `- Hotel: ${hotelLine}`,
      `- Harga Mulai: ${minPrice > 0 ? fmtRp(minPrice) : '-'}`,
      `- Seat Tersisa: ${pkg.seatSisa ?? '-'}`,
    ].join('\n');
  }

  // Isi Manual
  const m = p.manualPackage;
  return [
    `- Nama Paket: ${m.name || '[Nama Paket]'}`,
    `- Tanggal Berangkat: ${m.date || '[Tanggal Berangkat]'}`,
    `- Maskapai: ${m.airline || '[Maskapai]'}`,
    `- Hotel: ${m.hotel || '[Hotel]'}`,
    `- Harga Mulai: ${m.startingPrice || '[Harga Mulai]'}`,
    `- Seat Tersisa: ${m.remainingSeats || '[Seat Tersisa]'}`,
  ].join('\n');
}

function generateBrochurePrompt(p: PromptParams): string {
  const concept = CONCEPTS.find(c => c.id === p.conceptId) ?? CONCEPTS[0];
  const tone = COLOR_TONES.find(c => c.id === p.colorToneId) ?? COLOR_TONES[0];
  const copy = COPY_STYLES.find(c => c.id === p.copyStyleId) ?? COPY_STYLES[3];

  const agentName = p.agent.name?.trim() || '[Nama Agent]';
  const headline = concept.headline.replace('[Agent Name]', agentName);
  const phone = formatAgentWa(p.agent.phone) || '[Nomor WhatsApp Agent]';
  const website = p.agent.website?.trim() || `https://alhijaz.co/${p.agent.slug || '[slug]'}`;

  const notesBlock = p.notes.trim() ? p.notes.trim() : '(tidak ada catatan tambahan)';

  return `Buat desain ${p.designType} untuk promosi umroh/haji Alhijaz.

Ukuran/aspect ratio:
${p.aspectRatio}

Tema visual:
${concept.description} dengan tone warna ${tone.label} (${tone.description}).

Background:
${concept.background}.

Headline utama:
${headline}

Subheadline:
${copy.subheadline}

Informasi paket:
${buildPackageBlock(p)}

Identitas agent:
- Nama Agent: ${agentName}
- Label: Konsultan Umroh & Haji Alhijaz
- WhatsApp: ${phone}
- Website: ${website}

CTA:
${p.cta}

Style desain:
premium travel brochure, clean layout, high-converting social media design, elegant Islamic ornament, readable typography, professional advertising design, soft glow, luxury gradient, modern composition, tidak terlalu ramai.

Catatan tambahan:
${notesBlock}

Catatan penting:
Pastikan semua teks mudah dibaca, layout rapi, komposisi tidak penuh, visual terlihat profesional, dan cocok untuk promosi travel umroh/haji di media sosial. Hindari typo, teks terlalu kecil, wajah tidak realistis, layout berantakan, dan warna terlalu mencolok.`;
}

// ── Reusable field components ──────────────────────────────────────

const inputClass =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none transition-all text-gray-800 dark:text-white placeholder:text-gray-400 disabled:opacity-50';

const labelClass =
  'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 mb-1.5';

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: readonly T[] | T[];
}

function SelectField<T extends string>({ label, value, onChange, options }: SelectFieldProps<T>) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={inputClass}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

interface KeyedSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; description?: string }[];
}

function KeyedSelectField({ label, value, onChange, options }: KeyedSelectProps) {
  const current = options.find(o => o.id === value);
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
      {current?.description && (
        <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-slate-400">
          {current.description}
        </p>
      )}
    </div>
  );
}

interface TextInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}

function TextInput({ label, value, onChange, placeholder, type = 'text' }: TextInputProps) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

export default function BrochurePromptPage({ agent }: BrochurePromptPageProps) {
  const tracked = useRef(false);
  useEffect(() => {
    if (!tracked.current) {
      trackEvent('feature', 'open_brochure_prompt');
      tracked.current = true;
    }
  }, []);

  const [designType, setDesignType] = useState<typeof DESIGN_TYPES[number]>('Banner Sosmed');
  const [aspectRatio, setAspectRatio] = useState<typeof ASPECT_RATIOS[number]>('1:1 Instagram Feed');
  const [conceptId, setConceptId] = useState<string>('premium-elegan');
  const [colorToneId, setColorToneId] = useState<string>('emerald-gold');
  const [copyStyleId, setCopyStyleId] = useState<string>('elegant-premium');
  const [cta, setCta] = useState<typeof CTAS[number]>('Konsultasi Gratis Sekarang');

  const [packageMode, setPackageMode] = useState<typeof PACKAGE_MODES[number]>('Tanpa Paket');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [manualPackage, setManualPackage] = useState<ManualPackage>(EMPTY_MANUAL);

  const [notes, setNotes] = useState('');

  const [packages, setPackages] = useState<UmrohPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  // ── Lazy-load packages only when "Pilih Paket" mode is chosen ──
  useEffect(() => {
    if (packageMode !== 'Pilih Paket' || packages.length > 0 || loadingPackages) return;
    setLoadingPackages(true);
    getPackages({ yearCode: '1448' })
      .then((res) => {
        if (res.success) setPackages(res.packages);
      })
      .catch(() => {})
      .finally(() => setLoadingPackages(false));
  }, [packageMode, packages.length, loadingPackages]);

  const selectedPackage = useMemo(
    () => packages.find(p => p.jadwalId === selectedPackageId) || null,
    [packages, selectedPackageId],
  );

  const packageOptions = useMemo(() => {
    return packages.map((pkg) => {
      const date = pkg.keberangkatan?.tgl
        ? new Date(pkg.keberangkatan.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : '-';
      return { id: pkg.jadwalId, label: `${date} — ${pkg.nama}` };
    });
  }, [packages]);

  const buildPrompt = useCallback(() => {
    return generateBrochurePrompt({
      designType,
      aspectRatio,
      packageMode,
      selectedPackage,
      manualPackage,
      conceptId,
      colorToneId,
      copyStyleId,
      cta,
      agent,
      notes,
    });
  }, [designType, aspectRatio, packageMode, selectedPackage, manualPackage, conceptId, colorToneId, copyStyleId, cta, agent, notes]);

  const handleGenerate = () => {
    setOutput(buildPrompt());
    setCopied(false);
    trackEvent('feature', 'generate_brochure_prompt');
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      trackEvent('feature', 'copy_brochure_prompt');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select in textarea so the user can copy manually
    }
  };

  const handleReset = () => {
    setDesignType('Banner Sosmed');
    setAspectRatio('1:1 Instagram Feed');
    setConceptId('premium-elegan');
    setColorToneId('emerald-gold');
    setCopyStyleId('elegant-premium');
    setCta('Konsultasi Gratis Sekarang');
    setPackageMode('Tanpa Paket');
    setSelectedPackageId('');
    setManualPackage(EMPTY_MANUAL);
    setNotes('');
    setOutput('');
    setCopied(false);
  };

  const websiteFallback = agent.website?.trim() || `https://alhijaz.co/${agent.slug || ''}`;
  const agentWaDisplay = formatAgentWa(agent.phone);

  const cardClass =
    'bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4';

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">
      {/* Intro */}
      <div className={cardClass}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-50 dark:bg-pink-900/20 flex items-center justify-center shrink-0">
            <Sparkles size={20} className="text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-800 dark:text-white">Prompt Brosur AI</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
              Buat prompt banner, brosur, story, atau poster promosi yang siap dicopy ke ChatGPT, Gemini, Claude, Canva AI, atau AI image generator lainnya.
            </p>
          </div>
        </div>
      </div>

      {/* Design settings */}
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-3">
          <Palette size={16} className="text-pink-600 dark:text-pink-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800 dark:text-white">Pengaturan Desain</h3>
        </div>
        <div className="space-y-3">
          <SelectField label="Jenis Desain" value={designType} onChange={setDesignType} options={DESIGN_TYPES} />
          <SelectField label="Ukuran / Aspect Ratio" value={aspectRatio} onChange={setAspectRatio} options={ASPECT_RATIOS} />
          <KeyedSelectField label="Konsep Visual" value={conceptId} onChange={setConceptId} options={CONCEPTS} />
          <KeyedSelectField label="Tone Warna" value={colorToneId} onChange={setColorToneId} options={COLOR_TONES} />
          <KeyedSelectField label="Gaya Copywriting" value={copyStyleId} onChange={setCopyStyleId} options={COPY_STYLES} />
          <SelectField label="CTA" value={cta} onChange={setCta} options={CTAS} />
        </div>
      </div>

      {/* Package data */}
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-3">
          <Package size={16} className="text-pink-600 dark:text-pink-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800 dark:text-white">Data Paket</h3>
        </div>
        <SelectField label="Sumber Paket" value={packageMode} onChange={setPackageMode} options={PACKAGE_MODES} />

        {packageMode === 'Pilih Paket' && (
          <div className="mt-3">
            <label className={labelClass}>Pilih Paket Umroh</label>
            {loadingPackages ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 dark:text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                Memuat daftar paket…
              </div>
            ) : packages.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Daftar paket belum tersedia. Coba pilih mode lain atau muat ulang halaman.
              </p>
            ) : (
              <select
                value={selectedPackageId}
                onChange={(e) => setSelectedPackageId(e.target.value)}
                className={inputClass}
              >
                <option value="">— Pilih paket —</option>
                {packageOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {packageMode === 'Isi Manual' && (
          <div className="mt-3 space-y-3">
            <TextInput label="Nama Paket" value={manualPackage.name} onChange={(v) => setManualPackage({ ...manualPackage, name: v })} placeholder="Contoh: Umroh Reguler 12 Hari" />
            <TextInput label="Tanggal Berangkat" value={manualPackage.date} onChange={(v) => setManualPackage({ ...manualPackage, date: v })} placeholder="Contoh: 12 Maret 2026" />
            <TextInput label="Maskapai" value={manualPackage.airline} onChange={(v) => setManualPackage({ ...manualPackage, airline: v })} placeholder="Contoh: Saudia / Garuda" />
            <TextInput label="Hotel" value={manualPackage.hotel} onChange={(v) => setManualPackage({ ...manualPackage, hotel: v })} placeholder="Contoh: Mekkah Pullman, Madinah Anwar" />
            <TextInput label="Harga Mulai" value={manualPackage.startingPrice} onChange={(v) => setManualPackage({ ...manualPackage, startingPrice: v })} placeholder="Contoh: Rp34.500.000" />
            <TextInput label="Seat Tersisa" value={manualPackage.remainingSeats} onChange={(v) => setManualPackage({ ...manualPackage, remainingSeats: v })} placeholder="Contoh: 5 seat" />
          </div>
        )}
      </div>

      {/* Agent identity (read-only) */}
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-3">
          <MonitorSmartphone size={16} className="text-pink-600 dark:text-pink-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800 dark:text-white">Identitas Agent</h3>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-slate-400">Nama Agent</span>
            <span className="font-semibold text-gray-800 dark:text-white text-right truncate">{agent.name || '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-slate-400">WhatsApp</span>
            <span className="font-semibold text-gray-800 dark:text-white text-right truncate">{agentWaDisplay || '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-slate-400">Website</span>
            <span className="font-semibold text-gray-800 dark:text-white text-right truncate">{websiteFallback}</span>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-gray-500 dark:text-slate-400 leading-snug">
          Data ini otomatis diambil dari profil agent.
        </p>
      </div>

      {/* Notes */}
      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-pink-600 dark:text-pink-400" />
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800 dark:text-white">Catatan Tambahan</h3>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Contoh: tampilkan DP 1 juta, highlight hotel dekat Masjidil Haram, jangan terlalu ramai, tambahkan nuansa keluarga."
          className={`${inputClass} resize-y`}
        />
      </div>

      {/* Generate CTA */}
      <button
        onClick={handleGenerate}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-pink-500 hover:bg-pink-600 text-white shadow-md shadow-pink-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
      >
        <WandSparkles size={16} />
        {output ? 'Generate Ulang' : 'Generate Prompt'}
      </button>

      {/* Output */}
      {output && (
        <div className={cardClass}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Image size={16} className="text-pink-600 dark:text-pink-400" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-800 dark:text-white">Prompt Siap Copy</h3>
            </div>
            {copied && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                <Check size={14} /> Berhasil dicopy
              </span>
            )}
          </div>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={14}
            className={`${inputClass} font-mono text-[12px] leading-relaxed whitespace-pre-wrap`}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-pink-500 hover:bg-pink-600 text-white shadow-sm shadow-pink-500/20 transition-all duration-200 active:scale-95"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Tercopy' : 'Copy Prompt'}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 transition-all duration-200 active:scale-95"
            >
              <RefreshCw size={14} />
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
