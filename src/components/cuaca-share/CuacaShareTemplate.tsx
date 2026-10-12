// Banner Share Cuaca 1080×1350 (mockup C2/C3). Komponen BODOH: semua nilai
// sudah dihitung lib/cuaca-share-data.js. Dirender sebagai pratinjau di
// ShareCuacaModal dan dipotret Chromium di server (src/cuaca-share-entry.tsx),
// jadi gaya ditulis inline — tidak bergantung CSS Tailwind halaman.
import {
  BadgeCheck, CalendarDays, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun,
  Droplets, MapPin, Snowflake, Sun, SunMedium, Thermometer, Wind,
} from 'lucide-react';
import type { CuacaIconKey, CuacaShareProps } from '../../../lib/cuaca-share-data.js';
import { CUACA_SHARE_H, CUACA_SHARE_W, formatDeg, formatRange } from '../../../lib/cuaca-share-data.js';
import { CuacaOrnament, KhatamPanel } from './CuacaOrnament';

export interface CuacaShareAssets {
  photoSrc: string | null;
  logoSrc: string;
  agentPhotoSrc: string | null;
}

const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const GOLD = '#F8DFA1';
const MINT = '#A7F3D0';
const MINT_SOFT = '#D1FAE5';

const ICONS: Record<CuacaIconKey, typeof Sun> = {
  sun: Sun, 'cloud-sun': CloudSun, cloud: Cloud, 'cloud-fog': CloudFog, 'cloud-drizzle': CloudDrizzle,
  'cloud-rain': CloudRain, snowflake: Snowflake, 'cloud-lightning': CloudLightning, thermometer: Thermometer,
};

function WeatherIcon({ name, size, color }: { name: CuacaIconKey; size: number; color: string }) {
  const Icon = ICONS[name] ?? Thermometer;
  return <Icon size={size} color={color} strokeWidth={2} style={{ flexShrink: 0 }} />;
}

function CityCard({ data, photoSrc }: { data: CuacaShareProps; photoSrc: string | null }) {
  return (
    <div
      data-city-card={photoSrc ? 'photo' : 'pattern'}
      style={{ position: 'relative', height: 400, flexShrink: 0, borderRadius: 32, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)' }}
    >
      {photoSrc ? (
        <>
          <img src={photoSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,66,51,0) 45%, rgba(5,66,51,0.85) 100%)' }} />
        </>
      ) : (
        <KhatamPanel><WeatherIcon name={data.conditionIcon} size={230} color={GOLD} /></KhatamPanel>
      )}
      <div style={{ position: 'absolute', left: 24, bottom: 24, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px', borderRadius: 999, background: 'rgba(5,38,29,0.72)', border: '1px solid rgba(255,255,255,0.2)' }}>
        <MapPin size={28} color={GOLD} strokeWidth={2} />
        <span style={{ fontSize: 32, fontWeight: 800 }}>{data.cityName}</span>
        <span style={{ fontSize: 26, fontWeight: 600, color: MINT_SOFT }}>{data.country}</span>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: typeof Sun; value: string; label: string }) {
  const Icon = icon;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
      <Icon size={30} color={MINT} strokeWidth={2} />
      <span style={{ fontSize: 30, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,0.67)' }}>{label}</span>
    </div>
  );
}

function AgentPanel({ data, photoSrc }: { data: CuacaShareProps; photoSrc: string | null }) {
  const { agent } = data;
  return (
    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '24px 28px', borderRadius: 32, background: 'rgba(5,38,29,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0, flex: 1 }}>
        <div style={{ width: 88, height: 88, flexShrink: 0, borderRadius: 44, border: `4px solid ${GOLD}`, overflow: 'hidden', background: '#2F5FA8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {photoSrc
            ? <img src={photoSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 34, fontWeight: 800 }}>{agent.initials}</span>}
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: agent.nameFontSize, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{agent.name}</span>
            <BadgeCheck size={32} color="#1D9BF0" strokeWidth={2} style={{ flexShrink: 0 }} />
          </div>
          <span style={{ fontSize: 24, fontWeight: 600, color: MINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{agent.siteLabel}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, padding: '16px 22px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
        <CalendarDays size={26} color={GOLD} strokeWidth={2} />
        <span style={{ fontSize: 26, fontWeight: 700, whiteSpace: 'nowrap' }}>{data.dateLabel}</span>
      </div>
    </div>
  );
}

export function CuacaShareTemplate({ data, assets }: { data: CuacaShareProps; assets: CuacaShareAssets }) {
  return (
    <div
      data-cuaca-share
      style={{
        position: 'relative', width: CUACA_SHARE_W, height: CUACA_SHARE_H, overflow: 'hidden',
        fontFamily: FONT, color: '#FFFFFF',
        background: 'linear-gradient(200deg, #0F6E56 0%, #0A5644 55%, #054233 100%)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 120% 90% at 15% 85%, rgba(29,138,106,0.33), rgba(29,138,106,0) 70%)' }} />
      <CuacaOrnament />
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', gap: 30, padding: '64px 64px 56px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>Cuaca Hari Ini</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: MINT, marginTop: 10 }}>{data.subtitle}</div>
          </div>
          <img src={assets.logoSrc} alt="Alhijaz" style={{ height: 120, width: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.96 }} />
        </div>

        <CityCard data={data} photoSrc={assets.photoSrc} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <div style={{ fontSize: data.tempFontSize, fontWeight: 800, letterSpacing: -10, lineHeight: 0.9, whiteSpace: 'nowrap' }}>{formatDeg(data.temp)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <WeatherIcon name={data.conditionIcon} size={56} color={GOLD} />
              <span style={{ fontSize: data.conditionFontSize, fontWeight: 800, color: GOLD, whiteSpace: 'nowrap' }}>{data.conditionLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 4, borderRadius: 2, background: GOLD, flexShrink: 0 }} />
              <span style={{ fontSize: 30, fontWeight: 600, color: MINT, whiteSpace: 'nowrap' }}>
                {`terasa ${formatDeg(data.feelsLike)} · ${formatRange(data.tempMin, data.tempMax)}`}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <Stat icon={Droplets} value={`${data.humidity}%`} label="Lembap" />
          <Stat icon={Wind} value={`${data.windSpeed} km/j`} label="Angin" />
          <Stat icon={SunMedium} value={`UV ${data.uvIndex}`} label={data.uvLabel} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 28px', borderRadius: 28, background: 'rgba(5,38,29,0.4)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {data.forecast.map(f => (
              <div key={f.day} style={{ display: 'flex', alignItems: 'center', gap: 16, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: GOLD }}>{f.day}</span>
                <WeatherIcon name={f.icon} size={38} color="#FFFFFF" />
                <span style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{`${formatDeg(f.tempMin)} / ${formatDeg(f.tempMax)}`}</span>
              </div>
            ))}
          </div>
          {data.seasonalNote && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ fontSize: 26, fontWeight: 400, color: MINT_SOFT, lineHeight: 1.35 }}>{data.seasonalNote}</div>
            </>
          )}
        </div>

        {/* marginTop:auto di AgentPanel (bukan spacer flex:1) — spacer ikut memakan
            gap 30px dan membuat panel menempel ke tepi bawah saat catatan musim 2 baris. */}
        <AgentPanel data={data} photoSrc={assets.agentPhotoSrc} />
      </div>
    </div>
  );
}
