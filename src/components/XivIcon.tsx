import { useEffect, useRef, useState } from 'react';
import { cn } from '../utils';

interface Props {
  localSrc?: string;
  remoteSrc?: () => Promise<string | null>;
  alt: string;
  className?: string;
  fallback?: string;
}

export function XivIcon({ localSrc = '', remoteSrc, alt, className, fallback }: Props) {
  const [src, setSrc] = useState(localSrc);
  const [failed, setFailed] = useState(false);
  const triedRemote = useRef(false);

  useEffect(() => {
    setSrc(localSrc);
    setFailed(false);
    triedRemote.current = false;
  }, [localSrc]);

  const handleError = () => {
    if (!remoteSrc || triedRemote.current) {
      setFailed(true);
      return;
    }
    triedRemote.current = true;
    remoteSrc()
      .then((url) => {
        if (url) {
          setSrc(url);
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  };

  if (!src || failed) {
    return (
      <span className={cn('inline-flex items-center justify-center', className)} aria-hidden="true">
        {fallback ?? ''}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={handleError}
    />
  );
}
