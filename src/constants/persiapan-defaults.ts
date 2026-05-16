// MVP: items hard-coded sama untuk semua paket.
// Future: bisa di-override per paket di umroh_schedules.

export interface PersiapanItem {
  id: string;
  title: string;
  description: string;
  phase?: 'sekarang' | 'h30' | 'h7' | 'h1';
  category?: 'niat_doa' | 'ilmu_manasik' | 'persiapan_hati';
  autoSyncFrom?: 'bayar_lunas' | 'vaksin_dokumen' | 'paspor_dokumen';
  crossLink?: 'bayar' | 'perlengkapan' | 'dokumen';
  resourceUrl?: string;
}

export const TAHAPAN_DEFAULTS: PersiapanItem[] = [
  { id: 'dp_dibayar', title: 'DP keluarga dibayar', description: 'Pembayaran awal sudah masuk', phase: 'sekarang', autoSyncFrom: 'bayar_lunas' },
  { id: 'vaksin_meningitis', title: 'Vaksin Meningitis', description: 'Sertifikat ICV untuk semua jamaah', phase: 'sekarang', autoSyncFrom: 'vaksin_dokumen' },
  { id: 'pelunasan', title: 'Pelunasan sisa pembayaran', description: 'Sisa pembayaran sebelum H-30', phase: 'sekarang', autoSyncFrom: 'bayar_lunas', crossLink: 'bayar' },
  { id: 'fisik_sehat', title: 'Persiapan fisik & kesehatan', description: 'Jalan kaki rutin, jaga pola makan, cek tensi', phase: 'sekarang' },
  { id: 'manasik_hadir', title: 'Hadir Manasik Bersama', description: 'Sesuai jadwal dari agent', phase: 'h30' },
  { id: 'perlengkapan_ambil', title: 'Ambil perlengkapan dari kantor', description: 'Ihram, buku doa, ID card, dll', phase: 'h30', crossLink: 'perlengkapan' },
  { id: 'paspor_final', title: 'Pastikan paspor & dokumen final', description: 'Cek paspor expired & kelengkapan', phase: 'h30', crossLink: 'dokumen' },
  { id: 'packing_koper', title: 'Packing koper', description: 'Bawa list barang dari agent', phase: 'h7' },
  { id: 'cek_ulang', title: 'Cek ulang koper & dokumen', description: 'Pastikan paspor, ihram, obat-obatan', phase: 'h7' },
  { id: 'urus_rumah', title: 'Selesaikan urusan di rumah', description: 'Titip rumah, pet, kerjaan', phase: 'h7' },
  { id: 'konfirmasi_agent', title: 'Konfirmasi ulang ke agent', description: 'Jam kumpul di bandara', phase: 'h1' },
  { id: 'niat_azam', title: 'Persiapan mental: niat & azam', description: 'Mantapkan niat ibadah', phase: 'h1' },
  { id: 'tidur_cukup', title: 'Tidur cukup', description: 'Berangkat dalam kondisi prima', phase: 'h1' },
];

export const SPIRITUAL_DEFAULTS: PersiapanItem[] = [
  { id: 'hafal_niat_umroh', title: 'Hafal niat umroh', description: "Labbaika 'umratan", category: 'niat_doa', resourceUrl: 'https://www.youtube.com/results?search_query=niat+umroh' },
  { id: 'hafal_doa_tawaf', title: 'Hafal doa tawaf', description: 'Doa per putaran (7 putaran)', category: 'niat_doa', resourceUrl: 'https://www.youtube.com/results?search_query=doa+tawaf' },
  { id: 'hafal_doa_sai', title: "Hafal doa sa'i", description: 'Doa di Shafa & Marwah', category: 'niat_doa', resourceUrl: 'https://www.youtube.com/results?search_query=doa+sai' },
  { id: 'hafal_talbiyah', title: 'Hafal talbiyah', description: 'Labbaikallahumma labbaik...', category: 'niat_doa', resourceUrl: 'https://www.youtube.com/results?search_query=talbiyah' },
  { id: 'rukun_umroh', title: 'Rukun umroh', description: '5 rukun yang wajib dilakukan', category: 'ilmu_manasik' },
  { id: 'wajib_umroh', title: 'Wajib umroh', description: 'Wajib yang jika ditinggalkan kena dam', category: 'ilmu_manasik' },
  { id: 'larangan_ihram', title: 'Larangan ihram', description: 'Hal-hal yang tidak boleh saat ihram', category: 'ilmu_manasik' },
  { id: 'tobat_istighfar', title: 'Tobat & istighfar', description: 'Bersihkan hati sebelum berangkat', category: 'persiapan_hati' },
  { id: 'mohon_maaf', title: 'Mohon maaf ke keluarga', description: 'Silaturahmi sebelum berangkat', category: 'persiapan_hati' },
  { id: 'mantap_niat', title: 'Memantapkan niat', description: 'Ibadah karena Allah, bukan riya', category: 'persiapan_hati' },
];

export const PERLENGKAPAN_DEFAULTS = [
  { id: 'koper_besar', title: 'Koper besar', icon: 'briefcase', handover: 'dp' },
  { id: 'tas_kabin', title: 'Tas kabin', icon: 'backpack', handover: 'dp' },
  { id: 'tas_paspor', title: 'Tas paspor', icon: 'wallet', handover: 'dp' },
  { id: 'ihram', title: 'Ihram', icon: 'shirt', handover: 'manasik' },
  { id: 'buku_doa', title: 'Buku doa & manasik', icon: 'book', handover: 'manasik' },
  { id: 'id_card', title: 'ID card jamaah', icon: 'id-card', handover: 'manasik' },
  { id: 'sabuk_ihram', title: 'Sabuk pinggang ihram', icon: 'belt', handover: 'manasik' },
];
