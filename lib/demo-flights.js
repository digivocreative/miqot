// Penerbangan dummy untuk demo Alhijaz.co di akun nikita (mode khusus
// 17–21 Okt 2026, lib/nikita-focus-mode.js). Menggantikan penerbangan asli di
// /api/flights/status selama mode aktif.
//
// Jadwalnya tetap per hari (bukan relatif ke jam permintaan) supaya kartu tak
// melompat saat kartu menyegarkan diri; jamnya dipilih untuk demo 09:00–15:00
// WIB: satu Terbang (LIVE) sepanjang jendela itu, satu sudah Mendarat, dua
// Terjadwal. Status tetap dihitung dari jam sekarang, jadi di luar jendela demo
// kartunya tetap masuk akal.
//
// Nomor penerbangan sengaja yang tak dipakai rombongan Alhijaz (cek
// calendar_events Jun 2026–Mar 2027) agar halaman share tak menempel ke data
// pelacak asli. Nama jamaah karangan, tour leader pilihan user; nomor WA jamaah = nomor
// agent sendiri, supaya tombol Chat tak pernah menghubungi orang sungguhan.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WIB = 7;

const AIRPORTS = {
  CGK: { city: 'Jakarta', tz: 7 },
  JED: { city: 'Jeddah', tz: 3 },
  MED: { city: 'Madinah', tz: 3 },
};

// dep.day: selisih hari dari tanggal WIB hari ini; dep.time: jam lokal bandara.
const DEMO_FLIGHTS = [
  {
    flightNumber: 'SV 824', airline: 'SAUDIA', direction: 'pulang', group: '68', pax: 44,
    tourLeader: 'BAGAS PRAMUDITA', itinerary: 'saudia',
    dep: { code: 'JED', day: -1, time: '18:50', terminal: 'H' }, arr: { code: 'CGK', terminal: '3' },
    durationMin: 525,
    jamaah: [
      ['SITI AMINAH RAHAYU', 'P'], ['AHMAD SYAIFUL ANWAR', 'L'], ['NURUL HIDAYATI', 'P'],
      ['BAMBANG SETIAWAN', 'L'], ['DEWI KARTIKA SARI', 'P'],
    ],
  },
  {
    flightNumber: 'SV 825', airline: 'SAUDIA', direction: 'pergi', group: '71', pax: 45,
    tourLeader: 'NIKITA SARI', itinerary: 'saudia',
    dep: { code: 'CGK', day: 0, time: '06:30', terminal: '3' }, arr: { code: 'JED', terminal: 'H' },
    durationMin: 560,
    jamaah: [
      ['MUHAMMAD FAJAR NUGROHO', 'L'], ['RINA MARLINA', 'P'], ['HJ. SRI WAHYUNI', 'P'],
      ['AGUS SURYANTO', 'L'], ['FITRIA HANDAYANI', 'P'], ['DEDI KURNIAWAN', 'L'],
    ],
  },
  {
    flightNumber: 'GA 984', airline: 'GARUDA INDONESIA', direction: 'pergi', group: '73', pax: 42,
    tourLeader: 'NILA NOVITA SARI', itinerary: 'garuda',
    dep: { code: 'CGK', day: 0, time: '17:30', terminal: '3' }, arr: { code: 'MED', terminal: null },
    durationMin: 585,
    jamaah: [
      ['YULIANA PERMATASARI', 'P'], ['HENDRA WIJAYA', 'L'], ['LAILA FAUZIAH', 'P'], ['ARIF BUDIMAN', 'L'],
    ],
  },
  {
    flightNumber: 'SV 826', airline: 'SAUDIA', direction: 'pulang', group: '66', pax: 40,
    tourLeader: 'EVI CHANIAGO', itinerary: 'saudia',
    dep: { code: 'MED', day: 1, time: '09:30', terminal: null }, arr: { code: 'CGK', terminal: '3' },
    durationMin: 550,
    jamaah: [['ENDANG SULASTRI', 'P'], ['WAHYU PRATAMA', 'L'], ['MAYA ANGGRAINI', 'P']],
  },
];

