import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { X, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

// ── Helper: crop image to base64 JPEG ──
async function getCroppedImage(
  imageSrc: string,
  pixelCrop: Area,
  maxSize = 600,
): Promise<string> {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const outputSize = Math.min(pixelCrop.width, maxSize);
  canvas.width = outputSize;
  canvas.height = outputSize;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return canvas.toDataURL('image/jpeg', 0.85);
}

// ── Component ──
interface PhotoCropModalProps {
  isOpen: boolean;
  imageUrl: string;
  onClose: () => void;
  onCropComplete: (croppedBase64: string) => void;
}

export default function PhotoCropModal({ isOpen, imageUrl, onClose, onCropComplete }: PhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropAreaComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const result = await getCroppedImage(imageUrl, croppedAreaPixels);
      onCropComplete(result);
    } catch {
      // fallback — just pass original
      onCropComplete(imageUrl);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 bg-black/50">
        <p className="text-sm font-bold text-white">Crop Foto</p>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors active:scale-95"
        >
          <X size={18} />
        </button>
      </div>

      {/* Crop Area */}
      <div className="flex-1 relative overflow-hidden">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropAreaComplete}
        />
      </div>

      {/* Zoom Slider */}
      <div className="px-6 py-3 bg-black/50 flex items-center gap-3 flex-shrink-0">
        <ZoomOut size={16} className="text-white/60 shrink-0" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-emerald-500"
        />
        <ZoomIn size={16} className="text-white/60 shrink-0" />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 flex gap-2 flex-shrink-0 bg-black/50">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white/70 bg-white/10 hover:bg-white/20 transition-colors active:scale-95"
        >
          Batal
        </button>
        <button
          onClick={handleSave}
          disabled={processing}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-1.5"
        >
          {processing ? (
            <><Loader2 size={16} className="animate-spin" /> Memproses...</>
          ) : (
            'Gunakan Foto'
          )}
        </button>
      </div>
    </div>
  );
}
