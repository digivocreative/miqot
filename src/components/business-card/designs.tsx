// Desain Kartu Nama Digital — modul presentasional murni (tanpa analytics/auth)
// agar bisa di-render standalone (preview harness) maupun dari BusinessCardPage.
//
// Aturan export (DESIGN-SYSTEM.md §Business Card Export): ukuran piksel pasti,
// inline style + inline SVG, flat color / gradient sederhana saja (raster-safe,
// tanpa blur/filter), cek overflow untuk field dinamis.
import { useState } from 'react';
import { handleAgentPhotoError } from '../../lib/agent-photo';
import logoColorUrl from '../../logo-alhijaz.webp';

export type DesignId = 'd1' | 'd2' | 'd3' | 'd4' | 'd5';
export type CardFormat = 'landscape' | 'portrait';

export interface DesignMeta {
  id: DesignId;
  name: string;
  qrColor: { dark: string; light: string };
}

// Warna brand diambil langsung dari piksel logo resmi.
const RED = '#df110d';
const RED_DARK = '#a50c09';
const GOLD = '#c08427';
const GOLD_LIGHT = '#e2b45c';
const GOLD_PALE = '#f3dcae';

// QR selalu modul gelap di tile terang (QR terbalik sering ditolak scanner).
export const DESIGNS: DesignMeta[] = [
  { id: 'd1', name: 'Emerald Masjid', qrColor: { dark: '#065f46', light: '#ffffff' } },
  { id: 'd2', name: "Navy Ka'bah", qrColor: { dark: '#0a1122', light: '#ffffff' } },
  { id: 'd3', name: 'Putih Klasik', qrColor: { dark: '#1f2937', light: '#ffffff' } },
  { id: 'd4', name: 'Kiswah Gold', qrColor: { dark: '#1a1408', light: '#fffdf5' } },
  // d5: modul maroon gelap, bukan merah brand — merah terang kurang kontras utk scanner.
  { id: 'd5', name: 'Merah Alhijaz', qrColor: { dark: '#6b0906', light: '#ffffff' } },
];

export const CARD_SIZE: Record<CardFormat, { w: number; h: number }> = {
  landscape: { w: 1050, h: 600 },
  portrait: { w: 600, h: 1020 },
};

export interface CardProps {
  name: string; initials: string; role: string; brand: string;
  wa: string; email: string; web: string; qrCaption: string;
  photoUrl: string | null; qrDataUrl: string;
}

const font = "'Inter','Segoe UI',sans-serif";
// Nama agent pakai serif elegan; teks brand/label pakai Montserrat geometris.
// Keduanya woff2 lokal (public/fonts/brochure) + @font-face di index.html —
// wajib begitu agar ikut ter-embed saat export snapdom (embedFonts).
const fontSerif = "'Playfair Display', Georgia, 'Times New Roman', serif";
const fontDisplay = "'Montserrat', 'Inter', sans-serif";

// Layanan faktual (jangan tambah layanan yang tidak dijual Alhijaz).
const SERVICES = ['Umroh', 'Haji Plus'];

export function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();
}

// Kecilkan font nama panjang agar tetap muat satu baris (maxChars ≈ lebar area / (0.52 × base)).
function fitName(base: number, name: string, maxChars: number): number {
  if (name.length <= maxChars) return base;
  return Math.max(Math.round((base * maxChars) / name.length), Math.round(base * 0.6));
}

