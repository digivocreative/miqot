const fields = [
  { labelWidth: 'w-20' },
  { labelWidth: 'w-24' },
  { labelWidth: 'w-24', wide: true },
  { labelWidth: 'w-20' },
  { labelWidth: 'w-16' },
  { labelWidth: 'w-24' },
  { labelWidth: 'w-32' },
  { labelWidth: 'w-20' },
  { labelWidth: 'w-24' },
  { labelWidth: 'w-20' },
  { labelWidth: 'w-16' },
  { labelWidth: 'w-28', wide: true, tall: true },
  { labelWidth: 'w-36' },
  { labelWidth: 'w-28' },
  { labelWidth: 'w-16', wide: true },
  { labelWidth: 'w-28', wide: true },
];

export default function JamaahEditSkeleton() {
  return (
    <div
      className="px-4 pt-4 pb-8"
      role="status"
      aria-live="polite"
      aria-label="Memuat data jamaah"
    >
      <span className="sr-only">Memuat data jamaah...</span>
      <div className="space-y-3 animate-pulse" aria-hidden="true">
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-gray-50 px-4 py-2.5 dark:border-slate-700/50">
            <div className="h-3 w-24 rounded bg-gray-200 dark:bg-slate-700" />
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            {fields.map((field, index) => (
              <div
                key={index}
                className={`min-w-0 ${field.wide ? 'sm:col-span-2' : ''}`}
              >
                <div className={`mb-1.5 h-3 rounded bg-gray-200 dark:bg-slate-700 ${field.labelWidth}`} />
                <div className={`${field.tall ? 'h-[84px]' : 'h-[42px]'} w-full rounded-xl bg-gray-100 dark:bg-slate-900`} />
              </div>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="h-12 flex-1 rounded-xl bg-gray-200 dark:bg-slate-800" />
          <div className="h-12 flex-1 rounded-xl bg-gray-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );
}
