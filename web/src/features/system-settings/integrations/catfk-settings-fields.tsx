import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toIntlLocale } from '@/i18n/languages'
import { api } from '@/lib/api'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { CatFKProductDialog } from './catfk-product-dialog'
import {
  catfkChannelsSchema,
  normalizeCatFKGoodsKey,
  parseCatFKChannels,
  parseCatFKDirectGoodsKeys,
  parseCatFKProducts,
  type CatFKChannel,
  type CatFKMode,
  type CatFKProduct,
} from './catfk-schema'

export type CatFKFormValues = {
  CatFKEnabled: boolean
  CatFKMode?: CatFKMode
  CatFKStoreToken: string
  CatFKMerchantToken?: string
  CatFKProducts: string
  CatFKDirectGoodsKeys?: string
  CatFKAutoRestockMin?: number
  CatFKAutoRestockBatch?: number
  CatFKMaxAmountCNY?: number
  CatFKMaxOrdersPerMinute?: number
  CatFKChannels: string
}

type Props = {
  values: CatFKFormValues
  onChange: (
    key: keyof CatFKFormValues,
    value: string | boolean | number
  ) => void
  onReadChannels?: (token: string) => Promise<CatFKChannel[]>
  complianceConfirmed: boolean
}

export function CatFKSettingsFields(props: Props) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState<CatFKProduct | null>(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState<CatFKProduct | null>(null)
  const [slotDraft, setSlotDraft] = useState('')
  const [slotError, setSlotError] = useState<string | null>(null)
  const [numericDrafts, setNumericDrafts] = useState<
    Partial<
      Record<
        | 'CatFKAutoRestockMin'
        | 'CatFKAutoRestockBatch'
        | 'CatFKMaxAmountCNY'
        | 'CatFKMaxOrdersPerMinute',
        string
      >
    >
  >({})
  const [tokenStatus, setTokenStatus] = useState<{
    configured: boolean
    valid: boolean
    fallback_active: boolean
  } | null>(null)
  const [channelResult, setChannelResult] = useState<{
    token: string
    channels: CatFKChannel[]
  } | null>(null)
  const tokenRef = useRef(props.values.CatFKStoreToken)
  const generation = useRef(0)
  if (tokenRef.current !== props.values.CatFKStoreToken) {
    tokenRef.current = props.values.CatFKStoreToken
    generation.current += 1
  }
  const mode: CatFKMode =
    props.values.CatFKMode === 'direct' || props.values.CatFKMode === 'auto'
      ? props.values.CatFKMode
      : 'redemption'
  const showDirectSection = mode === 'direct' || mode === 'auto'
  const showRedemptionSection = mode === 'redemption' || mode === 'auto'
  const merchantToken = props.values.CatFKMerchantToken ?? ''
  const autoRestockMin = props.values.CatFKAutoRestockMin ?? 5
  const autoRestockBatch = props.values.CatFKAutoRestockBatch ?? 20
  const maxAmountCNY = props.values.CatFKMaxAmountCNY ?? 5000
  const maxOrdersPerMinute = props.values.CatFKMaxOrdersPerMinute ?? 15
  const available =
    channelResult?.token === props.values.CatFKStoreToken
      ? channelResult.channels
      : null
  let products: CatFKProduct[] = []
  let directSlots: string[] = []
  let channels: CatFKChannel[] = []
  let invalid = false
  try {
    products = parseCatFKProducts(props.values.CatFKProducts)
    directSlots = parseCatFKDirectGoodsKeys(
      props.values.CatFKDirectGoodsKeys ?? '[]'
    )
    channels = parseCatFKChannels(props.values.CatFKChannels)
  } catch {
    invalid = true
  }
  const displayChannels = available ?? channels

  const readChannels = useMutation({
    mutationFn: async (request: { token: string; generation: number }) => {
      if (props.onReadChannels) return props.onReadChannels(request.token)
      const response = await api.post<{
        success: boolean
        message?: string
        data: unknown
      }>('/api/option/catfk/channels', { store_token: request.token.trim() })
      return catfkChannelsSchema.parse(requireServerSuccess(response.data).data)
    },
    onSuccess: (nextChannels, request) => {
      if (
        request.generation === generation.current &&
        request.token === tokenRef.current
      ) {
        setChannelResult({ token: request.token, channels: nextChannels })
        props.onChange('CatFKChannels', JSON.stringify(nextChannels))
      }
    },
    onError: (error) => handleServerError(error),
  })

  const resetSlots = useMutation({
    mutationFn: async () => {
      const response = await api.post<{
        success: boolean
        message?: string
        data?: { reset_count?: number }
      }>('/api/option/catfk/slots/reset', {})
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
      }>('/api/option/catfk/merchant-token/check', {
        merchant_token: candidate.trim(),
      })
      return requireServerSuccess(response.data).data
    },
    onSuccess: (result) => {
      if (!result) return
      setTokenStatus(result)
      if (!result.configured) {
        toast.info(t('No Catfk merchant token is configured yet'))
      } else if (result.valid) {
        toast.success(t('Catfk merchant token is valid'))
      } else {
        toast.error(t('Catfk merchant token is invalid or expired'))
      }
    },
    onError: (error) => handleServerError(error),
  })

  let modeDescription = t(
    'Redemption-code mode sells mapped fixed-tier products, requires a QQ number for buyer order lookup on CatFK, and redeems real New API codes.'
  )
  if (mode === 'direct') {
    modeDescription = t(
      'Direct-credit mode supports preset and custom amounts without requiring a QQ number, automatically replenishes placeholder stock, and leaves existing in-flight orders on their original mode.'
    )
  } else if (mode === 'auto') {
    modeDescription = t(
      'Auto fallback mode runs direct-credit by default, silently falls back to redemption-code mode when the merchant token expires, and resumes direct-credit automatically once the token is updated.'
    )
  }

  function handleAddDirectSlot() {
    const normalized = normalizeCatFKGoodsKey(slotDraft)
    if (!normalized) {
      setSlotError(t('Invalid CatFK direct slot settings'))
      return
    }
    if (directSlots.includes(normalized)) {
      setSlotError(t('Direct-credit slot keys must be unique'))
      return
    }
    if (products.some((item) => item.goods_key.trim() === normalized)) {
      setSlotError(
        t(
          'Direct-credit slot keys cannot overlap with redemption product keys'
        )
      )
      return
    }
    setSlotError(null)
    setSlotDraft('')
    props.onChange(
      'CatFKDirectGoodsKeys',
      JSON.stringify([...directSlots, normalized])
    )
  }

  return (
    <div className='space-y-6'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Store payments use live CNY quotes and credit the configured USD balance.'
        )}
      </p>
      <div className='flex items-center justify-between gap-4'>
        <Label htmlFor='catfk-enabled'>{t('Enable Catfk')}</Label>
        <Switch
          id='catfk-enabled'
          checked={props.values.CatFKEnabled}
          disabled={!props.complianceConfirmed}
          onCheckedChange={(value) => props.onChange('CatFKEnabled', value)}
        />
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Disabling CatFK stops new orders only. Existing orders can still be processed.'
        )}
      </p>

      <div className='space-y-2'>
        <Label htmlFor='catfk-mode'>{t('CatFK settlement mode')}</Label>
        <Select
          items={[
            {
              value: 'redemption',
              label: t('Redemption-code verification mode'),
            },
            {
              value: 'direct',
              label: t('Direct-credit & auto-restock mode'),
            },
            {
              value: 'auto',
              label: t(
                'Auto fallback mode (direct first, fallback to redemption)'
              ),
            },
          ]}
          value={mode}
          onValueChange={(value) => {
            if (
              value === 'redemption' ||
              value === 'direct' ||
              value === 'auto'
            ) {
              props.onChange('CatFKMode', value)
            }
          }}
        >
          <SelectTrigger id='catfk-mode' className='w-full sm:max-w-md'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value='redemption'>
                {t('Redemption-code verification mode')}
              </SelectItem>
              <SelectItem value='direct'>
                {t('Direct-credit & auto-restock mode')}
              </SelectItem>
              <SelectItem value='auto'>
                {t('Auto fallback mode (direct first, fallback to redemption)')}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className='text-muted-foreground text-sm'>{modeDescription}</p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='catfk-token'>{t('CatFK store token')}</Label>
        <Input
          id='catfk-token'
          type='password'
          autoComplete='new-password'
          value={props.values.CatFKStoreToken}
          onChange={(event) => {
            props.onChange('CatFKStoreToken', event.target.value)
            props.onChange('CatFKChannels', '[]')
            setChannelResult(null)
          }}
        />
        <p className='text-muted-foreground text-sm'>
          {t(
            'Leave blank to keep the saved store token. Never enter a user session key.'
          )}
        </p>
      </div>

      <div className='space-y-2 sm:max-w-xs'>
        <Label htmlFor='catfk-max-orders-per-minute'>
          {t('Order rate limit (per minute)')}
        </Label>
        <Input
          id='catfk-max-orders-per-minute'
          type='number'
          min={1}
          max={600}
          value={
            numericDrafts.CatFKMaxOrdersPerMinute ?? String(maxOrdersPerMinute)
          }
          onChange={(event) => {
            const raw = event.target.value
            setNumericDrafts((prev) => ({
              ...prev,
              CatFKMaxOrdersPerMinute: raw,
            }))
            const parsed = Number.parseInt(raw, 10)
            if (raw.trim() !== '' && Number.isFinite(parsed) && parsed >= 1) {
              props.onChange('CatFKMaxOrdersPerMinute', parsed)
            }
          }}
          onBlur={() =>
            setNumericDrafts((prev) => {
              const next = { ...prev }
              delete next.CatFKMaxOrdersPerMinute
              return next
            })
          }
        />
        <p className='text-muted-foreground text-sm'>
          {t('Maximum new Catfk orders allowed per user or IP per minute.')}
        </p>
      </div>

      {showDirectSection && (
        <div className='space-y-5'>
          <div className='space-y-2'>
            <Label htmlFor='catfk-merchant-token'>
              {t('CatFK merchant token')}
            </Label>
            <div className='flex flex-wrap gap-2'>
              <Input
                id='catfk-merchant-token'
                type='password'
                autoComplete='new-password'
                value={merchantToken}
                onChange={(event) => {
                  props.onChange('CatFKMerchantToken', event.target.value)
                  if (tokenStatus) setTokenStatus(null)
                }}
                className='min-w-0 flex-1'
              />
              <Button
                type='button'
                variant='outline'
                disabled={checkMerchantToken.isPending}
                onClick={() => checkMerchantToken.mutate(merchantToken)}
              >
                {checkMerchantToken.isPending
                  ? t('Loading...')
                  : t('Check merchant token')}
              </Button>
            </div>
            {tokenStatus && tokenStatus.configured && (
              <p
                role='status'
                className={
                  tokenStatus.valid
                    ? 'text-sm text-green-600'
                    : 'text-destructive text-sm'
                }
              >
                {tokenStatus.valid
                  ? t('Catfk merchant token is valid')
                  : t('Catfk merchant token is invalid or expired')}
              </p>
            )}
            <p className='text-muted-foreground text-sm'>
              {t(
                'Leave blank to keep the saved merchant token. Used only on the server for dynamic slot pricing and placeholder stock replenishment.'
              )}
            </p>
          </div>

          <div className='space-y-3'>
            <h4 className='font-medium'>
              {t('Direct-credit slot goods keys')}
            </h4>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Configure 1–20 dedicated card products in your CatFK store with Contact format set to Any, Purchase limit set to 1, and Storefront visibility set to Hidden.'
              )}
            </p>
            {invalid && (
              <p role='alert'>{t('Invalid CatFK direct slot settings')}</p>
            )}
            <div className='flex flex-wrap gap-2'>
              <Input
                id='catfk-direct-slot-input'
                aria-label={t('Direct-credit slot goods key')}
                placeholder={t(
                  'Enter slot goods key or https://catfk.com/item/...'
                )}
                value={slotDraft}
                disabled={invalid || directSlots.length >= 20}
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
                  invalid || directSlots.length >= 20 || !slotDraft.trim()
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
            {!directSlots.length && (
              <p className='text-muted-foreground text-sm'>
                {t('No direct-credit slots configured')}
              </p>
            )}
            {directSlots.map((slotKey) => (
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
                    props.onChange(
                      'CatFKDirectGoodsKeys',
                      JSON.stringify(
                        directSlots.filter((item) => item !== slotKey)
                      )
                    )
                  }
                >
                  {t('Delete')}
                </Button>
              </div>
            ))}
          </div>

          <div className='grid gap-4 sm:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='catfk-restock-min'>
                {t('Auto-restock threshold')}
              </Label>
              <Input
                id='catfk-restock-min'
                type='number'
                min={1}
                max={1000}
                value={
                  numericDrafts.CatFKAutoRestockMin ?? String(autoRestockMin)
                }
                onChange={(event) => {
                  const raw = event.target.value
                  setNumericDrafts((prev) => ({
                    ...prev,
                    CatFKAutoRestockMin: raw,
                  }))
                  const parsed = Number.parseInt(raw, 10)
                  if (
                    raw.trim() !== '' &&
                    Number.isFinite(parsed) &&
                    parsed >= 1
                  ) {
                    props.onChange('CatFKAutoRestockMin', parsed)
                  }
                }}
                onBlur={() =>
                  setNumericDrafts((prev) => {
                    const next = { ...prev }
                    delete next.CatFKAutoRestockMin
                    return next
                  })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='catfk-restock-batch'>
                {t('Auto-restock batch size')}
              </Label>
              <Input
                id='catfk-restock-batch'
                type='number'
                min={1}
                max={500}
                value={
                  numericDrafts.CatFKAutoRestockBatch ??
                  String(autoRestockBatch)
                }
                onChange={(event) => {
                  const raw = event.target.value
                  setNumericDrafts((prev) => ({
                    ...prev,
                    CatFKAutoRestockBatch: raw,
                  }))
                  const parsed = Number.parseInt(raw, 10)
                  if (
                    raw.trim() !== '' &&
                    Number.isFinite(parsed) &&
                    parsed >= 1
                  ) {
                    props.onChange('CatFKAutoRestockBatch', parsed)
                  }
                }}
                onBlur={() =>
                  setNumericDrafts((prev) => {
                    const next = { ...prev }
                    delete next.CatFKAutoRestockBatch
                    return next
                  })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='catfk-max-amount-cny'>
                {t('Max single payment (CNY)')}
              </Label>
              <Input
                id='catfk-max-amount-cny'
                type='number'
                step='0.01'
                min={1}
                max={1000000}
                value={numericDrafts.CatFKMaxAmountCNY ?? String(maxAmountCNY)}
                onChange={(event) => {
                  const raw = event.target.value
                  setNumericDrafts((prev) => ({
                    ...prev,
                    CatFKMaxAmountCNY: raw,
                  }))
                  const parsed = Number.parseFloat(raw)
                  if (
                    raw.trim() !== '' &&
                    Number.isFinite(parsed) &&
                    parsed >= 1
                  ) {
                    props.onChange('CatFKMaxAmountCNY', parsed)
                  }
                }}
                onBlur={() =>
                  setNumericDrafts((prev) => {
                    const next = { ...prev }
                    delete next.CatFKMaxAmountCNY
                    return next
                  })
                }
              />
            </div>
          </div>

          <div>
            <Button
              type='button'
              variant='outline'
              disabled={resetSlots.isPending}
              onClick={() => resetSlots.mutate()}
            >
              {resetSlots.isPending
                ? t('Processing...')
                : t('Reset quarantined slots')}
            </Button>
          </div>
        </div>
      )}

      {showRedemptionSection && (
        <div className='space-y-3'>
          <h4 className='font-medium'>{t('CatFK product mappings')}</h4>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Selling prices come from live CatFK quotes. Each order buys one code.'
            )}
          </p>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Match each product’s expected credited balance (USD) to an amount option in General. Use the balance value, not the CNY selling price or converted display amount. Unmatched presets cannot use this payment method.'
            )}
          </p>
          {invalid && (
            <p role='alert'>{t('Invalid CatFK mapping configuration')}</p>
          )}
          {!products.length && (
            <p className='text-muted-foreground text-sm'>
              {t('No CatFK products configured')}
            </p>
          )}
          {products.map((product) => (
            <div
              key={product.id}
              className='flex flex-wrap items-center justify-between gap-3 rounded-md border p-3'
            >
              <div className='min-w-0 break-all'>
                <p>
                  {product.name} ({product.id})
                </p>
                <p className='text-muted-foreground text-sm'>
                  {product.goods_key} ·{' '}
                  {formatCurrencyFromUSD(product.amount, {
                    locale: toIntlLocale(
                      i18n.resolvedLanguage || i18n.language
                    ),
                  })}
                </p>
              </div>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  aria-label={t('Edit CatFK product {{name}}', {
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
                  variant='outline'
                  aria-label={t('Delete CatFK product {{name}}', {
                    name: product.name,
                  })}
                  onClick={() => setDeleting(product)}
                >
                  {t('Delete')}
                </Button>
              </div>
            </div>
          ))}
          <Button
            type='button'
            disabled={invalid || products.length >= 100}
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            {t('Add product')}
          </Button>
        </div>
      )}

      <div className='space-y-3'>
        <div>
          <h4 className='font-medium'>{t('Catfk available channels')}</h4>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Channels are enabled by adding their payment methods in General.'
            )}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          disabled={readChannels.isPending}
          onClick={() => {
            setChannelResult(null)
            readChannels.mutate({
              token: props.values.CatFKStoreToken,
              generation: generation.current,
            })
          }}
        >
          {readChannels.isPending ? t('Loading...') : t('Read Catfk channels')}
        </Button>
        {available !== null && !available.length && (
          <p>{t('No Catfk channels returned')}</p>
        )}
        {displayChannels.map((channel) => {
          let paymentIdentifier = t('Unsupported channel')
          if (channel.payment_type === 'wxpay') {
            paymentIdentifier = 'catfk_wxpay'
          } else if (channel.payment_type === 'alipay') {
            paymentIdentifier = 'catfk_alipay'
          }
          return (
            <div
              key={channel.id}
              className='flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm'
            >
              <span className='min-w-0 truncate'>{channel.name}</span>
              <code className='text-muted-foreground shrink-0 text-xs'>
                {paymentIdentifier}
              </code>
            </div>
          )
        })}
      </div>
      <CatFKProductDialog
        open={open}
        onOpenChange={setOpen}
        product={editing}
        products={products}
        onSave={(product) =>
          props.onChange(
            'CatFKProducts',
            JSON.stringify(
              editing
                ? products.map((item) =>
                    item.id === editing.id ? product : item
                  )
                : [...products, product]
            )
          )
        }
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(value) => {
          if (!value) setDeleting(null)
        }}
        title={t('Delete product')}
        desc={t(
          'Remove this CatFK mapping? Existing orders keep their original product snapshot.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={() => {
          props.onChange(
            'CatFKProducts',
            JSON.stringify(products.filter((item) => item.id !== deleting?.id))
          )
          setDeleting(null)
        }}
      />
    </div>
  )
}