// ── Ikon kontak ──
const PhoneSvg = ({ color = GOLD, size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.88.37 1.85.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.96.33 1.93.57 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);
const MailSvg = ({ color = GOLD, size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
  </svg>
);
const GlobeSvg = ({ color = GOLD, size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20" /><path d="M2 12h20" />
  </svg>
);

// ── Motif Islami (inline SVG, flat, raster-safe) ──

// Pola bintang 8 arah (dua persegi diputar 45°) — tile background geometri Islam.
const starPattern = (color: string, opacity = 0.06) =>
  `url("data:image/svg+xml,%3Csvg width='72' height='72' viewBox='0 0 72 72' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='${encodeURIComponent(color)}' stroke-width='1' opacity='${opacity}'%3E%3Crect x='16' y='16' width='40' height='40'/%3E%3Crect x='16' y='16' width='40' height='40' transform='rotate(45 36 36)'/%3E%3Ccircle cx='36' cy='36' r='6'/%3E%3C/g%3E%3C/svg%3E")`;

// Siluet skyline masjid: 2 menara + kubah besar (puncak lancip) + kubah samping.
// height WAJIB eksplisit — tanpa itu svg melebar mengikuti container dan
// tingginya ikut membesar (di kartu 1050px jadi ~234px, mendominasi kartu).
function MosqueSkyline({ color, opacity = 0.15, height }: { color: string; opacity?: number; height: number }) {
  return (
    <svg viewBox="0 0 600 140" preserveAspectRatio="xMidYMax meet" style={{ display: 'block', width: '100%', height }}>
      <path fill={color} opacity={opacity} d="M0 140 L0 112 H14 V64 H11 V56 H16 L25 28 L34 56 H39 V64 H36 V112 H60 V96 Q60 72 84 63 Q108 72 108 96 V112 H136 V100 Q136 85 151 79 Q166 85 166 100 V112 H198 V88 C198 62 244 46 266 37 C288 28 294 22 300 8 C306 22 312 28 334 37 C356 46 402 62 402 88 V112 H434 V100 Q434 85 449 79 Q464 85 464 100 V112 H492 V96 Q492 72 516 63 Q540 72 540 96 V112 H564 V64 H561 V56 H566 L575 28 L584 56 H589 V64 H586 V112 H600 V140 Z" />
    </svg>
  );
}

// Bulan sabit (arc balik radius lebih besar = cekungan; radius < ½chord bikin path kolaps).
function Crescent({ color, size = 28, style }: { color: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <path fill={color} d="M60 5 A45 45 0 1 0 60 95 A55 55 0 0 1 60 5 Z" />
    </svg>
  );
}

// Ka'bah flat — proporsi mengikuti aslinya: lebih tinggi dari lebar, sudut tajam,
// kain hitam terlihat di ATAS band hizam (~17%), pintu terangkat dari dasar dan
// offset ke kanan.
function KaabaMark({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <rect x="22" y="14" width="76" height="92" rx="1.5" fill="#0c0c11" stroke={GOLD} strokeWidth="1" strokeOpacity="0.5" />
      <rect x="22" y="30" width="76" height="12" fill={GOLD} />
      <g fill="#0c0c11" opacity="0.3">
        <rect x="28" y="34" width="9" height="4" /><rect x="43" y="34" width="9" height="4" />
        <rect x="58" y="34" width="9" height="4" /><rect x="73" y="34" width="9" height="4" />
        <rect x="88" y="34" width="6" height="4" />
      </g>
      <rect x="70" y="66" width="15" height="26" rx="1" fill={GOLD_LIGHT} />
      <rect x="70" y="66" width="15" height="5" fill={GOLD} />
    </svg>
  );
}

// Gema band hizam kiswah: dua garis emas tipis mengapit jalur kosong.
function HizamBand({ width = '100%' }: { width?: number | string }) {
  return <div style={{ width, height: 9, borderTop: `1px solid ${GOLD}`, borderBottom: `1px solid ${GOLD}`, opacity: 0.7 }} />;
}

// Chip layanan — pengisi ruang yang informatif, bukan sekadar dekorasi.
function ServiceChips({ fg, bg, border, center = false }: { fg: string; bg: string; border: string; center?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start' }}>
      {SERVICES.map(s => (
        <span key={s} style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: fg, background: bg, border: `1px solid ${border}`, borderRadius: 999, padding: '7px 18px', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>{s}</span>
      ))}
    </div>
  );
}

// Watermark bintang 8 arah besar — pengisi area kosong, opasitas rendah.
function StarWatermark({ color, size, opacity, style }: { color: string; size: number; opacity: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <g fill="none" stroke={color} strokeWidth="1" opacity={opacity}>
        <rect x="21" y="21" width="58" height="58" />
        <rect x="21" y="21" width="58" height="58" transform="rotate(45 50 50)" />
        <circle cx="50" cy="50" r="13" />
        <circle cx="50" cy="50" r="41" />
      </g>
    </svg>
  );
}

// Ornamen sudut untuk desain berbingkai (siku ganda + belah ketupat).
function CornerOrnament({ color, size = 44, style }: { color: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" style={style}>
      <g fill="none" stroke={color} strokeWidth="1.5">
        <path d="M4 36 V12 Q4 4 12 4 H36" />
        <path d="M13 42 V18 Q13 13 18 13 H42" strokeOpacity="0.45" />
      </g>
      <rect x="0.5" y="0.5" width="8" height="8" transform="rotate(45 4.5 4.5)" fill={color} />
    </svg>
  );
}

// Empat sudut sekaligus, sejajar bingkai dalam (inset px dari tepi kartu).
function FrameCorners({ color, inset = 32 }: { color: string; inset?: number }) {
  const c = (pos: React.CSSProperties, deg: number) => (
    <CornerOrnament color={color} style={{ position: 'absolute', transform: `rotate(${deg}deg)`, ...pos }} />
  );
  return (
    <>
      {c({ top: inset, left: inset }, 0)}
      {c({ top: inset, right: inset }, 90)}
      {c({ bottom: inset, right: inset }, 180)}
      {c({ bottom: inset, left: inset }, 270)}
    </>
  );
}

// Pembatas ornamen: garis — belah ketupat — garis.
function Ornament({ color = GOLD, width = 170 }: { color?: string; width?: number }) {
  return (
    <svg width={width} height={14} viewBox="0 0 170 14">
      <line x1="0" y1="7" x2="66" y2="7" stroke={color} strokeWidth="1" />
      <rect x="79" y="1" width="12" height="12" transform="rotate(45 85 7)" fill={color} />
      <circle cx="72" cy="7" r="1.6" fill={color} />
      <circle cx="98" cy="7" r="1.6" fill={color} />
      <line x1="104" y1="7" x2="170" y2="7" stroke={color} strokeWidth="1" />
    </svg>
  );
}

// Lockup brand: mark AIW + teks perusahaan. Di latar gelap (light=true) mark
// warna asli ditaruh di chip putih — logo merah+emas tetap tampil (knockout
// putih menghilangkan identitas merah brand).
function BrandLockup({ light, markH = 34, textColor, subColor, hideText = false }: {
  light?: boolean; markH?: number; textColor: string; subColor?: string; hideText?: boolean;
}) {
  const sub = subColor || (light ? GOLD_LIGHT : '#9a6b1e');
  const markW = (h: number) => Math.round(h * (1261 / 380));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {light ? (
        <div style={{ background: '#ffffff', borderRadius: 9, padding: '6px 10px', flexShrink: 0 }}>
          <img src={logoColorUrl} alt="" style={{ height: markH - 8, width: markW(markH - 8), objectFit: 'contain', display: 'block' }} />
        </div>
      ) : (
        <img src={logoColorUrl} alt="" style={{ height: markH, width: markW(markH), objectFit: 'contain', display: 'block', flexShrink: 0 }} />
      )}
      {!hideText && (
        <div style={{ borderLeft: `1px solid ${sub}`, paddingLeft: 12 }}>
          <div style={{ fontFamily: fontDisplay, fontSize: Math.round(markH * 0.5), fontWeight: 800, color: textColor, letterSpacing: 1.2, lineHeight: 1.15, whiteSpace: 'nowrap' }}>ALHIJAZ INDOWISATA</div>
          <div style={{ fontFamily: fontDisplay, fontSize: Math.round(markH * 0.36), fontWeight: 700, color: sub, letterSpacing: 3.2, textTransform: 'uppercase', marginTop: 2, whiteSpace: 'nowrap' }}>Tour & Travel</div>
        </div>
      )}
    </div>
  );
}

// ── Sub-komponen bersama ──
function Avatar({ url, initials, size, bg, border, textColor, fontSize, shadow, ring }: {
  url: string | null; initials: string; size: number; bg: string; border: string; textColor: string; fontSize: number; shadow?: string; ring?: string;
}) {
  // Setelah retry habis, fallback ke inisial bergaya desain kartu (bukan ui-avatars).
  const [failed, setFailed] = useState(false);
  const s: React.CSSProperties = { width: size, height: size, borderRadius: '50%', border, flexShrink: 0, overflow: 'hidden', boxShadow: shadow || '0 4px 20px rgba(0,0,0,0.15)' };
  const inner = url && !failed
    ? <img src={url} style={{ ...s, objectFit: 'cover' }}
        onError={e => handleAgentPhotoError(e.currentTarget, initials, size, () => setFailed(true))} />
    : <div style={{ ...s, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize, fontWeight: 700, color: textColor }}>{initials}</span>
      </div>;
  if (!ring) return inner;
  return <div style={{ padding: 5, borderRadius: '50%', border: `1.5px solid ${ring}`, flexShrink: 0 }}>{inner}</div>;
}

function ContactRow({ icon, text, iconBg, iconBorder, textColor }: {
  icon: React.ReactNode; text: string; iconBg: string; iconBorder: string; textColor: string;
}) {
  // Email panjang ikut mengecil agar tak meluber (hanya nama yang punya fitName).
  const fs = Math.max(Math.round((20 * 30) / Math.max(text.length, 30)), 15);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, border: `1px solid ${iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: fs, color: textColor, fontWeight: 500, whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  );
}

function Contacts({ wa, email, web, iconColor, iconBg, iconBorder, textColor, gap = 14 }: {
  wa: string; email: string; web: string; iconColor: string; iconBg: string; iconBorder: string; textColor: string; gap?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {wa && <ContactRow icon={<PhoneSvg color={iconColor} size={15} />} text={wa} iconBg={iconBg} iconBorder={iconBorder} textColor={textColor} />}
      {email && <ContactRow icon={<MailSvg color={iconColor} size={15} />} text={email} iconBg={iconBg} iconBorder={iconBorder} textColor={textColor} />}
      <ContactRow icon={<GlobeSvg color={iconColor} size={15} />} text={web} iconBg={iconBg} iconBorder={iconBorder} textColor={textColor} />
    </div>
  );
}

function QRBox({ src, size, border, bg = '#ffffff', radius = 10 }: { src: string; size: number; border: string; bg?: string; radius?: number }) {
  // Inset 20px = quiet zone ekstra di dalam tile (spec QR minta ≥2 lebar modul).
  return (
    <div style={{ width: size, height: size, border, borderRadius: radius, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>
      {src && <img src={src} style={{ width: size - 20, height: size - 20 }} />}
    </div>
  );
}

// ════════════════════════════════════════
// D1 — Emerald Masjid: panel zamrud + siluet masjid + aksen emas
// ════════════════════════════════════════

// Latar panel zamrud berlapis: pola bintang 2 skala + glow radial + gradient multi-stop.
const d1EmeraldBg = (glowY: string): React.CSSProperties => ({
  background: '#054a37',
  backgroundImage: `${starPattern('#ffffff', 0.05)}, ${starPattern(GOLD_LIGHT, 0.04)}, radial-gradient(circle at 50% ${glowY}, rgba(226,180,92,0.17), rgba(226,180,92,0) 62%), linear-gradient(165deg, #032b20, #065f46 55%, #047857)`,
  backgroundSize: '72px 72px, 144px 144px, cover, cover',
});

// Lengkung mihrab emas (garis ganda + finial belah ketupat + plinth) membingkai foto,
// dengan glow radial lembut di belakangnya.
function D1ArchFrame({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', width: w, height: h, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: Math.round(h * 0.13), boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', inset: -16, backgroundImage: 'radial-gradient(circle at 50% 58%, rgba(226,180,92,0.28), rgba(226,180,92,0) 65%)' }} />
      <svg width={w} height={h} viewBox="0 0 224 248" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        <path d="M30 248 L30 122 C30 66 64 36 112 20 C160 36 194 66 194 122 L194 248" fill="none" stroke={GOLD_LIGHT} strokeWidth="2" />
        <path d="M42 248 L42 126 C42 76 72 50 112 36 C152 50 182 76 182 126 L182 248" fill="none" stroke={GOLD} strokeWidth="1" strokeOpacity="0.55" />
        <line x1="112" y1="20" x2="112" y2="14" stroke={GOLD_LIGHT} strokeWidth="1.5" />
        <rect x="108" y="4" width="8" height="8" transform="rotate(45 112 8)" fill={GOLD_LIGHT} />
        <line x1="20" y1="247" x2="48" y2="247" stroke={GOLD_LIGHT} strokeWidth="2" />
        <line x1="176" y1="247" x2="204" y2="247" stroke={GOLD_LIGHT} strokeWidth="2" />
      </svg>
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

// Skyline masjid dua lapis (belakang lebih tinggi, samar, digeser ke kiri agar
// kubahnya tidak menumpuk dengan lapis depan) — kesan kedalaman.
function D1SkylineDuo({ height }: { height: number }) {
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', bottom: Math.round(height * 0.2), left: -150, right: 20 }}>
        <MosqueSkyline color="#ffffff" opacity={0.06} height={Math.round(height * 0.9)} />
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <MosqueSkyline color="#ffffff" opacity={0.16} height={Math.round(height * 0.75)} />
      </div>
    </div>
  );
}

// Role uppercase letterspaced diapit rule emas pendek.
function D1RoleRule({ text, color = GOLD_PALE, line = 'rgba(226,180,92,0.55)' }: { text: string; color?: string; line?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10 }}>
      <span style={{ width: 26, height: 1, background: line, flexShrink: 0 }} />
      <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color, letterSpacing: 2.6, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{text}</span>
      <span style={{ width: 26, height: 1, background: line, flexShrink: 0 }} />
    </div>
  );
}

// Baris kontak bertumpuk dengan hairline separator; ikon di tile zamrud bertepi emas.
function D1Contacts({ wa, email, web }: { wa: string; email: string; web: string }) {
  const rows = [
    wa ? { icon: <PhoneSvg color={GOLD_PALE} size={15} />, text: wa } : null,
    email ? { icon: <MailSvg color={GOLD_PALE} size={15} />, text: email } : null,
    { icon: <GlobeSvg color={GOLD_PALE} size={15} />, text: web },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '14px 2px', borderBottom: i < rows.length - 1 ? '1px solid rgba(6,95,70,0.14)' : 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg, #065f46, #047857)', border: '1px solid rgba(192,132,39,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(6,95,70,0.25)' }}>{r.icon}</div>
          <span style={{ fontSize: Math.max(Math.round((17 * 30) / Math.max(r.text.length, 29)), 14), color: '#173029', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

// Chip layanan elegan: uppercase letterspaced + bullet belah ketupat emas.
function D1Chips({ center = false }: { center?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: center ? 'center' : 'flex-start' }}>
      {SERVICES.map(s => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#065f46', background: 'linear-gradient(180deg, #ffffff, #e9f6ef)', border: '1px solid rgba(192,132,39,0.5)', borderRadius: 999, padding: '10px 20px', boxShadow: '0 2px 8px rgba(6,95,70,0.08)', whiteSpace: 'nowrap' }}>
          <svg width="9" height="9" viewBox="0 0 10 10" style={{ flexShrink: 0 }}><rect x="2.2" y="2.2" width="5.6" height="5.6" transform="rotate(45 5 5)" fill={GOLD} /></svg>
          {s}
        </span>
      ))}
    </div>
  );
}

// Hairline emas memudar dengan diamond di pangkal — pemisah di bawah lockup brand.
function D1BrandRule() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
      <span style={{ width: 8, height: 8, background: GOLD, transform: 'rotate(45deg)', flexShrink: 0 }} />
      <span style={{ flex: 1, height: 1, backgroundImage: `linear-gradient(90deg, ${GOLD}, rgba(192,132,39,0.05))` }} />
    </div>
  );
}

