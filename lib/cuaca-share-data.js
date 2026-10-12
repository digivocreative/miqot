// Logika murni banner Share Cuaca (spec 2026-10-12). Dipakai klien (pratinjau +
// caption) dan server (render). Template hanya menerima hasil fungsi di sini.
import { WEATHER_CITIES, CUACA_SHARE_CITY_META } from './weather-cities.js';
import { SEASONAL_NOTES } from './weather-seasonal-notes.js';

export const CUACA_SHARE_W = 1080;
export const CUACA_SHARE_H = 1350;

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];

// Emoji wmoMap lama (data cache sebelum forecast punya weatherCode). Kunci tanpa
// VS16 (U+FE0F) supaya "☀️" dan "☀" sama-sama cocok.
const stripVs = s => String(s || '').replace(/️/g, '').trim();
const EMOJI_ICON = new Map([
  ['☀', 'sun'], ['🌤', 'cloud-sun'], ['☁', 'cloud'], ['🌫', 'cloud-fog'],
  ['🌦', 'cloud-drizzle'], ['🌧', 'cloud-rain'], ['❄', 'snowflake'], ['⛈', 'cloud-lightning'],
]);

// Ambang sama dengan wmoMap di server.js.
export function weatherIconKey({ weatherCode, icon } = {}) {
  const code = weatherCode == null ? NaN : Number(weatherCode);
  if (Number.isFinite(code)) {
    if (code === 0) return 'sun';
    if (code <= 2) return 'cloud-sun';
    if (code === 3) return 'cloud';
    if (code <= 49) return 'cloud-fog';
    if (code <= 57) return 'cloud-drizzle';
    if (code <= 67) return 'cloud-rain';
    if (code <= 77) return 'snowflake';
    if (code <= 82) return 'cloud-rain';
    if (code <= 86) return 'snowflake';
    if (code <= 99) return 'cloud-lightning';
  }
  return EMOJI_ICON.get(stripVs(icon)) || 'thermometer';
}

export function uvLabelFull(label) {
  return label === 'Sgt Tinggi' ? 'Sangat Tinggi' : String(label || '');
}

export function formatTemp(n) {
  const v = Math.round(Number(n) || 0);
  return v < 0 ? `−${Math.abs(v)}` : String(v);
}

export function formatDeg(n) {
  return `${formatTemp(n)}°`;
}

// "27–38°" terbaca, tapi "−15–−8°" tidak: begitu ada batas negatif, pakai garis miring.
export function formatRange(min, max) {
  return Number(min) < 0 || Number(max) < 0
    ? `${formatDeg(min)} / ${formatDeg(max)}`
    : `${formatTemp(min)}–${formatDeg(max)}`;
}

export function cityLocalDate(syncedAt, tz, now = Date.now()) {
  const parsed = new Date(syncedAt);
  const at = Number.isNaN(parsed.getTime()) ? new Date(now) : parsed;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'Asia/Jakarta',
      year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    }).formatToParts(at).map(p => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const weekday = WEEKDAY_EN.indexOf(parts.weekday);
  return {
    dateKey: `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    monthIndex: month - 1,
    label: `${DAY_NAMES[weekday]}, ${day} ${MONTH_SHORT[month - 1]} ${year}`,
  };
}

export function agentInitials(name) {
  const initials = String(name || '').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return initials || 'A';
}

export function agentNameFontSize(name) {
  const len = String(name || '').trim().length;
  if (len <= 22) return 34;
  if (len <= 28) return 30;
  return 26;
}

export function tempFontSize(temp) {
  return formatDeg(temp).length <= 3 ? 230 : 190;
}

export function conditionFontSize(label) {
  return String(label || '').length <= 10 ? 60 : 50;
}

export function buildCuacaShareProps(city, agent, { syncedAt, now = Date.now() } = {}) {
  const def = WEATHER_CITIES.find(c => c.key === city.key);
  const meta = CUACA_SHARE_CITY_META[city.key] || { photo: null, trip: 'wisata' };
  const date = cityLocalDate(syncedAt, def?.tz, now);
  const name = String(agent?.name || '').trim();
  return {
    cityKey: city.key,
    cityName: city.name,
    country: city.country,
    subtitle: meta.trip === 'umroh' ? 'Update cuaca kota tujuan umroh' : 'Update cuaca kota tujuan wisata',
    photo: meta.photo,
    temp: city.temp,
    tempFontSize: tempFontSize(city.temp),
    conditionLabel: city.label,
    conditionFontSize: conditionFontSize(city.label),
    conditionIcon: weatherIconKey(city),
    feelsLike: city.feelsLike,
    tempMin: city.tempMin,
    tempMax: city.tempMax,
    humidity: city.humidity,
    windSpeed: city.windSpeed,
    uvIndex: city.uvIndex,
    uvLabel: uvLabelFull(city.uvLabel),
    forecast: (city.forecast || []).slice(0, 3).map(f => ({
      day: f.day, icon: weatherIconKey(f), tempMin: f.tempMin, tempMax: f.tempMax,
    })),
    seasonalNote: SEASONAL_NOTES[city.key]?.[date.monthIndex] || '',
    dateKey: date.dateKey,
    dateLabel: date.label,
    agent: {
      name,
      initials: agentInitials(name),
      nameFontSize: agentNameFontSize(name),
      siteLabel: `alhijaz.co/${String(agent?.slug || '').trim()}`,
    },
  };
}

export function buildCuacaCaption(props, { waNumber } = {}) {
  const lines = [
    `🌤️ Cuaca ${props.cityName} hari ini — ${props.dateLabel}`,
    `${formatDeg(props.temp)}C ${props.conditionLabel} (terasa ${formatDeg(props.feelsLike)}C) · ${formatRange(props.tempMin, props.tempMax)}C`,
  ];
  if (props.seasonalNote) lines.push(props.seasonalNote);
  lines.push('', 'Info paket Umroh & Haji:', props.agent.name);
  if (waNumber) lines.push(`wa.me/${waNumber}`);
  lines.push(props.agent.siteLabel);
  return lines.join('\n');
}

export function resolveCuacaShareCity(cityKey, cities) {
  const key = typeof cityKey === 'string' ? cityKey : '';
  if (!WEATHER_CITIES.some(c => c.key === key)) return { status: 400, error: 'Kota tidak dikenal' };
  const city = (cities || []).find(c => c?.key === key);
  if (!city) return { status: 404, error: 'Data cuaca kota ini belum tersedia' };
  return { status: 200, city };
}
