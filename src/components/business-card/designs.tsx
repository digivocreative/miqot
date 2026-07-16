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
        <span key={s} style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: fg, background: bg, border: `1px solid ${border}`, borderRadius: 999, padding: '7px 18px', letterSpacing: 0.8 }}>{s}</span>
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
          <div style={{ fontFamily: fontDisplay, fontSize: Math.round(markH * 0.5), fontWeight: 800, color: textColor, letterSpacing: 1.2, lineHeight: 1.15 }}>ALHIJAZ INDOWISATA</div>
          <div style={{ fontFamily: fontDisplay, fontSize: Math.round(markH * 0.36), fontWeight: 700, color: sub, letterSpacing: 3.2, textTransform: 'uppercase', marginTop: 2 }}>Tour & Travel</div>
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
      <span style={{ fontSize: fs, color: textColor, fontWeight: 500 }}>{text}</span>
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
function D1Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', fontFamily: font, overflow: 'hidden' }}>
      <div style={{ width: 400, height: '100%', background: '#065f46', backgroundImage: `${starPattern('#ffffff', 0.05)}, linear-gradient(165deg, #04382b, #065f46 55%, #047857)`, backgroundSize: '72px 72px, cover', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Crescent color={GOLD_LIGHT} size={40} style={{ position: 'absolute', top: 26, right: 30, transform: 'rotate(24deg)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <MosqueSkyline color="#ffffff" opacity={0.16} height={110} />
        </div>
        <Avatar url={photoUrl} initials={initials} size={148} bg="rgba(255,255,255,0.14)" border="4px solid rgba(255,255,255,0.55)" textColor="white" fontSize={50} ring={GOLD_LIGHT} shadow="0 8px 32px rgba(0,0,0,0.25)" />
        <div style={{ textAlign: 'center', padding: '0 24px', marginTop: 18, position: 'relative' }}>
          <div style={{ fontSize: Math.max(fitName(31, name, 22), 26), fontFamily: fontSerif, fontWeight: 800, color: 'white', lineHeight: 1.25 }}>{name}</div>
          <div style={{ fontFamily: fontDisplay, fontSize: 15, color: GOLD_PALE, marginTop: 8, fontWeight: 700, letterSpacing: 1.8 }}>{role}</div>
        </div>
      </div>
      <div style={{ width: 7, height: '100%', background: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD}, ${GOLD_LIGHT})`, flexShrink: 0 }} />
      <div style={{ flex: 1, background: 'linear-gradient(180deg, #ffffff 0%, #f2faf6 100%)', padding: '38px 44px 34px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
        <StarWatermark color="#059669" size={300} opacity={0.1} style={{ position: 'absolute', right: -80, top: 88 }} />
        <BrandLockup markH={33} textColor="#3a2c12" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
          <Contacts wa={wa} email={email} web={web} iconColor="#047857" iconBg="linear-gradient(135deg, #ecfdf5, #d1fae5)" iconBorder="#a7f3d0" textColor="#1f2937" />
          <ServiceChips fg="#065f46" bg="#ecfdf5" border="#a7f3d0" />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ paddingBottom: 12 }}>
            <Ornament color={GOLD} width={150} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <QRBox src={qrDataUrl} size={140} border="1.5px solid #a7f3d0" />
            <span style={{ fontSize: 14, color: '#51625b', fontWeight: 500 }}>{qrCaption}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function D1Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, display: 'flex', flexDirection: 'column', fontFamily: font, overflow: 'hidden', background: 'linear-gradient(180deg, #ffffff 0%, #f2faf6 100%)' }}>
      <div style={{ height: 292, background: '#065f46', backgroundImage: `${starPattern('#ffffff', 0.05)}, linear-gradient(160deg, #04382b, #065f46 55%, #047857)`, backgroundSize: '72px 72px, cover', position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 34 }}>
          <BrandLockup light markH={30} textColor="#ffffff" subColor={GOLD_LIGHT} />
        </div>
        <Crescent color={GOLD_LIGHT} size={34} style={{ position: 'absolute', top: 26, right: 26, transform: 'rotate(24deg)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <MosqueSkyline color="#ffffff" opacity={0.14} height={130} />
        </div>
        <div style={{ position: 'absolute', bottom: -4, left: 0, right: 0, height: 5, background: `linear-gradient(90deg, ${GOLD_LIGHT}, ${GOLD}, ${GOLD_LIGHT})` }} />
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: -66, zIndex: 2 }}>
        <Avatar url={photoUrl} initials={initials} size={136} bg="#d1fae5" border="6px solid white" textColor="#047857" fontSize={46} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.14)" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14 }}>
        <div style={{ fontSize: Math.max(fitName(30, name, 32), 24), fontFamily: fontSerif, fontWeight: 800, color: '#0c1f18' }}>{name}</div>
        <div style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 700, color: '#9a6d1f', letterSpacing: 1.8, marginTop: 6 }}>{role}</div>
        <div style={{ margin: '15px 0 17px' }}><Ornament color={GOLD} width={180} /></div>
        <div style={{ width: '80%', marginTop: 'auto', marginBottom: 'auto' }}>
          <Contacts wa={wa} email={email} web={web} iconColor="#047857" iconBg="linear-gradient(135deg, #ecfdf5, #d1fae5)" iconBorder="#a7f3d0" textColor="#1f2937" gap={13} />
          <div style={{ marginTop: 22 }}><ServiceChips center fg="#065f46" bg="#ecfdf5" border="#a7f3d0" /></div>
        </div>
        <div style={{ marginTop: 'auto', paddingBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <QRBox src={qrDataUrl} size={150} border="1.5px solid #a7f3d0" />
          <span style={{ fontSize: 14, color: '#51625b', fontWeight: 500 }}>{qrCaption}</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D2 — Navy Ka'bah: langit malam + Ka'bah emas
// ════════════════════════════════════════
function D2Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', fontFamily: font, overflow: 'hidden', background: 'linear-gradient(150deg, #080e1d, #101d3a 60%, #0b1329)', backgroundImage: `${starPattern(GOLD_LIGHT, 0.05)}, linear-gradient(150deg, #080e1d, #101d3a 60%, #0b1329)`, backgroundSize: '72px 72px, cover' }}>
      <div style={{ flex: 1, padding: '40px 46px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <BrandLockup light markH={32} textColor="#ffffff" subColor={GOLD_LIGHT} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <Avatar url={photoUrl} initials={initials} size={118} bg="linear-gradient(135deg, #16213c, #1d2b4d)" border="3px solid #26355c" textColor={GOLD_LIGHT} fontSize={42} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.35)" />
          <div>
            <div style={{ fontSize: Math.max(fitName(36, name, 24), 28), fontFamily: fontSerif, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{name}</div>
            <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: 2, marginTop: 7 }}>{role}</div>
            <div style={{ width: 64, height: 2, background: `linear-gradient(90deg, ${GOLD}, transparent)`, marginTop: 12 }} />
            <div style={{ marginTop: 16 }}><ServiceChips fg={GOLD_LIGHT} bg="rgba(192,132,39,0.12)" border="rgba(192,132,39,0.4)" /></div>
          </div>
        </div>
        <Contacts wa={wa} email={email} web={web} iconColor={GOLD_LIGHT} iconBg="rgba(192,132,39,0.12)" iconBorder="rgba(192,132,39,0.4)" textColor="#c7d0e0" gap={12} />
      </div>
      <div style={{ width: 306, background: 'rgba(255,255,255,0.035)', borderLeft: '1px solid rgba(192,132,39,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, flexShrink: 0, position: 'relative' }}>
        <Crescent color={GOLD_LIGHT} size={36} style={{ position: 'absolute', top: 24, right: 26, transform: 'rotate(24deg)' }} />
        <KaabaMark size={112} />
        <QRBox src={qrDataUrl} size={140} border={`1.5px solid ${GOLD}`} />
        <span style={{ fontSize: 14, color: '#8a94ab', fontWeight: 500 }}>{qrCaption}</span>
      </div>
    </div>
  );
}

function D2Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, fontFamily: font, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '42px 40px 32px', position: 'relative', background: 'linear-gradient(170deg, #080e1d, #101d3a 60%, #0b1329)', backgroundImage: `${starPattern(GOLD_LIGHT, 0.05)}, linear-gradient(170deg, #080e1d, #101d3a 60%, #0b1329)`, backgroundSize: '72px 72px, cover' }}>
      <Crescent color={GOLD_LIGHT} size={34} style={{ position: 'absolute', top: 28, right: 28, transform: 'rotate(24deg)' }} />
      <BrandLockup light markH={28} textColor="#ffffff" subColor={GOLD_LIGHT} />
      <div style={{ marginTop: 30 }}>
        <Avatar url={photoUrl} initials={initials} size={142} bg="linear-gradient(135deg, #16213c, #1d2b4d)" border="3px solid #26355c" textColor={GOLD_LIGHT} fontSize={48} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.35)" />
      </div>
      <div style={{ fontSize: Math.max(fitName(30, name, 32), 24), fontFamily: fontSerif, fontWeight: 800, color: 'white', marginTop: 18, textAlign: 'center' }}>{name}</div>
      <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: GOLD_LIGHT, letterSpacing: 2, marginTop: 6 }}>{role}</div>
      <div style={{ margin: '15px 0 17px' }}><Ornament color={GOLD} width={180} /></div>
      <div style={{ width: '80%', marginTop: 'auto', marginBottom: 'auto' }}>
        <Contacts wa={wa} email={email} web={web} iconColor={GOLD_LIGHT} iconBg="rgba(192,132,39,0.12)" iconBorder="rgba(192,132,39,0.4)" textColor="#c7d0e0" gap={12} />
        <div style={{ marginTop: 22 }}><ServiceChips center fg={GOLD_LIGHT} bg="rgba(192,132,39,0.12)" border="rgba(192,132,39,0.4)" /></div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <KaabaMark size={76} />
        <QRBox src={qrDataUrl} size={148} border={`1.5px solid ${GOLD}`} />
        <span style={{ fontSize: 14, color: '#8a94ab', fontWeight: 500 }}>{qrCaption}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D3 — Putih Klasik: gading + bingkai emas + logo warna
// ════════════════════════════════════════
function D3Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, background: '#fffdf8', backgroundImage: starPattern(GOLD, 0.06), backgroundSize: '72px 72px', fontFamily: font, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 16, border: `1px solid ${GOLD_LIGHT}` }} />
      <div style={{ position: 'absolute', inset: 23, border: '1px solid rgba(192,132,39,0.3)' }} />
      <Crescent color={GOLD_LIGHT} size={30} style={{ position: 'absolute', top: 42, right: 104, transform: 'rotate(24deg)' }} />
      <FrameCorners color={GOLD} inset={34} />
      <StarWatermark color={GOLD} size={280} opacity={0.12} style={{ position: 'absolute', right: -60, top: 140 }} />
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24 }}>
        <MosqueSkyline color={GOLD} opacity={0.11} height={120} />
      </div>
      <div style={{ position: 'relative', height: '100%', padding: '48px 60px', display: 'flex', gap: 44, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, flexShrink: 0 }}>
          <Avatar url={photoUrl} initials={initials} size={138} bg="linear-gradient(135deg, #fbf3e3, #f3dcae)" border="3px solid #fff" textColor={GOLD} fontSize={46} ring={GOLD} shadow="0 6px 24px rgba(192,132,39,0.18)" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <QRBox src={qrDataUrl} size={136} border={`1.5px solid ${GOLD_LIGHT}`} />
            <span style={{ fontSize: 14, color: '#6d5f43', fontWeight: 500 }}>{qrCaption}</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', padding: '6px 0' }}>
          <BrandLockup markH={33} textColor="#3a2c12" />
          <div>
            <div style={{ fontSize: Math.max(fitName(40, name, 30), 30), fontFamily: fontSerif, fontWeight: 800, color: '#241c0d', lineHeight: 1.15 }}>{name}</div>
            <div style={{ fontFamily: fontDisplay, fontSize: 17, fontWeight: 700, color: '#9a6d1f', letterSpacing: 1.8, marginTop: 8 }}>{role}</div>
            <div style={{ marginTop: 13 }}><Ornament color={GOLD} width={190} /></div>
            <div style={{ marginTop: 18 }}><ServiceChips fg="#8a6516" bg="#faf3e3" border="#e8cf9a" /></div>
          </div>
          <div>
            <Contacts wa={wa} email={email} web={web} iconColor={GOLD} iconBg="linear-gradient(135deg, #fdf8ec, #f7ead0)" iconBorder="#e8cf9a" textColor="#3f3a2d" gap={12} />
          </div>
        </div>
      </div>
    </div>
  );
}

