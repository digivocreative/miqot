import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, Check, Sparkles, Download, RefreshCw } from 'lucide-react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import { pdf } from '@react-pdf/renderer';
import type { AgentData } from '../data/agents';
import type { UmrohPackage } from '../types/umroh-package';
import { getPackages } from '../services/data-service';
import { getDistance } from '../data/hotelService';
import { sendCapiEvent } from '../lib/capi';

// ── Types ──

interface QuizAnswers {
  departure: string;
  packageClass: string;
  destination: string;
  budget: string;
  priority: string[];
  room: string;
  pax: string;
}

interface RecommendedPackage {
  pkg: UmrohPackage;
  score: number;
  overBudget?: boolean;
  soldOut?: boolean;
}

interface QuizPageProps {
  agent: AgentData;
  agentSlug: string;
  onClose: () => void;
  packages: UmrohPackage[];
}

// ── Helpers ──

function getTriplePrice(pkg: UmrohPackage): number | null {
  for (const tier of Object.values(pkg.harga)) {
    if (tier.Triple) {
      const p = parseInt(tier.Triple, 10);
      if (p > 0) return p;
    }
  }
  return null;
}

function getRoomPrice(pkg: UmrohPackage, room: string): number | null {
  const roomKey = room === 'quad' ? 'Quard' : room === 'double' ? 'Double' : room === 'triple' ? 'Triple' : null;
  if (!roomKey) return getTriplePrice(pkg);
  for (const tier of Object.values(pkg.harga)) {
    const val = tier[roomKey as keyof typeof tier];
    if (val) {
      const p = parseInt(val, 10);
      if (p > 0) return p;
    }
  }
  return getTriplePrice(pkg);
}

function formatJt(n: number): string {
  return Math.round(n / 1_000_000) + 'jt';
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}

// ── Display formatters (raw → human-readable) ──

const BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatDeparture(raw: string): string {
  if (!raw || raw === 'flexible') return 'Fleksibel';
  const rangeMatch = raw.match(/(\d{4})-(\d{1,2})_(\d{4})-(\d{1,2})/);
  if (rangeMatch) {
    const [, y1, m1, y2, m2] = rangeMatch;
    const bulan1 = BULAN[parseInt(m1)] || m1;
    const bulan2 = BULAN[parseInt(m2)] || m2;
    if (y1 === y2) return `${bulan1} – ${bulan2} ${y1}`;
    return `${bulan1} ${y1} – ${bulan2} ${y2}`;
  }
  const singleMatch = raw.match(/(\d{4})-(\d{1,2})/);
  if (singleMatch) {
    const [, y, m] = singleMatch;
    return `${BULAN[parseInt(m)] || m} ${y}`;
  }
  return raw;
}

function formatBudget(raw: string): string {
  if (!raw || raw === 'flexible') return 'Fleksibel';
  const match = raw.match(/^(\d+)-(\d+)$/);
  if (match) {
    const low = parseInt(match[1]);
    const high = parseInt(match[2]);
    const fmtJt = (n: number) => {
      const jt = n / 1000000;
      return jt % 1 === 0 ? `${jt}jt` : `${jt.toFixed(1)}jt`;
    };
    if (low === 0) return `Di bawah ${fmtJt(high)}`;
    return `${fmtJt(low)} – ${fmtJt(high)}`;
  }
  return raw;
}

function formatRoom(raw: string): string {
  const map: Record<string, string> = {
    quad: 'Quad (4 orang)',
    triple: 'Triple (3 orang)',
    double: 'Double (2 orang)',
    unsure: 'Belum tahu',
  };
  return map[raw?.toLowerCase()] || raw || '-';
}

function formatPax(raw: string): string {
  const map: Record<string, string> = {
    '1': 'Sendiri',
    '2': '2 orang',
    '3-5': '3–5 orang',
    '6+': '6+ orang',
  };
  return map[raw] || (raw ? `${raw} orang` : '-');
}

function formatPriority(raw: string): string {
  const map: Record<string, string> = {
    hotel: 'Hotel Dekat Masjid',
    duration: 'Durasi Lebih Lama',
    soon: 'Keberangkatan Cepat',
    flexible: 'Jadwal Fleksibel',
    // backward compat for old leads
    price: 'Harga Terjangkau',
    airline: 'Maskapai Nyaman',
    schedule: 'Jadwal Fleksibel',
  };
  return map[raw?.toLowerCase()] || raw || '';
}

function formatPackageClass(raw: string): string {
  const map: Record<string, string> = { hemat: 'Hemat / Promo', reguler: 'Reguler', premium: 'Premium / VIP', all: 'Semua' };
  return map[raw?.toLowerCase()] || raw || '-';
}

function formatDestination(raw: string): string {
  const map: Record<string, string> = { umroh_only: 'Umroh Saja', plus_turki: 'Plus Turki', plus_other: 'Plus Dubai / Lainnya', all: 'Semua' };
  return map[raw?.toLowerCase()] || raw || '-';
}

function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}

