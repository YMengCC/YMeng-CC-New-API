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
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { PasswordInput } from '@/components/password-input'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { SettingsCard } from '../components/settings-card'
import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import { JingSoftDirectSlotsSection } from './jingsoft-direct-slots-section'
import { JingSoftModeSelector } from './jingsoft-mode-selector'
import { JingSoftRedemptionProductsSection } from './jingsoft-redemption-products-section'
import {
  extractJingSoftStoreUrlParts,
  jingSoftCompatibilityResultSchema,
  normalizeJingSoftBaseURL,
  normalizeJingSoftMode,
  parseJingSoftChannels,
  parseJingSoftDirectGoodsKeys,
  parseJingSoftProducts,
  type JingSoftChannel,
  type JingSoftCompatibilityResult,
  type JingSoftMode,
  type JingSoftProduct,
} from './jingsoft-schema'

export type JingSoftFormValues = {
  JingSoftEnabled: boolean
  JingSoftMode?: JingSoftMode
  JingSoftBaseURL?: string
  JingSoftStoreToken: string
  JingSoftMerchantToken?: string
  JingSoftProducts: string
  JingSoftDirectGoodsKeys?: string
  JingSoftAutoRestockMin?: number
  JingSoftAutoRestockBatch?: number
  JingSoftMaxAmountCNY?: number
  JingSoftMaxOrdersPerMinute?: number
  JingSoftChannels: string
}

type Props = {
  values: JingSoftFormValues
  availableModes?: readonly JingSoftMode[]
  onChange: (
    key: keyof JingSoftFormValues,
    value: string | boolean | number
  ) => void
  complianceConfirmed: boolean
  presetOptions?: number[]
  priceRatio?: number
  amountDiscounts?: Record<number, number>
  onNavigateToGeneral?: () => void
}