function D3Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, background: '#fffdf8', backgroundImage: starPattern(GOLD, 0.06), backgroundSize: '72px 72px', fontFamily: font, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 16, border: `1px solid ${GOLD_LIGHT}` }} />
      <div style={{ position: 'absolute', inset: 23, border: '1px solid rgba(192,132,39,0.3)' }} />
      <Crescent color={GOLD_LIGHT} size={28} style={{ position: 'absolute', top: 42, right: 96, transform: 'rotate(24deg)' }} />
      <FrameCorners color={GOLD} inset={34} />
      <div style={{ position: 'absolute', bottom: 24, left: 24, right: 24 }}>
        <MosqueSkyline color={GOLD} opacity={0.11} height={120} />
      </div>
      <div style={{ position: 'relative', height: '100%', padding: '46px 44px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <BrandLockup markH={30} textColor="#3a2c12" />
        <div style={{ marginTop: 28 }}>
          <Avatar url={photoUrl} initials={initials} size={146} bg="linear-gradient(135deg, #fbf3e3, #f3dcae)" border="3px solid #fff" textColor={GOLD} fontSize={50} ring={GOLD} shadow="0 6px 24px rgba(192,132,39,0.18)" />
        </div>
        <div style={{ fontSize: Math.max(fitName(30, name, 32), 24), fontFamily: fontSerif, fontWeight: 800, color: '#241c0d', marginTop: 18, textAlign: 'center' }}>{name}</div>
        <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: '#9a6d1f', letterSpacing: 1.8, marginTop: 6 }}>{role}</div>
        <div style={{ margin: '15px 0 17px' }}><Ornament color={GOLD} width={180} /></div>
        <div style={{ width: '80%', marginTop: 'auto', marginBottom: 'auto' }}>
          <Contacts wa={wa} email={email} web={web} iconColor={GOLD} iconBg="linear-gradient(135deg, #fdf8ec, #f7ead0)" iconBorder="#e8cf9a" textColor="#3f3a2d" gap={12} />
          <div style={{ marginTop: 22 }}><ServiceChips center fg="#8a6516" bg="#faf3e3" border="#e8cf9a" /></div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <QRBox src={qrDataUrl} size={150} border={`1.5px solid ${GOLD_LIGHT}`} />
          <span style={{ fontSize: 14, color: '#6d5f43', fontWeight: 500 }}>{qrCaption}</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D4 — Kiswah Gold: hitam kiswah + sulaman emas
