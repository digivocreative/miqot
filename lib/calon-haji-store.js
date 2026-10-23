// Penyimpanan daftar Calon Haji (tabel di migrations/20261022000000_calon_haji.sql).
//
// Penggantian atomik tanpa transaksi: baris baru ditulis di bawah import_id
// baru, lalu SATU upsert memindahkan penunjuk calon_haji_aktif. Selama baris
// baru masih ditulis, agent tetap membaca impor lama. Gagal di tengah → impor
// baru dihapus (cascade), penunjuk tak tersentuh.

export const CALON_HAJI_COLUMNS = 'no_urut,tahap,no_porsi,nik,nama,keterangan,status_cadangan,kepesertaan_jkn,status_jemaah,usia,kab_kota,provinsi';
const INSERT_BATCH = 500;
// Supabase memotong SELECT di 1.000 baris secara diam-diam → wajib paging.
const PAGE = 1000;
const PERSONAL_COLUMNS = 'id_haji,id_jamaah,nomor_porsi,nomor_spph,telp,staff,paket,paket_detail,paket_harga,bayar,sisa,tgl_daftar,no_paspor,bpih_url,surat_pernyataan_url';

function check({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function activeImportId(sb, musim) {
  const data = check(
    await sb.from('calon_haji_aktif').select('import_id').eq('musim', musim).maybeSingle(),
    'baca impor aktif',
  );
  return data?.import_id ?? null;
}

export async function replaceCalonHaji(sb, { musim, header, rows, sumber }) {
  const imp = check(
    await sb.from('calon_haji_imports')
      .insert({ musim, tanggal_data: header.tanggalData, jumlah: header.jumlah, sumber })
      .select('id')
      .single(),
    'buat impor',
  );
  const importId = imp.id;

  try {
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, import_id: importId }));
      check(await sb.from('calon_haji').insert(batch), `tulis baris ${i + 1}–${i + batch.length}`);
    }
  } catch (err) {
    await sb.from('calon_haji_imports').delete().eq('id', importId);
    throw err;
  }

  const replacedImportId = await activeImportId(sb, musim);
  check(
    await sb.from('calon_haji_aktif').upsert({ musim, import_id: importId, updated_at: new Date().toISOString() }),
    'pindah penunjuk impor aktif',
  );
  if (replacedImportId) {
    check(await sb.from('calon_haji_imports').delete().eq('id', replacedImportId), 'hapus impor lama');
  }
  return { importId, replacedImportId };
}

// Impor baru bisa memindahkan penunjuk lalu menghapus impor lama di sela
// halaman → halaman berikutnya kosong. Cocokkan dengan jumlah tercatat dan
// ulangi sekali; tetap tak cocok → galat, bukan daftar terpotong diam-diam.
export async function loadCalonHaji(sb, musim) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const importId = await activeImportId(sb, musim);
    if (!importId) return { rows: [] };
    const imp = check(
      await sb.from('calon_haji_imports').select('jumlah').eq('id', importId).maybeSingle(),
      'baca impor',
    );
    const rows = await loadImportRows(sb, importId);
    if (imp && rows.length === imp.jumlah) return { rows };
  }
  throw new Error('baca calon haji: data tidak lengkap (impor sedang berjalan?)');
}

function normalizePorsi(value) {
  const digits = String(value ?? '').replace(/[\s.-]/g, '');
  return /^\d+$/.test(digits) ? digits : null;
}

export async function loadAgentCalonHaji(sb, musim, agentId) {
  if (!agentId) throw new Error('Akun agent diperlukan');
  const porsi = new Map();
  for (let from = 0; ; from += PAGE) {
    const page = check(
      await sb.from('jamaah_haji').select(PERSONAL_COLUMNS)
        .eq('agent_id', agentId).order('id_haji').order('id_jamaah').range(from, from + PAGE - 1),
      'baca nomor porsi jamaah agent',
    ) ?? [];
    for (const row of page) {
      const key = normalizePorsi(row.nomor_porsi);
      if (key) porsi.set(key, [...(porsi.get(key) || []), row]);
    }
    if (page.length < PAGE) break;
  }
  if (!porsi.size) return { rows: [] };
  const { rows } = await loadCalonHaji(sb, musim);
  return {
    rows: rows.filter((row) => porsi.has(normalizePorsi(row.no_porsi)))
      .map((row) => ({ ...row, haji: porsi.get(normalizePorsi(row.no_porsi)) })),
  };
}

async function loadImportRows(sb, importId) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = check(
      await sb.from('calon_haji').select(CALON_HAJI_COLUMNS).eq('import_id', importId)
        .order('no_urut').range(from, from + PAGE - 1),
      'baca calon haji',
    ) ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}
