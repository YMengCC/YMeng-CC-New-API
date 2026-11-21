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
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { ConfiguredImage } from '@/components/configured-image'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getPaymentIcon } from '@/features/wallet/lib/ui'
import { isHttpsUrl } from '@/lib/content-format'

import type { CatFKChannel } from './catfk-schema'

const createPaymentMethodDialogSchema = (t: (key: string) => string) =>
  z
    .object({
      name: z.string().min(1, t('Payment method name is required')),
      type: z.string().min(1, t('Payment type key is required')),
      custom_type: z
        .string()
        .refine(
          (value) => !value.trim().toLowerCase().startsWith('catfk'),
          t('Catfk payment identifiers must use the verified channel list')
        ),
      channel_id: z.string(),
      icon: z.string().optional(),
      min_topup: z.string().optional(),
      fee_percent: z.string().refine((value) => {
        if (!value.trim()) return true
        const feePercent = Number(value)
        return (
          Number.isFinite(feePercent) && feePercent >= 0 && feePercent <= 100
        )
      }, t('Enter a percentage from 0 to 100')),
      show_topup_notice: z.boolean(),
      show_topup_link: z.boolean(),
      topup_notice_text: z.string().optional(),
      topup_link_image: z
        .string()
        .refine(
          (value) => !value.trim() || isHttpsUrl(value.trim()),
          t('Enter a valid HTTPS image URL')
        ),
    })
    .superRefine((values, ctx) => {
      if (values.type === '__custom_epay__' && !values.custom_type.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['custom_type'],
          message: t('Payment type key is required'),
        })
      }
    })

type PaymentMethodDialogFormValues = z.infer<
  ReturnType<typeof createPaymentMethodDialogSchema>
>

const PAYMENT_METHOD_FORM_ID = 'payment-method-form'

export type PaymentMethodData = {
  name: string
  type: string
  icon?: string
  min_topup?: string
  fee_percent?: string
  channel_id?: string
  color?: string
  show_topup_notice?: string
  show_topup_link?: string
  topup_notice_text?: string
  topup_link_image?: string
}

type PaymentTypeOption = {
  iconName: string
  label: string
  name: string
  value: string
  channelID?: string
}

type PaymentMethodDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: PaymentMethodData) => void
  editData?: PaymentMethodData | null
  catfkChannels?: CatFKChannel[]
}

const PAYMENT_TYPE_ICON_NAMES: Record<string, string> = {
  alipay: 'SiAlipay',
  catfk: 'SiAlipay',
  catfk_alipay: 'SiAlipay',
  catfk_wxpay: 'SiWechat',
  stripe: 'SiStripe',
  waffo_pancake: 'LuCreditCard',
  wxpay: 'SiWechat',
}

const getDefaultIconName = (type: string) => PAYMENT_TYPE_ICON_NAMES[type] ?? ''

