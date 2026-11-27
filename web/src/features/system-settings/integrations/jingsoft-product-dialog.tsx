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
import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  inferJingSoftExpectedUSD,
  jingSoftProductSchema,
  makeUniqueJingSoftProductId,
  normalizeJingSoftGoodsKey,
  type JingSoftDiscoveredProduct,
  type JingSoftProduct,
} from './jingsoft-schema'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: JingSoftProduct | null
  products: JingSoftProduct[]
  baseUrl?: string
  discoveredProducts?: JingSoftDiscoveredProduct[]
  presetOptions?: number[]
  priceRatio?: number
  amountDiscounts?: Record<number, number>
  onSave: (product: JingSoftProduct) => void
}

export function JingSoftProductDialog(props: Props) {
  const { t } = useTranslation()
  const idCustomizedRef = useRef(false)
  const form = useForm<JingSoftProduct>({
    resolver: zodResolver(jingSoftProductSchema),
    defaultValues: { id: '', name: '', goods_key: '', amount: 1 },
  })

  const presetOptions = useMemo(
    () =>
      (props.presetOptions ?? []).filter(
        (item) => Number.isFinite(item) && item > 0
      ),
    [props.presetOptions]
  )
  const defaultAmount = presetOptions[0] ?? 1
  const existingGoodsKeys = new Set(
    props.products
      .filter((item) => item.id !== props.product?.id)
      .map(
        (item) =>
          normalizeJingSoftGoodsKey(item.goods_key, props.baseUrl) ??
          item.goods_key.trim()
      )
  )
  const unmappedDiscovered = (props.discoveredProducts ?? []).filter(
    (item) => !existingGoodsKeys.has(item.goods_key)
  )

  useEffect(() => {
    if (props.open) {
      idCustomizedRef.current = !!props.product
      form.reset(
        props.product ?? {
          id: '',
          name: '',
          goods_key: '',
          amount: defaultAmount,
        }
      )
    }
  }, [props.open, props.product, form, defaultAmount])

  function applyGoodsKeyRecognition(rawInput: string, rewriteGoodsKey: boolean) {
    const normalized = normalizeJingSoftGoodsKey(rawInput, props.baseUrl)
    if (!normalized) return
    if (rewriteGoodsKey && normalized !== rawInput) {
      form.setValue('goods_key', normalized, {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
    if (!props.product && !idCustomizedRef.current) {
      const existingIds = new Set(props.products.map((item) => item.id))
      form.setValue('id', makeUniqueJingSoftProductId(normalized, existingIds), {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
    const matchedStoreItem = (props.discoveredProducts ?? []).find(
      (item) => item.goods_key === normalized
    )
    if (matchedStoreItem) {
      if (!form.getValues('name').trim()) {
        form.setValue('name', matchedStoreItem.name, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
      const inferred = inferJingSoftExpectedUSD(
        matchedStoreItem,
        presetOptions,
        props.priceRatio ?? 1,
        props.amountDiscounts
      )
      if (inferred !== null) {
        form.setValue('amount', inferred, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.product ? t('Edit product') : t('Add product')}
      description={t(
        'Selling prices come from live JingSoft quotes. Each order buys one code.'
      )}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form='jingsoft-product-form'>
            {t('Save')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='jingsoft-product-form'
          className='space-y-4'
          onSubmit={(event) => {
            event.stopPropagation()
            const currentGoodsKey = form.getValues('goods_key')
            const normalizedKey = normalizeJingSoftGoodsKey(
              currentGoodsKey,
              props.baseUrl
            )
            if (normalizedKey) {
              form.setValue('goods_key', normalizedKey)
              if (!props.product && !form.getValues('id').trim()) {
                const existingIds = new Set(
                  props.products.map((item) => item.id)
                )
                form.setValue(
                  'id',
                  makeUniqueJingSoftProductId(normalizedKey, existingIds)
                )
              }
            }
            void form.handleSubmit((product) => {
              const cleanKey = normalizeJingSoftGoodsKey(
                product.goods_key,
                props.baseUrl
              )
              if (!cleanKey) {
                form.setError('goods_key', {
                  message: t('JingSoft goods key is required'),
                })
                return
              }
              if (
                !props.product &&
                props.products.some((item) => item.id === product.id)
              ) {
                form.setError('id', {
                  message: 'JingSoft product IDs must be unique',
                })
                return
              }
              props.onSave({
                ...product,
                goods_key: cleanKey,
                name: product.name.trim(),
              })
              props.onOpenChange(false)
            })(event)
          }}
        >
          {!props.product && unmappedDiscovered.length > 0 && (
            <div className='space-y-2'>
              <FormLabel>{t('Select from store products')}</FormLabel>
              <Select
                items={unmappedDiscovered.map((item) => ({
                  value: item.goods_key,
                  label: `${item.name} (${item.goods_key}${item.price_cny ? ` · ¥${item.price_cny}` : ''})`,
                }))}
                onValueChange={(selectedKey) => {
                  const found = unmappedDiscovered.find(
                    (item) => item.goods_key === selectedKey
                  )
                  if (!found) return
                  form.setValue('goods_key', found.goods_key, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                  form.setValue('name', found.name, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                  if (!idCustomizedRef.current) {
                    const existingIds = new Set(
                      props.products.map((item) => item.id)
                    )
                    form.setValue(
                      'id',
                      makeUniqueJingSoftProductId(found.goods_key, existingIds),
                      { shouldDirty: true, shouldValidate: true }
                    )
                  }
                  const inferred = inferJingSoftExpectedUSD(
                    found,
                    presetOptions,
                    props.priceRatio ?? 1,
                    props.amountDiscounts
                  )
                  if (inferred !== null) {
                    form.setValue('amount', inferred, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                }}
              >
                <SelectTrigger aria-label={t('Select from store products')}>
                  <SelectValue
                    placeholder={t(
                      'Choose a detected store product to auto-fill'
                    )}
                  />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {unmappedDiscovered.map((item) => (
                      <SelectItem key={item.goods_key} value={item.goods_key}>
                        {item.name} ({item.goods_key}
                        {item.price_cny ? ` · ¥${item.price_cny}` : ''})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}

          <FormField
            control={form.control}
            name='goods_key'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('JingSoft goods key')}</FormLabel>
                <FormControl>
                    <Input
                      {...field}
                      placeholder={t(
                        'Enter goods key or paste https://.../item/... link'
                      )}
                      onChange={(event) => {
                        field.onChange(event.target.value)
                        applyGoodsKeyRecognition(event.target.value, false)
                      }}
                      onPaste={(event) => {
                        if (field.value.trim()) return
                        const pasted = event.clipboardData.getData('text')
                        const normalized = normalizeJingSoftGoodsKey(
                          pasted,
                          props.baseUrl
                        )
                        if (!normalized || normalized === pasted.trim()) return
                        event.preventDefault()
                        field.onChange(normalized)
                        applyGoodsKeyRecognition(normalized, true)
                      }}
                      onBlur={() => {
                        field.onBlur()
                        applyGoodsKeyRecognition(field.value, true)
                      }}
                    />
                </FormControl>
                <FormDescription>
                  {t(
                    'Paste either the goods key or the full product URL; the key and ID are recognized automatically.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Product Name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='amount'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Expected credited balance (USD)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min='0'
                    max='1000000'
                    step='any'
                    {...field}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ''
                          ? Number.NaN
                          : Number(event.target.value)
                      )
                    }
                  />
                </FormControl>
                {presetOptions.length > 0 && (
                  <div className='flex flex-wrap gap-1.5 pt-1'>
                    {presetOptions.map((preset) => (
                      <Button
                        key={preset}
                        type='button'
                        size='sm'
                        variant={field.value === preset ? 'default' : 'outline'}
                        className='h-7 px-2.5 text-xs'
                        onClick={() =>
                          form.setValue('amount', preset, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      >
                        ${preset}
                      </Button>
                    ))}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='id'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Stable product ID')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    disabled={!!props.product}
                    placeholder={t('Auto-generated from goods key')}
                    onChange={(event) => {
                      idCustomizedRef.current =
                        event.target.value.trim().length > 0
                      field.onChange(event.target.value)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