// QR di atas medali bintang samar — watermark tampil utuh, tidak terpotong.
function D1QrBlock({ src, caption, size = 146 }: { src: string; caption: string; size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
      <div style={{ position: 'relative' }}>
        <StarWatermark color="#059669" size={size + 66} opacity={0.26} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} />
        <QRBox src={src} size={size} border={`1.5px solid ${GOLD_LIGHT}`} />
      </div>
      <span style={{ position: 'relative', fontSize: 14, color: '#51625b', fontWeight: 600, whiteSpace: 'nowrap' }}>{caption}</span>
    </div>
  );
}

// Band penutup zamrud bermotif emas — mengunci komposisi di dasar kartu.
function D1FooterBand({ mx = 0, height = 44 }: { mx?: number; height?: number }) {
  return (
    <div style={{ height, flexShrink: 0, margin: `0 ${-mx}px 0`, borderTop: '1px solid rgba(226,180,92,0.8)', background: '#04382b', backgroundImage: `${starPattern(GOLD_LIGHT, 0.16)}, linear-gradient(90deg, #032b20, #065f46 50%, #032b20)`, backgroundSize: '44px 44px, cover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Ornament color={GOLD_LIGHT} width={150} />
    </div>
  );
}

function D1Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', fontFamily: font, overflow: 'hidden' }}>
      <div style={{ width: 408, height: '100%', position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...d1EmeraldBg('36%') }}>
        <div style={{ position: 'absolute', inset: 12, border: '1px solid rgba(226,180,92,0.28)', pointerEvents: 'none' }} />
        <Crescent color={GOLD_LIGHT} size={36} style={{ position: 'absolute', top: 26, right: 28, transform: 'rotate(24deg)' }} />
        <D1SkylineDuo height={132} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -18 }}>
          <D1ArchFrame w={224} h={248}>
            <Avatar url={photoUrl} initials={initials} size={130} bg="rgba(255,255,255,0.14)" border="3px solid rgba(255,255,255,0.6)" textColor="white" fontSize={46} shadow="0 10px 36px rgba(0,0,0,0.35)" />
          </D1ArchFrame>
          <div style={{ textAlign: 'center', padding: '0 26px', marginTop: 16 }}>
            <div style={{ fontSize: Math.max(fitName(31, name, 22), 25), fontFamily: fontSerif, fontWeight: 800, color: 'white', lineHeight: 1.22 }}>{name}</div>
            <D1RoleRule text={role} />
          </div>
        </div>
      </div>
      <div style={{ width: 9, height: '100%', flexShrink: 0, background: `linear-gradient(90deg, #7a5417, ${GOLD} 30%, ${GOLD_PALE} 52%, ${GOLD} 78%, #8a5f1c)` }} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '32px 46px 0', background: '#ffffff', backgroundImage: `${starPattern('#065f46', 0.018)}, linear-gradient(170deg, #ffffff 30%, #eef7f2 100%)`, backgroundSize: '132px 132px, cover' }}>
        <BrandLockup markH={33} textColor="#3a2c12" />
        <D1BrandRule />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 30 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <D1Contacts wa={wa} email={email} web={web} />
            <div style={{ marginTop: 22 }}><D1Chips /></div>
          </div>
          <D1QrBlock src={qrDataUrl} caption={qrCaption} size={152} />
        </div>
        <D1FooterBand mx={46} />
      </div>
    </div>
  );
}

function D1Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, display: 'flex', flexDirection: 'column', fontFamily: font, overflow: 'hidden', background: '#ffffff', backgroundImage: `${starPattern('#065f46', 0.018)}, linear-gradient(180deg, #ffffff 40%, #eef7f2 100%)`, backgroundSize: '132px 132px, cover' }}>
      <div style={{ height: 350, position: 'relative', flexShrink: 0, ...d1EmeraldBg('60%') }}>
        <div style={{ position: 'absolute', left: 12, right: 12, top: 12, bottom: 14, border: '1px solid rgba(226,180,92,0.28)', pointerEvents: 'none' }} />
        <Crescent color={GOLD_LIGHT} size={32} style={{ position: 'absolute', top: 24, right: 26, transform: 'rotate(24deg)' }} />
        <D1SkylineDuo height={120} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 26 }}>
          <BrandLockup light markH={29} textColor="#ffffff" subColor={GOLD_LIGHT} />
          <div style={{ marginTop: 14 }}>
            <D1ArchFrame w={210} h={232}>
              <Avatar url={photoUrl} initials={initials} size={122} bg="rgba(255,255,255,0.14)" border="3px solid rgba(255,255,255,0.6)" textColor="white" fontSize={42} shadow="0 10px 32px rgba(0,0,0,0.35)" />
            </D1ArchFrame>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg, ${GOLD}, ${GOLD_PALE} 50%, ${GOLD})` }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '22px 44px 0' }}>
        <div style={{ fontSize: Math.max(fitName(29, name, 28), 23), fontFamily: fontSerif, fontWeight: 800, color: '#0c231b', textAlign: 'center', whiteSpace: 'nowrap' }}>{name}</div>
        <D1RoleRule text={role} color="#9a6d1f" line="rgba(192,132,39,0.5)" />
        <div style={{ margin: '14px 0 18px' }}><Ornament color={GOLD} width={190} /></div>
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(192,132,39,0.38)', borderRadius: 16, padding: '6px 24px', boxShadow: '0 10px 30px rgba(6,95,70,0.09)' }}>
          <D1Contacts wa={wa} email={email} web={web} />
        </div>
        <div style={{ marginTop: 20 }}><D1Chips center /></div>
        <div style={{ marginTop: 'auto', paddingBottom: 20 }}>
          <D1QrBlock src={qrDataUrl} caption={qrCaption} size={146} />
        </div>
      </div>
      <D1FooterBand />
    </div>
  );
}

// ════════════════════════════════════════
// D2 — Navy Ka'bah: langit malam + Ka'bah emas
// ════════════════════════════════════════

// Taburan bintang malam — dot putih kebiruan + sparkle 4 arah emas, posisi hardcode.
type D2StarSpec = { x: number; y: number; r: number; o: number; s?: boolean };

const D2_STARS_L: D2StarSpec[] = [
  { x: 432, y: 46, r: 1.6, o: 0.45 },
  { x: 474, y: 102, r: 2.1, o: 0.6 },
  { x: 517, y: 58, r: 6, o: 0.55, s: true },
  { x: 577, y: 120, r: 1.5, o: 0.4 },
  { x: 622, y: 52, r: 1.9, o: 0.55 },
  { x: 664, y: 132, r: 5, o: 0.5, s: true },
  { x: 700, y: 78, r: 1.4, o: 0.42 },
  { x: 547, y: 172, r: 1.3, o: 0.3 },
  { x: 760, y: 66, r: 1.8, o: 0.55 },
  { x: 800, y: 40, r: 1.4, o: 0.45 },
  { x: 872, y: 60, r: 5.5, o: 0.6, s: true },
  { x: 930, y: 98, r: 1.6, o: 0.5 },
  { x: 748, y: 152, r: 1.5, o: 0.45 },
  { x: 1014, y: 152, r: 1.7, o: 0.5 },
  { x: 741, y: 258, r: 5, o: 0.4, s: true },
  { x: 1022, y: 282, r: 1.5, o: 0.42 },
  { x: 752, y: 372, r: 1.5, o: 0.38 },
  { x: 1016, y: 396, r: 5, o: 0.45, s: true },
  { x: 745, y: 486, r: 1.4, o: 0.32 },
  { x: 1012, y: 508, r: 1.7, o: 0.45 },
];

const D2_STARS_P: D2StarSpec[] = [
  { x: 60, y: 60, r: 1.8, o: 0.55 },
  { x: 106, y: 118, r: 5.5, o: 0.55, s: true },
  { x: 152, y: 66, r: 1.4, o: 0.4 },
  { x: 60, y: 210, r: 1.5, o: 0.4 },
  { x: 128, y: 288, r: 5, o: 0.45, s: true },
  { x: 68, y: 350, r: 1.6, o: 0.42 },
  { x: 470, y: 122, r: 1.7, o: 0.5 },
  { x: 508, y: 192, r: 6, o: 0.55, s: true },
  { x: 546, y: 122, r: 1.4, o: 0.4 },
  { x: 476, y: 288, r: 1.5, o: 0.42 },
  { x: 536, y: 342, r: 5, o: 0.45, s: true },
  { x: 480, y: 412, r: 1.4, o: 0.35 },
  { x: 300, y: 90, r: 1.5, o: 0.45 },
  { x: 96, y: 436, r: 1.4, o: 0.32 },
  { x: 60, y: 762, r: 1.5, o: 0.35 },
  { x: 544, y: 742, r: 5, o: 0.4, s: true },
  { x: 66, y: 880, r: 1.4, o: 0.3 },
  { x: 540, y: 900, r: 1.6, o: 0.38 },
];

function D2Stars({ w, h, stars }: { w: number; h: number; stars: D2StarSpec[] }) {
  const spark = (x: number, y: number, r: number) =>
    `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0 }}>
      {stars.map((t, i) => t.s
        ? <path key={i} d={spark(t.x, t.y, t.r)} fill={GOLD_PALE} opacity={t.o} />
        : <circle key={i} cx={t.x} cy={t.y} r={t.r} fill="#dfe7f5" opacity={t.o} />)}
    </svg>
  );
}

