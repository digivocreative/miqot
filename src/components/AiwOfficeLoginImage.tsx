/** Cuplikan halaman login kantor, supaya agent mengenali akun yang dimaksud. */
export default function AiwOfficeLoginImage({ className = '' }: { className?: string }) {
  return (
    <img
      src="/login-kantor-aiw.webp"
      alt="Halaman login kantor Alhijaz Indowisata"
      width={720}
      height={392}
      className={`h-auto w-full rounded-lg border border-gray-200 dark:border-slate-700 ${className}`}
    />
  );
}
