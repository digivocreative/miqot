import { useState, useEffect, useRef } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Cell, CartesianGrid, LabelList } from 'recharts';
import { getAuthHeaders } from './LoginPage';
import { trackEvent } from '../utils/analytics';

// ── Types ──
interface HajiPlusItem { year: number; pax: number; }
interface HajiPlusData {
  items: HajiPlusItem[];
  total: number; average: number;
  peak: HajiPlusItem; min: HajiPlusItem;
  current: HajiPlusItem | null;
  yearCount: number; synced_at: string;
}

interface ColorTheme {
  name: string; dark: string; glow: string; main: string; ring: string;
  bars: string[]; areaFill: string;
  badgeBg: string; badgeText: string;
  ftBg: string; ftBorder: string; ftText: string;
  gradient: string;
  btn: string; accent: string;
}

// ── Theme Config ──
const COLOR_THEMES: ColorTheme[] = [
  { name: 'Emerald', dark: '#021a13', glow: 'rgba(16,185,129,0.25)', main: '#0F6E56', ring: '#0F6E56', gradient: 'linear-gradient(135deg, #064e3b, #10b981)', bars: ['#065f46','#0d9488','#10b981','#34d399','#6ee7b7','#059669','#047857','#0f766e','#14b8a6','#2dd4bf'], areaFill: 'rgba(16,185,129,0.35)', badgeBg: '#d1fae5', badgeText: '#065f46', ftBg: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', ftBorder: '#6ee7b7', ftText: '#065f46', btn: '#0F6E56', accent: '#6ee7b7' },
  { name: 'Red', dark: '#1a0505', glow: 'rgba(220,38,38,0.3)', main: '#dc2626', ring: '#b91c1c', gradient: 'linear-gradient(135deg, #7f1d1d, #ef4444)', bars: ['#7f1d1d','#b91c1c','#dc2626','#ef4444','#f87171','#991b1b','#9f1239','#e11d48','#fb7185','#fca5a5'], areaFill: 'rgba(220,38,38,0.3)', badgeBg: '#fee2e2', badgeText: '#991b1b', ftBg: 'linear-gradient(135deg, #fee2e2, #fecaca)', ftBorder: '#fca5a5', ftText: '#991b1b', btn: '#b91c1c', accent: '#fca5a5' },
  { name: 'Navy', dark: '#060e1f', glow: 'rgba(37,99,235,0.25)', main: '#2563eb', ring: '#185FA5', gradient: 'linear-gradient(135deg, #0c2d57, #3b82f6)', bars: ['#1e3a8a','#2563eb','#3b82f6','#60a5fa','#93c5fd','#1d4ed8','#1e40af','#0369a1','#0284c7','#38bdf8'], areaFill: 'rgba(37,99,235,0.3)', badgeBg: '#dbeafe', badgeText: '#1e40af', ftBg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', ftBorder: '#93c5fd', ftText: '#1e40af', btn: '#1e40af', accent: '#93c5fd' },
  { name: 'Warm Gold', dark: '#1a0e03', glow: 'rgba(217,119,6,0.25)', main: '#d97706', ring: '#BA7517', gradient: 'linear-gradient(135deg, #78350f, #f59e0b)', bars: ['#92400e','#b45309','#d97706','#f59e0b','#fbbf24','#ca8a04','#a16207','#854d0e','#eab308','#facc15'], areaFill: 'rgba(217,119,6,0.3)', badgeBg: '#fef3c7', badgeText: '#92400e', ftBg: 'linear-gradient(135deg, #fef3c7, #fde68a)', ftBorder: '#fcd34d', ftText: '#92400e', btn: '#b45309', accent: '#fcd34d' },
  { name: 'Charcoal', dark: '#0a0a0a', glow: 'rgba(107,114,128,0.2)', main: '#4b5563', ring: '#374151', gradient: 'linear-gradient(135deg, #111827, #6b7280)', bars: ['#1f2937','#374151','#4b5563','#6b7280','#9ca3af','#111827','#334155','#475569','#64748b','#94a3b8'], areaFill: 'rgba(75,85,99,0.3)', badgeBg: '#f3f4f6', badgeText: '#374151', ftBg: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)', ftBorder: '#d1d5db', ftText: '#374151', btn: '#374151', accent: '#9ca3af' },
  { name: 'Purple', dark: '#0d0520', glow: 'rgba(124,58,237,0.25)', main: '#7c3aed', ring: '#6d28d9', gradient: 'linear-gradient(135deg, #2e1065, #a78bfa)', bars: ['#3b0764','#5b21b6','#7c3aed','#8b5cf6','#a78bfa','#6d28d9','#4c1d95','#6366f1','#818cf8','#c4b5fd'], areaFill: 'rgba(124,58,237,0.25)', badgeBg: '#ede9fe', badgeText: '#5b21b6', ftBg: 'linear-gradient(135deg, #ede9fe, #ddd6fe)', ftBorder: '#c4b5fd', ftText: '#5b21b6', btn: '#6d28d9', accent: '#c4b5fd' },
];

const COLOR_CIRCLES = [
  { from: '#064e3b', to: '#10b981', ring: '#0F6E56' },
  { from: '#7f1d1d', to: '#ef4444', ring: '#b91c1c' },
  { from: '#0c2d57', to: '#3b82f6', ring: '#185FA5' },
  { from: '#78350f', to: '#f59e0b', ring: '#BA7517' },
  { from: '#111827', to: '#6b7280', ring: '#374151' },
  { from: '#2e1065', to: '#a78bfa', ring: '#6d28d9' },
];

type HeaderStyle = 'magazine' | 'achievement' | 'contrast';
type ChartType = 'bar' | 'area' | 'line' | 'hbar' | 'step';

const fmt = (n: number) => n.toLocaleString('id-ID');
const getInitials = (name: string) => name.split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();

// ── Inline SVG Icons for poster (no Lucide for export compatibility) ──
const WaSvg = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="#22c55e"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
);
const GlobeSvg = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20"/><path d="M2 12h20"/></svg>
);


