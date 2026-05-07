import { normalizeWaNumber } from '../utils/phone';

export interface BrochurePackage {
  id: string;
  nama: string;
  maskapai: string;
  berangkat_tgl: string; // YYYY-MM-DD
  pulang_tgl: string;
  harga: number;
}

export interface BrochureMonth {
  key: string;
  label: string;
  monthIndexId: number;
  year: number;
  packages: BrochurePackage[];
  truncatedCount: number;
}

export interface BrochureAgent {
  name: string;
  phone: string;
  photo: string;
  website: string;
}

export interface BrochureScheduleTemplateProps {
  month: BrochureMonth;
  agent: BrochureAgent;
}

export const BROCHURE_W = 1080;
export const BROCHURE_H = 1920;

export const BROCHURE_FONT_STACK = "'Inter', 'Inter var', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const BROCHURE_FONT_WEIGHTS = [600, 700, 800, 900] as const;

const MONTH_ABBR_ID = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGT','SEP','OKT','NOV','DES'];

function formatHargaJt(harga: number): string {
  // Round to nearest 100k juta-precision (e.g. 33_950_000 → 34.0, 33_949_999 → 33.9).
  const jt = Math.round(harga / 100_000) / 10;
  return jt.toFixed(1);
}

function formatTglID(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return '';
  // Round-trip check: detect calendar overflow (e.g., 2025-02-29 → Mar 1)
  if (d.getUTCDate() !== parseInt(iso.slice(8, 10), 10)) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_ABBR_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatPhoneDisplay(rawPhone: string): string {
  // normalizeWaNumber returns 62-prefixed digits (e.g. "6282290002").
  // Brochure displays the local 0-prefixed grouping: "0822-9000-20".
  const norm = normalizeWaNumber(rawPhone);
  if (!norm) return '';
  const local = '0' + norm.slice(2); // "62..." → "0..."
  // Ungrouped fallback for inputs too short to group meaningfully.
  if (local.length < 10) return local;
  return `${local.slice(0, 4)}-${local.slice(4, 8)}-${local.slice(8)}`;
}

function avatarFallback(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'A')}&background=8B0000&color=fff&size=192`;
}

function cleanWebsite(website: string): string {
  return (website || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '')
    .toLowerCase();
}

export function BrochureScheduleTemplate({ month, agent }: BrochureScheduleTemplateProps) {
  const photo = agent.photo || avatarFallback(agent.name);
  const phone = formatPhoneDisplay(agent.phone);
  const website = cleanWebsite(agent.website) || 'alhijazindonesia.com';

  // Row height adapts: 7 rows = 110px, 10 rows = 90px (linear). Cap min 80px.
  const n = month.packages.length;
  const rowH = Math.max(80, Math.round(110 - (n - 7) * 5));

  return (
    <div style={{
      width: BROCHURE_W,
      height: BROCHURE_H,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: BROCHURE_FONT_STACK,
      background: 'linear-gradient(180deg, #C8102E 0%, #A00020 60%, #8B0000 100%)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header bar */}
      <div style={{
        height: 200,
        padding: '40px 60px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <img
          src="/logo-alhijaz-besar.svg"
          alt="Alhijaz"
          style={{ height: 110, width: 'auto', filter: 'brightness(0) invert(1)' }}
        />
        <div style={{ display: 'flex', gap: 14 }}>
          {/* Two seal-style placeholder badges */}
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            background: '#F8DFA1', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#8B0000', fontWeight: 900, fontSize: 16, textAlign: 'center', lineHeight: 1.05,
            border: '4px solid #fff', boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}>SERTI<br/>FIKASI</div>
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#8B0000', fontWeight: 900, fontSize: 14, textAlign: 'center', lineHeight: 1.05,
            border: '4px solid #F8DFA1', boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}>5 PASTI<br/>UMRAH</div>
        </div>
      </div>

      {/* Title block */}
      <div style={{
        padding: '0 60px 30px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          fontSize: 110, fontWeight: 900, lineHeight: 0.95, letterSpacing: -2,
          textShadow: '0 4px 18px rgba(0,0,0,0.35)',
        }}>PAKET UMROH</div>
        <div style={{
          fontSize: 130, fontWeight: 900, lineHeight: 1, letterSpacing: -3, marginTop: 6,
          textShadow: '0 4px 18px rgba(0,0,0,0.35)',
        }}>{month.label.toUpperCase()}</div>
      </div>

      {/* Package table */}
      <div style={{
        margin: '0 50px',
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
        position: 'relative',
        zIndex: 2,
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr 180px 180px 150px 220px',
          background: '#7A0018',
          color: '#fff',
          fontWeight: 900,
          fontSize: 22,
          height: 70,
          alignItems: 'center',
          padding: '0 18px',
          letterSpacing: 1,
        }}>
          <span>NO</span>
          <span>PAKET UMROH</span>
          <span style={{ textAlign: 'center' }}>BERANGKAT</span>
          <span style={{ textAlign: 'center' }}>PULANG</span>
          <span style={{ textAlign: 'center' }}>MASKAPAI</span>
          <span style={{ textAlign: 'right' }}>HARGA</span>
        </div>

        {/* Data rows */}
        {month.packages.map((p, i) => (
          <div key={p.id} style={{
            display: 'grid',
            gridTemplateColumns: '70px 1fr 180px 180px 150px 220px',
            background: '#fff',
            color: '#1f1f1f',
            fontWeight: 700,
            fontSize: 22,
            height: rowH,
            alignItems: 'center',
            padding: '0 18px',
            borderTop: i === 0 ? 'none' : '1px solid #f1d1d6',
          }}>
            <span style={{ color: '#8B0000', fontWeight: 800 }}>{i + 1}.</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{p.nama}</span>
            <span style={{ textAlign: 'center', fontWeight: 800 }}>{formatTglID(p.berangkat_tgl)}</span>
            <span style={{ textAlign: 'center', fontWeight: 800 }}>{formatTglID(p.pulang_tgl)}</span>
            <span style={{ textAlign: 'center' }}>{p.maskapai}</span>
            <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 22, color: '#8B0000', fontWeight: 700 }}>Rp </span>
              <span style={{ fontSize: 36, color: '#8B0000', fontWeight: 900 }}>{formatHargaJt(p.harga)}</span>
              <span style={{ fontSize: 22, color: '#8B0000', fontWeight: 700 }}> Jt</span>
            </span>
          </div>
        ))}

        {/* Truncation footnote */}
        {month.truncatedCount > 0 && (
          <div style={{
            background: '#fff5f5',
            color: '#8B0000',
            fontWeight: 700,
            fontSize: 20,
            padding: '14px 18px',
            textAlign: 'center',
            borderTop: '1px dashed #E5A0AA',
          }}>
            + {month.truncatedCount} paket lainnya — hubungi {agent.name?.trim() || 'kami'}
          </div>
        )}
      </div>

      {/* Spacer pushes footer down */}
      <div style={{ flex: 1 }} />

      {/* Footer pill — agent info */}
      <div style={{
        margin: '0 50px 24px',
        padding: '24px 28px',
        borderRadius: 28,
        background: 'rgba(60, 0, 5, 0.55)',
        border: '1px solid rgba(248, 223, 161, 0.45)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        zIndex: 2,
      }}>
        <img
          src={photo}
          alt=""
          style={{
            width: 140, height: 140, borderRadius: '50%', objectFit: 'cover',
            border: '5px solid #F8DFA1', flexShrink: 0,
            boxShadow: '0 10px 26px rgba(0,0,0,0.25)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 24, color: '#F8DFA1', fontWeight: 700, letterSpacing: 0.5 }}>
            Info &amp; Pendaftaran:
          </span>
          <strong style={{ fontSize: 44, fontWeight: 900, color: '#fff', marginTop: 2, lineHeight: 1.1 }}>
            {agent.name || 'Alhijaz'} {phone ? `(${phone})` : ''}
          </strong>
        </div>
      </div>

      {/* Website strip */}
      <div style={{
        background: '#5A0010',
        color: '#fff',
        fontWeight: 800,
        fontSize: 30,
        textAlign: 'center',
        padding: '20px 0',
        letterSpacing: 1,
        position: 'relative',
        zIndex: 2,
      }}>
        {website}
      </div>
    </div>
  );
}
