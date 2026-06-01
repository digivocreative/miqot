interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  'aria-label'?: string;
}

/** Small pill switch (emerald when on) used across the admin editors + list. */
export default function Toggle({ checked, onChange, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}
