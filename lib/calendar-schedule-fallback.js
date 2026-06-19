export function parseCalendarJadwalIds(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim().toUpperCase())
    .filter(v => /^JBU\d+$/.test(v));
}

function formatDmy(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

function parseIntSafe(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function buildPesawat(schedule, eventType) {
  const code = eventType === 'kepulangan'
    ? schedule.pulang_kode_penerbangan
    : schedule.berangkat_kode_penerbangan;
  return [schedule.maskapai, code].filter(Boolean).join(' - ') || null;
}

function buildJam(schedule, eventType) {
  if (eventType === 'kepulangan') return schedule.pulang_jam || null;
  if (eventType === 'manasik') return schedule.manasik_jam || null;
  return schedule.berangkat_jam || null;
}

function buildPaket(schedule, eventType) {
  const name = schedule.jadwal_nama || null;
  if (eventType !== 'manasik' || !name) return name;
  const departure = formatDmy(schedule.berangkat_tgl);
  return departure ? `${departure}${name}` : name;
}

export function buildScheduleFallbackDetails(event, scheduleById) {
  const ids = parseCalendarJadwalIds(event.apalah);
  if (ids.length === 0) return [];
  const eventType = event.type || event.event_type;

  const schedules = ids.map(id => scheduleById.get(id));
  if (schedules.some(s => !s)) return [];

  return schedules.map(schedule => {
    const seatTotal = parseIntSafe(schedule.seat_total);
    const seatSisa = parseIntSafe(schedule.seat_sisa);
    const paxTerisi = Math.min(seatTotal, Math.max(0, seatTotal - seatSisa));

    return {
      jadwal_id: schedule.jadwal_id,
      group_number: null,
      pesawat: buildPesawat(schedule, eventType),
      jam: buildJam(schedule, eventType),
      paket: buildPaket(schedule, eventType),
      pax: seatTotal,
      pax_terisi: paxTerisi,
      staff: '-',
      tour_leader: '-',
    };
  });
}
