import {
  useEffect,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from 'react'

import { markImageLoadFailed } from '@/lib/image-preload'
import { cn } from '@/lib/utils'

type ConfiguredImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'children'
> & {
  src?: string | null
  fallback?: ReactNode
  containerClassName?: string
}

/** Render a configured image with one visible fallback. */
export function ConfiguredImage(props: ConfiguredImageProps) {
  const source = props.src?.trim() ?? ''
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [source])

  if (!source || imageFailed) return props.fallback ?? null

  const {
    className,
    containerClassName,
    fallback: _fallback,
    ...imageProps
  } = props

  return (
    <span className={cn('contents', containerClassName)}>
      <img
        {...imageProps}
        src={source}
        decoding={imageProps.decoding ?? 'async'}
        onError={(event) => {
          markImageLoadFailed(source)
          props.onError?.(event)
          setImageFailed(true)
        }}
        className={className}
      />
    </span>
  )
}
