'use client';

// Studio tempel sticker: satu gambar masuk, satu gambar ber-sticker keluar.
//
// Komponen ini sengaja tidak tahu apa-apa soal paket, jadwal, tier, atau desain
// brosur — ia hanya menerima Blob. Itulah yang membuat ketiga permukaan brosur
// (kartu Jadwal, Brosur Paket, Brosur Jadwal) dilayani satu implementasi.
//
// Pratinjau memakai thumbnail lokal 256px, komposit memakai PNG penuh dari
// Bunny. Ketajamannya beda; GEOMETRINYA tidak, karena keduanya memakai `aspect`
// dari katalog dan placementToRect() yang sama — cuma beda ukuran kotak.
//
// Garis pilih, pegangan ukuran, dan tombol hapus hidup di DOM dan TIDAK PERNAH
// ikut digambar ke kanvas, jadi ornamen editor tidak mungkin bocor ke berkas.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Download, Loader2, Plus, Share2, Trash2, X } from 'lucide-react';

import { useBackToClose } from '../hooks/useBackToClose';
import { STICKERS, STICKER_GROUPS, stickerById, stickerThumbUrl } from '../lib/stickerCatalog.js';
import { clampPlacement, defaultPlacement, placementToRect } from '../lib/stickerLayout.js';
import type { StickerPlacement } from '../lib/stickerLayout';
import {
  STICKER_OUTPUT_EXT,
  STICKER_OUTPUT_MIME,
  compositeStickers,
} from '../utils/compositeStickers';
import { canShareFiles, downloadBlob, isTouchPrimary } from '../utils/share';

export interface StickerStudioProps {
  isOpen: boolean;
  onClose: () => void;
  /** Gambar dasar yang ditempeli — sudah final (identitas agent terbakar). */
  baseBlob: Blob | null;
  /** Nama berkas TANPA ekstensi; studio menambahkan `.jpg`. */
  fileNameBase: string;
  tone?: 'emerald' | 'burgundy';
}

type GestureKind = 'move' | 'pinch' | 'handle';

interface Gesture {
  kind: GestureKind;
  index: number;
  /** Titik pointer aktif, dipakai membedakan geser satu jari dari cubit dua jari. */
  pointers: Map<number, { x: number; y: number }>;
  /** Posisi pointer & placement saat gerakan ini dimulai. */
  anchorX: number;
  anchorY: number;
  startCx: number;
  startCy: number;
  startW: number;
  /** Jarak awal (cubit: antar dua jari; pegangan: pusat → pointer). */
  startDist: number;
}

const distance = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);

