import { useEffect, useState } from 'react';
import { getAgentInitials, handleAgentPhotoError } from '../../lib/agent-photo';

/**
 * Dipindahkan dari TerasPage.tsx (Task 9, Bagian 0) supaya CommentThread.tsx
 * tidak lagi mengimpor sebuah NILAI runtime dari TerasPage.tsx sementara
 * TerasPage.tsx sendiri mengimpor CommentThread — siklus modul yang
 * sebelumnya hanya selamat karena function declaration di-hoist. Perilaku
 * dan tampilan dipindah apa adanya, tanpa perubahan.
 */
export function AgentAvatar({
  name,
  photo,
  size = 'post',
}: {
  name: string;
  photo?: string | null;
  size?: 'post' | 'comment';
}) {
  const [fallback, setFallback] = useState(!photo);

  useEffect(() => {
    setFallback(!photo);
  }, [photo]);

  const sizeClass = size === 'comment' ? 'h-7 w-7 text-[9px]' : 'h-10 w-10 text-xs';
  const imageSize = size === 'comment' ? 28 : 40;

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 font-bold text-emerald-700 ring-1 ring-black/[0.06] dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-white/10 ${sizeClass}`}>
      {photo && !fallback ? (
        <img
          src={photo}
          alt={name}
          className="h-full w-full object-cover"
          onError={event => handleAgentPhotoError(
            event.currentTarget,
            name,
            imageSize,
            () => setFallback(true),
          )}
        />
      ) : (
        <span aria-hidden="true">{getAgentInitials(name)}</span>
      )}
    </div>
  );
}