function wibDateStr(ms) {
  return new Date(ms + WIB * HOUR_MS).toISOString().slice(0, 10);
}

function localParts(ms, tz) {
  const iso = new Date(ms + tz * HOUR_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

function addMinutesHHmm(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * @param {object} opts
 * @param {number} [opts.nowMs]
 * @param {{saudia?: object|null, garuda?: object|null}} [opts.itineraries]
 *   Masing-masing { jadwalId, itineraryUrl, itineraryTitle } dari paket asli.
 * @param {string|null} [opts.waNumber] Nomor WA agent untuk semua jamaah dummy.
 */
export function buildNikitaDemoFlights({ nowMs = Date.now(), itineraries = {}, waNumber = null } = {}) {
  const todayStart = Date.parse(`${wibDateStr(nowMs)}T00:00:00Z`);

  return DEMO_FLIGHTS.map((spec) => {
    const depAirport = AIRPORTS[spec.dep.code];
    const arrAirport = AIRPORTS[spec.arr.code];
    const depDateLocal = new Date(todayStart + spec.dep.day * DAY_MS).toISOString().slice(0, 10);
    const depUTC = Date.parse(`${depDateLocal}T${spec.dep.time}:00Z`) - depAirport.tz * HOUR_MS;
    const arrUTC = depUTC + spec.durationMin * 60 * 1000;
    const arrLocal = localParts(arrUTC, arrAirport.tz);
    const flightIata = spec.flightNumber.replace(/\s+/g, '');

    let status = 'scheduled';
    let progress = 0;
    if (nowMs >= arrUTC) {
      status = 'landed';
      progress = 100;
    } else if (nowMs >= depUTC) {
      status = 'en-route';
      progress = Math.min(99, Math.max(1, Math.round(((nowMs - depUTC) / (arrUTC - depUTC)) * 100)));
    }
    const departed = status !== 'scheduled';
    const enRoute = status === 'en-route';
    const itinerary = itineraries?.[spec.itinerary] || null;

    return {
      id: `${depDateLocal}_${flightIata}_g${spec.group}`,
      flightNumber: spec.flightNumber,
      airline: spec.airline,
      airlineLogo: null,
      group: spec.group,
      status,
      depCity: depAirport.city,
      depCode: spec.dep.code,
      depTerminal: spec.dep.terminal,
      depGate: null,
      depScheduled: spec.dep.time,
      // Lepas landas 4 menit dari jadwal: detail kecil yang membuat kartu terasa nyata.
      depActual: departed ? addMinutesHHmm(spec.dep.time, 4) : null,
      depDate: `${depDateLocal}T00:00:00`,
      arrCity: arrAirport.city,
      arrCode: spec.arr.code,
      arrTerminal: spec.arr.terminal,
      arrGate: null,
      arrScheduled: arrLocal.time,
      arrEstimated: departed ? arrLocal.time : null,
      arrDate: `${arrLocal.date}T00:00:00`,
      pax: spec.pax,
      tourLeader: spec.tourLeader,
      lat: null,
      lng: null,
      alt: enRoute ? 11280 : null,
      speed: enRoute ? 872 : null,
      direction: spec.direction,
      progress,
      depTs: Math.floor(depUTC / 1000),
      arrTs: Math.floor(arrUTC / 1000),
      delayed: 0,
      aircraftType: spec.airline === 'SAUDIA' ? 'Boeing 777-300ER' : 'Airbus A330-300',
      aircraftReg: null,
      duration: spec.durationMin,
      depDelayed: 0,
      arrDelayed: 0,
      arrBaggage: status === 'landed' && spec.arr.code === 'CGK' ? '7' : null,
      isLive: enRoute,
      trackingSource: 'airlabs',
      eventDate: depDateLocal,
      jadwalId: itinerary?.jadwalId || null,
      itineraryUrl: itinerary?.itineraryUrl || null,
      itineraryTitle: itinerary?.itineraryTitle || null,
      jamaah: spec.jamaah.map(([nama, jk]) => ({ nama, jk, wa: waNumber || null })),
      routeLabel: null,
      departureTimestamp: depUTC,
    };
  });
}
