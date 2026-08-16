interface HotelPageProps {
  agent: { slug: string; name: string; role: 'admin' | 'agent' };
  onNavigate: (path: string) => void;
}

// Stub — diisi penuh di task berikutnya (kategori → daftar → detail).
export default function HotelPage(_props: HotelPageProps) {
  return (
    <div className="px-4 pt-4 pb-8">
      <p className="text-sm text-gray-400 dark:text-slate-500">Memuat direktori hotel…</p>
    </div>
  );
}