// Bulan sabit dengan halo radial (glow via backgroundImage, raster-safe).
function D2Moon({ size = 48, style }: { size?: number; style?: React.CSSProperties }) {
  const box = Math.round(size * 2.2);
  return (
    <div style={{ position: 'absolute', width: box, height: box, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(226,180,92,0.30) 0%, rgba(226,180,92,0.08) 42%, rgba(226,180,92,0) 68%)', ...style }}>
      <Crescent color={GOLD_LIGHT} size={size} style={{ transform: 'rotate(24deg)' }} />
    </div>
  );
}

// Bingkai lengkung mihrab emas: outline ganda + finial belah ketupat di puncak.
function D2Arch({ w, h, pb = 14, children }: { w: number; h: number; pb?: number; children?: React.ReactNode }) {
  const sy = Math.round(h * 0.46);
  const ax = w / 2; const ay = 16;
  const outer = `M 5 ${h - 1} L 5 ${sy} Q 5 ${ay + 26} ${ax} ${ay} Q ${w - 5} ${ay + 26} ${w - 5} ${sy} L ${w - 5} ${h - 1} Z`;
  const inner = `M 13 ${h - 1} L 13 ${sy} Q 13 ${ay + 34} ${ax} ${ay + 11} Q ${w - 13} ${ay + 34} ${w - 13} ${sy} L ${w - 13} ${h - 1} Z`;
  return (
    <div style={{ position: 'relative', width: w, height: h, flexShrink: 0 }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0 }}>
        <path d={outer} fill="rgba(255,255,255,0.028)" stroke={GOLD} strokeWidth="1.4" strokeOpacity="0.75" />
        <path d={inner} fill="none" stroke={GOLD_LIGHT} strokeWidth="1" strokeOpacity="0.3" />
        <rect x={ax - 4} y={ay - 12} width={8} height={8} transform={`rotate(45 ${ax} ${ay - 8})`} fill={GOLD} />
        <line x1={5} y1={sy} x2={20} y2={sy} stroke={GOLD} strokeWidth="1" strokeOpacity="0.5" />
        <line x1={w - 20} y1={sy} x2={w - 5} y2={sy} stroke={GOLD} strokeWidth="1" strokeOpacity="0.5" />
        <line x1={ax} y1={ay + 13} x2={ax} y2={ay + 34} stroke={GOLD} strokeWidth="1" strokeOpacity="0.6" />
        <rect x={ax - 3.5} y={ay + 34} width={7} height={7} transform={`rotate(45 ${ax} ${ay + 37.5})`} fill={GOLD_LIGHT} opacity="0.9" />
        <circle cx={ax} cy={ay + 46} r={1.5} fill={GOLD_LIGHT} opacity="0.8" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: pb }}>{children}</div>
    </div>
  );
}

// Ka'bah berdiri di platform: glow emas lembut + garis mataf melengkung di depan.
function D2KaabaScene({ kaaba = 104, w = 200, arcs = true }: { kaaba?: number; w?: number; arcs?: boolean }) {
  return (
    <div style={{ position: 'relative', width: w, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: -14, left: '50%', width: w, height: kaaba + 34, transform: 'translateX(-50%)', backgroundImage: 'radial-gradient(ellipse 52% 46% at 50% 56%, rgba(226,180,92,0.24) 0%, rgba(226,180,92,0) 72%)' }} />
      <div style={{ position: 'relative' }}><KaabaMark size={kaaba} /></div>
      {arcs && (
        <svg width={w} height={26} viewBox={`0 0 ${w} 26`} style={{ position: 'relative', marginTop: -14 }}>
          <path d={`M ${w * 0.2} 6 A ${w * 0.3} 7 0 0 0 ${w * 0.8} 6`} fill="none" stroke={GOLD_LIGHT} strokeWidth="1" opacity="0.65" />
          <path d={`M ${w * 0.09} 8 A ${w * 0.41} 10 0 0 0 ${w * 0.91} 8`} fill="none" stroke={GOLD_LIGHT} strokeWidth="1" opacity="0.4" />
          <path d={`M 1 10 A ${w * 0.5 - 1} 13 0 0 0 ${w - 1} 10`} fill="none" stroke={GOLD_LIGHT} strokeWidth="1" opacity="0.22" />
        </svg>
      )}
    </div>
  );
}

// Baris layanan elegan: teks uppercase berjarak + belah ketupat emas + hairline sisi.
function D2Services({ size = 13 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 30, height: 1, backgroundImage: `linear-gradient(90deg, rgba(226,180,92,0), ${GOLD})` }} />
      {SERVICES.map((s, i) => (
        <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {i > 0 && <span style={{ width: 6, height: 6, background: GOLD, transform: 'rotate(45deg)', flexShrink: 0 }} />}
          <span style={{ fontFamily: fontDisplay, fontSize: size, fontWeight: 700, color: GOLD_PALE, letterSpacing: 3, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{s}</span>
        </span>
      ))}
      <div style={{ width: 30, height: 1, backgroundImage: `linear-gradient(90deg, ${GOLD}, rgba(226,180,92,0))` }} />
    </div>
  );
}

// Baris kontak varian navy: ikon tile bundar emas + pemisah hairline memudar.
function D2ContactCell({ icon, text }: { icon: React.ReactNode; text: string }) {
  const fs = Math.max(Math.round((20 * 30) / Math.max(text.length, 30)), 15);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(226,180,92,0.45)', backgroundImage: 'linear-gradient(150deg, rgba(226,180,92,0.18), rgba(226,180,92,0.03))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: fs, color: '#dde4f2', fontWeight: 500, whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  );
}

function D2Contacts({ wa, email, web }: { wa: string; email: string; web: string }) {
  const rows = [
    ...(wa ? [{ k: 'wa', icon: <PhoneSvg color={GOLD_LIGHT} size={15} />, t: wa }] : []),
    ...(email ? [{ k: 'em', icon: <MailSvg color={GOLD_LIGHT} size={15} />, t: email }] : []),
    { k: 'wb', icon: <GlobeSvg color={GOLD_LIGHT} size={15} />, t: web },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => (
        <div key={r.k}>
          {i > 0 && <div style={{ height: 1, backgroundImage: 'linear-gradient(90deg, rgba(226,180,92,0.35), rgba(226,180,92,0.05))', margin: '11px 0' }} />}
          <D2ContactCell icon={r.icon} text={r.t} />
        </div>
      ))}
    </div>
  );
}

