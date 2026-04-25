interface Props {
  image_url?: string;
  caption?: string;
}

export default function TilePhoto({ image_url, caption }: Props) {
  if (!image_url) return null;
  return (
    <div className="bio-tile bio-tile-photo">
      <div className="bio-photo-frame">
        <img src={image_url} alt={caption || 'Dokumentasi jamaah'} loading="lazy" />
      </div>
      {caption?.trim() && <p className="bio-photo-caption">{caption}</p>}
    </div>
  );
}
