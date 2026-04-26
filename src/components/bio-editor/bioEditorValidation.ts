import type { BioTile } from '../bio/types';

export interface BioTileValidation {
  complete: boolean;
  issues: string[];
}

function isHttpsUrl(value: unknown): boolean {
  return typeof value === 'string' && /^https:\/\//i.test(value.trim());
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateBioTile(tile: BioTile, agentPhone?: string): BioTileValidation {
  const c = tile.config || {};
  const issues: string[] = [];

  switch (tile.type) {
    case 'umroh':
    case 'umroh_landing':
    case 'haji':
      break;
    case 'wa':
      if (!nonEmpty(agentPhone)) issues.push('Nomor HP belum diisi');
      break;
    case 'featured':
      if (!nonEmpty(c.jadwal_id)) issues.push('Pilih paket');
      break;
    case 'link':
      if (!nonEmpty(c.title)) issues.push('Judul wajib diisi');
      if (!isHttpsUrl(c.url)) issues.push('URL harus https://');
      break;
    case 'text':
      if (!nonEmpty(c.content)) issues.push('Teks wajib diisi');
      break;
    case 'photo':
      if (!isHttpsUrl(c.image_url)) issues.push('Foto wajib diunggah');
      break;
    case 'testi':
      if (!nonEmpty(c.quote)) issues.push('Kutipan wajib diisi');
      if (!nonEmpty(c.author_name)) issues.push('Nama jamaah wajib diisi');
      break;
  }

  if (tile.orphaned) issues.push('Paket tidak tersedia');

  return { complete: issues.length === 0, issues };
}

export function canShowBioTile(tile: BioTile, agentPhone?: string): boolean {
  return validateBioTile(tile, agentPhone).complete;
}