// Panel kontak halus: bg samar + hairline emas + bar aksen emas di kiri.
function D2ContactPanel({ wa, email, web, width }: { wa: string; email: string; web: string; width?: number | string }) {
  return (
    <div style={{ width, alignSelf: width ? undefined : 'flex-start', position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(226,180,92,0.25)', borderRadius: 14, padding: '16px 26px 16px 22px' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD})` }} />
      <D2Contacts wa={wa} email={email} web={web} />
    </div>
  );
}

function D2Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', fontFamily: font, overflow: 'hidden', position: 'relative', backgroundColor: '#0a1122', backgroundImage: `${starPattern(GOLD_LIGHT, 0.045)}, radial-gradient(ellipse 640px 420px at 86% 0%, rgba(226,180,92,0.10), rgba(226,180,92,0) 68%), radial-gradient(ellipse 760px 560px at 12% 100%, rgba(43,73,133,0.30), rgba(43,73,133,0) 70%), linear-gradient(150deg, #070c19 0%, #0f1c38 52%, #0a1228 100%)`, backgroundSize: '72px 72px, 100% 100%, 100% 100%, 100% 100%' }}>
      <D2Stars w={1050} h={600} stars={D2_STARS_L} />
      <div style={{ position: 'absolute', inset: 14, border: '1px solid rgba(226,180,92,0.22)' }} />
      <div style={{ flex: 1, minWidth: 0, position: 'relative', padding: '44px 44px 40px 50px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <BrandLockup light markH={32} textColor="#ffffff" subColor={GOLD_LIGHT} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <Avatar url={photoUrl} initials={initials} size={126} bg="linear-gradient(135deg, #16213c, #1d2b4d)" border="3px solid #26355c" textColor={GOLD_LIGHT} fontSize={44} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.4)" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: Math.max(fitName(40, name, 19), 25), fontFamily: fontSerif, fontWeight: 800, color: '#f7f5ef', lineHeight: 1.18, whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <div style={{ width: 34, height: 1, background: GOLD }} />
              <div style={{ fontFamily: fontDisplay, fontSize: 13.5, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: 3, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{role}</div>
              <div style={{ flex: 1, minWidth: 20, height: 1, backgroundImage: `linear-gradient(90deg, ${GOLD}, rgba(192,132,39,0))` }} />
            </div>
            <div style={{ marginTop: 16 }}><D2Services /></div>
          </div>
        </div>
        <D2ContactPanel wa={wa} email={email} web={web} width="100%" />
      </div>
      <div style={{ width: 330, flexShrink: 0, position: 'relative', borderLeft: '1px solid rgba(226,180,92,0.4)', backgroundImage: 'linear-gradient(180deg, rgba(4,8,18,0.5), rgba(10,17,36,0.1) 42%, rgba(4,8,18,0.55))', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 5, width: 1, background: 'rgba(226,180,92,0.15)' }} />
        <D2Moon size={44} style={{ top: -6, right: 8 }} />
        <D2Arch w={230} h={252} pb={16}>
          <D2KaabaScene kaaba={108} w={200} />
        </D2Arch>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <QRBox src={qrDataUrl} size={132} border={`1.5px solid ${GOLD}`} />
          <span style={{ fontSize: 14, color: '#a7b1c7', fontWeight: 500, whiteSpace: 'nowrap' }}>{qrCaption}</span>
        </div>
      </div>
    </div>
  );
}

function D2Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, fontFamily: font, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '38px 40px 26px', backgroundColor: '#0a1122', backgroundImage: `${starPattern(GOLD_LIGHT, 0.045)}, radial-gradient(ellipse 520px 380px at 82% 3%, rgba(226,180,92,0.10), rgba(226,180,92,0) 68%), radial-gradient(ellipse 640px 300px at 50% 100%, rgba(226,180,92,0.08), rgba(226,180,92,0) 70%), linear-gradient(175deg, #070c19 0%, #101d3a 55%, #0a1228 100%)`, backgroundSize: '72px 72px, 100% 100%, 100% 100%, 100% 100%' }}>
      <D2Stars w={600} h={1020} stars={D2_STARS_P} />
      <div style={{ position: 'absolute', inset: 14, border: '1px solid rgba(226,180,92,0.22)' }} />
      <D2Moon size={40} style={{ top: 22, right: 24 }} />
      <div style={{ position: 'relative' }}><BrandLockup light markH={28} textColor="#ffffff" subColor={GOLD_LIGHT} /></div>
      <div style={{ marginTop: 22, position: 'relative' }}>
        <D2Arch w={226} h={248} pb={12}>
          <Avatar url={photoUrl} initials={initials} size={146} bg="linear-gradient(135deg, #16213c, #1d2b4d)" border="3px solid #26355c" textColor={GOLD_LIGHT} fontSize={48} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.4)" />
        </D2Arch>
      </div>
      <div style={{ position: 'relative', fontSize: Math.max(fitName(33, name, 25), 23), fontFamily: fontSerif, fontWeight: 800, color: '#f7f5ef', marginTop: 16, textAlign: 'center', whiteSpace: 'nowrap' }}>{name}</div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
        <div style={{ width: 30, height: 1, backgroundImage: `linear-gradient(90deg, rgba(192,132,39,0), ${GOLD})` }} />
        <div style={{ fontFamily: fontDisplay, fontSize: 13.5, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: 3, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{role}</div>
        <div style={{ width: 30, height: 1, backgroundImage: `linear-gradient(90deg, ${GOLD}, rgba(192,132,39,0))` }} />
      </div>
      <div style={{ position: 'relative', marginTop: 13 }}><D2Services size={12.5} /></div>
      <div style={{ position: 'relative', width: '100%', marginTop: 'auto' }}>
        <D2ContactPanel wa={wa} email={email} web={web} width="100%" />
      </div>
      <div style={{ marginTop: 'auto', position: 'relative', width: 600, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'absolute', bottom: -26, left: 0, right: 0 }}>
          <MosqueSkyline color={GOLD_LIGHT} opacity={0.1} height={118} />
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 46 }}>
          <D2KaabaScene kaaba={106} w={160} />
          <QRBox src={qrDataUrl} size={138} border={`1.5px solid ${GOLD}`} />
        </div>
        <span style={{ position: 'relative', fontSize: 14, color: '#a7b1c7', fontWeight: 500, marginTop: 10, whiteSpace: 'nowrap' }}>{qrCaption}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D3 — Putih Klasik: gading berlapis + bingkai emas ganda + ceruk mihrab
// ════════════════════════════════════════

// Manik belah ketupat di titik tengah keempat sisi bingkai luar.
function D3FrameBeads({ inset = 12 }: { inset?: number }) {
  const bead = (pos: React.CSSProperties) => (
    <div style={{ position: 'absolute', width: 9, height: 9, background: GOLD, transform: 'rotate(45deg)', ...pos }} />
  );
  return (
    <>
      {bead({ top: inset - 4, left: '50%', marginLeft: -4.5 })}
      {bead({ bottom: inset - 4, left: '50%', marginLeft: -4.5 })}
      {bead({ left: inset - 4, top: '50%', marginTop: -4.5 })}
      {bead({ right: inset - 4, top: '50%', marginTop: -4.5 })}
    </>
  );
}

// Garis pembatas penuh: hairline emas memudar di ujung + belah ketupat tengah.
function D3Divider({ width = '100%' }: { width?: number | string }) {
  return (
    <div style={{ width, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(192,132,39,0), rgba(192,132,39,0.75))' }} />
      <div style={{ width: 3, height: 3, borderRadius: '50%', background: GOLD, opacity: 0.8, flexShrink: 0 }} />
      <div style={{ width: 7, height: 7, background: GOLD, transform: 'rotate(45deg)', flexShrink: 0 }} />
      <div style={{ width: 3, height: 3, borderRadius: '50%', background: GOLD, opacity: 0.8, flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(192,132,39,0.75), rgba(192,132,39,0))' }} />
    </div>
  );
}

// Ceruk mihrab: lengkung lancip berlapis ganda menaungi foto agent.
function D3ArchNiche({ photoUrl, initials, w = 240, fill = '#fffdf6' }: {
  photoUrl: string | null; initials: string; w?: number; fill?: string;
}) {
  const s = w / 240;
  const h = Math.round(260 * s);
  const av = Math.round(138 * s);
  return (
    <div style={{ position: 'relative', width: w, height: h, flexShrink: 0 }}>
      <svg width={w} height={h} viewBox="0 0 240 260" style={{ position: 'absolute', inset: 0 }}>
        <path d="M120 14 C 166 32 202 64 202 120 L202 252 L38 252 L38 120 C 38 64 74 32 120 14 Z" fill={fill} stroke={GOLD} strokeWidth="1.6" />
        <path d="M188 252 L188 122 C 188 74 158 45 120 28 C 82 45 52 74 52 122 L52 252" fill="none" stroke={GOLD} strokeWidth="1" strokeOpacity="0.4" />
        <rect x="115" y="2" width="10" height="10" transform="rotate(45 120 7)" fill={GOLD} />
        <circle cx="38" cy="120" r="2.6" fill={GOLD} opacity="0.85" />
        <circle cx="202" cy="120" r="2.6" fill={GOLD} opacity="0.85" />
      </svg>
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: Math.round(88 * s) }}>
        <Avatar url={photoUrl} initials={initials} size={av} bg="linear-gradient(135deg, #fbf3e3, #f3dcae)" border="4px solid #ffffff" textColor={GOLD} fontSize={Math.round(av * 0.34)} shadow="0 10px 28px rgba(146,100,26,0.26)" />
      </div>
    </div>
  );
}

// Role uppercase letterspaced dengan garis emas pendek (rule).
function D3Role({ text, center = false }: { text: string; center?: boolean }) {
  const line = <div style={{ width: 34, height: 1.5, background: `linear-gradient(90deg, ${GOLD}, ${GOLD_LIGHT})`, flexShrink: 0 }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: center ? 'center' : 'flex-start' }}>
      {line}
      <span style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 800, color: '#8a5c10', letterSpacing: 3.2, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{text}</span>
      {center && line}
    </div>
  );
}

// Chip layanan varian klasik: uppercase letterspaced + pemisah belah ketupat.
function D3Chips({ center = false }: { center?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start' }}>
      {SERVICES.map((sv, i) => (
        <div key={sv} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <div style={{ width: 5, height: 5, background: GOLD, transform: 'rotate(45deg)', opacity: 0.8, margin: '0 14px' }} />}
          <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2.2, color: '#8a5c10', background: 'linear-gradient(180deg, #fdf8ec, #f6ead0)', border: '1px solid #ddbe72', borderRadius: 8, padding: '8px 19px', boxShadow: '0 1px 4px rgba(146,100,26,0.1)', whiteSpace: 'nowrap' }}>{sv}</span>
        </div>
      ))}
    </div>
  );
}

