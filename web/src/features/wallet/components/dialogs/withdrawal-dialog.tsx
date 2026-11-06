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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  createWithdrawal,
  getCollectionQrProfile,
} from '@/features/withdrawals/api'
import { CollectionQrPreview } from '@/features/withdrawals/components/collection-qr-preview'
import { createWithdrawalRequestId } from '@/features/withdrawals/lib/request-id'
import {
  parseWithdrawalQuota,
  withdrawalAmountSchema,
} from '@/features/withdrawals/lib/validation'
import { formatQuota, quotaUnitsToDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

interface WithdrawalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableQuota: number
  onSuccess: () => Promise<void>
}

export function WithdrawalDialog(props: WithdrawalDialogProps) {
  const { t } = useTranslation()
  useSystemConfigStore((state) => state.config.currency)
  const client = useQueryClient()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const profile = useQuery({
    queryKey: ['collection-qr-profile', userId],
    queryFn: ({ signal }) => getCollectionQrProfile(signal),
    enabled: props.open,
    staleTime: 0,
    retry: false,
    meta: { errorToast: false },
  })
  const [qrReady, setQrReady] = useState(false)
  const attempt = useRef<{ quota: number; request_id: string } | null>(null)
  const minimumQuota = profile.data?.minimum_quota ?? 1
  const form = useForm<{ amount: string }>({
    resolver: zodResolver(
      withdrawalAmountSchema(props.availableQuota, minimumQuota)
    ),
    defaultValues: { amount: '' },
  })
  const submit = useMutation({
    mutationFn: createWithdrawal,
    onSuccess: async () => {
      attempt.current = null
      form.reset({ amount: '' })
      props.onOpenChange(false)
      toast.success(t('Withdrawal requested'))
      await Promise.all([
        client.invalidateQueries({ queryKey: ['affiliate', 'summary'] }),
        props.onSuccess(),
      ])
    },
    onError: (error) => handleServerError(error),
  })
  const amount = form.watch('amount')
  const quota = parseWithdrawalQuota(Number(amount), minimumQuota)
  const validAmount = withdrawalAmountSchema(
    props.availableQuota,
    minimumQuota
  ).safeParse({
    amount,
  }).success
  const ready =
    profile.isSuccess && !profile.isFetching && profile.data.has_qr && qrReady
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (attempt.current) {
      event.preventDefault()
      // A committed request may already have reduced available rewards to zero.
      // Retry the original immutable request so the server can confirm it.
      if (ready && !submit.isPending) submit.mutate(attempt.current)
      return
    }
    void form.handleSubmit(() => {
      if (!ready || submit.isPending) return
      attempt.current = { quota, request_id: createWithdrawalRequestId() }
      submit.mutate(attempt.current)
    })(event)
  }

  let body: React.ReactNode
  if (profile.isFetching || profile.isPending) {
    body = (
      <div role='status' className='flex items-center gap-2 py-6'>
        <Spinner />
        {t('Checking collection QR code...')}
      </div>
    )
  } else if (profile.isError) {
    body = (
      <ErrorState
        title={t('Failed to load collection QR code settings')}
        onRetry={() => void profile.refetch()}
        className='min-h-36'
      />
    )
  } else if (!profile.data.has_qr) {
    body = (
      <div role='alert' className='space-y-3'>
        <p>
          {t(
            'Save your Alipay collection QR code in your profile before requesting a withdrawal.'
          )}
        </p>
        <Button
          render={<Link to='/profile' hash='collection-qr' />}
          nativeButton={false}
          role='link'
        >
          {t('Set up collection QR code')}
        </Button>
      </div>
    )
  } else {
    body = (
      <form id='withdrawal-form' onSubmit={onSubmit} className='space-y-4'>
        <CollectionQrPreview
          path='/api/withdrawal/profile/qr'
          revision={profile.data.sha256 ?? profile.data.updated_at}
          onReadyChange={setQrReady}
        />
        <p className='text-muted-foreground text-sm'>
          {t('Only Alipay collection QR codes are supported')}
        </p>
        <div>
          <Label>{t('Available Rewards')}</Label>
          <p className='text-xl font-semibold'>
            {formatQuota(props.availableQuota)}
          </p>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='withdrawal-amount'>{t('Withdrawal amount')}</Label>
          <Input
            id='withdrawal-amount'
            type='number'
            step='1'
            inputMode='numeric'
            min={10}
            max={quotaUnitsToDollars(props.availableQuota)}
            {...form.register('amount')}
            disabled={submit.isPending || !!attempt.current}
            aria-invalid={!!form.formState.errors.amount}
            aria-describedby='withdrawal-amount-help'
          />
          <p
            id='withdrawal-amount-help'
            className='text-muted-foreground text-xs'
          >
            {t(
              'Enter a whole amount of at least 10 and no more than your available rewards'
            )}
          </p>
          <p className='text-muted-foreground text-xs'>
            {t('Minimum withdrawal amount is 10')}
          </p>
          <p className='text-muted-foreground text-xs'>
            {t('Withdrawal amounts do not include decimals')}
          </p>
          {form.formState.errors.amount ? (
            <p role='alert' className='text-destructive text-sm'>
              {t(form.formState.errors.amount.message ?? '')}
            </p>
          ) : null}
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={
              submit.isPending || !!attempt.current || props.availableQuota <= 0
            }
            onClick={() =>
              form.setValue(
                'amount',
                String(quotaUnitsToDollars(props.availableQuota)),
                { shouldValidate: true }
              )
            }
          >
            {t('Use all available rewards')}
          </Button>
        </div>
        <p className='text-muted-foreground text-sm'>
          {t(
            'The requested amount is deducted immediately. An administrator will pay manually using this QR code.'
          )}
        </p>
        {submit.isError ? (
          <p role='alert'>
            {t(
              'The request could not be confirmed. Retry this same withdrawal to avoid duplicate deductions.'
            )}
          </p>
        ) : null}
      </form>
    )
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!submit.isPending) props.onOpenChange(open)
      }}
      title={t('Withdraw rewards')}
      description={t(
        'Request a manual Alipay withdrawal from your referral rewards'
      )}
      contentHeight='auto'
      contentClassName='sm:max-w-md'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            variant='outline'
            disabled={submit.isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          {profile.data?.has_qr && !profile.isError ? (
            <Button
              type='submit'
              form='withdrawal-form'
              disabled={
                !ready || (!attempt.current && !validAmount) || submit.isPending
              }
            >
              {submit.isPending ? <Spinner /> : null}
              {submit.isError ? t('Retry withdrawal') : t('Request withdrawal')}
            </Button>
          ) : null}
        </>
      }
    >
      {body}
    </Dialog>
  )
}
