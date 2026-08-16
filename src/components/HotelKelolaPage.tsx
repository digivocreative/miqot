interface HotelKelolaPageProps {
  agent: { slug: string; name: string };
  onNavigate: (path: string) => void;
}

// Stub — diisi penuh di task berikutnya (daftar kelola + form + hapus).
export default function HotelKelolaPage(_props: HotelKelolaPageProps) {
  return (
    <div className="px-4 pt-4 pb-8">
      <p className="text-sm text-gray-400 dark:text-slate-500">Memuat panel kelola hotel…</p>
    </div>
  );
}