// Baris kontak klasik: ikon di wadah belah ketupat + hairline pemisah antar baris.
function D3Contacts({ wa, email, web, maxWidth }: { wa: string; email: string; web: string; maxWidth?: number }) {
  const rows = [
    wa ? { icon: <PhoneSvg color={GOLD} size={14} />, text: wa } : null,
    email ? { icon: <MailSvg color={GOLD} size={14} />, text: email } : null,
    { icon: <GlobeSvg color={GOLD} size={14} />, text: web },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxWidth }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderTop: i > 0 ? '1px solid rgba(192,132,39,0.28)' : 'none' }}>
          <div style={{ width: 26, height: 26, transform: 'rotate(45deg)', background: 'linear-gradient(135deg, #fdf8ec, #f3e3bd)', border: '1px solid #d9b96a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, margin: '5px 6px', boxShadow: '0 1px 3px rgba(146,100,26,0.15)' }}>
            <div style={{ transform: 'rotate(-45deg)', display: 'flex' }}>{r.icon}</div>
          </div>
          <span style={{ fontSize: Math.max(Math.round((20 * 30) / Math.max(r.text.length, 30)), 15), color: '#33281a', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

// Medali geometri besar: lingkaran + bintang 8 + oktagram, pengisi ruang elegan.
function D3Medallion({ size, opacity = 0.15, style }: { size: number; opacity?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" style={style}>
      <g fill="none" stroke={GOLD} strokeWidth="1" opacity={opacity}>
        <circle cx="100" cy="100" r="96" />
        <circle cx="100" cy="100" r="88" strokeDasharray="1.5 5" />
        <rect x="44" y="44" width="112" height="112" />
        <rect x="44" y="44" width="112" height="112" transform="rotate(45 100 100)" />
        <circle cx="100" cy="100" r="42" />
        <rect x="70" y="70" width="60" height="60" transform="rotate(22.5 100 100)" />
        <circle cx="100" cy="100" r="10" />
      </g>
      <g fill={GOLD} opacity={Math.min(opacity * 1.6, 1)}>
        <circle cx="100" cy="4" r="2" /><circle cx="100" cy="196" r="2" />
        <circle cx="4" cy="100" r="2" /><circle cx="196" cy="100" r="2" />
        <circle cx="32" cy="32" r="2" /><circle cx="168" cy="32" r="2" />
        <circle cx="32" cy="168" r="2" /><circle cx="168" cy="168" r="2" />
      </g>
    </svg>
  );
}

function D3Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, fontFamily: font, overflow: 'hidden', position: 'relative', background: '#fffdf8', backgroundImage: `radial-gradient(ellipse 620px 420px at 82% 30%, rgba(226,180,92,0.14), rgba(226,180,92,0) 68%), ${starPattern(GOLD, 0.05)}, ${starPattern(GOLD, 0.04)}, linear-gradient(160deg, #fffef9 0%, #fbf4e4 55%, #f6ecd3 100%)`, backgroundSize: 'cover, 72px 72px, 168px 168px, cover' }}>
      <div style={{ position: 'absolute', inset: 12, border: '1.5px solid rgba(192,132,39,0.8)' }} />
      <div style={{ position: 'absolute', inset: 19, border: '1px solid rgba(192,132,39,0.32)' }} />
      <FrameCorners color={GOLD} inset={30} />
      <D3FrameBeads inset={12} />
      <D3Medallion size={340} opacity={0.16} style={{ position: 'absolute', right: -74, top: 124 }} />
      <Crescent color={GOLD_LIGHT} size={30} style={{ position: 'absolute', top: 38, right: 48, transform: 'rotate(24deg)' }} />
      <div style={{ position: 'absolute', bottom: 21, left: 360, right: 24 }}>
        <MosqueSkyline color={GOLD} opacity={0.1} height={104} />
      </div>
      <div style={{ position: 'relative', height: '100%', padding: '44px 52px 40px', display: 'flex', gap: 42 }}>
        <div style={{ width: 296, flexShrink: 0, background: 'linear-gradient(180deg, #fcf6e8, #f5ead0)', border: '1px solid #e2cb93', borderRadius: 16, boxShadow: '0 10px 30px rgba(146,100,26,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '22px 20px 18px', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 6, border: '1px solid rgba(192,132,39,0.25)', borderRadius: 11 }} />
          <D3ArchNiche photoUrl={photoUrl} initials={initials} w={224} />
          <Ornament color={GOLD} width={150} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' }}>
            <div style={{ padding: 6, border: '1px solid rgba(192,132,39,0.4)', borderRadius: 14, background: 'rgba(255,255,255,0.55)' }}>
              <QRBox src={qrDataUrl} size={132} border={`1.5px solid ${GOLD_LIGHT}`} />
            </div>
            <span style={{ fontSize: 14, color: '#5f4e2e', fontWeight: 600, whiteSpace: 'nowrap' }}>{qrCaption}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', paddingTop: 2 }}>
          <BrandLockup markH={34} textColor="#31250f" />
          <div style={{ marginTop: 16 }}><D3Divider /></div>
          <div style={{ marginTop: 'auto', marginBottom: 'auto', paddingTop: 6 }}>
            <div style={{ fontSize: Math.max(fitName(42, name, 23), 28), fontFamily: fontSerif, fontWeight: 800, color: '#20180a', lineHeight: 1.14, whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ marginTop: 12 }}><D3Role text={role} /></div>
            <div style={{ marginTop: 20 }}><D3Chips /></div>
          </div>
          <D3Contacts wa={wa} email={email} web={web} maxWidth={470} />
        </div>
      </div>
    </div>
  );
}

function D3Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, fontFamily: font, overflow: 'hidden', position: 'relative', background: '#fffdf8', backgroundImage: `radial-gradient(ellipse 520px 420px at 50% 12%, rgba(226,180,92,0.15), rgba(226,180,92,0) 70%), ${starPattern(GOLD, 0.05)}, ${starPattern(GOLD, 0.04)}, linear-gradient(170deg, #fffef9 0%, #fbf4e4 55%, #f6ecd3 100%)`, backgroundSize: 'cover, 72px 72px, 168px 168px, cover' }}>
      <div style={{ position: 'absolute', inset: 12, border: '1.5px solid rgba(192,132,39,0.8)' }} />
      <div style={{ position: 'absolute', inset: 19, border: '1px solid rgba(192,132,39,0.32)' }} />
      <FrameCorners color={GOLD} inset={30} />
      <D3FrameBeads inset={12} />
      <Crescent color={GOLD_LIGHT} size={30} style={{ position: 'absolute', top: 152, right: 62, transform: 'rotate(24deg)' }} />
      <div style={{ position: 'absolute', bottom: 21, left: 30, right: 30 }}>
        <MosqueSkyline color={GOLD} opacity={0.09} height={110} />
      </div>
      <div style={{ position: 'relative', height: '100%', padding: '40px 42px 34px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <BrandLockup markH={30} textColor="#31250f" />
        <div style={{ marginTop: 14, width: '100%' }}><D3Divider /></div>
        <div style={{ marginTop: 20 }}>
          <D3ArchNiche photoUrl={photoUrl} initials={initials} w={236} fill="#fdf6e6" />
        </div>
        <div style={{ fontSize: Math.max(fitName(30, name, 30), 24), fontFamily: fontSerif, fontWeight: 800, color: '#20180a', marginTop: 18, textAlign: 'center', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ marginTop: 10 }}><D3Role text={role} center /></div>
        <div style={{ marginTop: 16 }}><D3Chips center /></div>
        <div style={{ width: '100%', marginTop: 'auto', marginBottom: 'auto', background: 'linear-gradient(180deg, #fcf6e8, #f5ead0)', border: '1px solid #e2cb93', borderRadius: 14, boxShadow: '0 8px 24px rgba(146,100,26,0.1)', padding: '6px 24px', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 5, border: '1px solid rgba(192,132,39,0.22)', borderRadius: 10 }} />
          <D3Contacts wa={wa} email={email} web={web} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <div style={{ padding: 6, border: '1px solid rgba(192,132,39,0.4)', borderRadius: 15, background: 'rgba(255,255,255,0.55)' }}>
            <QRBox src={qrDataUrl} size={146} border={`1.5px solid ${GOLD_LIGHT}`} />
          </div>
          <span style={{ fontSize: 14, color: '#5f4e2e', fontWeight: 600, whiteSpace: 'nowrap' }}>{qrCaption}</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D4 — Kiswah Gold: hitam kiswah + sulaman emas
// ════════════════════════════════════════

// Tile sulaman hizam (data-uri, repeat-x): rantai belah-ketupat benang emas —
// edging garis ganda atas/bawah, ketupat besar ber-inti pale, ketupat kecil
// pengisi atas/bawah, titik penyambung antar tile.
const d4HizamTile = (() => {
  const g = encodeURIComponent(GOLD);
  const gl = encodeURIComponent(GOLD_LIGHT);
  const gp = encodeURIComponent(GOLD_PALE);
  return `url("data:image/svg+xml,%3Csvg width='26' height='38' viewBox='0 0 26 38' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none'%3E%3Cpath d='M0 1.5h26' stroke='${gl}' stroke-width='1' opacity='0.9'/%3E%3Cpath d='M0 4.5h26' stroke='${g}' stroke-width='1' opacity='0.5'/%3E%3Cpath d='M0 33.5h26' stroke='${g}' stroke-width='1' opacity='0.5'/%3E%3Cpath d='M0 36.5h26' stroke='${gl}' stroke-width='1' opacity='0.9'/%3E%3Crect x='6.5' y='12.5' width='13' height='13' transform='rotate(45 13 19)' stroke='${gl}' stroke-width='1.2' opacity='0.95'/%3E%3Crect x='10.5' y='16.5' width='5' height='5' transform='rotate(45 13 19)' fill='${gp}' opacity='0.95'/%3E%3Ccircle cx='0' cy='19' r='1.8' fill='${g}'/%3E%3Ccircle cx='26' cy='19' r='1.8' fill='${g}'/%3E%3Crect x='11.2' y='6' width='3.6' height='3.6' transform='rotate(45 13 7.8)' fill='${g}' opacity='0.85'/%3E%3Crect x='11.2' y='28.4' width='3.6' height='3.6' transform='rotate(45 13 30.2)' fill='${g}' opacity='0.85'/%3E%3C/g%3E%3C/svg%3E")`;
})();

// Band hizam: strip sulaman emas rapat di atas dasar kain gelap ber-sheen.
function D4Hizam({ height = 38, style }: { height?: number; style?: React.CSSProperties }) {
  const tileW = Math.round((height * 26) / 38);
  return (
    <div style={{ height, backgroundColor: '#1c1408', backgroundImage: `${d4HizamTile}, linear-gradient(180deg, #2b200d, #171006 52%, #251b0b)`, backgroundSize: `${tileW}px ${height}px, cover`, backgroundRepeat: 'repeat-x, no-repeat', boxShadow: '0 1px 0 rgba(0,0,0,0.55), 0 -1px 0 rgba(0,0,0,0.55)', ...style }} />
  );
}

// Pembatas benang emas: hairline gradient + tiga ketupat (tengah mengilap).
function D4Rule({ width = 210, style }: { width?: number; style?: React.CSSProperties }) {
  const dia = (s: number, bright = false) => (
    <div style={{ width: s, height: s, transform: 'rotate(45deg)', background: bright ? `linear-gradient(135deg, ${GOLD_PALE}, ${GOLD_LIGHT} 45%, ${GOLD})` : GOLD, flexShrink: 0 }} />
  );
  return (
    <div style={{ width, display: 'flex', alignItems: 'center', gap: 9, ...style }}>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, rgba(226,180,92,0), ${GOLD})` }} />
      {dia(4)}{dia(9, true)}{dia(4)}
      <div style={{ flex: 1, height: 1, background: `linear-gradient(270deg, rgba(226,180,92,0), ${GOLD})` }} />
    </div>
  );
}

// Chip layanan lokal: persegi tajam, uppercase letterspaced, isi gradient tipis.
function D4Chips({ center = false }: { center?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: center ? 'center' : 'flex-start' }}>
      {SERVICES.map(s => (
        <span key={s} style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2.2, color: GOLD_PALE, background: 'linear-gradient(180deg, rgba(226,180,92,0.16), rgba(192,132,39,0.04))', border: '1px solid rgba(226,180,92,0.45)', borderRadius: 3, padding: '8px 18px', whiteSpace: 'nowrap' }}>{s}</span>
      ))}
    </div>
  );
}

// Panel bergaya pintu Ka'bah: lengkung penuh di atas, bingkai emas ganda,
// glow radial di puncak + finial ketupat.
function D4DoorPanel({ width, style, children }: { width: number; style?: React.CSSProperties; children: React.ReactNode }) {
  const r = Math.round(width / 2);
  return (
    <div style={{ width, borderRadius: `${r}px ${r}px 10px 10px`, border: '1.5px solid rgba(226,180,92,0.6)', backgroundColor: '#181107', backgroundImage: `radial-gradient(ellipse at 50% 0%, rgba(226,180,92,0.15), rgba(0,0,0,0) 58%), linear-gradient(180deg, #221909, #120c05 70%, #191106)`, boxShadow: '0 14px 44px rgba(0,0,0,0.55)', position: 'relative', ...style }}>
      <div style={{ position: 'absolute', inset: 5, border: '1px solid rgba(226,180,92,0.3)', borderRadius: `${r - 5}px ${r - 5}px 7px 7px`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -5, left: '50%', marginLeft: -5, width: 10, height: 10, transform: 'rotate(45deg)', background: `linear-gradient(135deg, ${GOLD_PALE}, ${GOLD})` }} />
      {children}
    </div>
  );
}

// Panel kontak: spine emas kiri + hairline halus, isi Contacts bersama.
function D4ContactsPanel({ wa, email, web }: { wa: string; email: string; web: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${GOLD}`, borderTop: '1px solid rgba(226,180,92,0.22)', borderBottom: '1px solid rgba(226,180,92,0.22)', borderRight: '1px solid rgba(226,180,92,0.22)', borderRadius: '4px 10px 10px 4px', background: 'linear-gradient(90deg, rgba(226,180,92,0.08), rgba(226,180,92,0.015))', padding: '16px 22px' }}>
      <Contacts wa={wa} email={email} web={web} iconColor={GOLD_LIGHT} iconBg="linear-gradient(135deg, rgba(226,180,92,0.2), rgba(192,132,39,0.05))" iconBorder="rgba(226,180,92,0.45)" textColor="#e9ddbd" gap={12} />
    </div>
  );
}

// Ketupat kecil di empat sudut bingkai hairline dalam (aksen permata).
function D4CornerDots({ top, bottom, side }: { top: number; bottom: number; side: number }) {
  const d = (pos: React.CSSProperties) => (
    <div style={{ position: 'absolute', width: 7, height: 7, transform: 'rotate(45deg)', background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`, ...pos }} />
  );
  return (
    <>
      {d({ top: top - 3.5, left: side - 3.5 })}
      {d({ top: top - 3.5, right: side - 3.5 })}
      {d({ bottom: bottom - 3.5, left: side - 3.5 })}
      {d({ bottom: bottom - 3.5, right: side - 3.5 })}
    </>
  );
}

