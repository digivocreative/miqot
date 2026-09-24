'use client';

import { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { isSessionValid } from '@/utils/authUtils';
import { isProgrammaticScrollActive } from '@/lib/programmatic-scroll';
import type { UmrohPackage } from '@/types';
import {
  FilterMode,
  SEMUA_JENIS_TYPE_VALUE,
  modeMenuValue,
  resolveModeMenuChoice,
  typeMenuValue,
  resolveTypeMenuChoice,
  filterModeLabel,
  groupByMonth,
  extractUniqueDurations,
  extractUniqueLandings,
  extractJourneyStarts,
  monthOptionLabel,
  type MonthGroup,
} from '@/utils';
import {
  getMusimDinginWindow,
  listPackageTypeOptions,
  packageTypeLabel,
  umrohTypeSubject,
} from '@/lib/packageType';
import logoAlhijazColored from '@/new-logo/new-logo-alhijaz-colored.png';
import logoAlhijazWhite from '@/new-logo/new-logo-alhijaz-white.png';
import { Sun, Moon, Search, X, SlidersHorizontal, LayoutList, LogIn, Home, Eye, EyeOff } from 'lucide-react';
import { AGENTS_DATA } from '@/data/agents';
import FilterDropdown, { type FilterDropdownHandle } from './FilterDropdown';
import AvailabilityCoachMark from './AvailabilityCoachMark';
import { shouldShowAvailabilityHint, markAvailabilityHintShown } from '@/lib/availability-hint';

// ============================================
// Types
// ============================================

export interface FilterHeaderProps {
  /** All packages for extracting filter options */
  packages: UmrohPackage[];
  /** Current Hijri year */
  year: string;
  /** Available years for selection */
  availableYears?: string[];
  /** Current filter mode */
  filterMode: FilterMode;
  /** Secondary filter value (month key, durasi, kode landing, atau tipe paket) */
  secondaryValue?: string;
  /** Callbacks */
  onYearChange: (year: string) => void;
  onFilterModeChange: (mode: FilterMode) => void;
  onSecondaryValueChange: (value: string) => void;
  /** Dark mode state */
  isDarkMode: boolean;
  /** Toggle dark mode callback */
  onToggleDarkMode: () => void;
  /** Search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Callback to toggle filter modal */
  onToggleFilter: () => void;
  /** Whether any filter is active */
  isFilterActive?: boolean;
  /** Callback to clear filters */
  onClearFilter?: () => void;
  /** Whether compact card view is enabled */
  isCompactView?: boolean;
  /** Callback to toggle compact view */
  onToggleCompact?: () => void;
  /** Tombol "hanya seat tersedia" — nyala berarti paket habis disembunyikan */
  availableOnly?: boolean;
  /** Callback tombol "hanya seat tersedia" */
  onToggleAvailableOnly?: () => void;
}

// Trigger sizing for the filter-row dropdowns: two of them share the row (flex-1),
// so on <sm the default variant's text-sm truncates long labels ("Umroh Musim Dingin",
// "Madinah (12 paket)"). Shrink font + padding on mobile only; ≥sm keeps the
// default-variant look. Passed as triggerSizeClass (replaces, not appends).
// h-9 pins the mobile height to the search row below it (both 36px); `sm:h-auto`
// hands height back to sm:py-2.5 so the ≥sm look is unchanged.
const FILTER_ROW_TRIGGER_SIZE =
  'h-9 gap-1.5 px-2.5 text-xs sm:h-auto sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm font-medium rounded-xl';

// Sub-filter tampil HURUF BESAR, senada dropdown utama (JENIS PAKET, AWAL PERJALANAN…).
// Diubah di tampilan ini, BUKAN di sumber labelnya: label roster tipe paket
// ('Umroh Ramadhan') juga dipakai Brosur, kartu OG, dan judul tab.
function upperLabels<T extends { label: string }>(options: T[]): T[] {
  return options.map(o => ({ ...o, label: o.label.toUpperCase() }));
}

// Search icon + the two square action buttons shrink with the row on mobile.
// lucide's `size` prop writes width/height attributes, which CSS beats — so the
// responsive sizing has to come from classes, not the prop.
const ROW_ICON_SIZE = 'w-4 h-4 sm:w-[18px] sm:h-[18px]';

// Filter mode options for dropdown.
// 'LIBURAN_SEKOLAH', 'UMROH CUTI 5 HARI', & 'LANDING DI' sengaja tidak di sini —
// mode URL saja (lihat FilterMode di src/utils/filter-logic.ts). LANDING DI keluar
// 2026-09-24: 1,6% pilihan mode dalam 15 hari telemetri, dan "Landing Madinah"
// sudah tercakup AWAL PERJALANAN → MADINAH DULU. Link /landing-madinah tetap
// hidup; datang lewat link, trigger & sub-filter kotanya tetap dirender.
// Label datang dari FILTER_MODE_LABELS: nilai mode terikat slug URL & logika
// filter, teksnya tidak — mis. 'TIPE PAKET' tampil sebagai "JENIS PAKET".
// 'AVAILABLE' sengaja tidak di sini: ia tampil sebagai opsi "Semua Jenis" di
// dropdown Jenis Paket (lihat modeMenuValue di src/utils/filter-logic.ts).
const FILTER_MODE_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: 'TIPE PAKET', label: filterModeLabel('TIPE PAKET') },
  { value: 'AWAL PERJALANAN', label: filterModeLabel('AWAL PERJALANAN') },
  { value: 'DURASI PERJALANAN', label: filterModeLabel('DURASI PERJALANAN') },
  { value: 'DATA PER-BULAN', label: filterModeLabel('DATA PER-BULAN') },
  { value: 'SEMUA DATA', label: filterModeLabel('SEMUA DATA') },
];