// ── Poster Chart (Recharts SVG) ──
function PosterChart({ items, theme, chartType }: { items: HajiPlusItem[]; theme: ColorTheme; chartType: ChartType }) {
  const t = theme;
  const yFmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : String(v);

  if (chartType === 'hbar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="year" tick={{ fontSize: 8, fill: '#6b7280' }} width={36} axisLine={false} tickLine={false} interval={0} />
          <Bar dataKey="pax" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {items.map((_, i) => <Cell key={i} fill={t.bars[i % t.bars.length]} />)}
            <LabelList dataKey="pax" position="insideRight" style={{ fontSize: 7, fontWeight: 600, fill: 'white' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={items} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tick={{ fontSize: 8, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tickFormatter={yFmt} tick={{ fontSize: 7, fill: '#6b7280' }} axisLine={false} tickLine={false} width={28} />
          <Area type="monotone" dataKey="pax" stroke={t.main} fill={t.areaFill} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={items} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tick={{ fontSize: 8, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tickFormatter={yFmt} tick={{ fontSize: 7, fill: '#6b7280' }} axisLine={false} tickLine={false} width={28} />
          <Line type="monotone" dataKey="pax" stroke={t.main} strokeWidth={2} dot={(props: any) => {
            const { cx, cy, index } = props;
            return <circle key={index} cx={cx} cy={cy} r={4} fill={t.bars[index % t.bars.length]} stroke="white" strokeWidth={1.5} />;
          }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'step') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={items} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="year" tick={{ fontSize: 8, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} />
          <YAxis tickFormatter={yFmt} tick={{ fontSize: 7, fill: '#6b7280' }} axisLine={false} tickLine={false} width={28} />
          <Area type="stepAfter" dataKey="pax" stroke={t.main} fill={t.areaFill} strokeWidth={2} dot={{ r: 3, fill: t.main, stroke: 'white', strokeWidth: 1.5 }} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={items} margin={{ top: 4, right: 4, bottom: 0, left: -6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 8, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} />
        <YAxis tickFormatter={yFmt} tick={{ fontSize: 7, fill: '#6b7280' }} axisLine={false} tickLine={false} width={28} />
        <Bar dataKey="pax" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {items.map((_, i) => <Cell key={i} fill={t.bars[i % t.bars.length]} />)}
          <LabelList dataKey="pax" position="inside" style={{ fontSize: 7, fontWeight: 600, fill: 'white' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}


// ── Poster Design ──
function PosterDesign({ data, theme, headerStyle, chartType, agent, showAgent, showTitle, contactType }: {
  data: HajiPlusData; theme: ColorTheme; headerStyle: HeaderStyle; chartType: ChartType;
  agent: { slug: string; name: string; phone: string; email?: string; photo: string; website: string; };
  showAgent: boolean; showTitle: boolean; contactType: 'wa' | 'email' | 'website';
}) {
  const t = theme;
  const items = data.items;
  const currentYear = new Date().getFullYear();
  const yearRange = items.length > 0 ? `${items[0].year}–${items[items.length - 1].year}` : '';
  const now = new Date();
  const BULAN = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const dateStr = `${BULAN[now.getMonth() + 1]} ${now.getFullYear()}`;


  return (
    <div style={{
      width: '100%', aspectRatio: '4 / 5', fontFamily: "'Inter','Segoe UI',sans-serif",
      background: t.dark, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* BG ornaments — behind content */}
      <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 500, height: 300, background: `radial-gradient(ellipse, ${t.glow} 0%, transparent 70%)` }} />
      {/* Top-left glow — brightens logo area */}
      <div style={{ position: 'absolute', top: -40, left: -40, width: 220, height: 220, background: 'radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 70%)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', top: -80, right: -60, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
      <div style={{ position: 'absolute', bottom: 80, left: -60, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.025)' }} />
      <div style={{ position: 'absolute', bottom: -20, right: 40, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.02)' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
      <svg style={{ position: 'absolute', right: 10, bottom: 100, opacity: 0.025 }} width="160" height="160" viewBox="0 0 200 200">
        <polygon points="100,5 195,100 100,195 5,100" fill="none" stroke="white" strokeWidth="1.2"/>
        <polygon points="100,35 165,100 100,165 35,100" fill="none" stroke="white" strokeWidth="0.8"/>
      </svg>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 16px 10px' }}>

        {/* Logo bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          {/* Left: Logo + brand */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo-alhijaz.webp" style={{ height: 28, width: 'auto', objectFit: 'contain' }} crossOrigin="anonymous" />
          </div>
          {/* Right: Agent info */}
          {showAgent && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'white' }}>{agent.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 }}>
                  {contactType === 'wa' && agent.phone && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{agent.phone.startsWith('62') ? '0' + agent.phone.slice(2) : agent.phone}</span>
                  )}
                  {contactType === 'email' && agent.email && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{agent.email}</span>
                  )}
                  {contactType === 'website' && agent.website && (
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{agent.website}</span>
                  )}
                </div>
              </div>
              {agent.photo ? (
                <img src={agent.photo} crossOrigin="anonymous" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${t.accent}40`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: `1.5px solid ${t.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: t.accent, flexShrink: 0 }}>
                  {getInitials(agent.name)}
                </div>
              )}
            </div>
          )}
        </div>


        {/* Title — consistent across all header styles */}
        {showTitle && (
          <div style={{ fontSize: 18, fontWeight: 600, color: 'white', letterSpacing: -0.3, lineHeight: 1, marginBottom: 12, whiteSpace: 'nowrap' }}>Jamaah Haji Plus</div>
        )}

        {/* Header variant */}
        {headerStyle === 'magazine' && (
          <div style={{ marginBottom: 10 }}>
            {/* Full-width stat strip: Total | Tahun ini | Rekor */}
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ display: 'flex' }}>
                <div style={{ flex: 1, padding: '12px', textAlign: 'center', borderRight: '0.5px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 22, fontWeight: 500, color: 'white' }}>{fmt(data.total)}</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Total</div>
                </div>
                <div style={{ flex: 1, padding: '12px', textAlign: 'center', borderRight: '0.5px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 22, fontWeight: 500, color: t.accent }}>{data.current ? fmt(data.current.pax) : '—'}</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Tahun ini</div>
                </div>
                <div style={{ flex: 1, padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>{fmt(data.peak.pax)}</div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Rekor {data.peak.year}</div>
                </div>
              </div>
            </div>
          </div>
        )}


        {headerStyle === 'achievement' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.05))', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '6px 8px' }}>
              <div style={{ fontSize: 7, color: '#fbbf24', fontWeight: 600, marginBottom: 2 }}>🏆 TOTAL</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{fmt(data.total)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 8px' }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 2 }}>🚩 REKOR</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{fmt(data.peak.pax)} <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>({data.peak.year})</span></div>
            </div>
            {data.current && (
              <div style={{ background: `${t.main}18`, border: `1px solid ${t.main}35`, borderRadius: 8, padding: '6px 8px' }}>
                <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 2 }}>📅 TAHUN INI</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{fmt(data.current.pax)}</div>
              </div>
            )}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 8px' }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 2 }}>📊 DATA</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{data.yearCount} <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>tahun</span></div>
            </div>
          </div>
        )}

        {headerStyle === 'contrast' && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 2 }}>TERENDAH</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>{fmt(data.min.pax)}</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>{data.min.year}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${t.main}30`, border: `1px solid ${t.main}60`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontSize: 12 }}>→</span>
                </div>
                <span style={{ fontSize: 8, color: t.main, fontWeight: 700, marginTop: 2 }}>+{Math.round(((data.peak.pax - data.min.pax) / data.min.pax) * 100)}%</span>
              </div>
              <div style={{ flex: 1, background: `${t.main}18`, border: `1px solid ${t.main}35`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginBottom: 2 }}>TERTINGGI</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{fmt(data.peak.pax)}</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>{data.peak.year}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ l: 'Total', v: fmt(data.total) }, ...(data.current ? [{ l: String(currentYear), v: fmt(data.current.pax) }] : []), { l: 'Avg', v: fmt(data.average) }].map((s, i) => (
                <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>{s.v}</div>
                  <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.35)' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chart Card */}
        <div style={{ flex: 1, minHeight: 0, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '8px 10px 4px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: t.main }}>Keberangkatan per tahun</span>
            <span style={{ fontSize: 7, color: '#9ca3af', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>pax</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PosterChart items={items} theme={t} chartType={chartType} />
          </div>
        </div>

        {/* Bottom micro text */}
        <div style={{ marginTop: 10, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 }}>
          alhijaz.co/{agent?.slug || ''}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
// Export Page (Fullscreen)
// ═══════════════════════════════════════
export default function HajiPlusExportPage({ agent }: {
  agent: { slug: string; name: string; phone: string; email?: string; photo: string; website: string; };
}) {
  const [data, setData] = useState<HajiPlusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [headerStyle, setHeaderStyle] = useState<HeaderStyle>('magazine');
  const [colorIdx, setColorIdx] = useState(0); // Emerald default
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [exporting, setExporting] = useState(false);
  const [showAgent, setShowAgent] = useState(true);
  const [showTitle, setShowTitle] = useState(true);
  const [contactType, setContactType] = useState<'wa' | 'email' | 'website'>('website');
  const posterRef = useRef<HTMLDivElement>(null);

  const theme = COLOR_THEMES[colorIdx];

  // Fetch data
  useEffect(() => {
    setLoading(true);
    fetch('/api/haji-plus/data', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    const el = posterRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      const { domToPng } = await import('modern-screenshot');
      // Minimum 1 second spinner
      const [dataUrl] = await Promise.all([
        domToPng(el, { scale: 3, quality: 1 }),
        new Promise(res => setTimeout(res, 1000)),
      ]);
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const fileName = `haji-plus-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Native share (files ONLY — no text/title/url to avoid double-image)
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      trackEvent('action', 'export_haji_infographic', { year: data?.current?.year?.toString() || '' });
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const HEADER_LABELS = ['Magazine', 'Achievement', 'Contrast'];
  const HEADER_KEYS: HeaderStyle[] = ['magazine', 'achievement', 'contrast'];
  const CHART_LABELS = ['Bar', 'Area', 'Line', 'H-Bar', 'Step'];
  const CHART_KEYS: ChartType[] = ['bar', 'area', 'line', 'hbar', 'step'];

  // Loading state
  if (loading) {
    return (
      <div className="px-4 pt-4 pb-8 space-y-4">
        <div className="h-[80px] rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
        <div className="w-full rounded-2xl bg-gray-200 dark:bg-slate-700 animate-pulse" style={{ aspectRatio: '4/5' }} />
        <div className="h-[48px] rounded-xl bg-gray-200 dark:bg-slate-700 animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 pt-6 pb-8 text-center">
        <p className="text-sm text-gray-500 dark:text-slate-400">Data tidak tersedia.</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">

      {/* ── Compact Selectors Card ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm p-4 space-y-3">

        {/* Row 1: HEADER */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider w-[46px] flex-shrink-0">
            Header
          </span>
          <div className="flex gap-1.5 flex-1">
            {HEADER_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => setHeaderStyle(HEADER_KEYS[i])}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center transition-all ${
                  headerStyle === HEADER_KEYS[i]
                    ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-800'
                    : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: WARNA */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider w-[46px] flex-shrink-0">
            Warna
          </span>
          <div className="flex gap-1.5 flex-1">
            {COLOR_CIRCLES.map((c, i) => (
              <button
                key={i}
                onClick={() => setColorIdx(i)}
                className="w-[26px] h-[26px] rounded-full flex-shrink-0 transition-all"
                style={{
                  background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                  border: colorIdx === i ? `2px solid ${c.ring}` : '2px solid transparent',
                  boxShadow: colorIdx === i ? `0 0 0 2px white, 0 0 0 4px ${c.ring}` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Row 3: CHART */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider w-[46px] flex-shrink-0">
            Chart
          </span>
          <div className="flex gap-1.5 flex-1">
            {CHART_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => setChartType(CHART_KEYS[i])}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center transition-all ${
                  chartType === CHART_KEYS[i]
                    ? 'bg-gray-800 dark:bg-white text-white dark:text-gray-800'
                    : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ---- DIVIDER ---- */}
        <div className="-mx-4 border-t border-gray-100 dark:border-slate-700/50" />

        {/* Row 4: JUDUL */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider w-[46px] flex-shrink-0">
            Judul
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setShowTitle(!showTitle)}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
              showTitle ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              showTitle ? 'translate-x-[16px]' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {/* Row 5: AGENT */}
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider w-[46px] flex-shrink-0">
            Agent
          </span>
          <div className="flex-1">
            {showAgent && (
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value as 'wa' | 'email' | 'website')}
                className="h-6 text-[10px] font-bold text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 pr-5 outline-none appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%239CA3AF' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 5px center',
                }}
              >
                <option value="wa">WhatsApp</option>
                <option value="email">Email</option>
                <option value="website">Website</option>
              </select>
            )}
          </div>
          <button
            onClick={() => setShowAgent(!showAgent)}
            className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
              showAgent ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
              showAgent ? 'translate-x-[16px]' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
      </div>

      {/* ── Poster Preview ── */}
      <div
        id="export-poster"
        ref={posterRef}
        className="w-full overflow-hidden"
      >
        <PosterDesign data={data} theme={theme} headerStyle={headerStyle} chartType={chartType} agent={agent} showAgent={showAgent} showTitle={showTitle} contactType={contactType} />
      </div>

      {/* ── Export Button ── */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all duration-200 active:scale-95 disabled:opacity-70"
      >
        {exporting ? (
          <><Loader2 size={16} className="animate-spin" /> Menyimpan...</>
        ) : (
          <><Download size={16} /> Simpan Gambar</>
        )}
      </button>
    </div>
  );
}
