import { useState } from 'react';
import { cn } from '../utils';

interface Props {
  localSrc?: string;
  alt: string;
  className?: string;
  fallback?: string;
}

function XivIconInner({ localSrc = '', alt, className, fallback }: Props) {
  const [failed, setFailed] = useState(false);
  const src = localSrc;

  const handleError = () => {
    setFailed(true);
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

export function XivIcon(props: Props) {
  return <XivIconInner key={props.localSrc ?? ''} {...props} />;
}
