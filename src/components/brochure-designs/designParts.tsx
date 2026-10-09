// Potongan visual yang dipakai bersama desain Kartu, Kolom Harga, dan Kalender.
// Semua ukuran dalam piksel kanvas 1080×1620; setiap label tunggal-baris
// diberi nowrap karena klon ekspor modern-screenshot memaku lebar kotaknya.
import { Check } from 'lucide-react';
import WhatsAppIcon from '../bio/WhatsAppIcon';
import {
  BROCHURE_FONT_STACK,
  BROCHURE_MONTSERRAT_FONT_STACK,
  avatarFallback,
  formatPhoneDisplay,
  type BrochureAgent,
  type PillTag,
} from '../BrochureScheduleTemplate';

export const KABAH_IMAGE = '/img-brosur/kabah.png';
export const NABAWI_WIDE_IMAGE = '/img-brosur/nabawi-wide.png';
export const NABAWI_DOME_IMAGE = '/img-brosur/nabawi-dome.png';
export const LOGO_COLORED = '/new-logo-alhijaz-colored.png';
// Versi putih dari logo lengkap (AIW + ALHIJAZ + tagline) untuk latar merah;
// alpha logo berwarna dipertahankan, semua pikselnya diputihkan.
export const LOGO_WHITE_FULL = '/img-brosur/logo-alhijaz-white-full.png';
export const PASTI_UMRAH_IMAGE = '/img-brosur/pasti-umrah.png';

/** Nama agent: 3 baris maksimum (line-clamp) dengan ukuran turun bertahap. */
export function agentNameFontSize(name: string, base: number): number {
  if (name.length > 28) return base - 10;
  if (name.length > 22) return base - 6;
  if (name.length > 16) return base - 3;
  return base;
}

export function AgentAvatar({ agent, size, ring, ringWidth = 4, badgeBorder = '#FFFFFF' }: {
  agent: BrochureAgent;
  size: number;
  ring: string;
  ringWidth?: number;
  badgeBorder?: string;
}) {
  const badge = Math.round(size * 0.31);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <img
        src={agent.photo || avatarFallback(agent.name)}
        alt=""
        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = avatarFallback(agent.name); }}
        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: `${ringWidth}px solid ${ring}`, boxSizing: 'border-box', display: 'block' }}
      />
      <span style={{
        position: 'absolute', right: -2, bottom: 0, width: badge, height: badge, borderRadius: '50%',
        background: '#1D9BF0', border: `3px solid ${badgeBorder}`, color: '#fff', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Check size={Math.round(badge * 0.55)} strokeWidth={4} />
      </span>
    </div>
  );
}

export function PackagePills({ pills, soldOut, fontSize = 13 }: { pills: PillTag[]; soldOut: boolean; fontSize?: number }) {
  if (pills.length === 0) return null;
  return (
    <>
      {pills.map(pill => (
        <span key={pill.label} style={{
          display: 'inline-flex', alignItems: 'center', flexShrink: 0, padding: '4px 10px 5px', borderRadius: 999,
          background: soldOut ? '#94A3B8' : pill.bg,
          color: soldOut ? '#FFFFFF' : pill.fg,
          fontFamily: BROCHURE_FONT_STACK, fontSize, fontWeight: 600, fontSynthesis: 'none',
          lineHeight: 1, letterSpacing: 0.3, whiteSpace: 'nowrap',
        }}>{pill.label}</span>
      ))}
    </>
  );
}

/** Stempel SOLD OUT bergaris (pengganti harga pada baris habis). */
export function SoldOutStamp({ color = '#DC2626', background = 'rgba(255,255,255,0.88)', fontSize = 19 }: {
  color?: string;
  background?: string;
  fontSize?: number;
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 12px',
      borderRadius: 5, border: `3px solid ${color}`, color, background,
      fontFamily: BROCHURE_FONT_STACK, fontSize, fontWeight: 900, letterSpacing: 0.8, lineHeight: 1,
      transform: 'rotate(-8deg)', whiteSpace: 'nowrap',
    }}>SOLD OUT</span>
  );
}

