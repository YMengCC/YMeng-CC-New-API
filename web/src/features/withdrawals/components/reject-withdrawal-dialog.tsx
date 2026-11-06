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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

const MAX_REASON_LENGTH = 500

interface RejectWithdrawalDialogProps {
  open: boolean
  pending: boolean
  username: string
  onOpenChange: (open: boolean) => void
  onReject: (reason: string) => void
}

export function RejectWithdrawalDialog(props: RejectWithdrawalDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const tooLong = [...reason.trim()].length > MAX_REASON_LENGTH

  const close = (open: boolean) => {
    if (!open) {
      setReason('')
      setError('')
    }
    props.onOpenChange(open)
  }

  const submit = () => {
    const value = reason.trim()
    if (!value) {
      setError(t('Rejection reason is required'))
      return
    }
    if ([...value].length > MAX_REASON_LENGTH) {
      setError(t('Rejection reason must be 500 characters or fewer'))
      return
    }
    setError('')
    props.onReject(value)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.pending) close(open)
      }}
      title={t('Reject withdrawal application')}
      description={`${props.username} · ${t(
        'The amount will be returned to the user referral rewards.'
      )}`}
      contentHeight='auto'
      contentClassName='sm:max-w-md'
      bodyClassName='space-y-2'
      footer={
        <>
          <Button
            variant='outline'
            disabled={props.pending}
            onClick={() => close(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            variant='destructive'
            disabled={props.pending || tooLong}
            onClick={submit}
          >
            {props.pending ? <Spinner /> : null}
            {props.pending ? t('Rejecting...') : t('Reject withdrawal')}
          </Button>
        </>
      }
    >
      <Label htmlFor='withdrawal-reject-reason'>{t('Rejection reason')}</Label>
      <Textarea
        id='withdrawal-reject-reason'
        rows={5}
        value={reason}
        disabled={props.pending}
        aria-invalid={!!error}
        aria-describedby='withdrawal-reject-error'
        placeholder={t('Please enter the rejection reason')}
        onChange={(event) => setReason(event.target.value)}
      />
      {error ? (
        <p
          id='withdrawal-reject-error'
          role='alert'
          className='text-destructive text-sm'
        >
          {error}
        </p>
      ) : null}
    </Dialog>
  )
}
