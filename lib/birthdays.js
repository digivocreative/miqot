// Shared birthday query helper — used by /api/jamaah/birthdays and the
// daily Telegram digest cron. Treats Asia/Jakarta as the source of truth
// for "today" + offsets, and matches by literal month/day (29 Feb only
// matches in leap years — see PROMPT 1 spec).

function getJakartaTargets(offsets) {
  const jakartaNowStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  const baseJakarta = new Date(jakartaNowStr);
  const currentYear = baseJakarta.getFullYear();
  const targets = offsets.map((offset) => {
    const d = new Date(baseJakarta);
    d.setDate(d.getDate() + offset);
    return {
      offset,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    };
  });
  return { targets, currentYear };
}

async function fetchAllRows(queryBuilder) {
  const PAGE_SIZE = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return allRows;
}

export async function getBirthdaysForAgent(supabase, agentId, offsets = [0, 1, 2, 3]) {
  const { targets, currentYear } = getJakartaTargets(offsets);
  const targetByKey = new Map(targets.map(t => [`${t.month}-${t.day}`, t]));

  const rows = await fetchAllRows(
    supabase
      .from('jamaah')
      .select('id_umroh, nama, jk, wa, paket, tgl_lahir, bayar, sisa, tgl_berangkat')
      .eq('agent_id', agentId)
      .not('tgl_lahir', 'is', null),
  );

  const birthdays = [];
  for (const r of rows) {
    if (!r.tgl_lahir) continue;
    const m = String(r.tgl_lahir).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const birthYear = parseInt(m[1], 10);
    const birthMonth = parseInt(m[2], 10);
    const birthDay = parseInt(m[3], 10);
    const target = targetByKey.get(`${birthMonth}-${birthDay}`);
    if (!target) continue;

    const bayar = Number(r.bayar) || 0;
    const sisa = Number(r.sisa) || 0;
    const status_bayar = bayar === 0 ? 'belum_bayar' : sisa <= 0 ? 'lunas' : 'dp';

    const mm = String(birthMonth).padStart(2, '0');
    const dd = String(birthDay).padStart(2, '0');

    birthdays.push({
      id_umroh: r.id_umroh,
      nama: r.nama,
      jk: r.jk,
      salutation: r.jk === 'P' ? 'Ibu' : 'Bapak',
      wa: r.wa,
      paket: r.paket,
      tgl_lahir: r.tgl_lahir,
      birthday_date: `${target.year}-${mm}-${dd}`,
      age: currentYear - birthYear,
      day_offset: target.offset,
      status_bayar,
      tgl_berangkat: r.tgl_berangkat,
    });
  }

  birthdays.sort((a, b) => {
    if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset;
    return String(a.nama || '').localeCompare(String(b.nama || ''));
  });

  return birthdays;
}

export async function getTodaysBirthdays(supabase, agentId) {
  return getBirthdaysForAgent(supabase, agentId, [0]);
}