// ════════════════════════════════════════
function D4Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, fontFamily: font, overflow: 'hidden', position: 'relative', background: 'linear-gradient(160deg, #1b1508, #0f0b04 70%)', backgroundImage: `${starPattern(GOLD, 0.08)}, linear-gradient(160deg, #1b1508, #0f0b04 70%)`, backgroundSize: '72px 72px, cover' }}>
      <div style={{ position: 'absolute', inset: 14, border: '1px solid rgba(192,132,39,0.55)' }} />
      <div style={{ position: 'absolute', inset: 21, border: '1px solid rgba(192,132,39,0.22)' }} />
      <FrameCorners color={GOLD} inset={31} />
      <div style={{ position: 'relative', height: '100%', padding: '46px 58px', display: 'flex', gap: 40 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <BrandLockup light markH={32} textColor={GOLD_PALE} subColor={GOLD} />
            <div style={{ marginTop: 20, width: 330 }}><HizamBand /></div>
          </div>
          <div>
            <div style={{ fontSize: Math.max(fitName(38, name, 26), 30), fontFamily: fontSerif, fontWeight: 800, color: GOLD_PALE, lineHeight: 1.2 }}>{name}</div>
            <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: GOLD, letterSpacing: 1.8, marginTop: 8 }}>{role}</div>
            <div style={{ marginTop: 13 }}><Ornament color={GOLD} width={190} /></div>
            <div style={{ marginTop: 18 }}><ServiceChips fg={GOLD_LIGHT} bg="rgba(192,132,39,0.1)" border="rgba(192,132,39,0.45)" /></div>
          </div>
          <Contacts wa={wa} email={email} web={web} iconColor={GOLD_LIGHT} iconBg="rgba(192,132,39,0.1)" iconBorder="rgba(192,132,39,0.4)" textColor="#d9c9a3" gap={12} />
        </div>
        <div style={{ width: 270, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, flexShrink: 0 }}>
          <Avatar url={photoUrl} initials={initials} size={128} bg="linear-gradient(135deg, #2a2210, #1a1408)" border="3px solid rgba(192,132,39,0.5)" textColor={GOLD_LIGHT} fontSize={44} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.4)" />
          <QRBox src={qrDataUrl} size={140} border={`1.5px solid ${GOLD}`} bg="#fffdf5" />
          <span style={{ fontSize: 14, color: '#9b8a63', fontWeight: 500 }}>{qrCaption}</span>
        </div>
      </div>
    </div>
  );
}

