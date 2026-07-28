// Penanda scroll programatik (mis. kompensasi anchor kartu di halaman Jadwal)
// supaya listener auto-hide berbasis arah scroll (FilterHeader, FloatingAgentBar)
// tidak membacanya sebagai gestur user lalu memunculkan/menyembunyikan overlay
// di tengah animasi.
let activeCount = 0;

export function beginProgrammaticScroll(): void {
  activeCount++;
}

export function endProgrammaticScroll(): void {
  activeCount = Math.max(0, activeCount - 1);
}

export function isProgrammaticScrollActive(): boolean {
  return activeCount > 0;
}