export function PaymentMethodDialog({
  open,
  onOpenChange,
  onSave,
  editData,
  catfkChannels = [],
}: PaymentMethodDialogProps) {
  const { t } = useTranslation()
  const isEditMode = !!editData
  const paymentMethodDialogSchema = createPaymentMethodDialogSchema(t)
  const catfkOptions = useMemo(
    () =>
      catfkChannels.flatMap((channel) => {
        let value: string | undefined
        if (channel.payment_type === 'wxpay') value = 'catfk_wxpay'
        if (channel.payment_type === 'alipay') value = 'catfk_alipay'
        if (!value) return []
        return [
          {
            iconName: getDefaultIconName(value),
            label: `${t(channel.payment_type === 'wxpay' ? 'Catfk WeChat Pay' : 'Catfk Alipay')} (${channel.name}, Catfk: ${value})`,
            name: t(
              channel.payment_type === 'wxpay'
                ? 'Catfk WeChat Pay'
                : 'Catfk Alipay'
            ),
            value,
            channelID: channel.id,
          },
        ]
      }),
    [catfkChannels, t]
  )
  const paymentTypeOptions = useMemo<PaymentTypeOption[]>(
    () => [
      {
        iconName: 'SiAlipay',
        label: `${t('Alipay')} (Epay: alipay)`,
        name: t('Alipay'),
        value: 'alipay',
      },
      {
        iconName: 'SiWechat',
        label: `${t('WeChat Pay')} (Epay: wxpay)`,
        name: t('WeChat Pay'),
        value: 'wxpay',
      },
      {
        iconName: 'SiStripe',
        label: `${t('Stripe')} (stripe)`,
        name: t('Stripe'),
        value: 'stripe',
      },
      {
        iconName: 'LuCreditCard',
        label: `${t('Waffo Pancake')} (waffo_pancake)`,
        name: t('Waffo Pancake'),
        value: 'waffo_pancake',
      },
      ...catfkOptions,
      {
        iconName: 'LuCreditCard',
        label: t('Custom Epay payment identifier'),
        name: t('Custom Epay payment identifier'),
        value: '__custom_epay__',
      },
    ],
    [catfkOptions, t]
  )
  const getPaymentTypeOption = (value: string) =>
    paymentTypeOptions.find((option) => option.value === value)
  const form = useForm<PaymentMethodDialogFormValues>({
    resolver: zodResolver(paymentMethodDialogSchema),
    defaultValues: {
      name: '',
      type: '',
      custom_type: '',
      channel_id: '',
      icon: '',
      min_topup: '',
      fee_percent: '0',
      show_topup_notice: true,
      show_topup_link: true,
      topup_notice_text: '',
      topup_link_image: '',
    },
  })

  const selectedPaymentType = form.watch('type')
  const customType = form.watch('custom_type')
  const resolvedPaymentType =
    selectedPaymentType === '__custom_epay__'
      ? customType.trim()
      : selectedPaymentType
  const iconValue = form.watch('icon')
  const showTopupNotice = form.watch('show_topup_notice')
  const showTopupLink = form.watch('show_topup_link')
  const topupLinkImage = form.watch('topup_link_image')
  const topupLinkImagePreview = isHttpsUrl(topupLinkImage.trim())
    ? topupLinkImage.trim()
    : ''

  useEffect(() => {
    if (editData) {
      const knownType =
        ['alipay', 'wxpay', 'stripe', 'waffo_pancake'].includes(
          editData.type
        ) || editData.type.startsWith('catfk_')
      const legacyCatfkMethod = editData.type === 'catfk'
      let initialType = '__custom_epay__'
      if (knownType) initialType = editData.type
      if (legacyCatfkMethod) initialType = ''
      form.reset({
        name: editData.name,
        type: initialType,
        custom_type: knownType || legacyCatfkMethod ? '' : editData.type,
        channel_id: editData.channel_id ?? '',
        icon: editData.icon ?? getDefaultIconName(editData.type),
        min_topup: editData.min_topup ?? '',
        fee_percent: editData.fee_percent ?? '0',
        show_topup_notice: editData.show_topup_notice !== 'false',
        show_topup_link: editData.show_topup_link !== 'false',
        topup_notice_text: editData.topup_notice_text ?? '',
        topup_link_image: editData.topup_link_image ?? '',
      })
    } else {
      form.reset({
        name: '',
        type: '',
        custom_type: '',
        channel_id: '',
        icon: '',
        min_topup: '',
        fee_percent: '0',
        show_topup_notice: true,
        show_topup_link: true,
        topup_notice_text: '',
        topup_link_image: '',
      })
    }
  }, [editData, form, open])

  const handleSubmit = (values: PaymentMethodDialogFormValues) => {
    const type =
      values.type === '__custom_epay__'
        ? values.custom_type.trim()
        : values.type
    const data: PaymentMethodData = {
      name: values.name,
      type,
      show_topup_notice: String(values.show_topup_notice),
      show_topup_link: String(values.show_topup_link),
    }
    if (type.startsWith('catfk_') && values.channel_id) {
      data.channel_id = values.channel_id
    }
    if (editData?.color) {
      data.color = editData.color
    }
    if (values.icon && values.icon.trim() !== '') {
      data.icon = values.icon.trim()
    }
    if (values.min_topup && values.min_topup.trim() !== '') {
      data.min_topup = values.min_topup
    }
    if (!type.startsWith('catfk')) {
      data.fee_percent = values.fee_percent.trim() || '0'
    }
    if (values.topup_notice_text?.trim()) {
      data.topup_notice_text = values.topup_notice_text.trim()
    }
    if (values.topup_link_image.trim()) {
      data.topup_link_image = values.topup_link_image.trim()
    }
    onSave(data)
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? t('Edit payment method') : t('Add payment method')}
      description={t('Configure a payment method for user recharge options.')}
      contentClassName='sm:max-w-[500px]'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={PAYMENT_METHOD_FORM_ID}>
            {isEditMode ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={PAYMENT_METHOD_FORM_ID}
          onSubmit={form.handleSubmit(handleSubmit)}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('Payment method display name')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Display name for this payment method.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Payment type key')}</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (!value) return
                    const currentIcon = form.getValues('icon')?.trim()
                    const currentName = form.getValues('name')?.trim()
                    const previousOption =
                      getPaymentTypeOption(selectedPaymentType)
                    const nextOption = getPaymentTypeOption(value)
                    field.onChange(value)
                    if (value !== '__custom_epay__') {
                      form.setValue('custom_type', '')
                      form.setValue('channel_id', nextOption?.channelID ?? '')
                    } else {
                      form.setValue('channel_id', '')
                      if (
                        resolvedPaymentType &&
                        resolvedPaymentType !== '__custom_epay__'
                      ) {
                        form.setValue('custom_type', resolvedPaymentType)
                      }
                    }
                    if (
                      nextOption?.iconName &&
                      (!currentIcon || currentIcon === previousOption?.iconName)
                    ) {
                      form.setValue('icon', nextOption.iconName, {
                        shouldDirty: true,
                      })
                    }
                    if (
                      nextOption?.name &&
                      (!currentName || currentName === previousOption?.name)
                    ) {
                      form.setValue('name', nextOption.name, {
                        shouldDirty: true,
                      })
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger aria-label={t('Payment type key')}>
                      <SelectValue placeholder={t('Select payment type')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent
                    alignItemWithTrigger={false}
                    className='w-[min(28rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]'
                  >
                    {paymentTypeOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className='[&_[data-slot=select-item-text]]:break-words [&_[data-slot=select-item-text]]:whitespace-normal'
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription className='leading-relaxed'>
                  {t('Choose the payment provider.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {selectedPaymentType === '__custom_epay__' && (
            <FormField
              control={form.control}
              name='custom_type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Custom Epay payment type key')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t('Enter payment type key')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name='icon'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Icon')}</FormLabel>
                <FormControl>
                  <div className='flex items-center gap-2'>
                    <Input
                      placeholder={t('Icon name or HTTPS image URL')}
                      {...field}
                      className='flex-1'
                    />
                    {iconValue?.trim() &&
                      getPaymentIcon(
                        resolvedPaymentType,
                        'text-muted-foreground size-5 shrink-0',
                        iconValue,
                        form.watch('name')
                      )}
                  </div>
                </FormControl>
                <FormDescription>
                  {t(
                    'Enter a react-icons component name or an https image URL. Invalid values show no icon.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='min_topup'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Minimum top-up (optional)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    step='0.01'
                    placeholder={t('e.g., 50')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t('Optional minimum recharge amount for this method.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {resolvedPaymentType && !resolvedPaymentType.startsWith('catfk') && (
            <FormField
              control={form.control}
              name='fee_percent'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Display fee (%)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={0}
                      max={100}
                      step='0.01'
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Added only to the amount shown on the confirmation page.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className='space-y-3'>
            <FormField
              control={form.control}
              name='show_topup_notice'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between gap-4 rounded-lg border p-3'>
                  <div className='space-y-1'>
                    <FormLabel>{t('Show compatibility notice')}</FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='topup_notice_text'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Custom notice text')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t(
                        'e.g., USDT payments may take a few minutes to confirm.'
                      )}
                      disabled={!showTopupNotice}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='show_topup_link'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between gap-4 rounded-lg border p-3'>
                  <div className='space-y-1'>
                    <FormLabel>{t('Show top-up link')}</FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name='topup_link_image'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Top-up link image URL')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='https://example.com/images/topup.png'
                      disabled={!showTopupLink}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  {showTopupLink && topupLinkImagePreview && (
                    <div className='bg-muted/30 flex justify-center rounded-lg border p-3'>
                      <ConfiguredImage
                        src={topupLinkImagePreview}
                        alt={t('Top-up link image preview')}
                        className='h-12 max-w-full rounded-lg object-contain'
                        loading='lazy'
                        fallback={
                          <span className='text-muted-foreground text-xs'>
                            {t('Image not available')}
                          </span>
                        }
                      />
                    </div>
                  )}
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </Dialog>
  )
}
