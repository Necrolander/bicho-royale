type PrizeImageProps = {
  src: string;
  alt: string;
  className?: string;
};

export function PrizeImage({ src, alt, className = '' }: PrizeImageProps) {
  const catalogTile = /\/vegas-catalog-3x3\.png#tile=(\d+)/i.exec(src);
  const imageSrc = catalogTile
    ? `/scratch-prizes/vegas-prize-${Number(catalogTile[1]) % 9}.webp`
    : src;
  return <img className={className} src={imageSrc} alt={alt} loading="eager" decoding="async" />;
}
