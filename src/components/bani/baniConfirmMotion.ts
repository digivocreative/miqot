// Gerak untuk dialog konfirmasi Bani (BaniWaConfirm, BaniTelegramConfirm).
//
// Satu sumber supaya semua konfirmasi muncul dan menutup dengan cara yang sama
// — dialog yang timbul tenggelam dengan irama berbeda terbaca seperti dua
// aplikasi. Dipakai berpasangan dengan <AnimatePresence> DI PEMANGGIL: tanpa
// itu komponennya lepas seketika dan `exit` tidak pernah sempat berjalan.
//
// Latar yang meredup memegang seluruh peredupan (panel ikut lebur karena anak
// dari elemen ber-opacity), jadi panel hanya mengurus skala dan geser.
import { useReducedMotion } from 'framer-motion';
import type { MotionProps } from 'framer-motion';

export function useBaniConfirmMotion(): { backdrop: MotionProps; panel: MotionProps } {
  const reduceMotion = useReducedMotion();

  // Masuk sedikit lebih lambat daripada keluar: yang muncul boleh terasa
  // mendarat, yang ditutup harus terasa patuh.
  const backdrop: MotionProps = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: 0.14, ease: 'easeIn' } },
    transition: { duration: reduceMotion ? 0.12 : 0.2, ease: 'easeOut' },
  };

  // Hormati prefers-reduced-motion dengan membuang transform sama sekali —
  // peredupan latar sudah cukup menandai dialog datang dan pergi.
  const panel: MotionProps = reduceMotion
    ? {}
    : {
        initial: { scale: 0.92, y: 12 },
        animate: { scale: 1, y: 0 },
        exit: { scale: 0.96, y: 6, transition: { duration: 0.13, ease: 'easeIn' } },
        // Pegas, bukan tween: sedikit pantulan di ujung membuat dialog terasa
        // muncul, bukan sekadar berganti nilai.
        transition: { type: 'spring', stiffness: 420, damping: 26, mass: 0.7 },
      };

  return { backdrop, panel };
}
