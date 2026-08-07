import type { Sebutan } from './sebutan';

/** Cukup bidang yang dipakai perakit pesan — sengaja tidak mengimpor tipe
 *  `Birthday` dari komponen supaya modul ini bebas dari React dan bisa diuji
 *  langsung dari node:test. */
export interface BirthdayMessageInput {
  nama: string;
  age: number;
  day_offset: number;
}

export function getFirstName(nama: string): string {
  const first = (nama || '').trim().split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function getBirthdayMessage(
  jamaah: BirthdayMessageInput,
  agentName: string,
  sebutan: Sebutan,
): string {
  const jamaahFirst = getFirstName(jamaah.nama);
  const agentFirst = getFirstName(agentName) || 'Saya';

  const upcomingWord = jamaah.day_offset === 1
    ? 'besok'
    : `${jamaah.day_offset} hari lagi`;

  const doa = `Allah panjangkan umur ${sebutan} ${jamaahFirst} dengan keberkahan, dilimpahkan kesehatan, dilapangkan rezekinya, dan dimudahkan langkah menuju Baitullah`;

  const body = jamaah.day_offset === 0
    ? `*Barakallahu fii umrik, ${sebutan} ${jamaahFirst}!*\n\nDi hari yang penuh berkah ini, ${agentFirst} ikut mendoakan — semoga di usia ke-${jamaah.age} ini, ${doa}.\n\n_Aamiin Yaa Rabbal 'Alamiin_`
    : `*${sebutan} ${jamaahFirst}*, _${upcomingWord}_ ulang tahun ya.\n\nSebelum harinya, ${agentFirst} ingin doakan dulu — semoga di usia ke-${jamaah.age} nanti, ${doa}.\n\n_Aamiin Yaa Rabbal 'Alamiin_`;

  return `Assalamu'alaikum\n\n${body}\n\n— *${agentName}*\n_Alhijaz Indowisata_`;
}
