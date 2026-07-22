// Logika murni jadwal solat Portal Jamaah — tanpa DOM/jaringan. Aman diuji `node --test`
// sekaligus di-bundle ke FE (pola lib/teras-linkify.js).
// Zona Mekkah & Madinah = Asia/Riyadh (UTC+3, tanpa DST).

export const ALADHAN_METHOD = 4; // Umm al-Qura University, Makkah (metode resmi Arab Saudi)

export const PRAYER_CITIES = {
  mekkah: { id: 'mekkah', label: 'Mekkah', latitude: 21.4225, longitude: 39.8262 },
  madinah: { id: 'madinah', label: 'Madinah', latitude: 24.4672, longitude: 39.6111 },
};

export const PRAYER_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export const PRAYER_LABELS = {
  Fajr: 'Subuh',
  Dhuhr: 'Dzuhur',
  Asr: 'Ashar',
  Maghrib: 'Maghrib',
  Isha: 'Isya',
};

export const HIJRI_MONTHS_ID = [
  'Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir',
  'Jumadil Awal', 'Jumadil Akhir', 'Rajab', 'Syaban',
  'Ramadhan', 'Syawal', 'Dzulqaidah', 'Dzulhijjah',
];

export function getRiyadhNow(nowMs) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hourCycle: 'h23', // 00–23; hindari kuirk '24' saat tengah malam
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date(nowMs))) parts[p.type] = p.value;
  return {
    dateKey: `${parts.day}-${parts.month}-${parts.year}`, // DD-MM-YYYY (parameter Aladhan)
    isoDate: `${parts.year}-${parts.month}-${parts.day}`, // YYYY-MM-DD (perbandingan tanggal)
    minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function parseHHMM(value) {
  const m = String(value ?? '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHHMM(value) {
  const min = parseHHMM(value);
  if (min == null) return '--:--';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeNextPrayer(timings, nowMinutes) {
  if (!timings) return null;
  for (const name of PRAYER_ORDER) {
    const t = parseHHMM(timings[name]);
    if (t == null) continue;
    if (t > nowMinutes) {
      return { name, label: PRAYER_LABELS[name], timeLabel: formatHHMM(timings[name]), minutesUntil: t - nowMinutes, tomorrow: false };
    }
  }
  const fajr = parseHHMM(timings.Fajr);
  if (fajr == null) return null;
  return { name: 'Fajr', label: PRAYER_LABELS.Fajr, timeLabel: formatHHMM(timings.Fajr), minutesUntil: (1440 - nowMinutes) + fajr, tomorrow: true };
}

export function formatCountdown(minutesUntil) {
  if (minutesUntil == null || minutesUntil < 0) return '';
  if (minutesUntil < 1) return 'kurang dari 1 mnt';
  const h = Math.floor(minutesUntil / 60);
  const m = minutesUntil % 60;
  if (h === 0) return `${m} mnt lagi`;
  return `${h} jam ${m} mnt lagi`;
}

export function formatHijri(hijri) {
  if (!hijri) return null;
  const day = Number(hijri.day);
  const year = hijri.year;
  if (!day || !year) return null;
  const monthIdx = Number(hijri.month?.number);
  const month = HIJRI_MONTHS_ID[monthIdx - 1] || hijri.month?.en || '';
  return `${day} ${month} ${year} H`.replace(/\s+/g, ' ').trim();
}

export function buildTimingsUrl(cityId, dateKey) {
  const city = PRAYER_CITIES[cityId];
  if (!city) throw new Error(`Kota tidak dikenal: ${cityId}`);
  return `https://api.aladhan.com/v1/timings/${dateKey}?latitude=${city.latitude}&longitude=${city.longitude}&method=${ALADHAN_METHOD}`;
}
