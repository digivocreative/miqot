import { CheckCircle2 } from 'lucide-react';

interface Props {
  title: string;
  message: string;
}

export default function MagicLinkSuccessCard({ title, message }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-300">
        <CheckCircle2 size={28} strokeWidth={2} />
      </div>
      <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
      <p className="mt-2 break-words text-sm leading-6 text-gray-600 dark:text-slate-300">{message}</p>
    </section>
  );
}
