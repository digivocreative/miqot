// Salinan /me yang disimpan untuk portal offline hidup di localStorage perangkat — sering
// HP keluarga yang dipakai bergantian. Nomor paspor tidak disimpan utuh: cukup 4 karakter
// terakhir untuk dikenali. Kehadirannya tetap dipakai checklist dokumen, jadi dimasking,
// bukan dihapus. Tampilan online tetap memakai data utuh dari server.

interface SnapshotJamaah {
  no_paspor?: string | null;
}

interface SnapshotShape {
  jamaah?: SnapshotJamaah[];
}

function maskPassport(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  return `••••${trimmed.slice(-4)}`;
}

export function maskSnapshotForStorage<T extends SnapshotShape>(data: T): T {
  if (!Array.isArray(data.jamaah)) return data;
  return {
    ...data,
    jamaah: data.jamaah.map((jamaah) => ({ ...jamaah, no_paspor: maskPassport(jamaah.no_paspor) })),
  };
}
