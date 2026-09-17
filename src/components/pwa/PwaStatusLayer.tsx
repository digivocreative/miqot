import UpdateToast from './UpdateToast';

// Lapisan status PWA global (di-mount sekali dari src/main.tsx untuk semua rute).
export default function PwaStatusLayer() {
  return <UpdateToast />;
}
