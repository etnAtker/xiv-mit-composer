interface Props {
  localSrc: string;
  alt: string;
  className?: string;
}

export function XivIcon({ localSrc, alt, className }: Props) {
  return <img src={localSrc} alt={alt} className={className} loading="lazy" decoding="async" />;
}
