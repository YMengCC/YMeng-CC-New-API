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
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  jingSoftDiscoveredProductSchema,
  normalizeJingSoftGoodsKey,
  type JingSoftDiscoveredProduct,
  type JingSoftProduct,
} from './jingsoft-schema'

type Props = {
  baseUrl: string
  merchantToken: string
  directSlots: string[]
  products: JingSoftProduct[]
  invalid: boolean
  onDirectSlotsChange: (nextSlots: string[]) => void
}

export function JingSoftDirectSlotsSection(props: Props) {
  const { t } = useTranslation()
  const [slotDraft, setSlotDraft] = useState('')
  const [slotError, setSlotError] = useState<string | null>(null)
  const [discoveredResult, setDiscoveredResult] = useState<{
    scope: string
    items: JingSoftDiscoveredProduct[]
  } | null>(null)

  const currentScope = `${props.baseUrl.trim()}|${props.merchantToken.trim()}`
  const discovered =
    discoveredResult?.scope === currentScope ? discoveredResult.items : null

  const discoverDirectSlots = useMutation({
    mutationFn: async (request: {
      baseUrl: string
      merchantToken: string
      scope: string
    }) => {
      const response = await api.post<{
        success: boolean
        message?: string
        data: unknown
      }>('/api/option/jingsoft/slots/discover', {
        base_url: request.baseUrl.trim(),
        merchant_token: request.merchantToken.trim(),
      })
      return z
        .array(jingSoftDiscoveredProductSchema)
        .parse(requireServerSuccess(response.data).data)
    },
    onSuccess: (items, request) => {
      setDiscoveredResult({ scope: request.scope, items })
      if (items.length === 0) {
        toast.info(
          t('No hidden card products found in this JingSoft merchant account')
        )
      } else {
        toast.success(
          t('Detected {{count}} hidden card products', { count: items.length })
        )
      }
    },
    onError: (error) => handleServerError(error),
  })

  const redemptionKeys = new Set(
    props.products.map(
      (item) =>
        normalizeJingSoftGoodsKey(item.goods_key, props.baseUrl) ??
        item.goods_key.trim()
    )
  )
  const configuredSlots = new Set(props.directSlots)
  const unmappedDiscovered = (discovered ?? []).filter(
    (item) =>
      !configuredSlots.has(item.goods_key) && !redemptionKeys.has(item.goods_key)
  )
  const compatibleDiscovered = unmappedDiscovered.filter(
    (item) => item.compatible
  )
  const remainingCapacity = Math.max(0, 20 - props.directSlots.length)
  const batchAddCount = Math.min(compatibleDiscovered.length, remainingCapacity)

  function handleAddDirectSlot() {
    const normalized = normalizeJingSoftGoodsKey(slotDraft, props.baseUrl)
    if (!normalized) {
      setSlotError(t('Invalid JingSoft direct slot settings'))
      return
    }
    if (props.directSlots.includes(normalized)) {
      setSlotError(t('Direct-credit slot keys must be unique'))
      return
    }
    if (redemptionKeys.has(normalized)) {
      setSlotError(
        t(
          'Direct-credit slot keys cannot overlap with redemption product keys'
        )
      )
      return
    }
    setSlotError(null)
    setSlotDraft('')
    props.onDirectSlotsChange([...props.directSlots, normalized])
  }

  function addDiscoveredSlot(item: JingSoftDiscoveredProduct) {
    if (!item.compatible || props.directSlots.length >= 20) return
    if (configuredSlots.has(item.goods_key)) return
    if (redemptionKeys.has(item.goods_key)) {
      setSlotError(
        t(
          'Direct-credit slot keys cannot overlap with redemption product keys'
        )
      )
      return
    }
    setSlotError(null)
    props.onDirectSlotsChange([...props.directSlots, item.goods_key])
  }

  function addAllCompatibleSlots() {
    if (batchAddCount <= 0) return
    const additions = compatibleDiscovered
      .slice(0, remainingCapacity)
      .map((item) => item.goods_key)
    setSlotError(null)
    props.onDirectSlotsChange([...props.directSlots, ...additions])
    toast.success(
      t('Added {{count}} direct-credit slots', { count: additions.length })
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h4 className='font-medium'>{t('Direct-credit slot goods keys')}</h4>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={props.invalid || discoverDirectSlots.isPending}
          onClick={() =>
            discoverDirectSlots.mutate({
              baseUrl: props.baseUrl,
              merchantToken: props.merchantToken,
              scope: currentScope,
            })
          }
        >
          {discoverDirectSlots.isPending
            ? t('Loading...')
            : t('Auto-detect hidden slots')}
        </Button>
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Configure 1–20 dedicated card products in your JingSoft store with Contact format set to Any and Storefront visibility set to Hidden.'
        )}
      </p>
      {props.invalid && (
        <p role='alert'>{t('Invalid JingSoft direct slot settings')}</p>
      )}
      {unmappedDiscovered.length > 0 && (
        <div className='bg-muted/30 space-y-3 rounded-md border p-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-sm font-medium'>
              {t('Detected hidden card products')}
            </p>
            {batchAddCount > 0 && (
              <Button type='button' size='sm' onClick={addAllCompatibleSlots}>
                {t('Add compatible ({{count}})', { count: batchAddCount })}
              </Button>
            )}
          </div>
          <div className='space-y-2'>
            {unmappedDiscovered.map((item) => {
              const incompatibleLabel =
                item.contact_format && item.contact_format !== 'any'
                  ? t('Contact format must be Any')
                  : t('Product must be on sale')
              return (
                <div
                  key={item.goods_key}
                  className='bg-background flex flex-wrap items-center justify-between gap-3 rounded-md border p-2.5 text-sm'
                >
                  <div className='min-w-0 flex-1 space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium break-all'>{item.name}</span>
                      <code className='text-muted-foreground text-xs'>
                        {item.goods_key}
                      </code>
                      <Badge variant={item.in_stock ? 'outline' : 'secondary'}>
                        {t('Stock')}: {item.stock_count}
                      </Badge>
                      {!item.compatible && (
                        <Badge variant='destructive'>{incompatibleLabel}</Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={!item.compatible || props.directSlots.length >= 20}
                    onClick={() => addDiscoveredSlot(item)}
                  >
                    {t('Add slot')}
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className='flex flex-wrap gap-2'>
        <Input
          id='jingsoft-direct-slot-input'
          aria-label={t('Direct-credit slot goods key')}
          placeholder={t('Enter slot goods key or https://.../item/... link')}
          value={slotDraft}
          disabled={props.invalid || props.directSlots.length >= 20}
          onChange={(event) => {
            setSlotDraft(event.target.value)
            if (slotError) setSlotError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleAddDirectSlot()
            }
          }}
          className='min-w-0 flex-1'
        />
        <Button
          type='button'
          disabled={
            props.invalid || props.directSlots.length >= 20 || !slotDraft.trim()
          }
          onClick={handleAddDirectSlot}
        >
          {t('Add slot')}
        </Button>
      </div>
      {slotError && (
        <p role='alert' className='text-destructive text-sm'>
          {slotError}
        </p>
      )}
      {!props.directSlots.length && (
        <p className='text-muted-foreground text-sm'>
          {t('No direct-credit slots configured')}
        </p>
      )}
      {props.directSlots.map((slotKey) => (
        <div
          key={slotKey}
          className='flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm'
        >
          <code className='min-w-0 break-all'>{slotKey}</code>
          <Button
            type='button'
            variant='outline'
            size='sm'
            aria-label={t('Remove direct slot {{key}}', { key: slotKey })}
            onClick={() =>
              props.onDirectSlotsChange(
                props.directSlots.filter((item) => item !== slotKey)
              )
            }
          >
            {t('Delete')}
          </Button>
        </div>
      ))}
    </div>
  )
}