function D4Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, fontFamily: font, overflow: 'hidden', position: 'relative', background: 'linear-gradient(170deg, #1b1508, #0f0b04 70%)', backgroundImage: `${starPattern(GOLD, 0.08)}, linear-gradient(170deg, #1b1508, #0f0b04 70%)`, backgroundSize: '72px 72px, cover' }}>
      <div style={{ position: 'absolute', inset: 14, border: '1px solid rgba(192,132,39,0.55)' }} />
      <div style={{ position: 'absolute', inset: 21, border: '1px solid rgba(192,132,39,0.22)' }} />
      <FrameCorners color={GOLD} inset={31} />
      <div style={{ position: 'relative', height: '100%', padding: '46px 44px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <BrandLockup light markH={28} textColor={GOLD_PALE} subColor={GOLD} />
        <div style={{ marginTop: 18, width: '62%' }}><HizamBand /></div>
        <div style={{ marginTop: 20 }}>
          <Avatar url={photoUrl} initials={initials} size={142} bg="linear-gradient(135deg, #2a2210, #1a1408)" border="3px solid rgba(192,132,39,0.5)" textColor={GOLD_LIGHT} fontSize={48} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.4)" />
        </div>
        <div style={{ fontSize: Math.max(fitName(30, name, 32), 24), fontFamily: fontSerif, fontWeight: 800, color: GOLD_PALE, marginTop: 18, textAlign: 'center' }}>{name}</div>
        <div style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 700, color: GOLD, letterSpacing: 1.8, marginTop: 6 }}>{role}</div>
        <div style={{ margin: '15px 0 17px' }}><Ornament color={GOLD} width={180} /></div>
        <div style={{ width: '80%', marginTop: 'auto', marginBottom: 'auto' }}>
          <Contacts wa={wa} email={email} web={web} iconColor={GOLD_LIGHT} iconBg="rgba(192,132,39,0.1)" iconBorder="rgba(192,132,39,0.4)" textColor="#d9c9a3" gap={12} />
          <div style={{ marginTop: 22 }}><ServiceChips center fg={GOLD_LIGHT} bg="rgba(192,132,39,0.1)" border="rgba(192,132,39,0.45)" /></div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <QRBox src={qrDataUrl} size={148} border={`1.5px solid ${GOLD}`} bg="#fffdf5" />
          <span style={{ fontSize: 14, color: '#9b8a63', fontWeight: 500 }}>{qrCaption}</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D5 — Merah Alhijaz: warna brand penuh