// Latar kain kiswah: pola bintang dua skala + glow radial + sheen diagonal.
const d4Cloth = (deg: number) => ({
  backgroundColor: '#140e06',
  backgroundImage: `${starPattern(GOLD, 0.07)}, ${starPattern(GOLD_LIGHT, 0.035)}, radial-gradient(ellipse at 22% -12%, rgba(226,180,92,0.13), rgba(0,0,0,0) 55%), linear-gradient(${deg}deg, #241b0c, #140e06 42%, #1d1509 72%, #0c0803)`,
  backgroundSize: '72px 72px, 156px 156px, cover, cover',
});

function D4Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, fontFamily: font, overflow: 'hidden', position: 'relative', ...d4Cloth(152) }}>
      <D4Hizam height={36} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
      <D4Hizam height={36} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />
      <div style={{ position: 'absolute', top: 48, bottom: 48, left: 18, right: 18, border: '1px solid rgba(226,180,92,0.22)', pointerEvents: 'none' }} />
      <D4CornerDots top={48} bottom={48} side={18} />
      <StarWatermark color={GOLD_LIGHT} size={310} opacity={0.09} style={{ position: 'absolute', left: 398, top: 160 }} />
      <div style={{ position: 'relative', height: '100%', padding: '62px 56px', display: 'flex', gap: 44 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <BrandLockup light markH={33} textColor={GOLD_PALE} subColor={GOLD_LIGHT} />
          <div>
            <div style={{ fontSize: Math.max(fitName(46, name, 22), 32), fontFamily: fontSerif, fontWeight: 800, color: GOLD_PALE, lineHeight: 1.16, textShadow: '0 2px 14px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 11 }}>
              <div style={{ width: 34, height: 2, background: `linear-gradient(90deg, ${GOLD_LIGHT}, ${GOLD})` }} />
              <span style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: 3, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{role}</span>
            </div>
            <div style={{ marginTop: 18 }}><D4Chips /></div>
          </div>
          <D4ContactsPanel wa={wa} email={email} web={web} />
        </div>
        <D4DoorPanel width={288} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Avatar url={photoUrl} initials={initials} size={130} bg="linear-gradient(135deg, #2a2210, #1a1408)" border="3px solid rgba(226,180,92,0.55)" textColor={GOLD_LIGHT} fontSize={44} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.5)" />
          <D4Rule width={140} style={{ margin: '16px 0' }} />
          <QRBox src={qrDataUrl} size={138} border={`1.5px solid ${GOLD}`} bg="#fffdf5" />
          <span style={{ fontSize: 14, color: '#b7a678', fontWeight: 500, marginTop: 10, whiteSpace: 'nowrap' }}>{qrCaption}</span>
        </D4DoorPanel>
      </div>
    </div>
  );
}

function D4Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, fontFamily: font, overflow: 'hidden', position: 'relative', ...d4Cloth(168) }}>
      <D4Hizam height={36} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
      <D4Hizam height={36} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />
      <div style={{ position: 'absolute', top: 48, bottom: 48, left: 18, right: 18, border: '1px solid rgba(226,180,92,0.22)', pointerEvents: 'none' }} />
      <D4CornerDots top={48} bottom={48} side={18} />
      <div style={{ position: 'relative', height: '100%', padding: '58px 44px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <BrandLockup light markH={29} textColor={GOLD_PALE} subColor={GOLD_LIGHT} />
        <D4DoorPanel width={472} style={{ marginTop: 20, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '42px 18px 30px' }}>
          <Avatar url={photoUrl} initials={initials} size={138} bg="linear-gradient(135deg, #2a2210, #1a1408)" border="3px solid rgba(226,180,92,0.55)" textColor={GOLD_LIGHT} fontSize={46} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.5)" />
          <div style={{ fontSize: Math.max(fitName(31, name, 24), 22), fontFamily: fontSerif, fontWeight: 800, color: GOLD_PALE, marginTop: 18, textAlign: 'center', textShadow: '0 2px 12px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>{name}</div>
          <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: 2.6, textTransform: 'uppercase', marginTop: 8, whiteSpace: 'nowrap' }}>{role}</div>
          <D4Rule width={220} style={{ margin: '15px 0 0' }} />
          <div style={{ width: '86%', marginTop: 'auto', marginBottom: 'auto' }}>
            <Contacts wa={wa} email={email} web={web} iconColor={GOLD_LIGHT} iconBg="linear-gradient(135deg, rgba(226,180,92,0.2), rgba(192,132,39,0.05))" iconBorder="rgba(226,180,92,0.45)" textColor="#e9ddbd" gap={13} />
            <div style={{ marginTop: 20 }}><D4Chips center /></div>
          </div>
          <QRBox src={qrDataUrl} size={146} border={`1.5px solid ${GOLD}`} bg="#fffdf5" />
          <span style={{ fontSize: 14, color: '#b7a678', fontWeight: 500, marginTop: 9, whiteSpace: 'nowrap' }}>{qrCaption}</span>
        </D4DoorPanel>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D5 — Merah Alhijaz: mihrab scalloped + band emas bermotif + panel gading
// ════════════════════════════════════════

// Ceruk mihrab dengan lengkung scalloped (multifoil 7 lobus) + manik di tiap
// pertemuan lobus, finial belah ketupat di puncak, "capital" kecil di spring line.
// Rasio tetap: height = width × (250/220).
function D5Arch({ width, stroke = GOLD_LIGHT, fill = 'rgba(43,2,2,0.30)', style }: {
  width: number; stroke?: string; fill?: string; style?: React.CSSProperties;
}) {
  const h = Math.round(width * (250 / 220));
  const d = 'M24 250 L24 130 A23 23 0 0 1 32.5 92.7 A23 23 0 0 1 56.4 62.8 A23 23 0 0 1 90.9 46.2 A23 23 0 0 1 129.1 46.2 A23 23 0 0 1 163.6 62.8 A23 23 0 0 1 187.5 92.7 A23 23 0 0 1 196 130 L196 250 Z';
  const beads: [number, number][] = [[24, 130], [32.5, 92.7], [56.4, 62.8], [90.9, 46.2], [129.1, 46.2], [163.6, 62.8], [187.5, 92.7], [196, 130]];
  return (
    <svg width={width} height={h} viewBox="0 0 220 250" style={style}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="6" opacity="0.14" />
      <path d={d} fill={fill} stroke={stroke} strokeWidth="1.5" />
      {beads.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill={stroke} />)}
      <rect x="14" y="127.5" width="16" height="3" rx="1.5" fill={stroke} opacity="0.85" />
      <rect x="190" y="127.5" width="16" height="3" rx="1.5" fill={stroke} opacity="0.85" />
      <rect x="105.5" y="17.5" width="9" height="9" transform="rotate(45 110 22)" fill={stroke} />
    </svg>
  );
}

