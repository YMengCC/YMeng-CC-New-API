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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { api } from '@/lib/api'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsCard } from '../components/settings-card'
import { JingSoftProductDialog } from './jingsoft-product-dialog'
import {
  inferJingSoftExpectedUSD,
  jingSoftDiscoveredProductSchema,
  makeUniqueJingSoftProductId,
  normalizeJingSoftGoodsKey,
  type JingSoftDiscoveredProduct,
  type JingSoftProduct,
} from './jingsoft-schema'

type Props = {
  baseUrl: string
  storeToken: string
  products: JingSoftProduct[]
  directSlots: string[]
  invalid: boolean
  presetOptions: number[]
  priceRatio: number
  amountDiscounts: Record<number, number>
  onProductsChange: (nextProducts: JingSoftProduct[]) => void
}

export function JingSoftRedemptionProductsSection(props: Props) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState<JingSoftProduct | null>(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState<JingSoftProduct | null>(null)
  const [discovered, setDiscovered] = useState<
    JingSoftDiscoveredProduct[] | null
  >(null)
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({})

  const discoverProducts = useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        success: boolean
        message?: string
        data: unknown
      }>('/api/option/jingsoft/products/discover', {
        base_url: props.baseUrl.trim(),
        store_token: props.storeToken.trim(),
      })
      return z
        .array(jingSoftDiscoveredProductSchema)
        .parse(requireServerSuccess(response.data).data)
    },
    onSuccess: (items) => {
      setDiscovered(items)
      const nextDrafts: Record<string, string> = {}
      for (const item of items) {
        const inferred = inferJingSoftExpectedUSD(
          item,
          props.presetOptions,
          props.priceRatio,
          props.amountDiscounts
        )
        if (inferred !== null) {
          nextDrafts[item.goods_key] = String(inferred)
        }
      }
      setDraftAmounts(nextDrafts)
      if (items.length === 0) {
        toast.info(t('No card products found in this JingSoft store'))
      } else {
        toast.success(
          t('Detected {{count}} store products', { count: items.length })
        )
      }
    },
    onError: (error) => handleServerError(error),
  })

  const mappedKeys = new Set(
    props.products.map(
      (item) =>
        normalizeJingSoftGoodsKey(item.goods_key, props.baseUrl) ??
        item.goods_key.trim()
    )
  )
  const directSlotSet = new Set(props.directSlots)
  const unmappedDiscovered = (discovered ?? []).filter(
    (item) =>
      !mappedKeys.has(item.goods_key) && !directSlotSet.has(item.goods_key)
  )

  function importSingleDiscovered(item: JingSoftDiscoveredProduct) {
    const rawAmount = draftAmounts[item.goods_key] ?? ''
    const amount = Number.parseFloat(rawAmount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
      toast.error(t('Expected credit must be greater than zero'))
      return
    }
    if (props.products.length >= 100) return
    const existingIds = new Set(props.products.map((p) => p.id))
    const nextProduct: JingSoftProduct = {
      id: makeUniqueJingSoftProductId(item.goods_key, existingIds),
      name: item.name,
      goods_key: item.goods_key,
      amount,
    }
    props.onProductsChange([...props.products, nextProduct])
  }

  function importAllMatchedDiscovered() {
    const existingIds = new Set(props.products.map((p) => p.id))
    const additions: JingSoftProduct[] = []
    for (const item of unmappedDiscovered) {
      if (!item.compatible) continue
      if (props.products.length + additions.length >= 100) break
      const rawAmount = draftAmounts[item.goods_key] ?? ''
      const amount = Number.parseFloat(rawAmount)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
        continue
      }
      const id = makeUniqueJingSoftProductId(item.goods_key, existingIds)
      existingIds.add(id)
      additions.push({
        id,
        name: item.name,
        goods_key: item.goods_key,
        amount,
      })
    }
    if (additions.length === 0) {
      toast.info(t('Set expected USD credit on detected products first'))
      return
    }
    props.onProductsChange([...props.products, ...additions])
    toast.success(
      t('Imported {{count}} product mappings', { count: additions.length })
    )
  }

  const readyImportCount = unmappedDiscovered.filter((item) => {
    if (!item.compatible) return false
    const val = Number.parseFloat(draftAmounts[item.goods_key] ?? '')
    return Number.isFinite(val) && val > 0 && val <= 1000000
  }).length

  return (
    <SettingsCard
      title={
        <span className='inline-flex flex-wrap items-center gap-2'>
          <span>{t('JingSoft product mappings')}</span>
          <Badge variant='secondary' className='font-mono text-xs'>
            {props.products.length}
          </Badge>
        </span>
      }
      description={t(
        'Selling prices come from live JingSoft quotes. Each order buys one code.'
      )}
      action={
        <>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={props.invalid || discoverProducts.isPending}
            onClick={() => discoverProducts.mutate()}
          >
            {discoverProducts.isPending
              ? t('Loading...')
              : t('Auto-detect store products')}
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={props.invalid || props.products.length >= 100}
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            {t('Add product')}
          </Button>
        </>
      }
      contentClassName='space-y-4'
    >
      <p className='text-muted-foreground text-xs leading-relaxed'>
        {t(
          'Match each product’s expected credited balance (USD) to an amount option in General. Use the balance value, not the CNY selling price or converted display amount. Unmatched presets cannot use this payment method.'
        )}
      </p>

      {unmappedDiscovered.length > 0 && (
        <div className='bg-muted/30 min-w-0 space-y-3 rounded-xl border p-3.5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-sm font-medium'>
              {t('Detected unmapped store products')}
            </p>
            {readyImportCount > 0 && (
              <Button
                type='button'
                size='sm'
                onClick={importAllMatchedDiscovered}
              >
                {t('Import matched ({{count}})', { count: readyImportCount })}
              </Button>
            )}
          </div>
          <div className='max-h-80 space-y-2 overflow-y-auto pr-1'>
            {unmappedDiscovered.map((item) => (
              <div
                key={item.goods_key}
                className='bg-background flex flex-col gap-2.5 rounded-lg border p-2.5 text-sm sm:flex-row sm:items-center sm:justify-between'
              >
                <div className='min-w-0 flex-1 space-y-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='max-w-full truncate font-medium'>
                      {item.name}
                    </span>
                    <code className='bg-muted text-muted-foreground max-w-full truncate rounded px-1.5 py-0.5 text-xs'>
                      {item.goods_key}
                    </code>
                    {item.price_cny && (
                      <Badge variant='secondary'>¥{item.price_cny}</Badge>
                    )}
                    <Badge variant={item.in_stock ? 'outline' : 'destructive'}>
                      {t('Stock')}: {item.stock_count}
                    </Badge>
                    {!item.compatible && (
                      <Badge variant='destructive'>
                        {t('Check contact format')}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <Input
                    type='number'
                    min='0'
                    max='1000000'
                    step='any'
                    aria-label={t('Expected credited balance (USD)')}
                    placeholder='USD'
                    value={draftAmounts[item.goods_key] ?? ''}
                    onChange={(event) =>
                      setDraftAmounts((prev) => ({
                        ...prev,
                        [item.goods_key]: event.target.value,
                      }))
                    }
                    className='h-8 w-24'
                  />
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={!item.compatible || props.products.length >= 100}
                    onClick={() => importSingleDiscovered(item)}
                  >
                    {t('Import')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {props.invalid && (
        <p role='alert' className='text-destructive text-xs'>
          {t('Invalid JingSoft mapping configuration')}
        </p>
      )}
      {!props.products.length ? (
        <div className='text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm'>
          {t('No JingSoft products configured')}
        </div>
      ) : (
        <div className='max-h-80 space-y-2 overflow-y-auto pr-1'>
          {props.products.map((product) => (
            <div
              key={product.id}
              className='bg-muted/15 flex flex-col gap-2.5 rounded-lg border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between'
            >
              <div className='min-w-0 flex-1 space-y-0.5'>
                <p className='truncate text-sm font-medium'>
                  {product.name} ({product.id})
                </p>
                <p className='text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs'>
                  <code className='bg-muted max-w-full truncate rounded px-1.5 py-0.5 font-mono text-xs'>
                    {product.goods_key}
                  </code>
                  <span>·</span>
                  <span>
                    {formatCurrencyFromUSD(product.amount, {
                      locale: toIntlLocale(
                        i18n.resolvedLanguage || i18n.language
                      ),
                    })}
                  </span>
                </p>
              </div>
              <div className='flex shrink-0 gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  aria-label={t('Edit JingSoft product {{name}}', {
                    name: product.name,
                  })}
                  onClick={() => {
                    setEditing(product)
                    setOpen(true)
                  }}
                >
                  {t('Edit')}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  aria-label={t('Delete JingSoft product {{name}}', {
                    name: product.name,
                  })}
                  onClick={() => setDeleting(product)}
                >
                  {t('Delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <JingSoftProductDialog
        open={open}
        onOpenChange={setOpen}
        product={editing}
        products={props.products}
        baseUrl={props.baseUrl}
        discoveredProducts={discovered ?? undefined}
        presetOptions={props.presetOptions}
        priceRatio={props.priceRatio}
        amountDiscounts={props.amountDiscounts}
        onSave={(product) => {
          const normalizedKey =
            normalizeJingSoftGoodsKey(product.goods_key, props.baseUrl) ??
            product.goods_key.trim()
          if (props.directSlots.includes(normalizedKey)) {
            toast.error(
              t(
                'Direct-credit slot keys cannot overlap with redemption product keys'
              )
            )
            return
          }
          const cleanProduct = { ...product, goods_key: normalizedKey }
          props.onProductsChange(
            editing
              ? props.products.map((item) =>
                  item.id === editing.id ? cleanProduct : item
                )
              : [...props.products, cleanProduct]
          )
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(value) => {
          if (!value) setDeleting(null)
        }}
        title={t('Delete product')}
        desc={t(
          'Remove this JingSoft mapping? Existing orders keep their original product snapshot.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => {
          props.onProductsChange(
            props.products.filter((item) => item.id !== deleting?.id)
          )
          setDeleting(null)
        }}
      />
    </SettingsCard>
  )
}