/**
 * Ka'bah + Masjid Nabawi samar di area atas footer. Saat paketnya sedikit,
 * daftar tidak sampai ke footer — siluet ini mengisi sisa ruang (pola yang
 * sama dengan backdrop bawah Klasik). Saat penuh, kartu/tabel menutupinya.
 */
const LANDMARK_FADE = 'linear-gradient(180deg, #000 0%, #000 40%, transparent 88%)';

export function LowerLandmarks({ bottom, opacity = 0.13 }: { bottom: number; opacity?: number }) {
  return (
    <div aria-hidden="true" style={{
      position: 'absolute', left: 0, right: 0, bottom, height: 330, zIndex: 0, pointerEvents: 'none',
      // Kaki bangunan memudar sebelum menyentuh footer — tanpa ini, saat daftar
      // penuh, celah sempit di atas footer memperlihatkan potongan tembok.
      WebkitMaskImage: LANDMARK_FADE,
      maskImage: LANDMARK_FADE,
    }}>
      <img src={KABAH_IMAGE} alt="" style={{ position: 'absolute', left: 96, bottom: 0, height: 300, width: 'auto', opacity }} />
      <img src={NABAWI_WIDE_IMAGE} alt="" style={{ position: 'absolute', right: 70, bottom: 0, height: 330, width: 'auto', opacity }} />
    </div>
  );
}

/** "+ N paket lainnya — hubungi …" saat halaman memotong daftar (truncatedCount). */
export function TruncationNote({ count, agent, color, border }: {
  count: number;
  agent: BrochureAgent;
  color: string;
  border: string;
}) {
  if (count <= 0) return null;
  return (
    <div style={{
      position: 'relative', zIndex: 2, flexShrink: 0, margin: '0 50px 14px',
      border: `2px dashed ${border}`, borderRadius: 14, background: 'rgba(255,255,255,0.82)',
      color, fontWeight: 700, fontSize: 19, textAlign: 'center', padding: 11,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      + {count} paket lainnya — hubungi {agent.name?.trim() || 'kami'}
    </div>
  );
}

/**
 * Footer kartu putih (Kartu Jadwal, Kartu Ringkas, Kalender): foto + nama di
 * kiri, tombol WhatsApp merah di kanan.
 */
export function WhiteAgentFooter({ agent, margin, border }: { agent: BrochureAgent; margin: string; border?: string }) {
  const phone = formatPhoneDisplay(agent.phone);
  const agentName = agent.name || 'Alhijaz';
  return (
    <div style={{
      position: 'relative', zIndex: 2, flexShrink: 0, margin,
      display: 'flex', alignItems: 'center', gap: 20, padding: '20px 20px 20px 22px', borderRadius: 24,
      background: '#FFFFFF', border: border ? `1px solid ${border}` : 'none', boxShadow: '0 14px 34px rgba(90,0,16,0.13)',
    }}>
      <AgentAvatar agent={agent} size={104} ring="#C8102E" />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 2 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#C8102E', whiteSpace: 'nowrap' }}>Info &amp; Pendaftaran:</span>
        <strong style={{
          fontFamily: BROCHURE_MONTSERRAT_FONT_STACK, fontSize: agentNameFontSize(agentName, 40), fontWeight: 900, color: '#241A1C', lineHeight: 1.05,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{agentName}</strong>
      </div>
      {phone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, whiteSpace: 'nowrap',
          padding: '20px 26px 20px 22px', borderRadius: 18, color: '#FFFFFF',
          background: 'linear-gradient(160deg, #870018 0%, #C8102E 100%)',
        }}>
          <WhatsAppIcon size={40} />
          <span style={{ fontSize: 31, fontWeight: 900, letterSpacing: 0.3, lineHeight: 1 }}>{phone}</span>
        </div>
      )}
    </div>
  );
}
