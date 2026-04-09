import { useRef, useEffect } from 'react';

interface PinInputProps {
  value: string;
  onChange: (val: string) => void;
  autoFocus?: boolean;
  error?: boolean;
}

export default function PinInput({ value, onChange, autoFocus, error }: PinInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [autoFocus]);

  const getBoxClass = (i: number) => {
    const base = 'w-10 h-11 rounded-xl flex items-center justify-center text-base font-bold transition-all select-none outline-none';

    if (error && value[i]) {
      return `${base} border-[1.5px] border-red-500 bg-red-50/50 dark:bg-red-900/10 text-gray-800 dark:text-white`;
    }
    if (value[i]) {
      return `${base} border-[1.5px] border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10 text-gray-800 dark:text-white`;
    }
    if (i === value.length) {
      return `${base} border-[1.5px] border-emerald-500 ring-2 ring-emerald-500/[0.08] bg-white dark:bg-transparent text-gray-800 dark:text-white`;
    }
    return `${base} border border-gray-200 dark:border-slate-700 bg-white dark:bg-transparent text-gray-800 dark:text-white`;
  };

  return (
    <div
      className="relative flex gap-2.5 justify-center"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={e => {
          const v = e.target.value.replace(/\D/g, '').substring(0, 6);
          onChange(v);
        }}
        className="absolute inset-0 w-full h-full opacity-0 z-10"
      />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className={getBoxClass(i)}>
          {value[i] ? '●' : ''}
        </div>
      ))}
    </div>
  );
}
