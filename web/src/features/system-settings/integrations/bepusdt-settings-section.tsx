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
import { ExternalLink, Lightbulb, Loader2, PlugZap, Plus } from 'lucide-react'
import { type SetStateAction, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  BEPUSDT_CASHIER_TRADE_TYPE,
  formatBEpusdtPaymentType,
} from '@/features/wallet/constants'
import { getPaymentIcon } from '@/features/wallet/lib/ui'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsCard } from '../components/settings-card'
import {
  SettingsControlGroup,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import { BEPUSDT_PROJECT_URL, BEpusdtSetupGuide } from './bepusdt-setup-guide'

export interface BEpusdtSettingsValues {
  BEpusdtEnabled: boolean
  BEpusdtApiUrl: string
  BEpusdtApiToken: string
  BEpusdtFiat: string
  BEpusdtUnitPrice: number
  BEpusdtMinTopUp: number
  BEpusdtTimeout: number
  BEpusdtRate: string
  BEpusdtNotifyUrl: string
  BEpusdtReturnUrl: string
  BEpusdtPayMethods: string
}

export interface BEpusdtPayMethodConfig {
  name: string
  icon?: string
  trade_type: string
  address?: string
  currencies?: string
  rate?: string
  min_topup?: number
}

export type BEpusdtFieldValues = Omit<
  BEpusdtSettingsValues,
  'BEpusdtPayMethods'
>

const BEPUSDT_FIAT_OPTIONS = [
  { value: 'CNY', labelKey: 'CNY (Chinese Yuan)' },
  { value: 'USD', labelKey: 'USD (US Dollar)' },
  { value: 'EUR', labelKey: 'EUR (Euro)' },
  { value: 'GBP', labelKey: 'GBP (British Pound)' },
  { value: 'JPY', labelKey: 'JPY (Japanese Yen)' },
] as const

const BEPUSDT_TRADE_TYPE_OPTIONS = [
  { value: 'usdt.trc20', label: 'USDT (TRC20) — usdt.trc20' },
  { value: 'usdt.erc20', label: 'USDT (ERC20) — usdt.erc20' },
  { value: 'usdt.bep20', label: 'USDT (BEP20 / BSC) — usdt.bep20' },
  { value: 'usdt.polygon', label: 'USDT (Polygon) — usdt.polygon' },
  { value: 'usdt.arbitrum', label: 'USDT (Arbitrum One) — usdt.arbitrum' },
  { value: 'usdt.xlayer', label: 'USDT (X-Layer) — usdt.xlayer' },
  { value: 'usdt.solana', label: 'USDT (Solana) — usdt.solana' },
  { value: 'usdt.aptos', label: 'USDT (Aptos) — usdt.aptos' },
  { value: 'usdt.plasma', label: 'USDT (Plasma) — usdt.plasma' },
  { value: 'usdt.ton', label: 'USDT (TON) — usdt.ton' },
  { value: 'usdc.trc20', label: 'USDC (TRC20) — usdc.trc20' },
  { value: 'usdc.erc20', label: 'USDC (ERC20) — usdc.erc20' },
  { value: 'usdc.bep20', label: 'USDC (BEP20 / BSC) — usdc.bep20' },
  { value: 'usdc.polygon', label: 'USDC (Polygon) — usdc.polygon' },
  { value: 'usdc.arbitrum', label: 'USDC (Arbitrum One) — usdc.arbitrum' },
  { value: 'usdc.base', label: 'USDC (Base) — usdc.base' },
  { value: 'usdc.xlayer', label: 'USDC (X-Layer) — usdc.xlayer' },
  { value: 'usdc.solana', label: 'USDC (Solana) — usdc.solana' },
  { value: 'usdc.aptos', label: 'USDC (Aptos) — usdc.aptos' },
  { value: 'tron.trx', label: 'TRX (Tron) — tron.trx' },
  { value: 'ethereum.eth', label: 'ETH (Ethereum) — ethereum.eth' },
  { value: 'bsc.bnb', label: 'BNB (BSC) — bsc.bnb' },
  { value: 'ton.gram', label: 'TON (TON Network) — ton.gram' },
] as const

const KNOWN_BEPUSDT_TRADE_TYPES = new Set<string>(
  BEPUSDT_TRADE_TYPE_OPTIONS.map((item) => item.value)
)

const CUSTOM_TRADE_TYPE_VALUE = '__custom_trade_type__'

interface BEpusdtMethodFormState {
  name: string
  mode: 'transaction' | 'cashier'
  tradeTypeSelect: string
  customTradeType: string
  address: string
  currencies: string
  rate: string
  icon: string
  minTopUp: string
}

const emptyMethodForm: BEpusdtMethodFormState = {
  name: '',
  mode: 'transaction',
  tradeTypeSelect: 'usdt.trc20',
  customTradeType: '',
  address: '',
  currencies: '',
  rate: '',
  icon: 'SiTether',
  minTopUp: '',
}

function isCashierTradeType(tradeType: string): boolean {
  const trimmed = tradeType.trim()
  return trimmed === '' || trimmed === BEPUSDT_CASHIER_TRADE_TYPE
}

function maskWalletAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length <= 16) return trimmed
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`
}

interface BEpusdtSettingsSectionProps {
  values: BEpusdtSettingsValues
  tokenConfigured: boolean
  complianceConfirmed?: boolean
  callbackOrigin?: string
  onValueChange: <K extends keyof BEpusdtFieldValues>(
    key: K,
    value: BEpusdtFieldValues[K]
  ) => void
  payMethods: BEpusdtPayMethodConfig[]
  onPayMethodsChange: (value: SetStateAction<BEpusdtPayMethodConfig[]>) => void
  onNavigateToGeneral?: () => void
}

export function BEpusdtSettingsSection(props: BEpusdtSettingsSectionProps) {
  const { t } = useTranslation()
  const [testing, setTesting] = useState(false)
  const [methodDialogOpen, setMethodDialogOpen] = useState(false)
  const [editingIdx, setEditingIdx] = useState(-1)
  const [methodForm, setMethodForm] =
    useState<BEpusdtMethodFormState>(emptyMethodForm)

  const defaultWebhookUrl = useMemo(() => {
    const customOrigin = props.callbackOrigin?.trim().replace(/\/+$/, '')
    if (customOrigin) {
      return `${customOrigin}/api/bepusdt/webhook`
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/api/bepusdt/webhook`
    }
    return '<ServerAddress>/api/bepusdt/webhook'
  }, [props.callbackOrigin])

  const effectiveWebhookUrl =
    props.values.BEpusdtNotifyUrl.trim() || defaultWebhookUrl
  const trimmedApiUrl = props.values.BEpusdtApiUrl.trim()
  const invalidApiUrl =
    trimmedApiUrl.length > 0 && !/^https?:\/\//.test(trimmedApiUrl)
  const invalidTimeout =
    props.values.BEpusdtTimeout !== 0 && props.values.BEpusdtTimeout < 180

  const methodTemplates = useMemo<
    Array<{ label: string; config: BEpusdtPayMethodConfig }>
  >(
    () => [
      {
        label: t('Unified Crypto Cashier (create-order)'),
        config: {
          name: t('Crypto Payment'),
          icon: 'LuCoins',
          trade_type: BEPUSDT_CASHIER_TRADE_TYPE,
          currencies: 'USDT,USDC',
        },
      },
      {
        label: 'USDT (TRC20)',
        config: {
          name: 'USDT (TRC20)',
          icon: 'SiTether',
          trade_type: 'usdt.trc20',
        },
      },
      {
        label: 'USDT (ERC20)',
        config: {
          name: 'USDT (ERC20)',
          icon: 'SiTether',
          trade_type: 'usdt.erc20',
        },
      },
      {
        label: 'USDT (BEP20)',
        config: {
          name: 'USDT (BEP20)',
          icon: 'SiTether',
          trade_type: 'usdt.bep20',
        },
      },
      {
        label: 'USDT (X-Layer)',
        config: {
          name: 'USDT (X-Layer)',
          icon: 'SiTether',
          trade_type: 'usdt.xlayer',
        },
      },
      {
        label: 'USDC (ERC20)',
        config: {
          name: 'USDC (ERC20)',
          icon: 'LuCoins',
          trade_type: 'usdc.erc20',
        },
      },
      {
        label: 'USDT (Polygon)',
        config: {
          name: 'USDT (Polygon)',
          icon: 'SiTether',
          trade_type: 'usdt.polygon',
        },
      },
      {
        label: 'USDT (Arbitrum)',
        config: {
          name: 'USDT (Arbitrum)',
          icon: 'SiTether',
          trade_type: 'usdt.arbitrum',
        },
      },
      {
        label: 'USDT (Solana)',
        config: {
          name: 'USDT (Solana)',
          icon: 'SiTether',
          trade_type: 'usdt.solana',
        },
      },
      {
        label: 'USDT (TON)',
        config: {
          name: 'USDT (TON)',
          icon: 'SiTether',
          trade_type: 'usdt.ton',
        },
      },
    ],
    [t]
  )

  const handleTestConnection = async () => {
    const apiUrl = props.values.BEpusdtApiUrl.trim()
    const apiToken = props.values.BEpusdtApiToken.trim()
    if (!apiUrl) {
      toast.error(t('Please enter the BEpusdt API URL first'))
      return
    }
    if (!apiToken && !props.tokenConfigured) {
      toast.error(t('Please enter the BEpusdt API token first'))
      return
    }
    setTesting(true)
    try {
      const response = await api.post('/api/option/bepusdt/test', {
        api_url: apiUrl,
        api_token: apiToken,
      })
      requireServerSuccess(response.data)
      toast.success(t('BEpusdt connection verified successfully'))
    } catch (error) {
      handleServerError(error, t('BEpusdt connection test failed'))
    } finally {
      setTesting(false)
    }
  }

  const openAddMethod = () => {
    setEditingIdx(-1)
    setMethodForm(emptyMethodForm)
    setMethodDialogOpen(true)
  }

  const openEditMethod = (idx: number) => {
    const target = props.payMethods[idx]
    if (!target) return
    const cashier = isCashierTradeType(target.trade_type)
    const knownType = !cashier && KNOWN_BEPUSDT_TRADE_TYPES.has(target.trade_type)
    let tradeTypeSelect = CUSTOM_TRADE_TYPE_VALUE
    if (cashier) {
      tradeTypeSelect = 'usdt.trc20'
    } else if (knownType) {
      tradeTypeSelect = target.trade_type
    }
    setEditingIdx(idx)
    setMethodForm({
      name: target.name,
      mode: cashier ? 'cashier' : 'transaction',
      tradeTypeSelect,
      customTradeType: cashier || knownType ? '' : target.trade_type,
      address: target.address ?? '',
      currencies: target.currencies ?? '',
      rate: target.rate ?? '',
      icon: target.icon ?? '',
      minTopUp: target.min_topup ? String(target.min_topup) : '',
    })
    setMethodDialogOpen(true)
  }

  const handleInsertTemplate = (config: BEpusdtPayMethodConfig) => {
    props.onPayMethodsChange((prev) => {
      const exists = prev.some(
        (item) =>
          item.name === config.name && item.trade_type === config.trade_type
      )
      if (exists) {
        toast.info(t('This payment method template already exists'))
        return prev
      }
      return [...prev, config]
    })
  }

  const saveMethod = () => {
    const name = methodForm.name.trim()
    if (!name) {
      toast.error(t('Payment method name is required'))
      return
    }
    let tradeType = BEPUSDT_CASHIER_TRADE_TYPE
    if (methodForm.mode === 'transaction') {
      tradeType =
        methodForm.tradeTypeSelect === CUSTOM_TRADE_TYPE_VALUE
          ? methodForm.customTradeType.trim()
          : methodForm.tradeTypeSelect.trim()
      if (!tradeType) {
        toast.error(t('Trade type is required'))
        return
      }
    }

    const parsedMinTopUp = methodForm.minTopUp.trim()
      ? Number(methodForm.minTopUp.trim())
      : 0
    if (
      !Number.isFinite(parsedMinTopUp) ||
      parsedMinTopUp < 0 ||
      !Number.isInteger(parsedMinTopUp)
    ) {
      toast.error(t('Minimum top-up must be a non-negative integer'))
      return
    }

    const nextMethod: BEpusdtPayMethodConfig = {
      name,
      trade_type: tradeType,
    }
    if (methodForm.icon.trim()) {
      nextMethod.icon = methodForm.icon.trim()
    }
    if (methodForm.mode === 'transaction') {
      if (methodForm.address.trim()) {
        nextMethod.address = methodForm.address.trim()
      }
      if (methodForm.rate.trim()) {
        nextMethod.rate = methodForm.rate.trim()
      }
    } else if (methodForm.currencies.trim()) {
      nextMethod.currencies = methodForm.currencies.trim()
    }
    if (parsedMinTopUp > 0) {
      nextMethod.min_topup = parsedMinTopUp
    }

    if (editingIdx === -1) {
      props.onPayMethodsChange((prev) => [...prev, nextMethod])
    } else {
      props.onPayMethodsChange((prev) =>
        prev.map((item, index) => (index === editingIdx ? nextMethod : item))
      )
    }
    setMethodDialogOpen(false)
  }

  return (
    <div className='min-w-0 space-y-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 flex-1 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <h3 className='text-base font-semibold'>{t('BEpusdt')}</h3>
            <StatusBadge
              variant={props.values.BEpusdtEnabled ? 'success' : 'neutral'}
              label={
                props.values.BEpusdtEnabled ? t('Enabled') : t('Disabled')
              }
              showDot
              copyable={false}
              className='text-xs'
            />
            <Badge variant={props.tokenConfigured ? 'secondary' : 'outline'}>
              {props.tokenConfigured
                ? t('Token configured')
                : t('Token not set')}
            </Badge>
          </div>
          <p className='text-muted-foreground text-xs leading-relaxed sm:text-sm'>
            {t(
              'Connect directly to a self-hosted BEpusdt cryptocurrency gateway without Epay as an intermediary.'
            )}{' '}
            <span>{t('Open-source project:')}</span>{' '}
            <a
              href={BEPUSDT_PROJECT_URL}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary inline-flex items-center gap-1 font-medium underline underline-offset-4'
            >
              {BEPUSDT_PROJECT_URL}
              <ExternalLink className='size-3.5' aria-hidden='true' />
            </a>
          </p>
        </div>
        <BEpusdtSetupGuide
          apiUrl={props.values.BEpusdtApiUrl}
          autoOpen={Boolean(props.complianceConfirmed)}
        />
      </div>

      <SettingsCard
        title={t('BEpusdt Gateway')}
        description={t(
          'Configure API credentials, settlement fiat, callback URLs, and payment channels.'
        )}
        action={
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => void handleTestConnection()}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : (
              <PlugZap className='mr-1.5 h-3.5 w-3.5' />
            )}
            {t('Test connection')}
          </Button>
        }
        contentClassName='space-y-5'
      >
        <Alert>
          <AlertDescription className='flex flex-wrap items-center justify-between gap-2 text-xs'>
            <div className='min-w-0 space-y-1'>
              <p className='font-medium'>{t('BEpusdt Callback URL')}</p>
              <p className='text-muted-foreground break-all'>
                <code className='bg-muted rounded px-1.5 py-0.5 font-mono text-xs'>
                  {effectiveWebhookUrl}
                </code>
              </p>
              <p className='text-muted-foreground'>
                {t(
                  'BEpusdt receives this callback URL automatically when orders are created. Ensure your server is publicly reachable by BEpusdt.'
                )}
              </p>
            </div>
            <CopyButton
              value={effectiveWebhookUrl}
              variant='outline'
              size='sm'
              tooltip={t('Copy callback URL')}
            />
          </AlertDescription>
        </Alert>

        <SettingsControlGroup>
          <SettingsSwitchField
            checked={props.values.BEpusdtEnabled}
            onCheckedChange={(checked) =>
              props.onValueChange('BEpusdtEnabled', checked)
            }
            label={t('Enable BEpusdt')}
            description={t(
              'Enable direct cryptocurrency top-up and subscription payments via BEpusdt.'
            )}
            className='py-0.5'
          />
        </SettingsControlGroup>

        <div className='grid gap-4 md:grid-cols-2'>
          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-api-url'>{t('BEpusdt API URL')}</Label>
            <Input
              id='bepusdt-api-url'
              placeholder='https://bepusdt.example.com'
              value={props.values.BEpusdtApiUrl}
              aria-invalid={invalidApiUrl}
              onChange={(event) =>
                props.onValueChange('BEpusdtApiUrl', event.target.value)
              }
            />
            {invalidApiUrl ? (
              <p className='text-destructive text-xs'>
                {t('Invalid BEpusdt API URL')}
              </p>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Base URL of your BEpusdt instance without a trailing slash.'
                )}
              </p>
            )}
          </div>

          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-api-token'>{t('BEpusdt API Token')}</Label>
            <Input
              id='bepusdt-api-token'
              type='password'
              autoComplete='new-password'
              placeholder={
                props.tokenConfigured
                  ? t('Leave blank to keep existing token')
                  : t('Enter BEpusdt auth_token')
              }
              value={props.values.BEpusdtApiToken}
              onChange={(event) =>
                props.onValueChange('BEpusdtApiToken', event.target.value)
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'The auth_token from BEpusdt Admin -> System -> Basic Settings -> API Settings.'
              )}
            </p>
          </div>
        </div>

        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-fiat'>{t('Fiat currency')}</Label>
            <Select
              value={props.values.BEpusdtFiat || 'CNY'}
              onValueChange={(value) => {
                if (value) props.onValueChange('BEpusdtFiat', value)
              }}
            >
              <SelectTrigger id='bepusdt-fiat'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {BEPUSDT_FIAT_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-unit-price'>
              {t('Unit price (0 = follow General)')}
            </Label>
            <Input
              id='bepusdt-unit-price'
              type='number'
              step='0.01'
              min={0}
              value={props.values.BEpusdtUnitPrice}
              onChange={(event) => {
                const parsed = event.target.valueAsNumber
                props.onValueChange(
                  'BEpusdtUnitPrice',
                  event.target.value === '' || !Number.isFinite(parsed)
                    ? 0
                    : parsed
                )
              }}
            />
            <p className='text-muted-foreground text-xs'>
              {t('Fiat price per 1 USD quota; set 0 to use the General Price.')}
            </p>
          </div>

          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-min-topup'>
              {t('Minimum top-up (USD)')}
            </Label>
            <Input
              id='bepusdt-min-topup'
              type='number'
              min={1}
              step={1}
              value={props.values.BEpusdtMinTopUp}
              onChange={(event) => {
                const parsed = event.target.valueAsNumber
                props.onValueChange(
                  'BEpusdtMinTopUp',
                  event.target.value === '' || !Number.isFinite(parsed)
                    ? 1
                    : parsed
                )
              }}
            />
          </div>

          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-timeout'>
              {t('Order timeout (seconds)')}
            </Label>
            <Input
              id='bepusdt-timeout'
              type='number'
              min={0}
              step={60}
              value={props.values.BEpusdtTimeout}
              aria-invalid={invalidTimeout}
              onChange={(event) => {
                const parsed = event.target.valueAsNumber
                props.onValueChange(
                  'BEpusdtTimeout',
                  event.target.value === '' || !Number.isFinite(parsed)
                    ? 0
                    : parsed
                )
              }}
            />
            {invalidTimeout ? (
              <p className='text-destructive text-xs'>
                {t('BEpusdt order timeout must be 0 or at least 180 seconds')}
              </p>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {t('0 uses BEpusdt default; otherwise at least 180 seconds.')}
              </p>
            )}
          </div>
        </div>

        <div className='grid gap-4 md:grid-cols-3'>
          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-rate'>
              {t('Default exchange rate (optional)')}
            </Label>
            <Input
              id='bepusdt-rate'
              placeholder={t('e.g., 7.4 or ~1.02')}
              value={props.values.BEpusdtRate}
              onChange={(event) =>
                props.onValueChange('BEpusdtRate', event.target.value)
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Applies to create-transaction orders; leave blank for BEpusdt automatic rate.'
              )}
            </p>
          </div>

          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-notify-url'>
              {t('Callback notification URL')}
            </Label>
            <Input
              id='bepusdt-notify-url'
              placeholder={defaultWebhookUrl}
              value={props.values.BEpusdtNotifyUrl}
              onChange={(event) =>
                props.onValueChange('BEpusdtNotifyUrl', event.target.value)
              }
            />
          </div>

          <div className='grid min-w-0 gap-1.5'>
            <Label htmlFor='bepusdt-return-url'>
              {t('Payment return URL')}
            </Label>
            <Input
              id='bepusdt-return-url'
              placeholder='https://example.com/wallet?show_history=true'
              value={props.values.BEpusdtReturnUrl}
              onChange={(event) =>
                props.onValueChange('BEpusdtReturnUrl', event.target.value)
              }
            />
          </div>
        </div>

        <Separator />

        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='space-y-0.5'>
            <h4 className='text-sm font-medium'>
              {t('BEpusdt Payment Methods')}
            </h4>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Configure chain-specific (create-transaction) or unified cashier (create-order) channels here, then add their bepusdt_* identifiers in General → Payment methods to display them in the wallet.'
              )}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {props.onNavigateToGeneral ? (
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={props.onNavigateToGeneral}
              >
                {t('Configure in General')}
              </Button>
            ) : null}
            <Popover>
              <PopoverTrigger
                render={<Button type='button' variant='outline' size='sm' />}
              >
                <Lightbulb className='mr-1.5 h-3.5 w-3.5' />
                {t('Templates')}
              </PopoverTrigger>
              <PopoverContent className='w-72 max-w-[calc(100vw-2rem)]'>
                <div className='space-y-2'>
                  <p className='text-muted-foreground text-xs'>
                    {t('Quick insert BEpusdt payment methods')}
                  </p>
                  <div className='max-h-64 space-y-1 overflow-y-auto pr-1'>
                    {methodTemplates.map((item) => (
                      <Button
                        key={`${item.config.trade_type}-${item.label}`}
                        type='button'
                        variant='ghost'
                        className='h-auto min-h-8 w-full justify-start py-1.5 text-left text-sm whitespace-normal'
                        onClick={() => handleInsertTemplate(item.config)}
                      >
                        <Plus className='mr-2 h-3 w-3 shrink-0' />
                        <span className='min-w-0 break-words'>
                          {item.label}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={openAddMethod}
            >
              <Plus className='mr-1 h-3.5 w-3.5' />
              {t('Add payment method')}
            </Button>
          </div>
        </div>

        <StaticDataTable
          data={props.payMethods}
          getRowKey={(method, idx) =>
            `${method.trade_type}-${method.name}-${idx}`
          }
          emptyClassName='text-muted-foreground py-8'
          emptyContent={t(
            'No BEpusdt payment methods configured. Add a method or pick from templates.'
          )}
          columns={[
            {
              id: 'name',
              header: t('Display name'),
              cell: (method) => (
                <div className='flex items-center gap-2'>
                  {getPaymentIcon(
                    'bepusdt',
                    'h-4 w-4 shrink-0',
                    method.icon,
                    method.name
                  )}
                  <span className='font-medium'>{method.name}</span>
                </div>
              ),
            },
            {
              id: 'trade_type',
              header: t('Mode / Trade type'),
              cell: (method) => {
                const paymentTypeKey = formatBEpusdtPaymentType(
                  method.trade_type
                )
                return (
                  <div className='flex flex-col items-start gap-1'>
                    {isCashierTradeType(method.trade_type) ? (
                      <Badge variant='secondary'>{t('Unified cashier')}</Badge>
                    ) : (
                      <code className='bg-muted rounded px-1.5 py-0.5 text-xs'>
                        {method.trade_type}
                      </code>
                    )}
                    <span className='text-muted-foreground font-mono text-[11px]'>
                      {paymentTypeKey}
                    </span>
                  </div>
                )
              },
            },
            {
              id: 'target',
              header: t('Address / Currencies'),
              cell: (method) => {
                if (isCashierTradeType(method.trade_type)) {
                  return method.currencies ? (
                    <span className='font-mono text-xs'>
                      {method.currencies}
                    </span>
                  ) : (
                    <span className='text-muted-foreground text-xs'>
                      {t('All enabled wallets')}
                    </span>
                  )
                }
                return method.address ? (
                  <code
                    className='bg-muted rounded px-1.5 py-0.5 text-xs'
                    title={method.address}
                  >
                    {maskWalletAddress(method.address)}
                  </code>
                ) : (
                  <span className='text-muted-foreground text-xs'>
                    {t('Auto-assigned')}
                  </span>
                )
              },
            },
            {
              id: 'min_topup',
              header: t('Min Top-up'),
              cell: (method) =>
                method.min_topup ? (
                  <span className='font-mono text-xs'>{method.min_topup}</span>
                ) : (
                  <span className='text-muted-foreground text-xs'>—</span>
                ),
            },
            {
              id: 'actions',
              header: t('Actions'),
              className: 'text-right',
              cellClassName: 'text-right',
              cell: (_method, idx) => (
                <StaticRowActions
                  editLabel={t('Edit')}
                  deleteLabel={t('Delete')}
                  menuLabel={t('Open menu')}
                  onEdit={() => openEditMethod(idx)}
                  onDelete={() =>
                    props.onPayMethodsChange((prev) =>
                      prev.filter((_, i) => i !== idx)
                    )
                  }
                />
              ),
            },
          ]}
        />
      </SettingsCard>

      <Dialog
        open={methodDialogOpen}
        onOpenChange={setMethodDialogOpen}
        title={
          editingIdx === -1
            ? t('Add BEpusdt payment method')
            : t('Edit BEpusdt payment method')
        }
        description={t(
          'Configure either a specific trade type (create-transaction) or unified checkout (create-order).'
        )}
        contentClassName='sm:max-w-[520px]'
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setMethodDialogOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='button' onClick={saveMethod}>
              {editingIdx === -1 ? t('Add') : t('Update')}
            </Button>
          </>
        }
      >
        <div className='space-y-4'>
          <div className='grid gap-1.5'>
            <Label htmlFor='bepusdt-method-name' required>
              {t('Display name')}
            </Label>
            <Input
              id='bepusdt-method-name'
              placeholder={t('e.g., USDT (TRC20) or Crypto Payment')}
              value={methodForm.name}
              onChange={(event) =>
                setMethodForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='bepusdt-method-mode'>{t('Order mode')}</Label>
            <Select
              value={methodForm.mode}
              onValueChange={(value) => {
                if (value !== 'transaction' && value !== 'cashier') return
                setMethodForm((prev) => {
                  let nextIcon = prev.icon
                  if (prev.icon === 'SiTether' && value === 'cashier') {
                    nextIcon = 'LuCoins'
                  } else if (
                    prev.icon === 'LuCoins' &&
                    value === 'transaction'
                  ) {
                    nextIcon = 'SiTether'
                  }
                  return {
                    ...prev,
                    mode: value,
                    icon: nextIcon,
                  }
                })
              }}
            >
              <SelectTrigger id='bepusdt-method-mode'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value='transaction'>
                  {t('Specific trade type (create-transaction)')}
                </SelectItem>
                <SelectItem value='cashier'>
                  {t('Unified cashier (create-order)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {methodForm.mode === 'transaction' ? (
            <>
              <div className='grid gap-1.5'>
                <Label htmlFor='bepusdt-method-trade-type'>
                  {t('Trade type')}
                </Label>
                <Select
                  value={methodForm.tradeTypeSelect}
                  onValueChange={(value) => {
                    if (!value) return
                    setMethodForm((prev) => ({
                      ...prev,
                      tradeTypeSelect: value,
                    }))
                  }}
                >
                  <SelectTrigger id='bepusdt-method-trade-type'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {BEPUSDT_TRADE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_TRADE_TYPE_VALUE}>
                      {t('Custom trade type')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {methodForm.tradeTypeSelect === CUSTOM_TRADE_TYPE_VALUE && (
                <div className='grid gap-1.5'>
                  <Label htmlFor='bepusdt-method-custom-trade-type'>
                    {t('Custom trade type')}
                  </Label>
                  <Input
                    id='bepusdt-method-custom-trade-type'
                    placeholder='usdt.trc20'
                    value={methodForm.customTradeType}
                    onChange={(event) =>
                      setMethodForm((prev) => ({
                        ...prev,
                        customTradeType: event.target.value,
                      }))
                    }
                  />
                </div>
              )}

              <div className='grid gap-1.5'>
                <Label htmlFor='bepusdt-method-address'>
                  {t('Receiving wallet address (optional)')}
                </Label>
                <Input
                  id='bepusdt-method-address'
                  placeholder={t('Leave blank for BEpusdt auto-assignment')}
                  value={methodForm.address}
                  onChange={(event) =>
                    setMethodForm((prev) => ({
                      ...prev,
                      address: event.target.value,
                    }))
                  }
                />
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Optional fixed address for this trade type. Leave blank if wallets are managed in BEpusdt admin.'
                  )}
                </p>
              </div>

              <div className='grid gap-1.5'>
                <Label htmlFor='bepusdt-method-rate'>
                  {t('Exchange rate override (optional)')}
                </Label>
                <Input
                  id='bepusdt-method-rate'
                  placeholder={t('e.g., 7.4 or ~1.02')}
                  value={methodForm.rate}
                  onChange={(event) =>
                    setMethodForm((prev) => ({
                      ...prev,
                      rate: event.target.value,
                    }))
                  }
                />
              </div>
            </>
          ) : (
            <div className='grid gap-1.5'>
              <Label htmlFor='bepusdt-method-currencies'>
                {t('Allowed currencies (optional)')}
              </Label>
              <Input
                id='bepusdt-method-currencies'
                placeholder='USDT,USDC'
                value={methodForm.currencies}
                onChange={(event) =>
                  setMethodForm((prev) => ({
                    ...prev,
                    currencies: event.target.value,
                  }))
                }
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Comma-separated whitelist (e.g., USDT,USDC) or blacklist prefixed with - (e.g., -ETH,-BNB). Requires wallets configured in BEpusdt admin.'
                )}
              </p>
            </div>
          )}

          <div className='grid gap-1.5'>
            <Label htmlFor='bepusdt-method-icon'>{t('Icon')}</Label>
            <div className='flex items-center gap-2'>
              <Input
                id='bepusdt-method-icon'
                placeholder={t('Icon name or HTTPS image URL')}
                value={methodForm.icon}
                onChange={(event) =>
                  setMethodForm((prev) => ({
                    ...prev,
                    icon: event.target.value,
                  }))
                }
                className='flex-1'
              />
              {methodForm.icon.trim() &&
                getPaymentIcon(
                  'bepusdt',
                  'text-muted-foreground size-5 shrink-0',
                  methodForm.icon,
                  methodForm.name
                )}
            </div>
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor='bepusdt-method-min-topup'>
              {t('Minimum top-up (optional)')}
            </Label>
            <Input
              id='bepusdt-method-min-topup'
              type='number'
              min={0}
              step={1}
              placeholder={t('e.g., 50')}
              value={methodForm.minTopUp}
              onChange={(event) =>
                setMethodForm((prev) => ({
                  ...prev,
                  minTopUp: event.target.value,
                }))
              }
            />
          </div>
        </div>
      </Dialog>
    </div>
  )
}
