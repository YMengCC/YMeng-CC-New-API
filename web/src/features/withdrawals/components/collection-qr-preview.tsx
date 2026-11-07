/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { Spinner } from '@/components/ui/spinner'
import { useAuthStore } from '@/stores/auth-store'

import { fetchCollectionQr } from '../api'

export function CollectionQrImage(props: { blob: Blob; alt?: string }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(
    null
  )
  useEffect(() => {
    const url = URL.createObjectURL(props.blob)
    setPreview({ blob: props.blob, url })
    return () => URL.revokeObjectURL(url)
  }, [props.blob])
  if (preview?.blob !== props.blob) return <Spinner />
  return (
    <img
      src={preview.url}
      alt={props.alt ?? t('Collection QR code preview')}
      className='mx-auto max-h-72 max-w-full rounded-md border bg-white object-contain p-2'
    />
  )
}

export function CollectionQrPreview(props: {
  path: string
  revision?: string | number
  onReadyChange?: (ready: boolean) => void
  errorTitle?: string
  imageAlt?: string
  loadingLabel?: string
}) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const image = useQuery({
    queryKey: ['collection-qr-image', userId, props.path, props.revision],
    queryFn: ({ signal }) => fetchCollectionQr(props.path, signal),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    meta: { errorToast: false },
  })
  const onReadyChange = props.onReadyChange
  useEffect(() => {
    onReadyChange?.(image.isSuccess && !image.isFetching)
    return () => onReadyChange?.(false)
  }, [image.isSuccess, image.isFetching, onReadyChange])
  if (image.isError) {
    return (
      <ErrorState
        title={t(props.errorTitle ?? 'Failed to load collection QR code')}
        onRetry={() => void image.refetch()}
        className='min-h-36'
      />
    )
  }
  if (!image.data) {
    return (
      <div
        role='status'
        className='flex items-center justify-center gap-2 py-8'
      >
        <Spinner />
        {props.loadingLabel ?? t('Loading collection QR code...')}
      </div>
    )
  }
  return <CollectionQrImage blob={image.data} alt={props.imageAlt} />
}