export function StickerStudio({
  isOpen,
  onClose,
  baseBlob,
  fileNameBase,
  tone = 'emerald',
}: StickerStudioProps) {
  const [placements, setPlacements] = useState<StickerPlacement[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const stageBoxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  // Handler pointer membaca placement TERBARU, bukan yang tertangkap closure
  // saat render — tanpa cermin ini, gerakan kedua memakai nilai basi.
  const placementsRef = useRef<StickerPlacement[]>([]);
  placementsRef.current = placements;

  const useShareLabel =
    isTouchPrimary() && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useBackToClose(isOpen, onClose);

  // ── Gambar dasar: object URL + ukuran naturalnya ──
  useEffect(() => {
    if (!isOpen || !baseBlob) {
      setBaseUrl(null);
      setNatural(null);
      return;
    }
    const url = URL.createObjectURL(baseBlob);
    setBaseUrl(url);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      if (!cancelled) setError('Gambar brosur tidak bisa dibaca');
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [isOpen, baseBlob]);

  // ── Penyimpanan sekali pakai: tutup studio = semua tempelan hilang ──
  useEffect(() => {
    if (isOpen) return;
    setPlacements([]);
    setSelected(null);
    setPickerOpen(false);
    setError(null);
    setSaved(false);
    gestureRef.current = null;
  }, [isOpen]);

  // ── Ukuran kotak panggung ──
  useEffect(() => {
    const el = stageBoxRef.current;
    if (!isOpen || !el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, baseUrl]);

  // Panggung = gambar dasar yang diperkecil agar muat tanpa terpotong. Semua
  // rect sticker dihitung terhadap ukuran INI, bukan ukuran natural; yang
  // menjaga keduanya sepakat adalah placement ternormalisasi.
  const stage = useMemo(() => {
    if (!natural || box.w <= 0 || box.h <= 0) return { w: 0, h: 0 };
    const scale = Math.min(box.w / natural.w, box.h / natural.h);
    return { w: natural.w * scale, h: natural.h * scale };
  }, [natural, box]);

  const imageAspect = natural ? natural.w / natural.h : 0.75;
  const aspectOf = (stickerId: string) => stickerById(stickerId)?.aspect ?? 1;

  function updatePlacement(index: number, next: StickerPlacement) {
    setPlacements(prev =>
      prev.map((p, i) => (i === index ? clampPlacement(next, aspectOf(next.stickerId), imageAspect) : p)),
    );
  }

  function addSticker(stickerId: string) {
    // Updater setPlacements sengaja tidak dipakai untuk menghitung indeks
    // terpilih: updater wajib murni, dan StrictMode memanggilnya dua kali.
    const index = placements.length;
    const placement = clampPlacement(
      defaultPlacement(stickerId, index),
      aspectOf(stickerId),
      imageAspect,
    );
    setPlacements(prev => [...prev, placement]);
    setSelected(index);
    setPickerOpen(false);
    setSaved(false);
  }

  function removeSticker(index: number) {
    setPlacements(prev => prev.filter((_, i) => i !== index));
    setSelected(null);
    setSaved(false);
  }

  // ── Gestur ──
  //
  // Satu ref untuk seluruh panggung: hanya satu sticker yang bisa dimanipulasi
  // pada satu waktu, jadi melacak per-lapisan hanya menambah keadaan yang bisa
  // tidak sinkron.

  function centerInClient(placement: StickerPlacement) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: rect.left + placement.cx * stage.w, y: rect.top + placement.cy * stage.h };
  }

  /** Jadikan keadaan sekarang sebagai titik nol gerakan berikutnya. */
  function rebase(g: Gesture, x: number, y: number) {
    const p = placementsRef.current[g.index];
    if (!p) return;
    g.anchorX = x;
    g.anchorY = y;
    g.startCx = p.cx;
    g.startCy = p.cy;
    g.startW = p.w;
  }

  function onLayerPointerDown(index: number, e: React.PointerEvent<HTMLElement>) {
    e.stopPropagation();
    const placement = placementsRef.current[index];
    if (!placement || busy) return;
    setSelected(index);
    setSaved(false);
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const existing = gestureRef.current;
    const g: Gesture =
      existing && existing.index === index && existing.kind !== 'handle'
        ? existing
        : {
            kind: 'move',
            index,
            pointers: new Map(),
            anchorX: e.clientX,
            anchorY: e.clientY,
            startCx: placement.cx,
            startCy: placement.cy,
            startW: placement.w,
            startDist: 0,
          };

    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.pointers.size >= 2) {
      const [a, b] = Array.from(g.pointers.values());
      g.kind = 'pinch';
      g.startDist = distance(a.x, a.y, b.x, b.y);
      rebase(g, e.clientX, e.clientY);
    } else {
      g.kind = 'move';
      rebase(g, e.clientX, e.clientY);
    }
    gestureRef.current = g;
  }

  function onLayerPointerMove(index: number, e: React.PointerEvent<HTMLElement>) {
    const g = gestureRef.current;
    if (!g || g.index !== index || !g.pointers.has(e.pointerId)) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const placement = placementsRef.current[index];
    if (!placement || stage.w <= 0) return;

    if (g.kind === 'pinch' && g.pointers.size >= 2 && g.startDist > 0) {
      const [a, b] = Array.from(g.pointers.values());
      const ratio = distance(a.x, a.y, b.x, b.y) / g.startDist;
      updatePlacement(index, { ...placement, w: g.startW * ratio });
      return;
    }

    updatePlacement(index, {
      ...placement,
      cx: g.startCx + (e.clientX - g.anchorX) / stage.w,
      cy: g.startCy + (e.clientY - g.anchorY) / stage.h,
    });
  }

  function onLayerPointerUp(index: number, e: React.PointerEvent<HTMLElement>) {
    const g = gestureRef.current;
    if (!g || g.index !== index) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 0) {
      gestureRef.current = null;
      return;
    }
    // Satu jari terangkat saat mencubit: lanjutkan sebagai geser, dengan titik
    // nol baru supaya sticker tidak meloncat.
    const [remaining] = Array.from(g.pointers.values());
    g.kind = 'move';
    g.startDist = 0;
    rebase(g, remaining.x, remaining.y);
  }

  function onHandlePointerDown(index: number, e: React.PointerEvent<HTMLElement>) {
    e.stopPropagation();
    const placement = placementsRef.current[index];
    if (!placement || busy) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const center = centerInClient(placement);
    gestureRef.current = {
      kind: 'handle',
      index,
      pointers: new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]),
      anchorX: e.clientX,
      anchorY: e.clientY,
      startCx: placement.cx,
      startCy: placement.cy,
      startW: placement.w,
      startDist: Math.max(1, distance(e.clientX, e.clientY, center.x, center.y)),
    };
    setSaved(false);
  }

  function onHandlePointerMove(index: number, e: React.PointerEvent<HTMLElement>) {
    const g = gestureRef.current;
    if (!g || g.kind !== 'handle' || g.index !== index) return;
    const placement = placementsRef.current[index];
    if (!placement) return;
    const center = centerInClient(placement);
    const ratio = distance(e.clientX, e.clientY, center.x, center.y) / g.startDist;
    updatePlacement(index, { ...placement, w: g.startW * ratio });
  }

  function endGesture() {
    gestureRef.current = null;
  }

  // ── Simpan / Bagikan ──
  async function handleSave(mode: 'share' | 'download') {
    if (!baseBlob || placements.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const blob = await compositeStickers(baseBlob, placements);
      const name = `${fileNameBase}.${STICKER_OUTPUT_EXT}`;
      const file = new File([blob], name, { type: STICKER_OUTPUT_MIME });
      if (mode === 'share' && canShareFiles([file])) {
        try {
          await navigator.share({ files: [file], title: fileNameBase });
        } catch (err) {
          if ((err as { name?: string } | null)?.name !== 'AbortError') downloadBlob(blob, name);
        }
      } else {
        downloadBlob(blob, name);
      }
      setSaved(true);
    } catch (err) {
      // Studio TIDAK ditutup dan placement TIDAK dibuang: agent bisa coba lagi
      // tanpa menempel ulang dari nol.
      setError(err instanceof Error ? err.message : 'Sticker gagal ditempel');
    } finally {
      setBusy(false);
    }
  }

  const accent =
    tone === 'burgundy'
      ? 'bg-gradient-burgundy shadow-burgundy-700/20'
      : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[10001] bg-white dark:bg-slate-900 flex flex-col"
          onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {/* ─── HEADER ─── */}
          <div className="flex-none flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-gray-200/60 dark:border-slate-700/60">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800 dark:text-white">Tempel Sticker</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 leading-tight">
                Geser untuk memindah, cubit untuk besar-kecil
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="flex-none p-2 rounded-full text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* ─── PANGGUNG ─── */}
          <div
            ref={stageBoxRef}
            className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-3 bg-gray-50 dark:bg-slate-950"
            onPointerDown={() => setSelected(null)}
          >
            {baseUrl && stage.w > 0 ? (
              <div
                ref={stageRef}
                className="relative shadow-lg"
                style={{ width: stage.w, height: stage.h, touchAction: 'none' }}
              >
                <img
                  src={baseUrl}
                  alt="Brosur"
                  draggable={false}
                  className="absolute inset-0 w-full h-full select-none"
                />

                {placements.map((placement, index) => {
                  const def = stickerById(placement.stickerId);
                  if (!def) return null;
                  const rect = placementToRect(placement, def.aspect, stage.w, stage.h);
                  const isSelected = selected === index;
                  return (
                    <div
                      key={`${placement.stickerId}-${index}`}
                      data-sticker-layer={index}
                      className="absolute"
                      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, touchAction: 'none' }}
                    >
                      <img
                        src={stickerThumbUrl(def.id)}
                        alt={def.label}
                        draggable={false}
                        className="w-full h-full select-none cursor-move"
                        style={{ touchAction: 'none' }}
                        onPointerDown={e => onLayerPointerDown(index, e)}
                        onPointerMove={e => onLayerPointerMove(index, e)}
                        onPointerUp={e => onLayerPointerUp(index, e)}
                        onPointerCancel={e => onLayerPointerUp(index, e)}
                      />

                      {/* Ornamen editor — DOM saja, tidak pernah masuk kanvas. */}
                      {isSelected && (
                        <>
                          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-emerald-500 rounded-sm" />
                          <button
                            type="button"
                            data-sticker-remove={index}
                            aria-label={`Hapus ${def.label}`}
                            onPointerDown={e => e.stopPropagation()}
                            onClick={e => {
                              e.stopPropagation();
                              removeSticker(index);
                            }}
                            className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 shadow flex items-center justify-center text-red-500"
                          >
                            <Trash2 size={13} />
                          </button>
                          <div
                            data-sticker-handle={index}
                            role="slider"
                            aria-label={`Ukuran ${def.label}`}
                            aria-valuenow={Math.round(placement.w * 100)}
                            aria-valuemin={10}
                            aria-valuemax={100}
                            tabIndex={-1}
                            style={{ touchAction: 'none' }}
                            onPointerDown={e => onHandlePointerDown(index, e)}
                            onPointerMove={e => onHandlePointerMove(index, e)}
                            onPointerUp={endGesture}
                            onPointerCancel={endGesture}
                            className="absolute -bottom-3 -right-3 w-7 h-7 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 shadow cursor-nwse-resize"
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Loader2 size={28} className="animate-spin text-gray-300 dark:text-slate-600" />
            )}
          </div>

          {/* ─── GALAT / SUKSES ─── */}
          {error && (
            <div className="flex-none flex items-start gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800/60">
              <AlertTriangle size={15} className="flex-none mt-0.5 text-amber-600 dark:text-amber-400" />
              <p className="text-[12px] text-amber-900 dark:text-amber-200 leading-snug">
                {error} — tempelanmu masih ada, coba simpan lagi.
              </p>
            </div>
          )}
          {saved && !error && (
            <div className="flex-none flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-200 dark:border-emerald-800/60">
              <Check size={15} className="flex-none text-emerald-600 dark:text-emerald-400" />
              <p className="text-[12px] text-emerald-900 dark:text-emerald-200">
                Brosur ber-sticker sudah tersimpan.
              </p>
            </div>
          )}

          {/* ─── FOOTER ─── */}
          <div className="flex-none border-t border-gray-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-2">
            <button
              type="button"
              data-sticker-add
              onClick={() => setPickerOpen(true)}
              disabled={!natural || busy}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700/70 transition-all duration-200 active:scale-95 disabled:opacity-60"
            >
              <Plus size={17} />
              <span>Tambah Sticker</span>
            </button>
            <button
              type="button"
              data-sticker-save
              onClick={() => handleSave(useShareLabel ? 'share' : 'download')}
              disabled={placements.length === 0 || busy}
              title={placements.length === 0 ? 'Pilih sticker dulu' : undefined}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold text-white shadow-md transition-all duration-200 active:scale-95 disabled:opacity-50 ${accent}`}
            >
              {busy ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : useShareLabel ? (
                <>
                  <Share2 size={17} />
                  <span>Bagikan</span>
                </>
              ) : (
                <>
                  <Download size={17} />
                  <span>Download</span>
                </>
              )}
            </button>
          </div>

          {/* ─── PICKER ─── */}
          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                className="absolute inset-0 z-10 flex flex-col justify-end bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPickerOpen(false)}
              >
                <motion.div
                  className="max-h-[75%] overflow-y-auto rounded-t-2xl bg-white dark:bg-slate-900 pb-[max(1rem,env(safe-area-inset-bottom))]"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="sticky top-0 flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800">
                    <p className="text-sm font-bold text-gray-800 dark:text-white">Pilih Sticker</p>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(false)}
                      aria-label="Tutup pilihan sticker"
                      className="p-1.5 rounded-full text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {STICKER_GROUPS.map(group => (
                    <div key={group.id} className="px-4 pt-4">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-slate-500 mb-2">
                        {group.label}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {STICKERS.filter(s => s.group === group.id).map(s => (
                          <button
                            key={s.id}
                            type="button"
                            data-sticker-pick={s.id}
                            onClick={() => addSticker(s.id)}
                            className="flex flex-col items-center gap-1 p-2 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <img
                              src={stickerThumbUrl(s.id)}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="w-full aspect-square object-contain"
                            />
                            <span className="text-[10px] font-semibold text-center leading-tight text-gray-600 dark:text-slate-300">
                              {s.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default StickerStudio;
