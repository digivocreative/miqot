import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Loader2, Share2, Check, Maximize2, Minimize2 } from 'lucide-react';
import QRCode from 'qrcode';

type DesignId = 'd1' | 'd2' | 'd3' | 'd4' | 'd5';
type CardFormat = 'landscape' | 'portrait';

interface DesignMeta {
  id: DesignId;
  name: string;
  qrColor: { dark: string; light: string };
}

const DESIGNS: DesignMeta[] = [
  { id: 'd1', name: 'Emerald Split', qrColor: { dark: '#059669', light: '#f0fdf4' } },
  { id: 'd2', name: 'Dark Navy', qrColor: { dark: '#0f172a', light: '#f8fafc' } },
  { id: 'd3', name: 'Minimal Line', qrColor: { dark: '#059669', light: '#ffffff' } },
  { id: 'd4', name: 'Warm Gold', qrColor: { dark: '#b45309', light: '#fffbeb' } },
  { id: 'd5', name: 'Full Dark', qrColor: { dark: '#10b981', light: '#0f172a' } },
];

const CARD_SIZE = {
  landscape: { w: 1050, h: 600 },
  portrait: { w: 600, h: 1020 },
};

// ── Shared SVG Icons (inline for export compatibility) ──
const PhoneSvg = ({ color = '#059669', size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.88.37 1.85.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.96.33 1.93.57 2.81.7A2 2 0 0122 16.92z" />
  </svg>
);
const MailSvg = ({ color = '#059669', size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
  </svg>
);
const GlobeSvg = ({ color = '#059669', size = 16 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20" /><path d="M2 12h20" />
  </svg>
);

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();
}

// ── Shared sub-components ──
interface CardProps {
  name: string; initials: string; role: string; brand: string;
  wa: string; email: string; web: string; slug: string;
  photoUrl: string | null; qrDataUrl: string;
}

const font = "'Inter','Segoe UI',sans-serif";

// Islamic geometric pattern as background
const geoPattern = (color: string, opacity = 0.06) =>
  `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='${encodeURIComponent(color)}' stroke-width='1' opacity='${opacity}'%3E%3Cpath d='M30 0L60 30L30 60L0 30Z'/%3E%3Cpath d='M30 10L50 30L30 50L10 30Z'/%3E%3C/g%3E%3C/svg%3E")`;

function Avatar({ url, initials, size, bg, border, textColor, fontSize, shadow }: {
  url: string | null; initials: string; size: number; bg: string; border: string; textColor: string; fontSize: number; shadow?: string;
}) {
  const s: React.CSSProperties = { width: size, height: size, borderRadius: '50%', border, flexShrink: 0, overflow: 'hidden', boxShadow: shadow || '0 4px 20px rgba(0,0,0,0.15)' };
  return url
    ? <img src={url} style={{ ...s, objectFit: 'cover' }} />
    : <div style={{ ...s, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize, fontWeight: 700, color: textColor }}>{initials}</span>
      </div>;
}

function ContactRow({ icon, text, iconBg, iconBorder, textColor, gap = 12 }: {
  icon: React.ReactNode; text: string; iconBg: string; iconBorder: string; textColor: string; gap?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, border: `1px solid ${iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <span style={{ fontSize: 20, color: textColor, fontWeight: 500 }}>{text}</span>
    </div>
  );
}

function Contacts({ wa, email, web, iconColor, iconBg, iconBorder, textColor, gap = 14 }: {
  wa: string; email: string; web: string; iconColor: string; iconBg: string; iconBorder: string; textColor: string; gap?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      <ContactRow icon={<PhoneSvg color={iconColor} size={15} />} text={wa} iconBg={iconBg} iconBorder={iconBorder} textColor={textColor} />
      <ContactRow icon={<MailSvg color={iconColor} size={15} />} text={email} iconBg={iconBg} iconBorder={iconBorder} textColor={textColor} />
      <ContactRow icon={<GlobeSvg color={iconColor} size={15} />} text={web} iconBg={iconBg} iconBorder={iconBorder} textColor={textColor} />
    </div>
  );
}

function QRBox({ src, size, border, bg, radius = 10 }: { src: string; size: number; border: string; bg: string; radius?: number }) {
  return (
    <div style={{ width: size, height: size, border, borderRadius: radius, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      {src && <img src={src} style={{ width: size - 14, height: size - 14 }} />}
    </div>
  );
}

// ════════════════════════════════════════
// D1 — Emerald Split (rich gradient + geometric pattern + glassmorphism)
// ════════════════════════════════════════
function D1Landscape({ name, role, brand, wa, email, web, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', position: 'relative', fontFamily: font, overflow: 'hidden' }}>
      <div style={{ width: 400, height: '100%', background: 'linear-gradient(155deg, #047857, #059669 40%, #10b981)', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundImage: geoPattern('#ffffff', 0.08), backgroundSize: '60px 60px' }}>
        {/* Glow orb */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.1), transparent 70%)' }} />
        <Avatar url={photoUrl} initials={initials} size={150} bg="rgba(255,255,255,0.15)" border="4px solid rgba(255,255,255,0.4)" textColor="white" fontSize={52} shadow="0 8px 32px rgba(0,0,0,0.2)" />
        <div style={{ textAlign: 'center', padding: '0 20px', marginTop: 16 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'white', lineHeight: 1.2, textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>{name}</div>
          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', marginTop: 6, fontWeight: 500, letterSpacing: 1 }}>{role}</div>
        </div>
        {/* Arrow divider with glass effect */}
        <div style={{ position: 'absolute', right: -35, top: 0, width: 70, height: '100%', background: 'linear-gradient(155deg, #047857, #10b981)', clipPath: 'polygon(0 0, 0% 100%, 100% 50%)', filter: 'drop-shadow(4px 0 8px rgba(0,0,0,0.1))' }} />
      </div>
      <div style={{ flex: 1, background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)', padding: '40px 40px 36px 80px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(135deg, #059669, #34d399)', boxShadow: '0 0 8px rgba(16,185,129,0.4)' }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 2 }}>{brand}</span>
        </div>
        <Contacts wa={wa} email={email} web={web} iconColor="#059669" iconBg="linear-gradient(135deg, #ecfdf5, #d1fae5)" iconBorder="#a7f3d0" textColor="#1f2937" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><span style={{ fontSize: 15, color: '#9ca3af', fontWeight: 500 }}>Scan QR → lihat paket umroh</span></div>
          <QRBox src={qrDataUrl} size={100} border="1.5px solid #d1fae5" bg="linear-gradient(135deg, #f0fdf4, #ffffff)" />
        </div>
      </div>
    </div>
  );
}

function D1Portrait({ name, role, brand, wa, email, web, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, display: 'flex', flexDirection: 'column', fontFamily: font, overflow: 'hidden', background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)' }}>
      <div style={{ height: 300, background: 'linear-gradient(135deg, #047857, #059669 50%, #10b981)', position: 'relative', padding: '36px 36px 0', flexShrink: 0, backgroundImage: geoPattern('#ffffff', 0.07), backgroundSize: '60px 60px' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.8)' }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 2 }}>{brand}</span>
        </div>
        <div style={{ position: 'absolute', bottom: -40, left: '-5%', width: '110%', height: 80, background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)', borderRadius: '50%' }} />
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: -70, zIndex: 2 }}>
        <Avatar url={photoUrl} initials={initials} size={140} bg="#d1fae5" border="6px solid white" textColor="#059669" fontSize={48} shadow="0 8px 32px rgba(0,0,0,0.12)" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#111827' }}>{name}</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#10b981', letterSpacing: 2, marginTop: 4 }}>{role}</div>
        <div style={{ width: 50, height: 3, background: 'linear-gradient(90deg, #059669, #34d399)', borderRadius: 2, margin: '16px 0' }} />
        <div style={{ width: '78%' }}>
          <Contacts wa={wa} email={email} web={web} iconColor="#059669" iconBg="linear-gradient(135deg, #ecfdf5, #d1fae5)" iconBorder="#a7f3d0" textColor="#1f2937" gap={12} />
        </div>
        <div style={{ marginTop: 'auto', paddingBottom: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <QRBox src={qrDataUrl} size={120} border="1.5px solid #d1fae5" bg="linear-gradient(135deg, #f0fdf4, #ffffff)" />
          <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 500 }}>scan → lihat paket</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D2 — Dark Navy (deep gradients, cyan accent, glass sidebar)
// ════════════════════════════════════════
function D2Landscape({ name, role, brand, wa, email, web, slug, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', fontFamily: font, overflow: 'hidden' }}>
      <div style={{ width: 420, background: 'linear-gradient(170deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)', padding: 40, display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'relative', backgroundImage: geoPattern('#10b981', 0.04), backgroundSize: '50px 50px' }}>
        <div style={{ position: 'absolute', top: -50, left: -50, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.08), transparent 70%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 12px rgba(16,185,129,0.5)' }} />
          <span style={{ fontSize: 18, color: '#475569', textTransform: 'uppercase', letterSpacing: 2 }}>Alhijaz</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Avatar url={photoUrl} initials={initials} size={120} bg="linear-gradient(135deg, #1e293b, #334155)" border="3px solid #334155" textColor="#34d399" fontSize={42} shadow="0 8px 32px rgba(0,0,0,0.3)" />
          <div style={{ fontSize: 30, fontWeight: 700, color: 'white', marginTop: 20, textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{name}</div>
          <div style={{ fontSize: 18, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{role}</div>
        </div>
      </div>
      <div style={{ flex: 1, background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', borderLeft: '5px solid #10b981', padding: '36px 36px 36px 42px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 120, height: 120, background: 'radial-gradient(circle, rgba(16,185,129,0.06), transparent 70%)' }} />
        <span style={{ fontSize: 20, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 2 }}>{brand}</span>
        <Contacts wa={wa} email={email} web={web} iconColor="#475569" iconBg="linear-gradient(135deg, #f8fafc, #f1f5f9)" iconBorder="#e2e8f0" textColor="#374151" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, color: '#9ca3af', fontWeight: 500 }}>{slug}</span>
          <QRBox src={qrDataUrl} size={96} border="2px solid #1e293b" bg="#f8fafc" />
        </div>
      </div>
    </div>
  );
}

function D2Portrait({ name, role, brand, wa, email, web, slug, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, display: 'flex', flexDirection: 'column', fontFamily: font, overflow: 'hidden', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)' }}>
      <div style={{ height: 260, background: 'linear-gradient(150deg, #0f172a 0%, #1e293b 100%)', position: 'relative', flexShrink: 0, padding: '36px 36px 0', backgroundImage: geoPattern('#10b981', 0.04), backgroundSize: '50px 50px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 12px rgba(16,185,129,0.5)' }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 2 }}>{brand}</span>
        </div>
        <div style={{ position: 'absolute', bottom: -40, left: '-5%', width: '110%', height: 80, background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)', borderRadius: '50%' }} />
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: -70, zIndex: 2 }}>
        <Avatar url={photoUrl} initials={initials} size={140} bg="linear-gradient(135deg, #1e293b, #334155)" border="6px solid white" textColor="#34d399" fontSize={48} shadow="0 8px 32px rgba(0,0,0,0.15)" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#111827' }}>{name}</div>
        <div style={{ fontSize: 18, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{role}</div>
        <div style={{ width: 50, height: 2, background: 'linear-gradient(90deg, #0f172a, #334155)', borderRadius: 1, margin: '16px 0' }} />
        <div style={{ width: '78%' }}>
          <Contacts wa={wa} email={email} web={web} iconColor="#475569" iconBg="linear-gradient(135deg, #f8fafc, #f1f5f9)" iconBorder="#e2e8f0" textColor="#374151" gap={12} />
        </div>
        <div style={{ marginTop: 'auto', paddingBottom: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <QRBox src={qrDataUrl} size={120} border="2px solid #1e293b" bg="#f8fafc" />
          <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 500 }}>{slug}</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D3 — Minimal Line (clean with accent strip + subtle texture)
// ════════════════════════════════════════
function D3Landscape({ name, role, brand, wa, email, web, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, background: 'linear-gradient(170deg, #ffffff 0%, #f9fafb 50%, #f0fdf4 100%)', fontFamily: font, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 20, background: 'linear-gradient(90deg, #047857, #059669, #10b981, #34d399)', flexShrink: 0 }} />
      <div style={{ flex: 1, padding: '36px 48px', display: 'flex', gap: 40, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <Avatar url={photoUrl} initials={initials} size={130} bg="linear-gradient(135deg, #ecfdf5, #d1fae5)" border="3px solid #a7f3d0" textColor="#059669" fontSize={46} shadow="0 6px 24px rgba(5,150,105,0.12)" />
          <QRBox src={qrDataUrl} size={90} border="1.5px solid #d1fae5" bg="linear-gradient(135deg, #f0fdf4, #ffffff)" />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: 3 }}>{brand}</span>
          <div>
            <div style={{ fontSize: 40, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{name}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#6b7280', marginTop: 4 }}>{role}</div>
          </div>
          <div style={{ width: 72, height: 3, background: 'linear-gradient(90deg, #059669, #34d399)', borderRadius: 2 }} />
          <Contacts wa={wa} email={email} web={web} iconColor="#059669" iconBg="linear-gradient(135deg, #ecfdf5, #d1fae5)" iconBorder="#a7f3d0" textColor="#374151" gap={12} />
        </div>
      </div>
    </div>
  );
}

function D3Portrait({ name, role, brand, wa, email, web, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, background: 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)', fontFamily: font, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 16, background: 'linear-gradient(90deg, #047857, #059669, #10b981, #34d399)', flexShrink: 0 }} />
      <div style={{ flex: 1, padding: '40px 40px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Avatar url={photoUrl} initials={initials} size={150} bg="linear-gradient(135deg, #ecfdf5, #d1fae5)" border="3px solid #a7f3d0" textColor="#059669" fontSize={52} shadow="0 6px 24px rgba(5,150,105,0.12)" />
        <span style={{ fontSize: 16, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: 3, marginTop: 20 }}>{brand}</span>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#111827', marginTop: 8 }}>{name}</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: '#6b7280', marginTop: 4 }}>{role}</div>
        <div style={{ width: 50, height: 3, background: 'linear-gradient(90deg, #059669, #34d399)', borderRadius: 2, margin: '16px 0' }} />
        <div style={{ width: '78%' }}>
          <Contacts wa={wa} email={email} web={web} iconColor="#059669" iconBg="linear-gradient(135deg, #ecfdf5, #d1fae5)" iconBorder="#a7f3d0" textColor="#374151" gap={12} />
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <QRBox src={qrDataUrl} size={120} border="1.5px solid #d1fae5" bg="linear-gradient(135deg, #f0fdf4, #ffffff)" />
          <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 500 }}>scan → lihat paket</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D4 — Warm Gold (rich amber gradients + warm texture)
// ════════════════════════════════════════
function D4Landscape({ name, role, brand, wa, email, web, slug, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, fontFamily: font, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)' }}>
      <div style={{ height: 230, background: 'linear-gradient(135deg, #92400e 0%, #b45309 30%, #d97706 60%, #f59e0b 100%)', padding: '40px 48px', display: 'flex', justifyContent: 'space-between', position: 'relative', flexShrink: 0, backgroundImage: geoPattern('#ffffff', 0.06), backgroundSize: '50px 50px' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.12), transparent 70%)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 1 }}>
          <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', fontWeight: 500, letterSpacing: 1 }}>{brand}</span>
          <div style={{ fontSize: 40, fontWeight: 700, color: 'white', marginTop: 4, lineHeight: 1.1, textShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>{name}</div>
          <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.85)', marginTop: 4, fontWeight: 500 }}>{role}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
          <Avatar url={photoUrl} initials={initials} size={120} bg="rgba(255,255,255,0.15)" border="3px solid rgba(255,255,255,0.4)" textColor="white" fontSize={42} shadow="0 8px 32px rgba(0,0,0,0.2)" />
        </div>
        <div style={{ position: 'absolute', bottom: -40, left: '-5%', width: '110%', height: 80, background: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)', borderRadius: '50%' }} />
      </div>
      <div style={{ flex: 1, padding: '28px 48px 36px', display: 'flex', gap: 40, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Contacts wa={wa} email={email} web={web} iconColor="#b45309" iconBg="linear-gradient(135deg, #fffbeb, #fef3c7)" iconBorder="#fcd34d" textColor="#374151" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <QRBox src={qrDataUrl} size={100} border="2px solid #fde68a" bg="linear-gradient(135deg, #fffbeb, #ffffff)" />
          <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 500 }}>{slug}</span>
        </div>
      </div>
    </div>
  );
}

function D4Portrait({ name, role, brand, wa, email, web, slug, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, display: 'flex', flexDirection: 'column', fontFamily: font, overflow: 'hidden', background: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)' }}>
      <div style={{ height: 300, background: 'linear-gradient(135deg, #92400e 0%, #b45309 30%, #d97706 60%, #f59e0b 100%)', position: 'relative', padding: '36px 36px 0', flexShrink: 0, backgroundImage: geoPattern('#ffffff', 0.06), backgroundSize: '50px 50px' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.1), transparent 70%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 1 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.8)' }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 2 }}>{brand}</span>
        </div>
        <div style={{ position: 'absolute', bottom: -40, left: '-5%', width: '110%', height: 80, background: 'linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)', borderRadius: '50%' }} />
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: -70, zIndex: 2 }}>
        <Avatar url={photoUrl} initials={initials} size={140} bg="linear-gradient(135deg, #fef3c7, #fde68a)" border="6px solid white" textColor="#b45309" fontSize={48} shadow="0 8px 32px rgba(0,0,0,0.12)" />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#111827' }}>{name}</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#b45309', letterSpacing: 2, marginTop: 4 }}>{role}</div>
        <div style={{ width: 50, height: 3, background: 'linear-gradient(90deg, #b45309, #f59e0b)', borderRadius: 2, margin: '16px 0' }} />
        <div style={{ width: '78%' }}>
          <Contacts wa={wa} email={email} web={web} iconColor="#b45309" iconBg="linear-gradient(135deg, #fffbeb, #fef3c7)" iconBorder="#fcd34d" textColor="#374151" gap={12} />
        </div>
        <div style={{ marginTop: 'auto', paddingBottom: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <QRBox src={qrDataUrl} size={120} border="2px solid #fde68a" bg="linear-gradient(135deg, #fffbeb, #ffffff)" />
          <span style={{ fontSize: 14, color: '#9ca3af', fontWeight: 500 }}>{slug}</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// D5 — Full Dark (deep dark + emerald neon accents + glass panel)
// ════════════════════════════════════════
function D5Landscape({ name, role, brand, wa, email, web, slug, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 1050, height: 600, display: 'flex', fontFamily: font, overflow: 'hidden', background: 'linear-gradient(135deg, #0f172a 0%, #0c1222 40%, #0f172a 100%)' }}>
      <div style={{ flex: 1, padding: '40px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', backgroundImage: geoPattern('#10b981', 0.03), backgroundSize: '50px 50px' }}>
        <div style={{ position: 'absolute', bottom: -40, left: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.06), transparent 70%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 16px rgba(16,185,129,0.5)' }} />
          <span style={{ fontSize: 18, color: '#475569', textTransform: 'uppercase', letterSpacing: 2 }}>{brand}</span>
        </div>
        <div>
          <div style={{ fontSize: 40, fontWeight: 700, color: 'white', lineHeight: 1.1, textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{name}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981', letterSpacing: 3, marginTop: 6, textShadow: '0 0 20px rgba(16,185,129,0.3)' }}>{role}</div>
          <div style={{ width: 50, height: 2, background: 'linear-gradient(90deg, #10b981, #047857)', borderRadius: 1, marginTop: 12 }} />
        </div>
        <Contacts wa={wa} email={email} web={web} iconColor="#10b981" iconBg="linear-gradient(135deg, #0f2d1e, #0a2218)" iconBorder="#134e30" textColor="#94a3b8" gap={12} />
      </div>
      <div style={{ width: 240, background: 'linear-gradient(180deg, #1e293b 0%, #162032 100%)', borderLeft: '1px solid #334155', padding: '36px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.06), transparent 70%)' }} />
        <Avatar url={photoUrl} initials={initials} size={110} bg="linear-gradient(135deg, #0f2d1e, #0a2218)" border="3px solid #10b981" textColor="#10b981" fontSize={40} shadow="0 0 24px rgba(16,185,129,0.15), 0 8px 32px rgba(0,0,0,0.3)" />
        <QRBox src={qrDataUrl} size={110} border="1.5px solid #334155" bg="linear-gradient(135deg, #0f172a, #1e293b)" />
        <span style={{ fontSize: 16, color: '#475569', fontWeight: 500 }}>{slug}</span>
      </div>
    </div>
  );
}

function D5Portrait({ name, role, brand, wa, email, web, slug, photoUrl, initials, qrDataUrl }: CardProps) {
  return (
    <div style={{ width: 600, height: 1020, background: 'linear-gradient(180deg, #0f172a 0%, #0c1222 50%, #0f172a 100%)', fontFamily: font, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 40px 36px', position: 'relative', backgroundImage: geoPattern('#10b981', 0.03), backgroundSize: '50px 50px' }}>
      <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.05), transparent 70%)' }} />
      <Avatar url={photoUrl} initials={initials} size={150} bg="linear-gradient(135deg, #0f2d1e, #0a2218)" border="3px solid #10b981" textColor="#10b981" fontSize={52} shadow="0 0 24px rgba(16,185,129,0.15), 0 8px 32px rgba(0,0,0,0.3)" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 12px rgba(16,185,129,0.5)' }} />
        <span style={{ fontSize: 16, color: '#334155', textTransform: 'uppercase', letterSpacing: 2 }}>{brand}</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: 'white', marginTop: 12, textAlign: 'center', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>{name}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981', letterSpacing: 3, marginTop: 4, textShadow: '0 0 20px rgba(16,185,129,0.3)' }}>{role}</div>
      <div style={{ width: 50, height: 2, background: 'linear-gradient(90deg, #10b981, #047857)', borderRadius: 1, margin: '16px 0' }} />
      <div style={{ width: '78%' }}>
        <Contacts wa={wa} email={email} web={web} iconColor="#10b981" iconBg="linear-gradient(135deg, #0f2d1e, #0a2218)" iconBorder="#134e30" textColor="#94a3b8" gap={12} />
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <QRBox src={qrDataUrl} size={120} border="1.5px solid #334155" bg="linear-gradient(135deg, #1e293b, #0f172a)" />
        <span style={{ fontSize: 14, color: '#475569', fontWeight: 500 }}>{slug}</span>
      </div>
    </div>
  );
}

// ── Renderer map ──
const RENDERERS: Record<DesignId, Record<CardFormat, React.FC<CardProps>>> = {
  d1: { landscape: D1Landscape, portrait: D1Portrait },
  d2: { landscape: D2Landscape, portrait: D2Portrait },
  d3: { landscape: D3Landscape, portrait: D3Portrait },
  d4: { landscape: D4Landscape, portrait: D4Portrait },
  d5: { landscape: D5Landscape, portrait: D5Portrait },
};

// ══════════════════════════════════════
// Main Page Component
// ══════════════════════════════════════
interface BusinessCardPageProps {
  agent: { slug: string; name: string; phone: string; email: string; photo: string; website: string; };
}

export default function BusinessCardPage({ agent }: BusinessCardPageProps) {
  const name = agent.name || 'Agent';
  const initials = getInitials(name);
  const role = 'Agen Umroh';
  const brand = 'Alhijaz Indowisata';
  const wa = agent.phone || '';
  const email = agent.email || '';
  const web = `${agent.slug || 'agent'}.alhijaz.co`;
  const slug = `alhijaz.co/${agent.slug || 'agent'}`;
  const photoUrl: string | null = agent.photo || null;

  const [selectedDesign, setSelectedDesign] = useState<DesignId>('d1');
  const [format, setFormat] = useState<CardFormat>('landscape');
  const [isExporting, setIsExporting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const currentDesign = DESIGNS.find(d => d.id === selectedDesign)!;

  useEffect(() => {
    QRCode.toDataURL(`https://alhijaz.co/${agent.slug || 'agent'}`, {
      width: 200, margin: 1,
      color: { dark: currentDesign.qrColor.dark, light: currentDesign.qrColor.light },
    }).then(setQrDataUrl);
  }, [agent.slug, selectedDesign]);

  const cardExportRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.35);

  const computeScale = useCallback(() => {
    if (!previewContainerRef.current) return;
    const containerW = previewContainerRef.current.clientWidth - 48;
    setPreviewScale(Math.min(containerW / CARD_SIZE[format].w, 0.6));
  }, [format]);

  useEffect(() => {
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, [computeScale]);

  const cardProps: CardProps = { name, initials, role, brand, wa, email, web, slug, photoUrl, qrDataUrl };
  const CardRenderer = RENDERERS[selectedDesign][format];
  const cardSize = CARD_SIZE[format];

  const handleDownload = async () => {
    if (!cardExportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(cardExportRef.current, { scale: 2 });
      await result.download({ type: 'png', filename: `kartu-nama-${agent.slug || 'agent'}-${format}` });
    } catch (e) { console.error('Export gagal:', e); }
    finally { setIsExporting(false); }
  };

  const handleShare = async () => {
    if (!cardExportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const { snapdom } = await import('@zumer/snapdom');
      const result = await snapdom(cardExportRef.current, { scale: 2 });
      const blob = await result.toBlob({ type: 'png' });
      const file = new File([blob], `kartu-nama-${agent.slug || 'agent'}.png`, { type: 'image/png' });
      if (navigator.share) await navigator.share({ files: [file] });
    } catch (e: any) { if (e?.name !== 'AbortError') console.error('Share gagal:', e); }
    finally { setIsExporting(false); }
  };

  const thumbW = format === 'landscape' ? 88 : 54;
  const thumbH = format === 'landscape' ? 54 : 88;
  const thumbScale = format === 'landscape' ? 88 / 1050 : 54 / 600;

  return (
    <div className="px-4 pt-4 pb-8 space-y-3.5">
      {/* Pilih Desain */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Maximize2 size={13} className="text-gray-400" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Pilih Desain</span>
          </div>
          <div className="flex bg-gray-100 dark:bg-slate-900 rounded-lg p-0.5">
            {(['landscape', 'portrait'] as const).map(f => (
              <button key={f} onClick={() => setFormat(f)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${format === f ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-400 dark:text-slate-500'}`}>
                {f === 'landscape' ? '⬜ Landscape' : '⬜ Portrait'}
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {DESIGNS.map(d => (
              <button key={d.id} onClick={() => setSelectedDesign(d.id)}
                className={`flex flex-col items-center gap-1.5 flex-shrink-0 transition-all ${selectedDesign === d.id ? '' : 'opacity-60'}`}>
                <div className={`relative rounded-lg overflow-hidden border-2 transition-colors ${selectedDesign === d.id ? 'border-emerald-500' : 'border-gray-200 dark:border-slate-600'}`} style={{ width: thumbW, height: thumbH }}>
                  <div style={{ width: CARD_SIZE[format].w, height: CARD_SIZE[format].h, transform: `scale(${thumbScale})`, transformOrigin: 'top left' }}>
                    {(() => { const R = RENDERERS[d.id][format]; return <R {...cardProps} />; })()}
                  </div>
                  {selectedDesign === d.id && (
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <span className={`text-[9px] font-bold ${selectedDesign === d.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-slate-500'}`}>{d.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-1.5">
          <Minimize2 size={13} className="text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Preview</span>
        </div>
        <div ref={previewContainerRef} className="bg-gray-50 dark:bg-slate-900 p-6 flex justify-center">
          <div style={{ width: cardSize.w * previewScale, height: cardSize.h * previewScale, overflow: 'hidden', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
            <div style={{ width: cardSize.w, height: cardSize.h, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
              <CardRenderer {...cardProps} />
            </div>
          </div>
        </div>
        <div className="px-4 py-2 border-t border-gray-50 dark:border-slate-700/50">
          <p className="text-[9px] text-gray-400 dark:text-slate-500 text-center">{cardSize.w}×{cardSize.h}px · Resolusi tinggi untuk print & digital</p>
        </div>
      </div>

      {/* Download */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 flex items-center gap-1.5">
          <Download size={13} className="text-gray-400" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Download</span>
        </div>
        <div className="p-4 space-y-2">
          <button onClick={handleDownload} disabled={isExporting}
            className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
            {isExporting ? <><Loader2 size={16} className="animate-spin" /> Exporting...</> : <><Download size={16} /> Download PNG</>}
          </button>
          {'share' in navigator && (
            <button onClick={handleShare} disabled={isExporting}
              className="w-full py-3 rounded-xl text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
              <Share2 size={16} /> Bagikan
            </button>
          )}
          <p className="text-[9px] text-gray-400 dark:text-slate-500 text-center mt-1">Format PNG · Resolusi tinggi · Siap print & share</p>
        </div>
      </div>

      {/* Hidden export card */}
      <div style={{ position: 'fixed', left: -9999, top: -9999, pointerEvents: 'none', opacity: 0 }}>
        <div ref={cardExportRef} style={{ width: cardSize.w, height: cardSize.h }}>
          <CardRenderer {...cardProps} />
        </div>
      </div>
    </div>
  );
}