// Generate departure options from packages
function generateDepartureOptions(packages: UmrohPackage[]): { label: string; value: string; icon: string }[] {
  const now = new Date();
  const months: Map<string, Date> = new Map();

  for (const pkg of packages) {
    const d = new Date(pkg.keberangkatan.tgl);
    if (d < now) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!months.has(key)) months.set(key, d);
  }

  const sorted = [...months.entries()].sort(([a], [b]) => a.localeCompare(b));

  // Group by 2 months
  const groups: { label: string; value: string; icon: string }[] = [];
  const seasonIcons = ['🌙', '☀️', '🍂', '❄️', '🌸', '🔥'];
  for (let i = 0; i < sorted.length; i += 2) {
    const [, d1] = sorted[i];
    const d2 = sorted[i + 1]?.[1];
    const m1 = d1.toLocaleDateString('id-ID', { month: 'short' });
    const y1 = d1.getFullYear();
    if (d2) {
      const m2 = d2.toLocaleDateString('id-ID', { month: 'short' });
      const y2 = d2.getFullYear();
      const label = y1 === y2 ? `${m1} - ${m2} ${y1}` : `${m1} ${y1} - ${m2} ${y2}`;
      groups.push({
        label,
        value: `${d1.getFullYear()}-${d1.getMonth()}_${d2.getFullYear()}-${d2.getMonth()}`,
        icon: seasonIcons[groups.length % seasonIcons.length],
      });
    } else {
      groups.push({
        label: `${m1} ${y1}`,
        value: `${d1.getFullYear()}-${d1.getMonth()}`,
        icon: seasonIcons[groups.length % seasonIcons.length],
      });
    }
  }

  groups.push({ label: 'Fleksibel', value: 'flexible', icon: '🔄' });
  return groups;
}

// Generate budget options from packages
function generateBudgetOptions(packages: UmrohPackage[]): { label: string; value: string; icon: string }[] {
  const prices = packages.map(getTriplePrice).filter((p): p is number => p !== null && p > 0);
  if (prices.length === 0) return [{ label: 'Fleksibel', value: 'flexible', icon: '🔓' }];

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const step = Math.ceil(range / 3 / 1_000_000) * 1_000_000;

  const b1 = min + step;
  const b2 = min + step * 2;

  const icons = ['💚', '💎', '👑', '🔓'];
  return [
    { label: `Di bawah ${formatJt(b1)}`, value: `0-${b1}`, icon: icons[0] },
    { label: `${formatJt(b1)} - ${formatJt(b2)}`, value: `${b1}-${b2}`, icon: icons[1] },
    { label: `Di atas ${formatJt(b2)}`, value: `${b2}-999999999999`, icon: icons[2] },
    { label: 'Fleksibel', value: 'flexible', icon: icons[3] },
  ];
}

// ── Scoring helpers ──

function hotelProximityScore(pkg: UmrohPackage): number {
  let totalScore = 0;
  let count = 0;
  for (const hotelInfo of Object.values(pkg.hotel)) {
    if (hotelInfo.mekkah_hotel) {
      const dist = getDistance(hotelInfo.mekkah_hotel);
      if (dist) {
        const meters = parseDistanceToMeters(dist);
        if (meters !== null) {
          totalScore += Math.max(0, 100 - (meters / 30));
          count++;
        }
      } else {
        totalScore += 50;
        count++;
      }
    }
  }
  return count > 0 ? totalScore / count : 50;
}

function parseDistanceToMeters(dist: string): number | null {
  const clean = dist.replace(/[±~]/g, '').trim().toLowerCase();
  const kmMatch = clean.match(/([\d.]+)\s*km/);
  if (kmMatch) return parseFloat(kmMatch[1]) * 1000;
  const mMatch = clean.match(/([\d.]+)\s*m/);
  if (mMatch) return parseFloat(mMatch[1]);
  return null;
}

function parseDuration(nama: string): number | null {
  const m = nama.match(/(\d+)\s*H(?:R|ARI)/i);
  return m ? parseInt(m[1], 10) : null;
}

const DEST_KEYWORDS = ['TURKI', 'TURKEY', 'DUBAI', 'CAIRO', 'HAIKOU', 'ALEXANDRIA'];

function matchesPackageClass(nama: string, cls: string): boolean {
  if (cls === 'all') return true;
  const upper = nama.toUpperCase();
  if (cls === 'hemat') return upper.includes('HEMAT') || upper.includes('PROMO');
  if (cls === 'reguler') return upper.includes('REGULER');
  if (cls === 'premium') return upper.includes('PREMIUM') || upper.includes('VIP');
  return true;
}

function matchesDestination(nama: string, dest: string): boolean {
  if (dest === 'all') return true;
  const upper = nama.toUpperCase();
  const hasDest = DEST_KEYWORDS.some(kw => upper.includes(kw));
  if (dest === 'umroh_only') return !hasDest;
  if (dest === 'plus_turki') return upper.includes('TURKI') || upper.includes('TURKEY');
  if (dest === 'plus_other') return DEST_KEYWORDS.filter(kw => kw !== 'TURKI' && kw !== 'TURKEY').some(kw => upper.includes(kw));
  return true;
}

// ── Matching Logic ──