// ============================================
// Component
// ============================================

export function FilterHeader({
  packages,
  year,
  availableYears = ['1448', '1449'],
  filterMode,
  secondaryValue,
  onYearChange,
  onFilterModeChange,
  onSecondaryValueChange,
  isDarkMode,
  onToggleDarkMode,
  searchQuery,
  onSearchChange,
  onToggleFilter,
  isFilterActive = false,
  onClearFilter,
  isCompactView = false,
  onToggleCompact,
  availableOnly = false,
  onToggleAvailableOnly,
}: FilterHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const loggedIn = useMemo(() => isSessionValid(), []);

  // The header is `fixed`, so <main> offsets itself by --filter-header-h. Publish the
  // measured height instead of letting that offset hardcode it — the two drifted apart
  // once the rows were resized, leaving a visible gap above the first card.
  //
  // Measure only the SETTLED EXPANDED height. Sampling per-frame (ResizeObserver) would
  // feed the collapse/expand animation into <main>'s padding and shove the page content
  // around under the fixed header while the user scrolls. Hence: on mount (nothing is
  // animating yet), on viewport resize, and on transitionend — all gated on `isVisible`,
  // so a collapsed header never overwrites the value.
  //
  // JEBAKAN: `transitionend` MENGGELEMBUNG. Di dalam header ada 13 elemen bertransisi,
  // dan beberapa (`transition-all` 0,15s/0,2s pada input cari + tombol) selesai SEBELUM
  // animasi buka header sendiri (0,3s). Tanpa saringan, publish() ikut jalan di tengah
  // animasi lalu mengukur tinggi antara — 165px dan 175px, bukan 181px yang sudah tenang.
  // Tiap nilai baru mengubah padding <main>, yang memaksa relayout SELURUH dokumen
  // (~11ms untuk 33 kartu di desktop; jauh lebih mahal di iPhone) dan menggeser seluruh
  // daftar kartu. Efeknya: daftar tersentak 176→186→192px tiap header muncul —
  // persis "flicker" yang terlihat saat menggulir. Karena itu hanya transisi yang
  // BENAR-BENAR menentukan tinggi header (grid-template-rows + padding pada dua
  // pembungkus di bawah ini) yang boleh memicu pengukuran.
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;
  const padBoxRef = useRef<HTMLDivElement>(null);
  const collapseRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    let lastPublished = '';
    let lastVisibleH = '';
    /**
     * Tinggi header SAAT INI — termasuk saat menyusut.
     *
     * Terpisah dari --filter-header-h yang sengaja dipaku ke tinggi mengembang:
     * <main> memakainya sebagai offset RUANG-DOKUMEN, dan menulis nilai yang
     * berubah-ubah ke situ menggeser seluruh daftar (sumber "ngejedug" iOS).
     *
     * Rail desktop `fixed` hidup di RUANG-VIEWPORT dan justru butuh angka yang
     * ikut menyusut, kalau tidak ia meninggalkan celah kosong di bawah header.
     * Menulisnya aman: yang dipengaruhi hanya padding rail itu sendiri, bukan
     * tata letak dokumen.
     *
     * Sama-sama hanya ditulis di keadaan SETTLED (transitionend / mount /
     * resize yang sudah reda) supaya tak ada nilai antara.
     */
    const publishVisible = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h <= 0) return;
      const value = `${h}px`;
      if (value === lastVisibleH) return;
      lastVisibleH = value;
      document.documentElement.style.setProperty('--filter-header-visible-h', value);
    };
    const publish = () => {
      if (!isVisibleRef.current) return;
      const h = Math.round(el.getBoundingClientRect().height);
      if (h <= 0) return;
      const value = `${h}px`;
      // Menulis nilai yang sama tidak dibaca ulang oleh engine, tapi tetap murah untuk
      // dijaga di sini supaya niatnya eksplisit.
      if (value === lastPublished) return;
      lastPublished = value;
      document.documentElement.style.setProperty('--filter-header-h', value);
    };
    const onTransitionEnd = (e: TransitionEvent) => {
      const settled =
        (e.target === collapseRef.current && e.propertyName === 'grid-template-rows') ||
        (e.target === padBoxRef.current && e.propertyName.startsWith('padding'));
      if (settled) { publish(); publishVisible(); }
    };
    // iOS Safari menembakkan `resize` saat toolbar browser muncul kembali — pada
    // gestur scroll-up yang SAMA yang memulai animasi buka header 300ms. Dulu
    // jalur ini publish() telanjang: mengukur DI TENGAH animasi (terukur 153px
    // dari settled 167px), menulis nilai antara ke --filter-header-h, menggeser
    // seluruh daftar di bawah jari (-14px), lalu transitionend menulis nilai
    // settled dan menggesernya balik (+14px). iOS belum punya scroll anchoring
    // (overflow-anchor baru Safari 27), jadi dua sentakan itu terasa mentah —
    // persis "ngejedug" tiap ganti arah gulir. Saat animasi masih berjalan,
    // lewati saja: transitionend settled di atas yang akan mengukur.
    //
    // Pagarnya bertanya ke animasinya SENDIRI, bukan timer: resize me-restart
    // transisi (terukur molor sampai ~690ms), jadi timer 300ms+margin pun bocor.
    const isToggleAnimating = () =>
      [collapseRef.current, padBoxRef.current].some(
        node => node?.getAnimations().some(a => a.playState === 'running'),
      );
    let resizeSettleTimer = 0;
    const onResize = () => {
      if (!isToggleAnimating()) { publish(); publishVisible(); }
      // Resize lintas-breakpoint (rotasi 390->744 melewati sm): isi header ikut
      // bertransisi (transition-all pada input Cari, ukuran tombol), jadi
      // pengukuran di momen resize menangkap nilai tengah (terukur 175px dari
      // settled 181px) — dan transisi itu SENGAJA tak lolos saringan settled di
      // atas. Ukur sekali lagi setelah reda; kalau saat itu toggle header justru
      // sedang beranimasi, transitionend settled yang mengambil alih.
      window.clearTimeout(resizeSettleTimer);
      resizeSettleTimer = window.setTimeout(() => {
        if (!isToggleAnimating()) { publish(); publishVisible(); }
      }, 400);
    };
    publish(); // mount: expanded, nothing animating yet
    publishVisible();
    window.addEventListener('resize', onResize);
    el.addEventListener('transitionend', onTransitionEnd);
    return () => {
      window.clearTimeout(resizeSettleTimer);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('transitionend', onTransitionEnd);
    };
  }, []);



  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const lastScrollY = lastScrollYRef.current;

    // Scroll kompensasi anchor kartu, bukan gestur user — jangan toggle header
    // di tengah animasi pindah kartu (header melebar bisa menutupi kartu yang di-tap).
    if (isProgrammaticScrollActive()) {
      lastScrollYRef.current = currentScrollY;
      return;
    }

    const windowHeight = window.innerHeight;
    // Bacaan `scrollHeight` ini MEMAKSA layout sinkron. Murah saat layout bersih, tapi
    // saat kartu terbuka framer-motion menganimasikan `height` panel tiap frame (dan
    // kartu ber-content-visibility keluar-masuk viewport), jadi layout hampir selalu
    // kotor — sekali baca = relayout seluruh dokumen. Dulu ini jalan sekali per EVENT
    // scroll; iOS Safari menembakkan event scroll lebih rapat dari frame saat momentum,
    // sehingga satu frame bisa menanggung beberapa relayout penuh dan scroll-nya
    // tersendat. Sekarang digas rAF (lihat useEffect di bawah): maksimal sekali per frame.
    const documentHeight = document.documentElement.scrollHeight;

    if (currentScrollY === 0) {
      // Mentok atas -> muncul
      lastScrollYRef.current = currentScrollY;
      setIsVisible(true);
      return;
    }
    if (windowHeight + currentScrollY >= documentHeight - 10) {
      // Mentok bawah (toleransi 10px) -> muncul
      lastScrollYRef.current = currentScrollY;
      setIsVisible(true);
      return;
    }

    // Ambang 4px: rubber-band dan momentum iOS melaporkan delta sub-pixel yang
    // bolak-balik arah, dan tiap pembalikan me-restart animasi 300ms header —
    // header jadi terlihat berkedip buka-tutup. Delta sekecil itu bukan gestur.
    // Sengaja HANYA menggerbangi toggle berbasis arah; mentok atas/bawah di atas
    // tetap tanpa syarat supaya header selalu muncul di kedua ujung halaman.
    // `lastScrollYRef` tidak diperbarui saat di bawah ambang, supaya guliran pelan
    // tetap terakumulasi sampai melewati 4px dan tidak hilang begitu saja.
    const delta = currentScrollY - lastScrollY;
    if (Math.abs(delta) < 4) return;
    lastScrollYRef.current = currentScrollY;

    // Scroll ke bawah -> sembunyi, ke atas -> muncul
    setIsVisible(delta < 0);
  }, []);

  useEffect(() => {
    // Gas rAF: banyak event scroll dalam satu frame dilipat jadi satu pemanggilan,
    // supaya `scrollHeight` di atas tidak memaksa relayout berkali-kali per frame.
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        handleScroll();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [handleScroll]);

  const handleClearSearch = () => {
    onSearchChange('');
    inputRef.current?.focus();
  };

  // Coach mark tombol mata: "Paket habis disembunyikan. Tap untuk
  // menampilkannya". Tombolnya ada di semua filter dan bawaannya aktif, jadi
  // petunjuknya dipicu saat pengunjung MENGGANTI filter (permintaan user
  // 2026-09-24), paling sering sekali per 4 jam (src/lib/availability-hint.ts).
  const availabilityBtnRef = useRef<HTMLButtonElement>(null);
  const [hintOpen, setHintOpen] = useState(false);

  // Pemicunya nonce yang dinaikkan HANYA dari tangan pengguna (bumpHint), bukan
  // efek ber-dep filterMode/secondaryValue — keduanya juga berubah saat filter
  // dibaca dari URL waktu halaman dimuat, dan petunjuk tidak boleh menyembul
  // untuk pengunjung yang sekadar membuka link WhatsApp.
  const [hintNonce, setHintNonce] = useState(0);
  const bumpHint = useCallback(() => setHintNonce(n => n + 1), []);
  // Teksnya hanya benar selama paket habis MEMANG disembunyikan. Dibaca lewat
  // ref supaya menekan tombol mata tidak ikut memicu efek petunjuk.
  const availableOnlyRef = useRef(availableOnly);
  availableOnlyRef.current = availableOnly;

  // Berapa dropdown header yang panelnya sedang terbuka. Selama > 0 gelembung
  // ditahan: memilih mode dari dropdown utama langsung menyembulkan
  // sub-filternya, dan gelembung yang terbit 600 ms kemudian akan menutupi opsi
  // panel itu. Ia muncul begitu panelnya ditutup.
  const [openMenuCount, setOpenMenuCount] = useState(0);
  const handleMenuOpenChange = useCallback((isOpen: boolean) => {
    setOpenMenuCount(c => Math.max(0, c + (isOpen ? 1 : -1)));
  }, []);

  // Menutup (× atau tombol matanya) hanya menutup. Jatah 4 jamnya sudah
  // terpakai saat gelembung terlihat, jadi tak ada yang perlu dicatat di sini.
  const dismissAvailabilityHint = useCallback(() => {
    setHintOpen(false);
  }, []);

  useEffect(() => {
    if (hintNonce === 0) return; // 0 = belum ada pergantian filter dari tangan pengguna
    if (!availableOnlyRef.current) return;
    if (!shouldShowAvailabilityHint()) return;
    // Jeda supaya gelembung tidak berebut frame dengan daftar yang baru
    // tersaring. Timer ini hanya MENGANTREKAN gelembung; jatah 4 jam dicatat di
    // efek hintVisible.
    const timer = setTimeout(() => {
      setHintOpen(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [hintNonce]);

  // Gelembung benar-benar TERLIHAT: antreannya menyala, header tidak menciut,
  // dan tak ada panel dropdown yang terbuka. Jatah 4 jam baru dipakai di sini —
  // kalau dicatat saat antre, gelembung yang tertahan (mis. pengunjung masih
  // memilih di panel sub-filter) menghabiskan jatahnya tanpa pernah terlihat.
  // Muncul lagi sesudah header digulir mengembang hanya menggeser stempelnya
  // beberapa detik; tidak mengubah aturan.
  const hintVisible = hintOpen && isVisible && openMenuCount === 0;
  useEffect(() => {
    if (hintVisible) markAvailabilityHintShown();
  }, [hintVisible]);

  // Roster sub-filter memakai gerbang yang SAMA dengan hasilnya (filterPackages),
  // jadi angka di label selalu sama dengan jumlah kartu — kalau lepas, "Jeddah
  // (59 paket)" nangkring di atas 29 kartu. Bawaannya aktif, jadi bulan yang
  // habis total tidak muncul sampai tombol mata dimatikan.
  const rosterPackages = useMemo(() => {
    if (!availableOnly) return packages;
    return packages.filter(pkg => pkg.seatSisa > 0);
  }, [packages, availableOnly]);

  // Group packages by month
  const monthGroups = useMemo<MonthGroup[]>(() => {
    return groupByMonth(rosterPackages);
  }, [rosterPackages]);

  // Extract unique durations
  const durationOptions = useMemo(() => {
    return extractUniqueDurations(rosterPackages);
  }, [rosterPackages]);

  // Extract unique landing cities
  const landingOptions = useMemo(() => {
    return extractUniqueLandings(rosterPackages);
  }, [rosterPackages]);

  // Awal perjalanan (Umroh Dulu / Madinah Dulu / Tur <destinasi>) — simpul pertama Urutan Perjalanan
  const journeyStartOptions = useMemo(() => {
    return extractJourneyStarts(rosterPackages);
  }, [rosterPackages]);

  // Jendela musim dingin dihitung sekali per sesi — sama seperti halaman Brosur;
  // window tidak bergeser mid-day untuk use case ini.
  const musimDinginWindow = useMemo(() => getMusimDinginWindow(new Date()), []);

  // Tipe paket: roster, urutan, label, dan gerbang "hanya yang punya paket"
  // datang dari modul bersama, jadi daftarnya identik dengan halaman Brosur.
  const packageTypeOptions = useMemo(() => {
    const options = listPackageTypeOptions(rosterPackages.map(umrohTypeSubject), musimDinginWindow);
    // Sub-nilai dari tautan lama (mis. /umroh-musim-dingin di tahun tanpa paket
    // Des/Jan) tetap ditampilkan supaya trigger tidak kosong dan user tahu
    // filter apa yang sedang aktif.
    if (secondaryValue && !options.some(o => o.value === secondaryValue)) {
      options.push({ value: secondaryValue, label: packageTypeLabel(secondaryValue) });
    }
    return options;
  }, [rosterPackages, musimDinginWindow, secondaryValue]);

  // Dropdown Jenis Paket: "Semua Jenis" (= mode AVAILABLE, halaman bawaan)
  // duduk di atas roster tipe, jadi tepat di atas "Umroh Saja".
  const typeMenuOptions = useMemo(() => {
    const options = [
      { value: SEMUA_JENIS_TYPE_VALUE, label: 'Semua Jenis' },
      ...packageTypeOptions,
    ];
    // Tautan lama /{agent}/tipe-paket tanpa sub-nilai: tanpa entri ini trigger
    // jatuh ke '—'. Hanya di keadaan itu — memilih JENIS PAKET dari dropdown
    // utama kini mendarat di Semua Jenis (resolveModeMenuChoice).
    if (filterMode === 'TIPE PAKET' && !secondaryValue) {
      options.unshift({ value: '', label: '- Pilih Jenis -' });
    }
    return upperLabels(options);
  }, [packageTypeOptions, filterMode, secondaryValue]);

  const handleTypeMenuChange = (v: string) => {
    const next = resolveTypeMenuChoice(v);
    if (next.mode !== filterMode || next.secondaryValue !== (secondaryValue || '')) bumpHint();
    // Mode dulu, baru sub-nilai: handleSecondaryValueChange di App membaca
    // filterModeRef yang baru saja diperbarui onFilterModeChange (state closure
    // di event yang sama masih mode lama).
    if (next.mode !== filterMode) onFilterModeChange(next.mode);
    onSecondaryValueChange(next.secondaryValue);
  };

  // Sub-filter selain Jenis Paket (Landing, Awal Perjalanan, Bulan, Durasi).
  // Memilih ulang nilai yang sama bukan "mengganti filter".
  const handleSubFilterChange = (v: string) => {
    if (v !== (secondaryValue || '')) bumpHint();
    onSecondaryValueChange(v);
  };

  // Nilai yang TAMPIL di dropdown utama: AVAILABLE tampil sebagai JENIS PAKET.
  const modeMenu = modeMenuValue(filterMode);

  // Mode URL-saja (mis. /cuti-5-hari, /liburan-sekolah) tidak ada di roster
  // dropdown. Tanpa entri sintetis, FilterDropdown tidak menemukan labelnya dan
  // trigger jatuh ke placeholder '—' — pengunjung yang datang dari tautan lama
  // tidak tahu filter apa yang sedang aktif.
  const filterModeOptions = useMemo(() => {
    const options = FILTER_MODE_OPTIONS.map(o => ({ value: o.value as string, label: o.label }));
    if (!options.some(o => o.value === modeMenu)) {
      options.push({ value: modeMenu, label: filterModeLabel(modeMenu) });
    }
    return options;
  }, [modeMenu]);

  // Check if secondary dropdown should be shown
  const showTypeDropdown = filterMode === 'TIPE PAKET' || filterMode === 'AVAILABLE';
  const showDurationDropdown = filterMode === 'DURASI PERJALANAN';
  const showMonthDropdown = filterMode === 'DATA PER-BULAN';
  const showLandingDropdown = filterMode === 'LANDING DI';
  const showJourneyStartDropdown = filterMode === 'AWAL PERJALANAN';

  // ── Sub-filter langsung menyembul setelah modenya dipilih ──────────────────
  //
  // Keempat mode berdimensi BELUM menampilkan apa pun sampai nilainya dipilih,
  // jadi memilih mode lalu harus menyentuh dropdown kedua itu dua ketukan untuk
  // satu niat.
  //
  // Satu ref cukup: keempat sub-dropdown saling eksklusif, tak pernah ada dua
  // yang terpasang sekaligus.
  const subFilterRef = useRef<FilterDropdownHandle | null>(null);

  // Pemicunya penghitung yang HANYA dinaikkan di dalam onChange dropdown mode,
  // bukan perbandingan `filterMode`. Dua alasan, keduanya sudah terbukti:
  //   1. Mode yang datang dari URL (link WhatsApp /nikita/landing-madinah), dari
  //      tombol Back, atau dari slug lama TIDAK boleh memuntahkan dropdown
  //      terbuka begitu halaman dimuat.
  //   2. Memilih ulang mode yang SUDAH aktif tetap harus membuka sub-filternya.
  //      Versi pertama memakai flag + efek ber-dep `filterMode`: di kasus ini
  //      modenya tidak berubah, jadi efeknya tak pernah jalan DAN flag-nya
  //      tertinggal menyala — lalu ikut meledak di perpindahan berikutnya,
  //      termasuk yang lewat tombol Back. Penghitung tidak bisa tertinggal:
  //      tiap kenaikan dikonsumsi tepat sekali.
  const [autoOpenNonce, setAutoOpenNonce] = useState(0);

  // Jumlah opsi per mode dipakai sebagai gerbang kedua: membuka dropdown yang
  // cuma berisi placeholder '- Pilih … -' itu jalan buntu yang menutupi hasil.
  const subFilterOptionCount =
    showTypeDropdown ? typeMenuOptions.length
    : showLandingDropdown ? landingOptions.length
    : showJourneyStartDropdown ? journeyStartOptions.length
    : showMonthDropdown ? monthGroups.length
    : showDurationDropdown ? durationOptions.length
    : 0;

  useEffect(() => {
    if (autoOpenNonce === 0) return; // 0 = belum ada pilihan dari tangan pengguna
    if (subFilterOptionCount === 0) return;
    subFilterRef.current?.open();
    // Sengaja HANYA bergantung pada nonce. `subFilterOptionCount` dibaca dari
    // closure render ini — penaikan nonce dan pergantian mode lahir dari event
    // yang sama, jadi React membatchnya jadi satu render dan nilainya sudah
    // yang terbaru. Memasukkannya ke deps justru membuat dropdown menyembul
    // lagi tiap kali jumlah opsi bergeser (mis. tombol "hanya seat tersedia").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNonce]);

  // pt safe-area di <header> sendiri, BUKAN di padBox: app terpasang di iOS digambar
  // di bawah status bar, dan tinggi yang diukur publish() dari elemen ini ikut
  // membawanya ke --filter-header-h — offset <main> & rail tak perlu tahu apa-apa.
  // Padding ini tak bertransisi, jadi saringan settled transitionend tetap utuh.
  return (
    <header
      ref={headerRef}
      className={`
        fixed top-0 left-0 right-0 z-50
        pt-[env(safe-area-inset-top)]
        bg-white/85 dark:bg-slate-900/85
        backdrop-blur-lg
        border-b border-gray-200/50 dark:border-slate-700/50
        supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/60
      `}
    >
      {/* Vertical padding slims symmetrically (16px -> 8px) while the rows are hidden */}
      <div
        ref={padBoxRef}
        className="jadwal-shell px-4 transition-[padding] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          paddingTop: isVisible ? '16px' : '8px',
          paddingBottom: isVisible ? '16px' : '8px',
        }}
      >
        {/* ============================================ */}
        {/* ROW 1: Title & Year Dropdown */}
        {/* ============================================ */}
        <div className="flex justify-between items-center">
          {/* Logo — preserve agent slug if present */}
          <div className="flex-shrink-0">
            <a href={(() => {
              const seg = window.location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)[0];
              return seg ? `/${seg}` : '/';
            })()} className="group relative block cursor-pointer transition-opacity hover:opacity-80">
              <img
                src={isDarkMode ? logoAlhijazWhite : logoAlhijazColored}
                alt="Alhijaz Indowisata"
                className="h-7 w-auto object-contain md:h-9"
              />
              <img
                src={isDarkMode ? logoAlhijazWhite : logoAlhijazColored}
                alt=""
                aria-hidden="true"
                className="animate-logo-shine pointer-events-none absolute inset-0 h-7 w-auto object-contain md:h-9"
              />
            </a>
          </div>

           {/* Year Dropdown & Dark Mode Toggle */}
          <div className="flex items-center gap-2">

             {/* Dark Mode Toggle — touch-hit: area ketuk 44px tanpa membesarkan tombol */}
             <button
              onClick={onToggleDarkMode}
              className="
                relative touch-hit
                flex items-center justify-center
                w-[38px] h-[38px] rounded-xl
                bg-gray-100/80 text-gray-600
                hover:bg-gray-200/80
                dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-emerald-500
              "
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Moon size={16} /> : <Sun size={16} />}
            </button>

             {/* Login / Dashboard Button */}
             <button
               onClick={() => {
                 window.location.href = loggedIn ? '/dashboard' : '/login';
               }}
               className="
                 relative touch-hit
                 flex items-center justify-center
                 w-[38px] h-[38px] rounded-xl
                 bg-gray-100/80 text-gray-600
                 hover:bg-gray-200/80
                 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80
                 transition-all duration-200
                 focus:outline-none focus:ring-2 focus:ring-emerald-500
                 active:scale-95
               "
               aria-label={loggedIn ? 'Dashboard' : 'Masuk'}
               title={loggedIn ? 'Dashboard' : 'Masuk'}
             >
               {loggedIn ? <Home size={16} /> : <LogIn size={16} />}
             </button>

           </div>
        </div>

        {/* ============================================ */}
        {/* ROW 2 + ROW 3: Filters & Search (collapsible on scroll) */}
        {/* ============================================ */}
        {/* Grid-rows 1fr/0fr animates to the exact content height (max-height overshoot causes a laggy start). */}
        {/* Dropdown panels render via portal so the overflow-hidden collapse wrapper can't clip them. */}
        <div
          ref={collapseRef}
          className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            gridTemplateRows: isVisible ? '1fr' : '0fr',
            opacity: isVisible ? 1 : 0,
          }}
        >
        <div className="min-h-0 overflow-hidden p-1 -m-1">
        <div
          className="transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ transform: isVisible ? 'translateY(0)' : 'translateY(-10px)' }}
        >
        <div className="flex gap-2 mt-3">
          {/* Main Filter Dropdown */}
          <FilterDropdown
            variant="default"
            triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
            portal
            onOpenChange={handleMenuOpenChange}
            value={modeMenu}
            onChange={(v) => {
              // Penanda "pilihan ini dari tangan pengguna" — dibaca efek
              // auto-open sub-filter di atas. Hanya di sini, jangan ditiru di
              // jalur URL/Back.
              setAutoOpenNonce(n => n + 1);
              // Memilih ulang filter yang sedang tampil tidak mereset apa pun:
              // sub-filternya (mis. UMROH RAMADHAN) tetap, hanya dropdown-nya
              // yang menyembul lewat nonce di atas.
              if (v === modeMenu) return;
              bumpHint();
              // JENIS PAKET mendarat di Semua Jenis, lalu dropdown jenisnya
              // menyembul supaya tipe lain bisa langsung dipilih.
              onFilterModeChange(resolveModeMenuChoice(v as FilterMode));
              // Reset secondary value when mode changes. Urutan TIDAK ikut
              // direset: ia tinggal di sheet Filter dan berlaku lintas mode.
              onSecondaryValueChange('');
            }}
            options={filterModeOptions}
            ariaLabel="Filter paket"
            widthClass="flex-1"
            showAllOptions
          />

          {/* Secondary Dropdown: Package Type — "Semua Jenis" + roster identik halaman Brosur */}
          {showTypeDropdown && (
            <FilterDropdown
              ref={subFilterRef}
              variant="default"
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
              onOpenChange={handleMenuOpenChange}
              value={typeMenuValue(filterMode, secondaryValue || '')}
              onChange={handleTypeMenuChange}
              options={typeMenuOptions}
              // Roster jenis paket lewat 8 opsi, jadi FilterDropdown otomatis
              // memunculkan kotak Cari — tidak berguna di sini: daftarnya pendek,
              // muat satu layar, dan halaman ini sudah punya kotak Cari sendiri
              // tepat di bawahnya.
              searchable={false}
              ariaLabel="Pilih Jenis Paket"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Landing City */}
          {showLandingDropdown && (
            <FilterDropdown
              ref={subFilterRef}
              variant="default"
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
              onOpenChange={handleMenuOpenChange}
              value={secondaryValue || ''}
              onChange={handleSubFilterChange}
              options={upperLabels([
                { value: '', label: '- Pilih Landing -' },
                ...landingOptions.map((l) => ({ value: l.code, label: `${l.name} (${l.packageCount} paket)` })),
              ])}
              ariaLabel="Pilih Landing"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Awal Perjalanan */}
          {showJourneyStartDropdown && (
            <FilterDropdown
              ref={subFilterRef}
              variant="default"
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
              onOpenChange={handleMenuOpenChange}
              value={secondaryValue || ''}
              onChange={handleSubFilterChange}
              options={upperLabels([
                { value: '', label: '- Pilih Awal -' },
                ...journeyStartOptions])}
              ariaLabel="Pilih Awal Perjalanan"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Months */}
          {showMonthDropdown && (
            <FilterDropdown
              ref={subFilterRef}
              variant="default"
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
              onOpenChange={handleMenuOpenChange}
              value={secondaryValue || ''}
              onChange={handleSubFilterChange}
              options={upperLabels([
                { value: '', label: '- Pilih Bulan -' },
                // "JUN 2026 (350/400)" — sisa/total seat sebulan. Nama bulan
                // disingkat 3 huruf supaya angkanya muat di trigger HP.
                ...monthGroups.map((m) => ({ value: m.monthKey, label: monthOptionLabel(m) })),
              ])}
              searchable={false}
              ariaLabel="Pilih Bulan"
              widthClass="flex-1"
            />
          )}

          {/* Secondary Dropdown: Duration */}
          {showDurationDropdown && (
            <FilterDropdown
              ref={subFilterRef}
              variant="default"
              triggerSizeClass={FILTER_ROW_TRIGGER_SIZE}
              portal
              onOpenChange={handleMenuOpenChange}
              value={secondaryValue || ''}
              onChange={handleSubFilterChange}
              options={upperLabels([
                { value: '', label: '- Pilih Durasi -' },
                ...durationOptions.map((d) => ({ value: d.days.toString(), label: `${d.label} (${d.count} paket)` })),
              ])}
              // Daftar durasi lewat 8 opsi, jadi FilterDropdown otomatis
              // memunculkan kotak Cari — dan kotak itu MEREBUT FOKUS saat panel
              // dibuka. Sejak sub-filter menyembul sendiri setelah modenya
              // dipilih, itu berarti keyboard HP ikut naik menutupi opsinya,
              // untuk menyaring daftar sependek ini. Alasan yang sama dengan
              // Jenis Paket & Bulan.
              searchable={false}
              ariaLabel="Pilih Durasi"
              widthClass="flex-1"
            />
          )}
        </div>

          <div className="flex items-center gap-2 mt-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search
                className={`absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none ${ROW_ICON_SIZE}`}
              />
              <input
                ref={inputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Cari..."
                className="
                  w-full h-9 pl-9 pr-9 sm:h-auto sm:pl-10 sm:pr-10 sm:py-2.5
                  bg-gray-100/80 dark:bg-slate-800/80
                  border border-transparent
                  rounded-xl
                  text-xs sm:text-sm font-medium
                  text-gray-900 dark:text-slate-100
                  placeholder-gray-400 dark:placeholder-slate-500
                  outline-none
                  focus:bg-white dark:focus:bg-slate-800
                  focus:ring-2 focus:ring-emerald-500/50
                  transition-all
                  [&::-webkit-search-cancel-button]:appearance-none
                  [&::-webkit-search-decoration]:appearance-none
                "
              />
              {searchQuery.length > 0 && (
                <button
                  onClick={handleClearSearch}
                  className="
                    touch-hit
                    absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2
                    flex items-center justify-center
                    w-4 h-4 sm:w-5 sm:h-5 rounded-full
                    bg-gray-200 dark:bg-slate-600
                    hover:bg-gray-300 dark:hover:bg-slate-500
                    text-gray-500 dark:text-slate-300
                    transition-colors
                  "
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Button — touch-hit: 36px di HP, area ketuknya tetap 44px.
                Tiga tombol ini berjarak gap-2 (8px): perluasan 4px per sisi pas
                bertemu di tengah celah, tidak saling tumpuk — dan p-1 pembungkus
                collapse di atas memberi tepat 4px sebelum overflow-hidden memotong. */}
            <button
              onClick={onToggleFilter}
              className={`
                relative touch-hit flex items-center justify-center
                w-9 h-9 sm:w-11 sm:h-11 shrink-0
                bg-gray-100/80 dark:bg-slate-800/80
                border border-transparent
                text-gray-600 dark:text-slate-300
                rounded-xl
                hover:bg-gray-200/80 dark:hover:bg-slate-700/80
                hover:text-emerald-600 dark:hover:text-emerald-400
                transition-all duration-200
                active:scale-95
              `}
              aria-label="Filter"
            >
              <SlidersHorizontal className={ROW_ICON_SIZE} />
              {isFilterActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full"></span>
              )}
            </button>

            {/* Compact View Toggle */}
            <button
              onClick={onToggleCompact}
              className={`
                relative touch-hit flex items-center justify-center
                w-9 h-9 sm:w-11 sm:h-11 shrink-0
                rounded-xl
                transition-all duration-200
                active:scale-95
                ${isCompactView
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                  : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80'
                }
              `}
              aria-label="Toggle Compact View"
              title={isCompactView ? 'Tampilan Normal' : 'Tampilan Compact'}
            >
              <LayoutList className={ROW_ICON_SIZE} />
            </button>

            {/* Tombol mata — ada di SEMUA filter, bawaannya aktif (paket habis
                disembunyikan) dan tampil NETRAL. Keadaan "habis" (paket habis
                ikut tampil, ?habis) HIJAU dengan ikon mata dicoret, sepola tombol
                Compact: warna menandai keadaan yang bukan bawaan. Mata dicoret
                sengaja TIDAK di keadaan bawaan — pilihan user dari 5 ikon. */}
            <button
              ref={availabilityBtnRef}
              onClick={() => {
                onToggleAvailableOnly?.();
                // Sudah ketemu sendiri — tak perlu diberi tahu lagi.
                dismissAvailabilityHint();
              }}
              className={`
                relative touch-hit flex items-center justify-center
                w-9 h-9 sm:w-11 sm:h-11 shrink-0
                rounded-xl
                transition-all duration-200
                active:scale-95
                ${!availableOnly
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                  : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80'
                }
                ${hintVisible ? 'ring-2 ring-slate-400/70 ring-offset-2 ring-offset-white dark:ring-slate-500/70 dark:ring-offset-slate-900 animate-pulse' : ''}
              `}
              // Hijau = "nyala": labelnya stabil dan aria-pressed mengikuti
              // keadaan yang hijau (paket habis ditampilkan).
              aria-pressed={!availableOnly}
              aria-label="Tampilkan paket habis"
              title={availableOnly ? 'Paket habis disembunyikan' : 'Paket habis ditampilkan'}
            >
              {availableOnly
                ? <Eye className={ROW_ICON_SIZE} />
                : <EyeOff className={ROW_ICON_SIZE} />}
            </button>
          </div>
        </div>
        </div>
        </div>

      </div>

      {/* Petunjuk untuk tombol mata. `hintVisible` ikut isVisible: kalau lepas,
          gelembungnya melayang menunjuk header yang sudah menciut. openMenuCount
          menahannya selama panel dropdown terbuka supaya tidak menimpa opsinya. */}
      <AvailabilityCoachMark
        anchorRef={availabilityBtnRef}
        open={hintVisible}
        onDismiss={dismissAvailabilityHint}
      />

    </header>
  );
}

export default FilterHeader;
