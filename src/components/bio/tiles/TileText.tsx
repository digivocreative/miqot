interface Props {
  content?: string;
}

export default function TileText({ content }: Props) {
  if (!content) return null;
  return (
    <div className="bio-tile bio-tile-text-block">
      <p className="bio-tile-text-content">{content}</p>
    </div>
  );
}
