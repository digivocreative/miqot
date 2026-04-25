interface Props {
  quote?: string;
  author_name?: string;
  author_meta?: string;
}

export default function TileTestimonial({ quote, author_name, author_meta }: Props) {
  if (!quote || !author_name) return null;
  return (
    <div className="bio-tile bio-tile-testi">
      <span className="bio-testi-mark" aria-hidden="true">&ldquo;</span>
      <p className="bio-testi-quote">{quote}</p>
      <p className="bio-testi-author">
        — {author_name}
        {author_meta?.trim() && (
          <span className="bio-testi-meta"> · {author_meta}</span>
        )}
      </p>
    </div>
  );
}