// Band emas bermotif (bukan strip polos): gradasi emas + hairline tepi gelap +
// rantai belah ketupat maroon dengan titik penghubung. Orientasi bebas.
function D5Band({ length, thickness = 16, vertical = false }: { length: number; thickness?: number; vertical?: boolean }) {
  const w = vertical ? thickness : length;
  const h = vertical ? length : thickness;
  const id = vertical ? 'd5BandV' : 'd5BandH';
  const step = 24;
  const n = Math.max(Math.floor(length / step), 1);
  const off = (length - (n - 1) * step) / 2;
  const mid = thickness / 2;
  const dm = Math.min(thickness * 0.42, 7);
  const pts = Array.from({ length: n }, (_, i) => off + i * step);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
          <stop offset="0" stopColor="#9c6a18" />
          <stop offset="0.5" stopColor={GOLD_LIGHT} />
          <stop offset="1" stopColor="#9c6a18" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id})`} />
      {vertical ? (
        <><rect x="0" y="0" width="1" height={h} fill="#7a5210" /><rect x={w - 1} y="0" width="1" height={h} fill="#7a5210" /></>
      ) : (
        <><rect x="0" y="0" width={w} height="1" fill="#7a5210" /><rect x="0" y={h - 1} width={w} height="1" fill="#7a5210" /></>
      )}
      {pts.map((p, i) => {
        const x = vertical ? mid : p;
        const y = vertical ? p : mid;
        return (
          <g key={i}>
            <rect x={x - dm / 2} y={y - dm / 2} width={dm} height={dm} transform={`rotate(45 ${x} ${y})`} fill="#6b0906" opacity="0.9" />
            {i < n - 1 && <circle cx={vertical ? mid : p + step / 2} cy={vertical ? p + step / 2 : mid} r="1.3" fill="#6b0906" opacity="0.5" />}
          </g>
        );
      })}
    </svg>
  );
}

// Chip layanan varian mewah: pil putih hairline emas, bullet belah ketupat, uppercase.
function D5Chips({ center = false }: { center?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start' }}>
      {SERVICES.map(s => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: fontDisplay, fontSize: 13.5, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: '#8f0a07', background: '#ffffff', border: `1px solid ${GOLD_LIGHT}`, borderRadius: 999, padding: '9px 20px', boxShadow: '0 1px 5px rgba(165,12,9,0.08)', whiteSpace: 'nowrap' }}>
          <svg width="9" height="9" viewBox="0 0 10 10"><rect x="1.8" y="1.8" width="6.4" height="6.4" transform="rotate(45 5 5)" fill={GOLD} /></svg>
          {s}
        </span>
      ))}
    </div>
  );
}

// Baris kontak varian D5: ikon merah di tile bundar putih ber-ring emas,
// dipisah hairline emas. Font menyusut utk teks panjang (anti meluber).
function D5Contacts({ wa, email, web }: { wa: string; email: string; web: string }) {
  const rows = [
    wa && { icon: <PhoneSvg color={RED} size={15} />, text: wa },
    email && { icon: <MailSvg color={RED} size={15} />, text: email },
    { icon: <GlobeSvg color={RED} size={15} />, text: web },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[];
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 2px', borderBottom: i < rows.length - 1 ? '1px solid rgba(192,132,39,0.3)' : 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ffffff', border: `1px solid ${GOLD_LIGHT}`, boxShadow: '0 1px 4px rgba(165,12,9,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.icon}</div>
          <span style={{ fontSize: Math.max(Math.min(19, Math.floor(440 / Math.max(r.text.length, 1))), 14), color: '#3b211d', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.text}</span>
        </div>
      ))}
    </div>
  );
}

// Empat ornamen sudut ukuran bebas (komposisi CornerOrnament bersama).
function D5Corners({ inset = 20, size = 32 }: { inset?: number; size?: number }) {
  const c = (pos: React.CSSProperties, deg: number) => (
    <CornerOrnament color={GOLD} size={size} style={{ position: 'absolute', transform: `rotate(${deg}deg)`, ...pos }} />
  );
  return (
    <>
      {c({ top: inset, left: inset }, 0)}
      {c({ top: inset, right: inset }, 90)}
      {c({ bottom: inset, right: inset }, 180)}
      {c({ bottom: inset, left: inset }, 270)}
    </>
  );
}

// Rule kecil mengapit role: hairline emas memudar di kedua sisi.
function D5RoleRule({ text, color = '#f5d9a8', line = GOLD_LIGHT }: { text: string; color?: string; line?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 32, height: 1, background: `linear-gradient(90deg, transparent, ${line})` }} />
      <span style={{ fontFamily: fontDisplay, fontSize: 13.5, fontWeight: 700, color, letterSpacing: 2.6, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{text}</span>
      <div style={{ width: 32, height: 1, background: `linear-gradient(90deg, ${line}, transparent)` }} />
    </div>
  );
}

function D5Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', fontFamily: font, overflow: 'hidden' }}>
      <div style={{ width: 410, height: '100%', background: '#8f0a07', backgroundImage: `${starPattern('#ffffff', 0.08)}, ${starPattern('#ffffff', 0.045)}, radial-gradient(circle at 50% 26%, rgba(255,214,150,0.18), rgba(255,214,150,0) 62%), linear-gradient(168deg, #6e0705, ${RED_DARK} 52%, #d01310)`, backgroundSize: '96px 96px, 48px 48px, 100% 100%, 100% 100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 84, flexShrink: 0, overflow: 'hidden' }}>
        <Crescent color={GOLD_PALE} size={34} style={{ position: 'absolute', top: 26, right: 28, transform: 'rotate(24deg)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <MosqueSkyline color="#ffffff" opacity={0.13} height={110} />
        </div>
        <div style={{ position: 'relative', width: 232, height: 264, flexShrink: 0 }}>
          <D5Arch width={232} style={{ position: 'absolute', top: 0, left: 0 }} />
          <div style={{ position: 'absolute', left: 35, top: 78 }}>
            <Avatar url={photoUrl} initials={initials} size={148} bg="rgba(255,255,255,0.14)" border="3px solid rgba(255,255,255,0.65)" textColor="white" fontSize={50} ring={GOLD_LIGHT} shadow="0 8px 32px rgba(0,0,0,0.35)" />
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '0 26px', marginTop: 20, position: 'relative' }}>
          <div style={{ fontSize: Math.max(fitName(31, name, 22), 26), fontFamily: fontSerif, fontWeight: 800, color: 'white', lineHeight: 1.22 }}>{name}</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 11 }}>
            <D5RoleRule text={role} />
          </div>
        </div>
      </div>
      <D5Band vertical length={600} thickness={18} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fffdfa', backgroundImage: `${starPattern(RED, 0.04)}, linear-gradient(175deg, #fffefd 0%, #fdf3ec 100%)`, backgroundSize: '72px 72px, cover', padding: '34px 46px 28px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', inset: 12, border: '1px solid rgba(165,12,9,0.22)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 17, border: '1px solid rgba(192,132,39,0.45)', pointerEvents: 'none' }} />
        <D5Corners inset={24} size={30} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <BrandLockup markH={34} textColor="#33221f" />
          <div style={{ marginTop: 16 }}><D5Band length={530} thickness={11} /></div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 22, marginTop: 4 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              <D5Contacts wa={wa} email={email} web={web} />
              <D5Chips />
            </div>
            <div style={{ width: 210, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{ position: 'relative', width: 210, height: 239 }}>
                <D5Arch width={210} fill="rgba(223,17,13,0.05)" stroke={GOLD} style={{ position: 'absolute', top: 0, left: 0 }} />
                <div style={{ position: 'absolute', left: 35, top: 72 }}>
                  <QRBox src={qrDataUrl} size={140} border={`1.5px solid ${GOLD_LIGHT}`} />
                </div>
              </div>
              <span style={{ fontSize: 13.5, color: '#7a544b', fontWeight: 600, whiteSpace: 'nowrap' }}>{qrCaption}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(192,132,39,0), rgba(192,132,39,0.55))' }} />
            <Ornament color={GOLD} width={150} />
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(192,132,39,0.55), rgba(192,132,39,0))' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function D5Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, position: 'relative', fontFamily: font, overflow: 'hidden', background: '#8f0a07', backgroundImage: `${starPattern('#ffffff', 0.08)}, ${starPattern('#ffffff', 0.045)}, radial-gradient(circle at 50% 18%, rgba(255,214,150,0.16), rgba(255,214,150,0) 55%), linear-gradient(172deg, #6e0705, ${RED_DARK} 48%, #d01310)`, backgroundSize: '96px 96px, 48px 48px, 100% 100%, 100% 100%' }}>
      <Crescent color={GOLD_PALE} size={32} style={{ position: 'absolute', top: 30, right: 28, transform: 'rotate(24deg)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <MosqueSkyline color="#ffffff" opacity={0.11} height={150} />
      </div>
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 32 }}>
        <BrandLockup light markH={29} textColor="#ffffff" subColor="#f5d9a8" />
        <div style={{ position: 'relative', width: 216, height: 245, marginTop: 16, flexShrink: 0 }}>
          <D5Arch width={216} style={{ position: 'absolute', top: 0, left: 0 }} />
          <div style={{ position: 'absolute', left: 32, top: 72 }}>
            <Avatar url={photoUrl} initials={initials} size={138} bg="rgba(255,255,255,0.14)" border="3px solid rgba(255,255,255,0.65)" textColor="white" fontSize={46} ring={GOLD_LIGHT} shadow="0 8px 32px rgba(0,0,0,0.35)" />
          </div>
        </div>
        <div style={{ fontSize: Math.max(fitName(30, name, 32), 24), fontFamily: fontSerif, fontWeight: 800, color: 'white', marginTop: 14, textAlign: 'center', padding: '0 30px', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ marginTop: 9 }}><D5RoleRule text={role} /></div>
        <div style={{ marginTop: 16 }}><D5Band length={240} thickness={12} /></div>
        <div style={{ alignSelf: 'stretch', flex: 1, margin: '18px 36px 40px', position: 'relative', background: '#fffdfa', backgroundImage: `${starPattern(RED, 0.035)}, linear-gradient(180deg, #fffefd 0%, #fdf3ec 100%)`, backgroundSize: '72px 72px, cover', border: `1px solid ${GOLD_LIGHT}`, borderRadius: 14, boxShadow: '0 10px 36px rgba(0,0,0,0.28)', padding: '24px 32px 22px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'absolute', inset: 7, border: '1px solid rgba(192,132,39,0.35)', borderRadius: 9, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <D5Contacts wa={wa} email={email} web={web} />
            <div style={{ marginTop: 16 }}><D5Chips center /></div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ornament color={GOLD} width={160} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <QRBox src={qrDataUrl} size={148} border={`1.5px solid ${GOLD_LIGHT}`} />
              <span style={{ fontSize: 13.5, color: '#7a544b', fontWeight: 600, whiteSpace: 'nowrap' }}>{qrCaption}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Peta renderer ──
export const RENDERERS: Record<DesignId, Record<CardFormat, React.FC<CardProps>>> = {
  d1: { landscape: D1Landscape, portrait: D1Portrait },
  d2: { landscape: D2Landscape, portrait: D2Portrait },
  d3: { landscape: D3Landscape, portrait: D3Portrait },
  d4: { landscape: D4Landscape, portrait: D4Portrait },
  d5: { landscape: D5Landscape, portrait: D5Portrait },
};
