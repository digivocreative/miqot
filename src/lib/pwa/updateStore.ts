// Store kecil untuk tawaran "versi baru tersedia" (dibaca UpdateToast lewat
// useSyncExternalStore). Sengaja tanpa React supaya bisa dipanggil dari main.tsx
// sebelum aplikasi dirender dan diuji dengan node:test.

export interface UpdateState {
  ready: boolean;
  dismissed: boolean;
}

type Listener = () => void;

let state: UpdateState = { ready: false, dismissed: false };
let applyAction: (() => void) | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function getUpdateState(): UpdateState {
  return state;
}

export function subscribeUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tandai ada versi baru; `apply` dijalankan saat pengguna memilih "Muat ulang". */
export function markUpdateReady(apply: () => void): void {
  applyAction = apply;
  state = { ready: true, dismissed: false };
  emit();
}

export function dismissUpdate(): void {
  state = { ...state, dismissed: true };
  emit();
}

export function applyUpdate(): void {
  if (applyAction) applyAction();
  else if (typeof window !== 'undefined') window.location.reload();
}
