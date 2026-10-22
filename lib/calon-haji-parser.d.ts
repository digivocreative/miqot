export interface CalonHajiRow {
  no_urut: number;
  tahap: number;
  no_porsi: string;
  nik: string;
  nama: string;
  keterangan: 'URUT PORSI' | 'CADANGAN' | 'LANSIA';
  status_cadangan: 'NON CADANGAN' | 'CADANGAN';
  kepesertaan_jkn: null | 'AKTIF' | 'TERDAFTAR, BELUM AKTIF' | 'BELUM TERDAFTAR';
  status_jemaah: string;
  usia: number;
  kab_kota: string;
  provinsi: string;
}

export interface CalonHajiHeader {
  /** 'YYYY-MM-DD' */
  tanggalData: string;
  jumlah: number;
}

export function parseCalonHajiText(text: string): { header: CalonHajiHeader; rows: CalonHajiRow[] };
export function extractPdfText(buffer: Buffer): Promise<string>;