export function JingSoftSettingsFields(props: Props) {
  const { t } = useTranslation()
  const [numericDrafts, setNumericDrafts] = useState<
    Partial<
      Record<
        | 'JingSoftAutoRestockMin'
        | 'JingSoftAutoRestockBatch'
        | 'JingSoftMaxAmountCNY'
        | 'JingSoftMaxOrdersPerMinute',
        string
      >
    >
  >({})
  const [tokenStatus, setTokenStatus] = useState<{
    configured: boolean
    valid: boolean
    fallback_active: boolean
  } | null>(null)
  const [compatibilityStatus, setCompatibilityStatus] =
    useState<JingSoftCompatibilityResult | null>(null)

  const baseUrl = props.values.JingSoftBaseURL ?? ''
  const mode = normalizeJingSoftMode(props.values.JingSoftMode)
  const showDirectSection = mode === 'auto' || mode === 'direct'
  const showRedemptionSection = mode === 'auto' || mode === 'redemption'
  const merchantToken = props.values.JingSoftMerchantToken ?? ''
  const autoRestockMin = props.values.JingSoftAutoRestockMin ?? 5
  const autoRestockBatch = props.values.JingSoftAutoRestockBatch ?? 20
  const maxAmountCNY = props.values.JingSoftMaxAmountCNY ?? 5000
  const maxOrdersPerMinute = props.values.JingSoftMaxOrdersPerMinute ?? 15

  let products: JingSoftProduct[] = []
  let productsInvalid = false
  try {
    products = parseJingSoftProducts(props.values.JingSoftProducts)
  } catch {
    productsInvalid = true
  }

  let directSlots: string[] = []
  let directSlotsInvalid = false
  try {
    directSlots = parseJingSoftDirectGoodsKeys(
      props.values.JingSoftDirectGoodsKeys ?? '[]'
    )
  } catch {
    directSlotsInvalid = true
  }

  let channels: JingSoftChannel[] = []
  let channelsInvalid = false
  try {
    channels = parseJingSoftChannels(props.values.JingSoftChannels)
  } catch {
    channelsInvalid = true
  }

  const checkCompatibility = useMutation({
    mutationFn: async (input: {
      baseUrl: string
      storeToken: string
      merchantToken: string
    }) => {
      const response = await api.post<{
        success: boolean
        message?: string
        data: unknown
      }>('/api/option/jingsoft/compatibility/check', {
        base_url: input.baseUrl.trim(),
        store_token: input.storeToken.trim(),
        merchant_token: input.merchantToken.trim(),
      })
      return jingSoftCompatibilityResultSchema.parse(
        requireServerSuccess(response.data).data
      )
    },
    onSuccess: (result) => {
      setCompatibilityStatus(result)
      if (result.base_url && result.base_url !== baseUrl.trim()) {
        props.onChange('JingSoftBaseURL', result.base_url)
      }
      if (!result.compatible) {
        toast.error(
          t(
            result.message_key ||
              'The target URL did not respond with a compatible JingSoft store API'
          )
        )
      } else if (result.store_verified) {
        toast.success(t('JingSoft store compatibility verified'))
      } else {
        toast.success(
          t(
            result.message_key ||
              'JingSoft store API detected. Enter a store token to verify store channels and products.'
          )
        )
      }
    },
    onError: (error) => {
      setCompatibilityStatus(null)
      handleServerError(error)
    },
  })

  const resetSlots = useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        success: boolean
        message?: string
        data?: { reset_count?: number }
      }>('/api/option/jingsoft/slots/reset', {})
      return requireServerSuccess(response.data).data
    },
    onSuccess: () => {
      toast.success(t('Quarantined slots have been reset'))
    },
    onError: (error) => handleServerError(error),
  })

  const checkMerchantToken = useMutation({
    mutationFn: async (candidate: string) => {
      const response = await api.post<{
        success: boolean
        message?: string
        data?: {
          configured: boolean
          valid: boolean
          fallback_active: boolean
        }
      }>('/api/option/jingsoft/merchant-token/check', {
        base_url: baseUrl.trim(),
        merchant_token: candidate.trim(),
      })
      return requireServerSuccess(response.data).data
    },
    onSuccess: (result) => {
      if (!result) return
      setTokenStatus(result)
      if (!result.configured) {
        toast.info(t('No JingSoft merchant token is configured yet'))
      } else if (result.valid) {
        toast.success(t('JingSoft merchant token is valid'))
      } else {
        toast.error(t('JingSoft merchant token is invalid or expired'))
      }
    },
    onError: (error) => handleServerError(error),
  })

  let tokenStatusTone: 'neutral' | 'success' | 'destructive' = 'neutral'
  let tokenStatusMessage = t('No JingSoft merchant token is configured yet')
  let TokenStatusIcon = Info
  if (tokenStatus?.configured) {
    tokenStatusTone = tokenStatus.valid ? 'success' : 'destructive'
    tokenStatusMessage = tokenStatus.valid
      ? t('JingSoft merchant token is valid')
      : t('JingSoft merchant token is invalid or expired')
    TokenStatusIcon = tokenStatus.valid ? CheckCircle2 : AlertCircle
  }

  return (
    <div className='min-w-0 space-y-5'>
      <SettingsCard
        title={t('Status & settlement mode')}
        description={t(
          'JingSoft Pro uses live CNY quotes and credits the configured USD balance.'
        )}
        contentClassName='space-y-5'
      >
        <SettingsControlGroup>
          <SettingsSwitchField
            controlId='jingsoft-enabled'
            checked={props.values.JingSoftEnabled}
            disabled={!props.complianceConfirmed}
            onCheckedChange={(value) =>
              props.onChange('JingSoftEnabled', value)
            }
            label={t('Enable JingSoft')}
            description={t(
              'Disabling JingSoft stops new orders only. Existing orders can still be processed.'
            )}
            className='py-0.5'
          />
        </SettingsControlGroup>

        <JingSoftModeSelector
          value={mode}
          modes={props.availableModes}
          onChange={(nextMode) => props.onChange('JingSoftMode', nextMode)}
        />
      </SettingsCard>

      <SettingsCard
        title={t('Platform & store credentials')}
        description={t(
          'Enter any HTTPS JingSoft Pro platform URL and click Test compatibility to verify.'
        )}
        contentClassName='space-y-5'
      >
        <div className='min-w-0 space-y-2'>
          <Label htmlFor='jingsoft-base-url'>
            {t('JingSoft platform URL')}
          </Label>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <Input
              id='jingsoft-base-url'
              type='url'
              placeholder='https://wzyp.cn'
              value={baseUrl}
              onChange={(event) => {
                props.onChange('JingSoftBaseURL', event.target.value)
                props.onChange('JingSoftChannels', '[]')
                if (compatibilityStatus) setCompatibilityStatus(null)
              }}
              onPaste={(event) => {
                if (baseUrl.trim()) return
                const pasted = event.clipboardData.getData('text')
                const extracted = extractJingSoftStoreUrlParts(pasted)
                if (!extracted) return
                event.preventDefault()
                props.onChange('JingSoftBaseURL', extracted.baseUrl)
                if (!props.values.JingSoftStoreToken.trim()) {
                  props.onChange('JingSoftStoreToken', extracted.storeToken)
                }
                props.onChange('JingSoftChannels', '[]')
                if (compatibilityStatus) setCompatibilityStatus(null)
              }}
              onBlur={() => {
                const extracted = extractJingSoftStoreUrlParts(baseUrl)
                if (extracted) {
                  props.onChange('JingSoftBaseURL', extracted.baseUrl)
                  if (!props.values.JingSoftStoreToken.trim()) {
                    props.onChange('JingSoftStoreToken', extracted.storeToken)
                  }
                  return
                }
                const normalized = normalizeJingSoftBaseURL(baseUrl)
                if (normalized !== null && normalized !== baseUrl) {
                  props.onChange('JingSoftBaseURL', normalized)
                }
              }}
              className='min-w-0 flex-1'
            />
            <Button
              type='button'
              variant='outline'
              className='w-full shrink-0 sm:w-auto'
              disabled={
                checkCompatibility.isPending ||
                (!baseUrl.trim() &&
                  !extractJingSoftStoreUrlParts(
                    props.values.JingSoftStoreToken
                  ))
              }
              onClick={() => {
                let resolvedBase = baseUrl.trim()
                let resolvedToken = props.values.JingSoftStoreToken.trim()
                const fromBase = extractJingSoftStoreUrlParts(resolvedBase)
                if (fromBase) {
                  resolvedBase = fromBase.baseUrl
                  props.onChange('JingSoftBaseURL', fromBase.baseUrl)
                  if (!resolvedToken) {
                    resolvedToken = fromBase.storeToken
                    props.onChange('JingSoftStoreToken', fromBase.storeToken)
                  }
                } else {
                  const fromToken = extractJingSoftStoreUrlParts(resolvedToken)
                  if (fromToken) {
                    if (!resolvedBase) {
                      resolvedBase = fromToken.baseUrl
                      props.onChange('JingSoftBaseURL', fromToken.baseUrl)
                    }
                    resolvedToken = fromToken.storeToken
                    props.onChange('JingSoftStoreToken', fromToken.storeToken)
                  }
                }
                checkCompatibility.mutate({
                  baseUrl: resolvedBase,
                  storeToken: resolvedToken,
                  merchantToken,
                })
              }}
            >
              {checkCompatibility.isPending
                ? t('Loading...')
                : t('Test compatibility')}
            </Button>
          </div>
          {compatibilityStatus && (
            <div
              role='status'
              className={cn(
                'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed break-words',
                compatibilityStatus.compatible
                  ? 'border-success/30 bg-success/5 text-success'
                  : 'border-destructive/30 bg-destructive/5 text-destructive'
              )}
            >
              {compatibilityStatus.compatible ? (
                <CheckCircle2
                  className='mt-0.5 size-3.5 shrink-0'
                  aria-hidden='true'
                />
              ) : (
                <AlertCircle
                  className='mt-0.5 size-3.5 shrink-0'
                  aria-hidden='true'
                />
              )}
              <span className='min-w-0'>
                {compatibilityStatus.compatible &&
                compatibilityStatus.store_verified
                  ? t(
                      'Compatible JingSoft store "{{shop}}" ({{channels}} payment channels, {{products}} card products)',
                      {
                        shop: compatibilityStatus.shop_name || '-',
                        channels: compatibilityStatus.supported_channel_count,
                        products: compatibilityStatus.product_count,
                      }
                    )
                  : t(
                      compatibilityStatus.message_key ||
                        'The target URL did not respond with a compatible JingSoft store API'
                    )}
              </span>
            </div>
          )}
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Supports pasting a full /shop/... store URL to fill both fields automatically.'
            )}
          </p>
        </div>

        <div className='min-w-0 space-y-2'>
          <Label htmlFor='jingsoft-token'>{t('JingSoft store token')}</Label>
          <PasswordInput
            id='jingsoft-token'
            autoComplete='new-password'
            value={props.values.JingSoftStoreToken}
            onChange={(event) => {
              props.onChange('JingSoftStoreToken', event.target.value)
              props.onChange('JingSoftChannels', '[]')
              if (compatibilityStatus) setCompatibilityStatus(null)
            }}
            onPaste={(event) => {
              if (props.values.JingSoftStoreToken.trim()) return
              const pasted = event.clipboardData.getData('text')
              const extracted = extractJingSoftStoreUrlParts(pasted)
              if (!extracted) return
              event.preventDefault()
              if (!baseUrl.trim()) {
                props.onChange('JingSoftBaseURL', extracted.baseUrl)
              }
              props.onChange('JingSoftStoreToken', extracted.storeToken)
              props.onChange('JingSoftChannels', '[]')
              if (compatibilityStatus) setCompatibilityStatus(null)
            }}
            onBlur={() => {
              const extracted = extractJingSoftStoreUrlParts(
                props.values.JingSoftStoreToken
              )
              if (!extracted) return
              if (!baseUrl.trim()) {
                props.onChange('JingSoftBaseURL', extracted.baseUrl)
              }
              props.onChange('JingSoftStoreToken', extracted.storeToken)
            }}
          />
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Leave blank to keep the saved store token. Never enter a user session key.'
            )}
          </p>
        </div>
      </SettingsCard>

      {showDirectSection && (
        <SettingsCard
          title={
            <span className='inline-flex flex-wrap items-center gap-2'>
              <span>{t('Direct top-up & auto-restock')}</span>
              {mode === 'auto' ? (
                <Badge variant='secondary'>{t('Primary mode')}</Badge>
              ) : null}
            </span>
          }
          description={t(
            'Configure the merchant token, hidden card slots, and automatic placeholder stock replenishment.'
          )}
          contentClassName='space-y-5'
        >
          <div className='min-w-0 space-y-2'>
            <Label htmlFor='jingsoft-merchant-token'>
              {t('JingSoft merchant token')}
            </Label>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <PasswordInput
                id='jingsoft-merchant-token'
                autoComplete='new-password'
                value={merchantToken}
                onChange={(event) => {
                  props.onChange('JingSoftMerchantToken', event.target.value)
                  if (tokenStatus) setTokenStatus(null)
                }}
                className='min-w-0 flex-1'
              />
              <Button
                type='button'
                variant='outline'
                className='w-full shrink-0 sm:w-auto'
                disabled={checkMerchantToken.isPending}
                onClick={() => checkMerchantToken.mutate(merchantToken)}
              >
                {checkMerchantToken.isPending
                  ? t('Loading...')
                  : t('Check merchant token')}
              </Button>
            </div>
            {tokenStatus && (
              <div
                role='status'
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed break-words',
                  tokenStatusTone === 'success' &&
                    'border-success/30 bg-success/5 text-success',
                  tokenStatusTone === 'destructive' &&
                    'border-destructive/30 bg-destructive/5 text-destructive',
                  tokenStatusTone === 'neutral' &&
                    'bg-muted/30 text-muted-foreground'
                )}
              >
                <TokenStatusIcon
                  className='mt-0.5 size-3.5 shrink-0'
                  aria-hidden='true'
                />
                <div className='min-w-0 space-y-0.5'>
                  <p>{tokenStatusMessage}</p>
                  {mode === 'auto' && tokenStatus.fallback_active ? (
                    <p className='text-muted-foreground'>
                      {t(
                        'Auto fallback is currently routing orders to Redemption code top-up.'
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
            <p className='text-muted-foreground text-xs leading-relaxed'>
              {t(
                'Leave blank to keep the saved merchant token. Used only on the server for dynamic slot pricing and placeholder stock replenishment.'
              )}
            </p>
          </div>

          <Separator />

          <JingSoftDirectSlotsSection
            baseUrl={baseUrl}
            merchantToken={merchantToken}
            directSlots={directSlots}
            products={products}
            invalid={directSlotsInvalid}
            onDirectSlotsChange={(nextSlots) =>
              props.onChange(
                'JingSoftDirectGoodsKeys',
                JSON.stringify(nextSlots)
              )
            }
          />

          <Separator />

          <div className='@container/jingsoft-restock min-w-0'>
            <div className='grid grid-cols-1 gap-5 @lg/jingsoft-restock:grid-cols-2'>
              <div className='min-w-0 space-y-2'>
                <Label htmlFor='jingsoft-restock-min'>
                  {t('Auto-restock threshold')}
                </Label>
                <Input
                  id='jingsoft-restock-min'
                  type='number'
                  min={1}
                  max={1000}
                  value={
                    numericDrafts.JingSoftAutoRestockMin ??
                    String(autoRestockMin)
                  }
                  onChange={(event) => {
                    const raw = event.target.value
                    setNumericDrafts((prev) => ({
                      ...prev,
                      JingSoftAutoRestockMin: raw,
                    }))
                    const parsed = Number.parseInt(raw, 10)
                    if (
                      raw.trim() !== '' &&
                      Number.isFinite(parsed) &&
                      parsed >= 1
                    ) {
                      props.onChange('JingSoftAutoRestockMin', parsed)
                    }
                  }}
                  onBlur={() =>
                    setNumericDrafts((prev) => {
                      const next = { ...prev }
                      delete next.JingSoftAutoRestockMin
                      return next
                    })
                  }
                />
                <p className='text-muted-foreground text-xs leading-relaxed'>
                  {t(
                    'Replenish placeholder cards automatically when a slot falls below this stock count.'
                  )}
                </p>
              </div>
              <div className='min-w-0 space-y-2'>
                <Label htmlFor='jingsoft-restock-batch'>
                  {t('Auto-restock batch size')}
                </Label>
                <Input
                  id='jingsoft-restock-batch'
                  type='number'
                  min={1}
                  max={500}
                  value={
                    numericDrafts.JingSoftAutoRestockBatch ??
                    String(autoRestockBatch)
                  }
                  onChange={(event) => {
                    const raw = event.target.value
                    setNumericDrafts((prev) => ({
                      ...prev,
                      JingSoftAutoRestockBatch: raw,
                    }))
                    const parsed = Number.parseInt(raw, 10)
                    if (
                      raw.trim() !== '' &&
                      Number.isFinite(parsed) &&
                      parsed >= 1
                    ) {
                      props.onChange('JingSoftAutoRestockBatch', parsed)
                    }
                  }}
                  onBlur={() =>
                    setNumericDrafts((prev) => {
                      const next = { ...prev }
                      delete next.JingSoftAutoRestockBatch
                      return next
                    })
                  }
                />
                <p className='text-muted-foreground text-xs leading-relaxed'>
                  {t(
                    'Number of placeholder cards generated per automatic replenishment.'
                  )}
                </p>
              </div>
            </div>
          </div>

          <SettingsControlGroup className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0 space-y-0.5'>
              <p className='text-sm font-medium'>
                {t('Slot quarantine recovery')}
              </p>
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {t(
                  'Release Direct top-up slots quarantined after upstream timeouts or readback mismatches.'
                )}
              </p>
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='w-full shrink-0 sm:w-auto'
              disabled={resetSlots.isPending}
              onClick={() => resetSlots.mutate()}
            >
              {resetSlots.isPending
                ? t('Processing...')
                : t('Reset quarantined slots')}
            </Button>
          </SettingsControlGroup>
        </SettingsCard>
      )}

      {showRedemptionSection && (
        <JingSoftRedemptionProductsSection
          baseUrl={baseUrl}
          storeToken={props.values.JingSoftStoreToken}
          products={products}
          directSlots={directSlots}
          invalid={productsInvalid}
          presetOptions={props.presetOptions ?? []}
          priceRatio={props.priceRatio ?? 1}
          amountDiscounts={props.amountDiscounts ?? {}}
          roleBadge={
            mode === 'auto' ? (
              <Badge variant='outline'>{t('Fallback mode')}</Badge>
            ) : undefined
          }
          onProductsChange={(nextProducts) =>
            props.onChange('JingSoftProducts', JSON.stringify(nextProducts))
          }
        />
      )}

      <SettingsCard
        title={
          <span className='inline-flex flex-wrap items-center gap-2'>
            <span>{t('JingSoft available channels')}</span>
            <Badge variant='secondary' className='font-mono text-xs'>
              {channels.length}
            </Badge>
          </span>
        }
        description={t(
          'Channels are refreshed automatically when you save settings. Enable them by adding the matching payment methods in General.'
        )}
        action={
          props.onNavigateToGeneral ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={props.onNavigateToGeneral}
            >
              {t('Configure in General')}
            </Button>
          ) : null
        }
        contentClassName='space-y-3'
      >
        {channelsInvalid && (
          <Alert variant='destructive'>
            <AlertCircle aria-hidden='true' />
            <AlertDescription>
              {t('Invalid JingSoft mapping configuration')}
            </AlertDescription>
          </Alert>
        )}
        {!channels.length ? (
          <Empty className='border py-6'>
            <EmptyHeader>
              <EmptyDescription>
                {t(
                  'No JingSoft channels synced yet. Save settings to read available channels.'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='@container/jingsoft-channels min-w-0'>
            <div className='grid max-h-64 grid-cols-1 gap-2.5 overflow-y-auto pr-1 @xl/jingsoft-channels:grid-cols-2'>
              {channels.map((channel) => {
                let paymentIdentifier: string | null = null
                if (channel.payment_type === 'wxpay') {
                  paymentIdentifier = 'jingsoft_wxpay'
                } else if (channel.payment_type === 'alipay') {
                  paymentIdentifier = 'jingsoft_alipay'
                }
                return (
                  <div
                    key={channel.id}
                    className='bg-muted/15 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm'
                  >
                    <span className='min-w-0 font-medium break-words'>
                      {channel.name}
                    </span>
                    {paymentIdentifier ? (
                      <code className='bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-xs'>
                        {paymentIdentifier}
                      </code>
                    ) : (
                      <StatusBadge
                        variant='neutral'
                        copyable={false}
                        label={t('Unsupported channel')}
                        className='shrink-0 text-xs'
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title={t('Risk & rate limits')}
        description={t(
          'Protect your storefront from oversized single orders and automated request bursts.'
        )}
      >
        <div className='@container/jingsoft-risk min-w-0'>
          <div className='grid grid-cols-1 gap-5 @lg/jingsoft-risk:grid-cols-2 @lg/jingsoft-risk:items-start'>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='jingsoft-max-amount-cny'>
                {t('Max single payment (CNY)')}
              </Label>
              <Input
                id='jingsoft-max-amount-cny'
                type='number'
                step='0.01'
                min={1}
                max={1000000}
                value={
                  numericDrafts.JingSoftMaxAmountCNY ?? String(maxAmountCNY)
                }
                onChange={(event) => {
                  const raw = event.target.value
                  setNumericDrafts((prev) => ({
                    ...prev,
                    JingSoftMaxAmountCNY: raw,
                  }))
                  const parsed = Number.parseFloat(raw)
                  if (
                    raw.trim() !== '' &&
                    Number.isFinite(parsed) &&
                    parsed >= 1
                  ) {
                    props.onChange('JingSoftMaxAmountCNY', parsed)
                  }
                }}
                onBlur={() =>
                  setNumericDrafts((prev) => {
                    const next = { ...prev }
                    delete next.JingSoftMaxAmountCNY
                    return next
                  })
                }
              />
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {t(
                  'Maximum CNY total allowed for a single Direct top-up order.'
                )}
              </p>
            </div>

            <div className='min-w-0 space-y-2'>
              <Label htmlFor='jingsoft-max-orders-per-minute'>
                {t('Order rate limit (per minute)')}
              </Label>
              <Input
                id='jingsoft-max-orders-per-minute'
                type='number'
                min={1}
                max={600}
                value={
                  numericDrafts.JingSoftMaxOrdersPerMinute ??
                  String(maxOrdersPerMinute)
                }
                onChange={(event) => {
                  const raw = event.target.value
                  setNumericDrafts((prev) => ({
                    ...prev,
                    JingSoftMaxOrdersPerMinute: raw,
                  }))
                  const parsed = Number.parseInt(raw, 10)
                  if (
                    raw.trim() !== '' &&
                    Number.isFinite(parsed) &&
                    parsed >= 1
                  ) {
                    props.onChange('JingSoftMaxOrdersPerMinute', parsed)
                  }
                }}
                onBlur={() =>
                  setNumericDrafts((prev) => {
                    const next = { ...prev }
                    delete next.JingSoftMaxOrdersPerMinute
                    return next
                  })
                }
              />
              <p className='text-muted-foreground text-xs leading-relaxed'>
                {t(
                  'Maximum new JingSoft orders allowed per user or IP per minute.'
                )}
              </p>
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
