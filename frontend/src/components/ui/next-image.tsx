import { useState } from 'react';
import Image from 'next/image';
import cn from 'clsx';
import type { CSSProperties, JSX, ReactNode } from 'react';
import type { ImageProps } from 'next/image';

type NextImageProps = {
  alt: string;
  width?: string | number;
  children?: ReactNode;
  useSkeleton?: boolean;
  imgClassName?: string;
  previewCount?: number;
  blurClassName?: string;
} & ImageProps;

/**
 *
 * @description Must set width and height, if not add layout='fill'
 * @param useSkeleton add background with pulse animation, don't use it if image is transparent
 */
export function NextImage({
  src,
  alt,
  width,
  height,
  children,
  className,
  useSkeleton,
  imgClassName,
  previewCount,
  blurClassName,
  layout,
  fill,
  objectFit,
  objectPosition,
  ...rest
}: NextImageProps): JSX.Element {
  const fillsParent = fill || layout === 'fill' || (!width && !height);
  const [loading, setLoading] = useState(!!useSkeleton);

  const handleLoad = (): void => setLoading(false);

  return (
    <figure style={{ width, height }} className={className}>
      <Image
        className={cn(
          imgClassName,
          loading
            ? blurClassName ??
                'animate-pulse bg-light-secondary dark:bg-dark-secondary'
            : previewCount === 1
            ? 'rounded-lg object-contain'
            : 'object-cover'
        )}
        src={src}
        fill={fillsParent}
        width={fillsParent ? undefined : width}
        height={fillsParent ? undefined : height}
        alt={alt}
        onLoadingComplete={handleLoad}
        {...rest}
        sizes='100vw'
        style={{
          ...(fillsParent ? {} : { height: 'auto', width: '100%' }),
          objectFit: objectFit as CSSProperties['objectFit'],
          objectPosition,
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      />
      {children}
    </figure>
  );
}
