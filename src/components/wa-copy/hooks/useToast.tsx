import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface UseToast {
  toast: string | null;
  showToast: (msg: string) => void;
}

/** Transient bottom pill toast. Default auto-dismiss 1.8s (matches the copy UX). */
export function useToast(duration = 1800): UseToast {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string) => {
      setToast(msg);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), duration);
    },
    [duration],
  );

  return { toast, showToast };
}

/**
 * Dark rounded-pill toast (DESIGN-SYSTEM "Toast Feedback" dark variant):
 * bottom-centered, single line (max-w-[90vw] whitespace-nowrap so it never
 * wraps/cuts off), with a fade + slide-up entrance/exit via Framer Motion.
 */
export function ToastPill({ toast }: { toast: string | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="wa-copy-toast"
          initial={{ opacity: 0, x: '-50%', y: 16, scale: 0.96 }}
          animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
          exit={{ opacity: 0, x: '-50%', y: 16, scale: 0.96 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="fixed left-1/2 z-[10000] max-w-[90vw] whitespace-nowrap bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl"
          style={{ bottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