function matchPackages(
  packages: UmrohPackage[],
  answers: QuizAnswers,
): RecommendedPackage[] {
  const now = new Date();
  const nowMs = now.getTime();

  // Step 1: Filter seat > 0 + future
  let filtered = packages.filter(pkg => new Date(pkg.keberangkatan.tgl) > now && pkg.seatSisa > 0);

  // Step 2: Filter departure
  if (answers.departure && answers.departure !== 'flexible') {
    const parts = answers.departure.split('_');
    const ranges: { year: number; month: number }[] = [];
    for (const part of parts) {
      const [y, m] = part.split('-').map(Number);
      ranges.push({ year: y, month: m });
    }
    filtered = filtered.filter(pkg => {
      const d = new Date(pkg.keberangkatan.tgl);
      return ranges.some(r => d.getFullYear() === r.year && d.getMonth() === r.month);
    });
  }

  // Step 3: Filter package type
  if (answers.packageClass && answers.packageClass !== 'all') {
    filtered = filtered.filter(pkg => matchesPackageClass(pkg.nama, answers.packageClass));
  }
  if (answers.destination && answers.destination !== 'all') {
    filtered = filtered.filter(pkg => matchesDestination(pkg.nama, answers.destination));
  }

  // Step 4: Filter budget
  const roomType = answers.room || 'triple';
  if (answers.budget && answers.budget !== 'flexible') {
    const [minB, maxB] = answers.budget.split('-').map(Number);
    filtered = filtered.filter(pkg => {
      const price = getRoomPrice(pkg, roomType);
      if (!price) return false;
      return price >= minB && price <= maxB;
    });
  }

  // Step 5: Score based on priorities
  const priorities = answers.priority || [];
  const defaultWeights = { hotel: 0.30, duration: 0.25, soon: 0.25, flexible: 0.20 };
  const weights = { ...defaultWeights };

  if (priorities.length === 1) {
    const p = priorities[0] as keyof typeof weights;
    if (weights[p] !== undefined) {
      const selected = 0.6;
      const remaining = (1 - selected) / 3;
      for (const k of Object.keys(weights) as (keyof typeof weights)[]) {
        weights[k] = k === p ? selected : remaining;
      }
    }
  } else if (priorities.length === 2) {
    const selectedSum = priorities.reduce((sum, p) => sum + (defaultWeights[p as keyof typeof defaultWeights] || 0.25), 0);
    const remainingSum = 1 - selectedSum;
    const unselectedKeys = (Object.keys(weights) as (keyof typeof weights)[]).filter(k => !priorities.includes(k));
    const perUnselected = remainingSum / (unselectedKeys.length || 1);
    for (const k of unselectedKeys) weights[k] = perUnselected;
    // selected keys keep default weights
  }

  // Precompute ranges for normalization
  const durations = filtered.map(pkg => parseDuration(pkg.nama)).filter((d): d is number => d !== null);
  const minDur = Math.min(...durations, Infinity);
  const maxDur = Math.max(...durations, 0);
  const durRange = maxDur - minDur || 1;

  const depDates = filtered.map(pkg => new Date(pkg.keberangkatan.tgl).getTime());
  const minDep = Math.min(...depDates, Infinity);
  const maxDep = Math.max(...depDates, 0);
  const depRange = maxDep - minDep || 1;

  const scored = filtered.map(pkg => {
    // Hotel score
    const hotelScore = hotelProximityScore(pkg);

    // Duration score: longer = better
    const dur = parseDuration(pkg.nama);
    const durationScore = dur !== null && maxDur > minDur ? ((dur - minDur) / durRange) * 100 : 50;

    // Soon score: earlier = better (inverse)
    const depMs = new Date(pkg.keberangkatan.tgl).getTime();
    const soonScore = maxDep > minDep ? ((maxDep - depMs) / depRange) * 100 : 50;

    // Flexibility score: count alternatives within ±14 days
    const alternatives = filtered.filter(other => {
      if (other.jadwalId === pkg.jadwalId) return false;
      const otherDate = new Date(other.keberangkatan.tgl).getTime();
      return Math.abs(otherDate - depMs) <= 14 * 24 * 60 * 60 * 1000;
    }).length;
    const flexScore = Math.min(100, alternatives * 20);

    const total =
      hotelScore * weights.hotel +
      durationScore * weights.duration +
      soonScore * weights.soon +
      flexScore * weights.flexible;

    return { pkg, score: Math.round(total) };
  });

  // Sort + deduplicate
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const unique = scored.filter(r => {
    const price = getRoomPrice(r.pkg, roomType) || 0;
    const key = `${r.pkg.jadwalId}_${r.pkg.nama}_${price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let results: RecommendedPackage[] = unique.slice(0, 3);

  // Fallback 1: relax budget ±20%
  if (results.length < 3 && answers.budget && answers.budget !== 'flexible') {
    const [minB, maxB] = answers.budget.split('-').map(Number);
    const relaxMin = minB * 0.8;
    const relaxMax = maxB * 1.2;
    const relaxed = packages
      .filter(pkg => {
        const d = new Date(pkg.keberangkatan.tgl);
        if (d <= now || pkg.seatSisa <= 0) return false;
        const price = getRoomPrice(pkg, roomType);
        if (!price) return false;
        if (results.some(r => r.pkg.jadwalId === pkg.jadwalId)) return false;
        return price >= relaxMin && price <= relaxMax && (price < minB || price > maxB);
      })
      .map(pkg => {
        const price = getRoomPrice(pkg, roomType) || 0;
        return { pkg, score: Math.round(50 - Math.abs(price - (minB + maxB) / 2) / 1_000_000), overBudget: true };
      })
      .sort((a, b) => b.score - a.score);
    results = [...results, ...relaxed.slice(0, 3 - results.length)];
  }

  // Fallback 2: relax package type filters
  if (results.length < 3) {
    const relaxType = packages
      .filter(pkg => {
        const d = new Date(pkg.keberangkatan.tgl);
        if (d <= now || pkg.seatSisa <= 0) return false;
        if (results.some(r => r.pkg.jadwalId === pkg.jadwalId)) return false;
        return true;
      })
      .map(pkg => ({ pkg, score: 40 }))
      .slice(0, 3 - results.length);
    results = [...results, ...relaxType];
  }

  // Fallback 3: sold-out fillers (always last, never "Rekomendasi Terbaik")
  if (results.length < 3) {
    const soldOutFillers = packages
      .filter(pkg => {
        const d = new Date(pkg.keberangkatan.tgl);
        if (d <= now) return false;
        if (pkg.seatSisa > 0) return false;
        if (results.some(r => r.pkg.jadwalId === pkg.jadwalId)) return false;
        return true;
      })
      .map(pkg => ({ pkg, score: 0, soldOut: true }))
      .slice(0, 3 - results.length);
    results = [...results, ...soldOutFillers];
  }

  // Final sort: sold out always last
  results.sort((a, b) => {
    if (a.soldOut && !b.soldOut) return 1;
    if (!a.soldOut && b.soldOut) return -1;
    return b.score - a.score;
  });

  return results.slice(0, 3);
}

// ── Priority labels ──
const PRIORITY_MAP: Record<string, { label: string; icon: string }> = {
  hotel: { label: 'Hotel Dekat Masjid', icon: '🏨' },
  duration: { label: 'Durasi Lebih Lama', icon: '🕌' },
  soon: { label: 'Keberangkatan Cepat', icon: '⚡' },
  flexible: { label: 'Jadwal Fleksibel', icon: '📆' },
  // backward compat
  price: { label: 'Harga Terjangkau', icon: '💰' },
  airline: { label: 'Maskapai Nyaman', icon: '✈️' },
};

// ── PDF Document ──

Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf', fontWeight: 'normal' },
    { src: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf', fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const pdfStyles = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9, color: '#1f2937', padding: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 12 },
  headerLeft: { flex: 1 },
  logo: { fontWeight: 'bold', fontSize: 14, color: '#059669' },
  agentName: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  agentPhone: { fontSize: 9, color: '#6b7280', marginTop: 1 },
  sectionTitle: { fontWeight: 'bold', fontSize: 11, color: '#1f2937', marginBottom: 8, marginTop: 16 },
  prefRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  prefLabel: { fontSize: 8, color: '#9ca3af', width: 80 },
  prefValue: { fontSize: 9, fontWeight: 'bold', color: '#1f2937' },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, marginBottom: 8, padding: 10 },
  cardFirst: { borderColor: '#059669', borderWidth: 1.5 },
  cardName: { fontWeight: 'bold', fontSize: 10, color: '#1f2937', marginBottom: 4 },
  cardPrice: { fontWeight: 'bold', fontSize: 12, color: '#059669', marginBottom: 4 },
  cardDetail: { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  matchBadge: { fontSize: 8, color: '#059669', fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#9ca3af' },
});

function QuizPdfDocument({ agent, agentSlug, answers, results, nama }: {
  agent: AgentData;
  agentSlug: string;
  answers: QuizAnswers;
  results: RecommendedPackage[];
  nama: string;
}) {
  const roomLabel = answers.room === 'quad' ? 'Quad' : answers.room === 'double' ? 'Double' : answers.room === 'triple' ? 'Triple' : 'Belum tahu';
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <View style={pdfStyles.headerLeft}>
            <Text style={pdfStyles.logo}>Alhijaz Indowisata</Text>
            <Text style={pdfStyles.agentName}>{agent.name}</Text>
            <Text style={pdfStyles.agentPhone}>{agent.phone}</Text>
          </View>
        </View>

        <Text style={pdfStyles.sectionTitle}>Berdasarkan preferensi Anda</Text>
        <View style={pdfStyles.prefRow}>
          <Text style={pdfStyles.prefLabel}>Keberangkatan</Text>
          <Text style={pdfStyles.prefValue}>{answers.departure === 'flexible' ? 'Fleksibel' : answers.departure}</Text>
        </View>
        <View style={pdfStyles.prefRow}>
          <Text style={pdfStyles.prefLabel}>Kelas Paket</Text>
          <Text style={pdfStyles.prefValue}>{formatPackageClass(answers.packageClass)}</Text>
        </View>
        <View style={pdfStyles.prefRow}>
          <Text style={pdfStyles.prefLabel}>Destinasi</Text>
          <Text style={pdfStyles.prefValue}>{formatDestination(answers.destination)}</Text>
        </View>
        <View style={pdfStyles.prefRow}>
          <Text style={pdfStyles.prefLabel}>Budget</Text>
          <Text style={pdfStyles.prefValue}>{answers.budget === 'flexible' ? 'Fleksibel' : answers.budget}</Text>
        </View>
        <View style={pdfStyles.prefRow}>
          <Text style={pdfStyles.prefLabel}>Tipe Kamar</Text>
          <Text style={pdfStyles.prefValue}>{roomLabel}</Text>
        </View>
        <View style={pdfStyles.prefRow}>
          <Text style={pdfStyles.prefLabel}>Prioritas</Text>
          <Text style={pdfStyles.prefValue}>{answers.priority.map(p => PRIORITY_MAP[p]?.label || p).join(', ')}</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>Rekomendasi Paket untuk {nama}</Text>
        {results.map((r, i) => {
          const price = getRoomPrice(r.pkg, answers.room);
          const hotel = Object.values(r.pkg.hotel)[0];
          return (
            <View key={r.pkg.jadwalId} style={i === 0 ? [pdfStyles.card, pdfStyles.cardFirst] : pdfStyles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={pdfStyles.cardName}>{r.pkg.nama}</Text>
                <Text style={pdfStyles.matchBadge}>{r.score}% Cocok</Text>
              </View>
              <Text style={pdfStyles.cardPrice}>Rp {price ? formatRupiah(price) : '-'}</Text>
              <Text style={pdfStyles.cardDetail}>Hotel Makkah: {hotel?.mekkah_hotel || '-'}</Text>
              <Text style={pdfStyles.cardDetail}>Hotel Madinah: {hotel?.madinah_hotel || '-'}</Text>
              <Text style={pdfStyles.cardDetail}>Maskapai: {r.pkg.maskapai}</Text>
              <Text style={pdfStyles.cardDetail}>Berangkat: {new Date(r.pkg.keberangkatan.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
            </View>
          );
        })}

        <View style={pdfStyles.footer}>
          <Text style={pdfStyles.footerText}>Hubungi {agent.name} — {agent.phone}</Text>
          <Text style={pdfStyles.footerText}>alhijaz.co/{agentSlug}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ── Main Component ──

export default function QuizPage({ agent, agentSlug, onClose, packages }: QuizPageProps) {
  const [step, setStep] = useState(0); // 0-5 for 6 questions
  const [answers, setAnswers] = useState<QuizAnswers>({
    departure: '',
    packageClass: '',
    destination: '',
    budget: '',
    priority: [],
    room: '',
    pax: '',
  });
  const [nama, setNama] = useState('');
  const [wa, setWa] = useState('');
  const [countryCode] = useState('+62');
  const [phase, setPhase] = useState<'quiz' | 'loading' | 'results'>('quiz');
  const [loadingStep, setLoadingStep] = useState(0);
  const [results, setResults] = useState<RecommendedPackage[]>([]);
  const [slideDir, setSlideDir] = useState<'forward' | 'back'>('forward');
  const [animKey, setAnimKey] = useState(0);

  // Restore results from localStorage if URL has ?quiz=results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('quiz') !== 'results') return;

    try {
      const raw = localStorage.getItem(`quiz_results_${agentSlug}`);
      if (!raw) return;
      const saved = JSON.parse(raw);

      // Restore answers & contact info
      if (saved.answers) setAnswers(saved.answers);
      if (saved.nama) setNama(saved.nama);
      if (saved.wa) setWa(saved.wa);

      // Restore results by matching jadwalIds back to package objects
      if (saved.results && packages.length > 0) {
        const restored: RecommendedPackage[] = [];
        for (const r of saved.results) {
          const pkg = packages.find(p => p.jadwalId === r.jadwalId);
          if (pkg) restored.push({ pkg, score: r.score, overBudget: r.overBudget });
        }
        if (restored.length > 0) {
          setResults(restored);
          setPhase('results');
        }
      }
    } catch { /* corrupt data — start fresh */ }
  }, [agentSlug, packages]);

  // Generate options from packages
  const departureOptions = useMemo(() => generateDepartureOptions(packages), [packages]);
  const budgetOptions = useMemo(() => generateBudgetOptions(packages), [packages]);

  const totalSteps = 6;
  const progress = ((step + 1) / totalSteps) * 100;

  // Handle single select auto-advance
  const handleSingleSelect = useCallback((field: keyof QuizAnswers, value: string) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
    setTimeout(() => {
      setSlideDir('forward');
      setAnimKey(k => k + 1);
      setStep(s => s + 1);
    }, 300);
  }, []);

  // Handle multi select toggle
  const handlePriorityToggle = useCallback((value: string) => {
    setAnswers(prev => {
      const current = prev.priority;
      if (current.includes(value)) {
        return { ...prev, priority: current.filter(v => v !== value) };
      }
      if (current.length >= 2) return prev;
      return { ...prev, priority: [...current, value] };
    });
  }, []);

  // Back handler
  const handleBack = useCallback(() => {
    if (step === 0) {
      onClose();
      return;
    }
    setSlideDir('back');
    setAnimKey(k => k + 1);
    setStep(s => s - 1);
  }, [step, onClose]);

  // Submit quiz
  const handleSubmit = useCallback(async () => {
    const fullWa = countryCode.replace('+', '') + wa.replace(/^0+/, '');
    setPhase('loading');
    setLoadingStep(0);

    // Progress loading steps
    setTimeout(() => setLoadingStep(1), 1200);
    setTimeout(() => setLoadingStep(2), 2400);

    // Do actual matching
    const matchResults = matchPackages(packages, answers);
    setResults(matchResults);

    // Fire CAPI event
    sendCapiEvent(agentSlug, 'contact', window.location.href);

    // Submit to server (formatted for human-readable display)
    const recommended = matchResults.map(r => ({
      jadwal_id: r.pkg.jadwalId,
      name: r.pkg.nama,
      price: getRoomPrice(r.pkg, answers.room),
      match: r.score,
    }));

    const formattedAnswers = {
      departure: formatDeparture(answers.departure),
      packageClass: formatPackageClass(answers.packageClass),
      destination: formatDestination(answers.destination),
      budget: formatBudget(answers.budget),
      priority: (answers.priority || []).map(formatPriority),
      room: formatRoom(answers.room),
      pax: formatPax(answers.pax),
    };

    const formattedRecommended = recommended.map(r => ({
      ...r,
      price: r.price ? `Rp ${formatRupiah(r.price)}` : '-',
    }));

    try {
      const res = await fetch(`/api/quiz/${agentSlug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama,
          wa: fullWa,
          answers: formattedAnswers,
          recommended: formattedRecommended,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        console.warn('[Quiz] Submit failed:', json.error);
      }
    } catch (err) {
      console.warn('[Quiz] Submit error:', err);
    }

    // Save results to localStorage for persistence across reload
    try {
      localStorage.setItem(`quiz_results_${agentSlug}`, JSON.stringify({
        nama,
        wa: fullWa,
        answers,
        recommended,
        results: matchResults.map(r => ({
          jadwalId: r.pkg.jadwalId,
          score: r.score,
          overBudget: r.overBudget || false,
        })),
      }));
    } catch { /* storage full — ignore */ }

    // Transition to results after loading animation
    setTimeout(() => {
      setPhase('results');
      localStorage.setItem(`quiz_completed_${agentSlug}`, 'true');
      // Push URL so browser back/reload keeps the results page
      window.history.pushState({ quizResults: true }, '', `/${agentSlug}?quiz=results`);
    }, 3600);
  }, [packages, answers, nama, wa, countryCode, agentSlug]);

  // Download PDF
  const handleDownloadPdf = useCallback(async () => {
    try {
      const blob = await pdf(
        <QuizPdfDocument
          agent={agent}
          agentSlug={agentSlug}
          answers={answers}
          results={results}
          nama={nama}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rekomendasi-umroh-${nama.toLowerCase().replace(/\s+/g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[Quiz PDF] Failed:', err);
    }
  }, [agent, agentSlug, answers, results, nama]);

  // Reset quiz
  const handleReset = useCallback(() => {
    setStep(0);
    setAnswers({ departure: '', packageClass: '', destination: '', budget: '', priority: [], room: '', pax: '' });
    setNama('');
    setWa('');
    setPhase('quiz');
    setResults([]);
    setLoadingStep(0);
    localStorage.removeItem(`quiz_completed_${agentSlug}`);
    localStorage.removeItem(`quiz_results_${agentSlug}`);
    // Clean URL back to agent page
    window.history.replaceState({}, '', `/${agentSlug}`);
  }, [agentSlug]);

  // WA link for result
  const topPkg = results[0]?.pkg;
  const waMessage = topPkg
    ? `Assalamualaikum ${agent.name}, saya ${nama}. Saya sudah isi quiz di alhijaz.co dan tertarik dengan paket ${topPkg.nama}. Boleh tanya lebih lanjut?`
    : `Assalamualaikum ${agent.name}, saya ${nama}. Saya tertarik paket umroh di Alhijaz.`;
  const waLink = `https://wa.me/${agent.phone}?text=${encodeURIComponent(waMessage)}`;

  // WA validation
  const isWaValid = wa.replace(/\D/g, '').length >= 10;
  const isFormValid = nama.trim().length > 0 && isWaValid;

  // Lock body scroll while quiz overlay is mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // ── Render ──

  const loadingSteps = [
    'Menganalisis preferensi Anda',
    'Mencocokkan dengan paket tersedia',
    'Menyiapkan rekomendasi terbaik',
  ];

  const priorityOptions = [
    { label: 'Hotel Dekat Masjid', value: 'hotel', icon: '🏨', desc: 'Jarak dekat ke Masjidil Haram & Nabawi' },
    { label: 'Durasi Lebih Lama', value: 'duration', icon: '🕌', desc: 'Ibadah lebih leluasa' },
    { label: 'Keberangkatan Cepat', value: 'soon', icon: '⚡', desc: 'Tanggal terdekat dari sekarang' },
    { label: 'Jadwal Fleksibel', value: 'flexible', icon: '📆', desc: 'Banyak pilihan tanggal' },
  ];

  const packageClassOptions = [
    { label: 'Hemat / Promo', value: 'hemat', icon: '💚' },
    { label: 'Reguler', value: 'reguler', icon: '⭐' },
    { label: 'Premium / VIP', value: 'premium', icon: '👑' },
    { label: 'Lihat Semua', value: 'all', icon: '🔓' },
  ];

  const destinationOptions = [
    { label: 'Umroh Saja', value: 'umroh_only', icon: '🕋' },
    { label: 'Plus Turki', value: 'plus_turki', icon: '🇹🇷' },
    { label: 'Plus Dubai / Lainnya', value: 'plus_other', icon: '🌍' },
    { label: 'Semua Boleh', value: 'all', icon: '🔓' },
  ];

  const roomOptions = [
    { label: 'Quad', value: 'quad' },
    { label: 'Triple', value: 'triple' },
    { label: 'Double', value: 'double' },
    { label: 'Belum tahu', value: 'unknown' },
  ];

  const paxOptions = [
    { label: 'Sendiri', value: '1' },
    { label: '2 orang', value: '2' },
    { label: '3-5 orang', value: '3-5' },
    { label: '6+ orang', value: '6+' },
  ];

  const steps = [
    { id: 'departure', emoji: '📅', heading: 'Kapan rencana berangkat?', subtitle: 'Pilih perkiraan waktu keberangkatan' },
    { id: 'package_type', emoji: '✈️', heading: 'Tipe paket yang diminati?', subtitle: 'Pilih kelas dan destinasi yang Anda inginkan' },
    { id: 'budget', emoji: '💰', heading: 'Budget per orang?', subtitle: 'Kami akan carikan yang sesuai' },
    { id: 'priority', emoji: '🎯', heading: 'Apa yang paling penting untuk Anda?', subtitle: 'Pilih maksimal 2 yang paling penting' },
    { id: 'room_pax', emoji: '🛏️', heading: 'Tipe kamar & jumlah rombongan?', subtitle: 'Menentukan harga dan rekomendasi' },
    { id: 'contact', emoji: '📋', heading: 'Satu langkah lagi!', subtitle: 'Isi data Anda untuk melihat rekomendasi paket' },
  ];

  const currentStep = steps[step];

  // Single wrapper — solid opaque background, covers everything behind it
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 overflow-y-auto">

      {/* ── Loading Phase ── */}
      {phase === 'loading' && (
        <div className="flex items-center justify-center min-h-full">
          <div className="text-center px-8">
            {/* Spinner */}
            <div className="relative w-20 h-20 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-emerald-100 dark:border-emerald-900/30 rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-emerald-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-2xl">🕋</div>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              {loadingSteps.map((text, i) => (
                <div key={i} className="flex items-center gap-3 justify-center">
                  {loadingStep > i ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                      <Check size={12} className="text-white" />
                    </div>
                  ) : loadingStep === i ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-slate-800 flex-shrink-0" />
                  )}
                  <span className={`text-sm ${loadingStep >= i ? 'text-gray-800 dark:text-white font-medium' : 'text-gray-400 dark:text-slate-500'}`}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Results Phase ── */}
      {phase === 'results' && (
        <>
          {/* Header — solid opaque */}
          <header className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-700/50">
            <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <h1 className="text-sm font-bold text-gray-800 dark:text-white">Hasil Rekomendasi</h1>
            </div>
          </header>

          <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
            {/* Result header */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40 flex items-center justify-center text-xl">
                ✅
              </div>
              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
                {nama}, ini rekomendasi untuk Anda!
              </h2>
              <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
                {results.length} paket terbaik berdasarkan preferensi Anda
              </p>
            </div>

            {/* Result cards */}
            <div className="space-y-3 mb-6">
              {results.map((r, i) => {
                const price = getRoomPrice(r.pkg, answers.room);
                const hotel = Object.values(r.pkg.hotel)[0];
                const depDate = new Date(r.pkg.keberangkatan.tgl).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

                return (
                  <button
                    key={r.pkg.jadwalId}
                    onClick={() => {
                      window.location.href = `/${agentSlug}/${r.pkg.jadwalId}`;
                    }}
                    className={`w-full text-left bg-white dark:bg-slate-800 rounded-2xl border ${i === 0 ? 'border-emerald-500 dark:border-emerald-600' : 'border-gray-100 dark:border-slate-700'} shadow-sm overflow-hidden transition-all active:scale-[0.98]`}
                  >
                    {/* Best match banner — never for sold out */}
                    {i === 0 && !r.soldOut && (
                      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 flex items-center gap-1.5">
                        <span className="text-[10px]">⭐</span>
                        <span className="text-[10px] font-bold text-white tracking-wide uppercase">Rekomendasi Terbaik</span>
                      </div>
                    )}

                    <div className="p-3.5 relative">
                      {/* Match badge */}
                      <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold ${r.score >= 90 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'}`}>
                        {r.score}% Cocok
                      </div>

                      {/* Package name */}
                      <p className="text-sm font-extrabold text-gray-900 dark:text-white pr-20 leading-tight">
                        {r.pkg.nama}
                      </p>

                      {/* Price */}
                      <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                        Rp {price ? formatRupiah(price) : '-'}
                        <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500 ml-1">/{answers.room === 'double' ? 'Double' : answers.room === 'quad' ? 'Quad' : 'Triple'}</span>
                      </p>

                      {/* Over budget badge */}
                      {r.overBudget && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          Sedikit di atas budget
                        </span>
                      )}

                      {/* Details 2x2 grid */}
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl px-2.5 py-2">
                          <p className="text-[9px] text-gray-400 dark:text-slate-500 uppercase font-bold tracking-wide">Hotel Makkah</p>
                          <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200 mt-0.5 leading-tight">{hotel?.mekkah_hotel || '-'}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl px-2.5 py-2">
                          <p className="text-[9px] text-gray-400 dark:text-slate-500 uppercase font-bold tracking-wide">Hotel Madinah</p>
                          <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200 mt-0.5 leading-tight">{hotel?.madinah_hotel || '-'}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl px-2.5 py-2">
                          <p className="text-[9px] text-gray-400 dark:text-slate-500 uppercase font-bold tracking-wide">Maskapai</p>
                          <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200 mt-0.5">{r.pkg.maskapai}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-xl px-2.5 py-2">
                          <p className="text-[9px] text-gray-400 dark:text-slate-500 uppercase font-bold tracking-wide">Berangkat</p>
                          <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-200 mt-0.5">{depDate}</p>
                        </div>
                      </div>

                      {/* Seat indicator */}
                      {r.pkg.seatSisa <= 0 ? (
                        <div className="mt-2 flex items-center gap-1">
                          <span className="text-[10px] font-semibold text-red-500">Seat Habis</span>
                        </div>
                      ) : r.pkg.seatSisa <= 10 ? (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-[10px] text-red-500">🪑 Sisa {r.pkg.seatSisa} seat</span>
                          <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-[9px] font-bold text-red-500">Hampir habis</span>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <span className="text-[10px] text-gray-400 dark:text-slate-500">🪑 Sisa {r.pkg.seatSisa} seat</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* CTA Buttons */}
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition-all active:scale-95"
            >
              <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Chat dengan {agent.name} via WhatsApp
            </a>

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDownloadPdf}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                <Download size={14} />
                Simpan PDF
              </button>
              <button
                onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                <RefreshCw size={14} />
                Ulangi Quiz
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Quiz Phase ── */}
      {phase === 'quiz' && (
        <div className="flex flex-col min-h-full">
      {/* Header */}
      <header className="flex-shrink-0 px-4 pt-4 pb-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={handleBack}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100/80 dark:bg-slate-800/80 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-slate-500">Pertanyaan {step + 1}/{totalSteps}</span>
                <span className="text-[11px] font-bold text-emerald-500">{Math.round(progress)}%</span>
              </div>
              <div className="h-1 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="max-w-lg mx-auto" key={animKey}>
          <div
            className="quiz-step-enter"
            style={{
              animation: `quizSlide${slideDir === 'forward' ? 'In' : 'InBack'} 0.3s ease-out`,
            }}
          >
            {/* Question header */}
            <div className="mb-6">
              <div className="text-[40px] mb-2">{currentStep.emoji}</div>
              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white leading-tight">{currentStep.heading}</h2>
              <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">{currentStep.subtitle}</p>
            </div>

            {/* Step 1: Departure */}
            {step === 0 && (
              <div className="space-y-2">
                {departureOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleSingleSelect('departure', opt.value)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all duration-200 active:scale-[0.98] ${
                      answers.departure === opt.value
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600'
                        : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      answers.departure === opt.value
                        ? 'bg-emerald-100 dark:bg-emerald-900/40'
                        : 'bg-gray-50 dark:bg-slate-700'
                    }`}>
                      {opt.icon}
                    </div>
                    <span className="flex-1 text-left text-sm font-semibold text-gray-800 dark:text-white">{opt.label}</span>
                    <div className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center ${
                      answers.departure === opt.value
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-gray-300 dark:border-slate-600'
                    }`}>
                      {answers.departure === opt.value && <Check size={12} className="text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: Package Type (class + destination) */}
            {step === 1 && (
              <div>
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">Kelas Paket</p>
                  <div className="flex flex-wrap gap-2">
                    {packageClassOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setAnswers(prev => ({ ...prev, packageClass: opt.value }))}
                        className={`px-3 py-2 rounded-xl border-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                          answers.packageClass === opt.value
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300'
                        }`}
                      >
                        <span>{opt.icon}</span> {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">Destinasi</p>
                  <div className="flex flex-wrap gap-2">
                    {destinationOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setAnswers(prev => ({ ...prev, destination: opt.value }))}
                        className={`px-3 py-2 rounded-xl border-2 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                          answers.destination === opt.value
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300'
                        }`}
                      >
                        <span>{opt.icon}</span> {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSlideDir('forward');
                    setAnimKey(k => k + 1);
                    setStep(2);
                  }}
                  disabled={!answers.packageClass || !answers.destination}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Lanjut
                </button>
              </div>
            )}

            {/* Step 3: Budget */}
            {step === 2 && (
              <div className="space-y-2">
                {budgetOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleSingleSelect('budget', opt.value)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all duration-200 active:scale-[0.98] ${
                      answers.budget === opt.value
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600'
                        : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                      answers.budget === opt.value
                        ? 'bg-emerald-100 dark:bg-emerald-900/40'
                        : 'bg-gray-50 dark:bg-slate-700'
                    }`}>
                      {opt.icon}
                    </div>
                    <span className="flex-1 text-left text-sm font-semibold text-gray-800 dark:text-white">{opt.label}</span>
                    <div className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center ${
                      answers.budget === opt.value
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-gray-300 dark:border-slate-600'
                    }`}>
                      {answers.budget === opt.value && <Check size={12} className="text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Step 4: Priority (multi select max 2) */}
            {step === 3 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500">Dipilih: {answers.priority.length}/2</span>
                </div>
                <div className="space-y-2">
                  {priorityOptions.map(opt => {
                    const selected = answers.priority.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => handlePriorityToggle(opt.value)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all duration-200 active:scale-[0.98] ${
                          selected
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-600'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                          selected
                            ? 'bg-emerald-100 dark:bg-emerald-900/40'
                            : 'bg-gray-50 dark:bg-slate-700'
                        }`}>
                          {opt.icon}
                        </div>
                        <span className="flex-1 text-left text-sm font-semibold text-gray-800 dark:text-white">{opt.label}</span>
                        <div className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center ${
                          selected
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'border-gray-300 dark:border-slate-600'
                        }`}>
                          {selected && <Check size={12} className="text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    if (answers.priority.length > 0) {
                      setSlideDir('forward');
                      setAnimKey(k => k + 1);
                      setStep(4);
                    }
                  }}
                  disabled={answers.priority.length === 0}
                  className="w-full mt-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Lanjut
                </button>
              </div>
            )}

            {/* Step 5: Room + Pax (combined) */}
            {step === 4 && (
              <div>
                {/* Room type */}
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">Tipe Kamar</p>
                  <div className="flex flex-wrap gap-2">
                    {roomOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setAnswers(prev => ({ ...prev, room: opt.value }))}
                        className={`px-4 py-2.5 rounded-xl border-2 text-xs font-bold transition-all active:scale-95 ${
                          answers.room === opt.value
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 dark:border-emerald-600'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pax count */}
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">Jumlah Orang</p>
                  <div className="flex flex-wrap gap-2">
                    {paxOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setAnswers(prev => ({ ...prev, pax: opt.value }))}
                        className={`px-4 py-2.5 rounded-xl border-2 text-xs font-bold transition-all active:scale-95 ${
                          answers.pax === opt.value
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 dark:border-emerald-600'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSlideDir('forward');
                    setAnimKey(k => k + 1);
                    setStep(5);
                  }}
                  disabled={!answers.room && !answers.pax}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Lanjut
                </button>
              </div>
            )}

            {/* Step 6: Contact form */}
            {step === 5 && (
              <div>
                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 dark:text-slate-400 mb-1.5">Nama Panggilan</label>
                    <input
                      type="text"
                      value={nama}
                      onChange={e => setNama(e.target.value)}
                      placeholder="Contoh: Sari"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-800 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 dark:text-slate-400 mb-1.5">Nomor WhatsApp</label>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1 px-3 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-sm text-gray-600 dark:text-slate-300 shrink-0">
                        <span className="text-sm">🇮🇩</span>
                        <span className="text-xs font-bold">{countryCode}</span>
                      </div>
                      <input
                        type="tel"
                        value={wa}
                        onChange={e => setWa(e.target.value.replace(/\D/g, ''))}
                        placeholder="812 3456 7890"
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-gray-800 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Privacy info */}
                <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
                  <span className="text-sm mt-0.5">🔒</span>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                    Data Anda aman dan hanya dibagikan ke agent pilihan Anda
                  </p>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!isFormValid}
                  className="w-full mt-5 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  Lihat Rekomendasi
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes quizSlideIn {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes quizSlideInBack {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
        </div>
      )}

    </div>
  );
}