// ════════════════════════════════════════
function D5Landscape({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', fontFamily: font, overflow: 'hidden' }}>
      <div style={{ width: 400, height: '100%', background: RED_DARK, backgroundImage: `${starPattern('#ffffff', 0.06)}, linear-gradient(165deg, #8f0a07, ${RED_DARK} 45%, ${RED})`, backgroundSize: '72px 72px, cover', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Crescent color={GOLD_PALE} size={40} style={{ position: 'absolute', top: 26, right: 30, transform: 'rotate(24deg)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <MosqueSkyline color="#ffffff" opacity={0.15} height={110} />
        </div>
        <Avatar url={photoUrl} initials={initials} size={148} bg="rgba(255,255,255,0.14)" border="4px solid rgba(255,255,255,0.6)" textColor="white" fontSize={50} ring={GOLD_LIGHT} shadow="0 8px 32px rgba(0,0,0,0.28)" />
        <div style={{ textAlign: 'center', padding: '0 24px', marginTop: 18 }}>
          <div style={{ fontSize: Math.max(fitName(30, name, 22), 26), fontFamily: fontSerif, fontWeight: 800, color: 'white', lineHeight: 1.25 }}>{name}</div>
          <div style={{ fontFamily: fontDisplay, fontSize: 14, color: '#ffe3b8', marginTop: 8, fontWeight: 700, letterSpacing: 1.8 }}>{role}</div>
        </div>
      </div>
      <div style={{ width: 7, height: '100%', background: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD}, ${GOLD_LIGHT})`, flexShrink: 0 }} />
      <div style={{ flex: 1, background: 'linear-gradient(180deg, #ffffff 0%, #fff8f3 100%)', padding: '38px 44px 34px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
        <StarWatermark color={RED} size={300} opacity={0.07} style={{ position: 'absolute', right: -80, top: 88 }} />
        <BrandLockup markH={33} textColor="#3a2c12" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
          <Contacts wa={wa} email={email} web={web} iconColor={RED} iconBg="linear-gradient(135deg, #fdeeed, #fbdcda)" iconBorder="#f3b3b0" textColor="#2b1a18" />
          <ServiceChips fg={RED_DARK} bg="#fdeeed" border="#f3b3b0" />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ paddingBottom: 12 }}>
            <Ornament color={GOLD} width={150} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <QRBox src={qrDataUrl} size={140} border="1.5px solid #f3b3b0" />
            <span style={{ fontSize: 14, color: '#6f5d58', fontWeight: 500 }}>{qrCaption}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function D5Portrait({ name, role, wa, email, web, photoUrl, initials, qrDataUrl, qrCaption }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, display: 'flex', flexDirection: 'column', fontFamily: font, overflow: 'hidden', background: 'linear-gradient(180deg, #ffffff 0%, #fff8f3 100%)' }}>
      <div style={{ height: 292, background: RED_DARK, backgroundImage: `${starPattern('#ffffff', 0.06)}, linear-gradient(160deg, #8f0a07, ${RED_DARK} 45%, ${RED})`, backgroundSize: '72px 72px, cover', position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 36 }}>
          <BrandLockup light markH={30} textColor="#ffffff" subColor="#f5d9a8" />
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <MosqueSkyline color="#ffffff" opacity={0.13} height={130} />
        </div>
        <div style={{ position: 'absolute', bottom: -4, left: 0, right: 0, height: 5, background: `linear-gradient(90deg, ${GOLD_LIGHT}, ${GOLD}, ${GOLD_LIGHT})` }} />
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: -66, zIndex: 2 }}>
        <Avatar url={photoUrl} initials={initials} size={136} bg="#fbdcda" border="6px solid white" textColor={RED_DARK} fontSize={46} ring={GOLD} shadow="0 8px 32px rgba(0,0,0,0.14)" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14 }}>
        <div style={{ fontSize: Math.max(fitName(30, name, 32), 24), fontFamily: fontSerif, fontWeight: 800, color: '#26120f' }}>{name}</div>
        <div style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 700, color: '#9a6d1f', letterSpacing: 1.8, marginTop: 6 }}>{role}</div>
        <div style={{ margin: '15px 0 17px' }}><Ornament color={GOLD} width={180} /></div>
        <div style={{ width: '80%', marginTop: 'auto', marginBottom: 'auto' }}>
          <Contacts wa={wa} email={email} web={web} iconColor={RED} iconBg="linear-gradient(135deg, #fdeeed, #fbdcda)" iconBorder="#f3b3b0" textColor="#2b1a18" gap={13} />
          <div style={{ marginTop: 22 }}><ServiceChips center fg={RED_DARK} bg="#fdeeed" border="#f3b3b0" /></div>
        </div>
        <div style={{ marginTop: 'auto', paddingBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
          <QRBox src={qrDataUrl} size={150} border="1.5px solid #f3b3b0" />
          <span style={{ fontSize: 14, color: '#6f5d58', fontWeight: 500 }}>{qrCaption}</span>
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
