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
import {
  BEPUSDT_CASHIER_TRADE_TYPE,
  formatBEpusdtPaymentType,
} from '@/features/wallet/constants'

export interface BEpusdtSettingsValues {
  BEpusdtEnabled: boolean
  BEpusdtApiUrl: string
  BEpusdtApiToken: string
  BEpusdtCallbackAddress: string
  BEpusdtPayMethods: string
}

export function normalizeBEpusdtCallbackOrigin(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    if (!parsed.host || parsed.username || parsed.password) {
      return null
    }
    if (parsed.search || parsed.hash) {
      return null
    }
    if (parsed.pathname && parsed.pathname !== '/') {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

export interface BEpusdtPayMethodConfig {
  trade_type: string
  address?: string
  currencies?: string
}

export type BEpusdtFieldValues = Omit<
  BEpusdtSettingsValues,
  'BEpusdtPayMethods'
>

export const BEPUSDT_TRADE_TYPE_OPTIONS = [
  {
    value: 'usdt.trc20',
    shortLabel: 'USDT (TRC20)',
    label: 'USDT (TRC20) — usdt.trc20',
  },
  {
    value: 'usdt.erc20',
    shortLabel: 'USDT (ERC20)',
    label: 'USDT (ERC20) — usdt.erc20',
  },
  {
    value: 'usdt.bep20',
    shortLabel: 'USDT (BEP20)',
    label: 'USDT (BEP20 / BSC) — usdt.bep20',
  },
  {
    value: 'usdt.polygon',
    shortLabel: 'USDT (Polygon)',
    label: 'USDT (Polygon) — usdt.polygon',
  },
  {
    value: 'usdt.arbitrum',
    shortLabel: 'USDT (Arbitrum)',
    label: 'USDT (Arbitrum One) — usdt.arbitrum',
  },
  {
    value: 'usdt.xlayer',
    shortLabel: 'USDT (X-Layer)',
    label: 'USDT (X-Layer) — usdt.xlayer',
  },
  {
    value: 'usdt.solana',
    shortLabel: 'USDT (Solana)',
    label: 'USDT (Solana) — usdt.solana',
  },
  {
    value: 'usdt.aptos',
    shortLabel: 'USDT (Aptos)',
    label: 'USDT (Aptos) — usdt.aptos',
  },
  {
    value: 'usdt.plasma',
    shortLabel: 'USDT (Plasma)',
    label: 'USDT (Plasma) — usdt.plasma',
  },
  {
    value: 'usdt.ton',
    shortLabel: 'USDT (TON)',
    label: 'USDT (TON) — usdt.ton',
  },
  {
    value: 'usdc.trc20',
    shortLabel: 'USDC (TRC20)',
    label: 'USDC (TRC20) — usdc.trc20',
  },
  {
    value: 'usdc.erc20',
    shortLabel: 'USDC (ERC20)',
    label: 'USDC (ERC20) — usdc.erc20',
  },
  {
    value: 'usdc.bep20',
    shortLabel: 'USDC (BEP20)',
    label: 'USDC (BEP20 / BSC) — usdc.bep20',
  },
  {
    value: 'usdc.polygon',
    shortLabel: 'USDC (Polygon)',
    label: 'USDC (Polygon) — usdc.polygon',
  },
  {
    value: 'usdc.arbitrum',
    shortLabel: 'USDC (Arbitrum)',
    label: 'USDC (Arbitrum One) — usdc.arbitrum',
  },
  {
    value: 'usdc.base',
    shortLabel: 'USDC (Base)',
    label: 'USDC (Base) — usdc.base',
  },
  {
    value: 'usdc.xlayer',
    shortLabel: 'USDC (X-Layer)',
    label: 'USDC (X-Layer) — usdc.xlayer',
  },
  {
    value: 'usdc.solana',
    shortLabel: 'USDC (Solana)',
    label: 'USDC (Solana) — usdc.solana',
  },
  {
    value: 'usdc.aptos',
    shortLabel: 'USDC (Aptos)',
    label: 'USDC (Aptos) — usdc.aptos',
  },
  {
    value: 'tron.trx',
    shortLabel: 'TRX (Tron)',
    label: 'TRX (Tron) — tron.trx',
  },
  {
    value: 'ethereum.eth',
    shortLabel: 'ETH (Ethereum)',
    label: 'ETH (Ethereum) — ethereum.eth',
  },
  {
    value: 'bsc.bnb',
    shortLabel: 'BNB (BSC)',
    label: 'BNB (BSC) — bsc.bnb',
  },
  {
    value: 'ton.gram',
    shortLabel: 'TON',
    label: 'TON (TON Network) — ton.gram',
  },
] as const

const TRADE_TYPE_SHORT_LABELS = new Map<string, string>(
  BEPUSDT_TRADE_TYPE_OPTIONS.map((item) => [item.value, item.shortLabel])
)

export function isBEpusdtCashierTradeType(tradeType: string): boolean {
  const trimmed = tradeType.trim()
  return trimmed === '' || trimmed === BEPUSDT_CASHIER_TRADE_TYPE
}

export function maskBEpusdtWalletAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length <= 16) return trimmed
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`
}

export function getBEpusdtDefaultDisplayName(
  tradeType: string,
  cashierLabel: string
): string {
  const trimmed = tradeType.trim()
  if (isBEpusdtCashierTradeType(trimmed)) {
    return cashierLabel
  }
  return TRADE_TYPE_SHORT_LABELS.get(trimmed.toLowerCase()) ?? trimmed
}

export function getBEpusdtDefaultIconName(tradeType: string): string {
  const trimmed = tradeType.trim().toLowerCase()
  if (isBEpusdtCashierTradeType(trimmed) || !trimmed.startsWith('usdt.')) {
    return 'LuCoins'
  }
  return 'SiTether'
}

export function formatBEpusdtChannelOptionLabel(
  method: BEpusdtPayMethodConfig,
  cashierLabel: string
): string {
  const paymentType = formatBEpusdtPaymentType(method.trade_type)
  const baseName = getBEpusdtDefaultDisplayName(method.trade_type, cashierLabel)
  if (isBEpusdtCashierTradeType(method.trade_type)) {
    const suffix = method.currencies?.trim()
      ? ` · ${method.currencies.trim()}`
      : ''
    return `${baseName}${suffix} (BEpusdt: ${paymentType})`
  }
  const addrSuffix = method.address?.trim()
    ? ` · ${maskBEpusdtWalletAddress(method.address)}`
    : ''
  return `${baseName}${addrSuffix} (BEpusdt: ${paymentType})`
}
