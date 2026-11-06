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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ScanLine } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  getCollectionQrProfile,
  saveCollectionQr,
} from '@/features/withdrawals/api'
import { CollectionQrCrop } from '@/features/withdrawals/components/collection-qr-crop'
import { CollectionQrPreview } from '@/features/withdrawals/components/collection-qr-preview'
import { validateCollectionQr } from '@/features/withdrawals/lib/validation'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

export function CollectionQrCard() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const queryKey = ['collection-qr-profile', userId]
  const profile = useQuery({
    queryKey,
    queryFn: ({ signal }) => getCollectionQrProfile(signal),
    retry: false,
    meta: { errorToast: false },
  })
  const [file, setFile] = useState<File | null>(null)
  const [cropped, setCropped] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  const [cropping, setCropping] = useState(false)
  const selection = useRef(0)
  const save = useMutation({
    mutationFn: saveCollectionQr,
    onSuccess: async (data) => {
      client.setQueryData(queryKey, data)
      setFile(null)
      setCropped(null)
      await client.invalidateQueries({ queryKey: ['collection-qr-profile'] })
      toast.success(t('Collection QR code saved'))
    },
    onError: (cause) => handleServerError(cause),
  })
  const selectFile = async (next: File | undefined) => {
    const version = ++selection.current
    if (!next) return
    setValidating(true)
    setError('')
    setCropped(null)
    try {
      await validateCollectionQr(next)
      if (version === selection.current) setFile(next)
    } catch (cause) {
      if (version === selection.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Please select a valid PNG image'
        )
      }
    } finally {
      if (version === selection.current) setValidating(false)
    }
  }
  return (
    <Card id='collection-qr' className='scroll-mt-6'>
      <CardHeader>
        <CardTitle>{t('Collection QR code')}</CardTitle>
        <CardDescription>
          {t('Only Alipay collection QR codes are supported')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {profile.isPending ? (
          <div role='status'>
            <Spinner />
            {t('Loading...')}
          </div>
        ) : null}
        {profile.isError ? (
          <ErrorState
            title={t('Failed to load collection QR code settings')}
            onRetry={() => void profile.refetch()}
            className='min-h-36'
          />
        ) : null}
        {file ? (
          <CollectionQrCrop
            key={file.name + file.size + file.lastModified}
            file={file}
            onCropReady={setCropped}
            onError={setError}
            onCropping={setCropping}
          />
        ) : null}
        {!file && profile.isSuccess && profile.data.has_qr ? (
          <CollectionQrPreview
            key={profile.data.sha256 ?? profile.data.updated_at}
            path='/api/withdrawal/profile/qr'
            revision={profile.data.sha256 ?? profile.data.updated_at}
          />
        ) : null}
        {!file && profile.isSuccess && !profile.data.has_qr ? (
          <p className='text-muted-foreground text-sm'>
            {t('No collection QR code saved')}
          </p>
        ) : null}
        <div className='space-y-2'>
          <Label htmlFor='collection-qr-file'>
            {t('PNG collection QR code')}
          </Label>
          <Input
            id='collection-qr-file'
            type='file'
            accept='image/png,.png'
            disabled={save.isPending || validating}
            aria-invalid={!!error}
            aria-describedby='collection-qr-help collection-qr-error'
            onChange={(event) => {
              void selectFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <p id='collection-qr-help' className='text-muted-foreground text-xs'>
            {t(
              'PNG only, up to 5 MiB and 4096 × 4096 pixels. Select a square area of the QR code before saving.'
            )}
          </p>
          {error ? (
            <p
              id='collection-qr-error'
              role='alert'
              className='text-destructive text-sm'
            >
              {t(error)}
            </p>
          ) : null}
          {validating ? <p role='status'>{t('Validating image...')}</p> : null}
        </div>
        {file && !cropped && !cropping ? (
          <Alert
            id='collection-qr-crop-alert'
            role='status'
            aria-live='polite'
            className='relative overflow-hidden border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent py-3 pl-3 text-amber-950 dark:text-amber-100'
          >
            <div className='flex items-start gap-3'>
              <span className='flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 ring-1 ring-amber-500/40 dark:text-amber-300'>
                <ScanLine className='size-4' aria-hidden='true' />
              </span>
              <div className='min-w-0 space-y-1'>
                <AlertTitle className='font-semibold'>
                  {t('Select the QR code area first')}
                </AlertTitle>
                <AlertDescription className='text-amber-900/80 dark:text-amber-100/80'>
                  {t(
                    'Drag on the image above to draw a square around the QR code. Saving stays disabled until you select an area.'
                  )}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        ) : null}
        <Button
          aria-describedby={
            file && !cropped ? 'collection-qr-crop-alert' : undefined
          }
          disabled={!cropped || validating || cropping || save.isPending}
          onClick={() => {
            if (cropped) save.mutate(cropped)
          }}
        >
          {save.isPending ? <Spinner /> : null}
          {profile.data?.has_qr
            ? t('Replace collection QR code')
            : t('Save collection QR code')}
        </Button>
      </CardContent>
    </Card>
  )
}
