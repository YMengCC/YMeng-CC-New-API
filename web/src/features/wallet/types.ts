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
// ============================================================================
// Wallet Type Definitions
// ============================================================================

/**
 * Generic API response
 */
export interface ApiResponse<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

/**
 * Standard API response types
 */
export type TopupInfoResponse = ApiResponse<TopupInfo>
export type RedemptionResponse = ApiResponse<number>
export type AmountResponse = ApiResponse<string>
export type PaymentResponse = ApiResponse<Record<string, unknown>> & {
  url?: string
}
export type StripePaymentResponse = ApiResponse<{ pay_link: string }>
export type AffiliateCodeResponse = ApiResponse<string>
export type AffiliateTransferResponse = ApiResponse
export type CreemPaymentResponse = ApiResponse<{ checkout_url: string }>
export type WaffoPaymentResponse = ApiResponse<
  { payment_url?: string } | string
>
export type BEpusdtPaymentResponse = ApiResponse<
  { payment_url?: string; order_id?: string; trade_id?: string } | string
>
export type WaffoPancakePaymentResponse = ApiResponse<
  | {
      checkout_url?: string
      session_id?: string
      expires_at?: number | string
      order_id?: string
      // Self-service session token + expiry — surfaced by the backend so
      // future flows (refund / cancel from new-api's own UI) can use them
      // without re-issuing checkout. Not consumed by the current handler.
      token?: string
      token_expires_at?: number | string
    }
  | string
>

/**
 * Creem product configuration
 */
export interface CreemProduct {
  /** Product display name */
  name: string
  /** Creem product ID */
  productId: string
  /** Product price */
  price: number
  /** Quota amount to credit */
  quota: number
  /** Currency (USD or EUR) */
  currency: 'USD' | 'EUR'
}

/**
 * Creem payment request
 */
export interface CreemPaymentRequest {
  /** Creem product ID */
  product_id: string
  /** Payment method identifier */
  payment_method: 'creem'
}

/**
 * Payment method configuration
 */
export interface PaymentMethod {
  /** Display name of payment method */
  name: string
  /** Payment method type identifier */
  type: string
  /** Legacy optional color for UI display */
  color?: string
  /** Minimum topup amount for this payment method */
  min_topup?: number
  /** Display-only fee percentage for this payment method */
  fee_percent?: number
  /** Upstream JingSoft channel ID selected for this payment method */
  channel_id?: string
  /** Optional react-icons component name or safe icon URL */
  icon?: string
  /** Whether to show the compatibility notice in the confirmation dialog */
  show_topup_notice?: boolean
  /** Whether to show the external top-up link in the confirmation dialog */
  show_topup_link?: boolean
  /** Optional custom notice shown in the confirmation dialog */
  topup_notice_text?: string
  /** Optional HTTPS image URL used for the external top-up link */
  topup_link_image?: string
}

/**
 * Waffo payment method configuration
 */
export interface WaffoPayMethod {
  /** Display name of payment method */
  name: string
  /** Optional icon path */
  icon?: string
  /** Waffo pay method type */
  payMethodType?: string
  /** Waffo pay method name */
  payMethodName?: string
}

/**
 * BEpusdt public payment method configuration
 */
export interface BEpusdtPayMethod {
  /** Display name of payment method */
  name: string
  /** Optional react-icons component name or HTTPS icon URL */
  icon?: string
  /** BEpusdt trade type or "cashier" */
  trade_type: string
  /** Optional per-method minimum top-up amount */
  min_topup?: number
  /** Optional channel index bound in General PayMethods */
  channel_id?: string
}

/**
 * Topup configuration information
 */
export interface JingSoftProduct {
  id: string
  name: string
  /** USD credit added to the wallet; one fixed product per order. */
  amount: number
}

export interface JingSoftChannel {
  id: string
  name: string
  icon?: string
  payment_type?: 'alipay' | 'wxpay'
}

export interface JingSoftInfo {
  enabled: boolean
  available: boolean
  mode?: 'direct' | 'redemption'
  configured_mode?: 'auto' | 'direct' | 'redemption'
  available_modes?: Array<'auto' | 'direct' | 'redemption'>
  fallback_active?: boolean
  max_amount_cny?: number
  unavailable_reason?: string
  products: JingSoftProduct[]
  channels: JingSoftChannel[]
}

export interface JingSoftQuote {
  quote_id: string
  amount: number
  currency: string
  topup_amount: number
  mode?: 'direct' | 'redemption'
  product_id?: string
  /** Included in amount; fee_rate is its percentage of the goods price. */
  fee?: number
  fee_rate?: number
}

export interface JingSoftPaymentStatusOrder {
  tradeNo: string
  amount: number
  status: string
  /** Display name of the payment channel the buyer chose, such as Alipay. */
  channelName: string
  /** JingSoft payment method returned by the backend, when available. */
  paymentMethod?: string
  paymentQrCode: string | null
  /** What the buyer pays, fee included, from the confirmed quote. */
  payment: Pick<JingSoftQuote, 'amount' | 'fee' | 'fee_rate'>
}

export interface JingSoftOrder {
  trade_no: string
  status: string
  mode?: 'redemption' | 'direct'
  payment_method?: string
  /** Scanned to pay; the payment page itself is never opened in the browser. */
  payment_qr_code?: string
}

export interface JingSoftRedemption {
  key: string
  quota: number
  redeemed_time: number
}

export interface JingSoftQuoteRequest {
  product_id?: string
  amount?: number
  channel_id: string
}

export interface JingSoftPayRequest extends JingSoftQuoteRequest {
  quote_id: string
  qq: string
  idempotency_key: string
}

export interface TopupInfo {
  jingsoft?: JingSoftInfo
  /** Whether online topup is enabled */
  enable_online_topup: boolean
  /** Whether Stripe topup is enabled */
  enable_stripe_topup: boolean
  /** Available payment methods */
  pay_methods: PaymentMethod[]
  /** Minimum topup amount for online topup */
  min_topup: number
  /** Minimum topup amount for Stripe */
  stripe_min_topup: number
  /** Preset amount options */
  amount_options: number[]
  /** Discount rates by amount */
  discount: Record<number, number>
  /** Optional topup link for purchasing codes */
  topup_link?: string
  /** Whether Creem topup is enabled */
  enable_creem_topup?: boolean
  /** Available Creem products */
  creem_products?: CreemProduct[]
  /** Whether Waffo topup is enabled */
  enable_waffo_topup?: boolean
  /** Available Waffo payment methods */
  waffo_pay_methods?: WaffoPayMethod[]
  /** Minimum topup amount for Waffo */
  waffo_min_topup?: number
  /** Whether Waffo Pancake topup is enabled */
  enable_waffo_pancake_topup?: boolean
  /** Minimum topup amount for Waffo Pancake */
  waffo_pancake_min_topup?: number
  /** Whether BEpusdt topup is enabled */
  enable_bepusdt_topup?: boolean
  /** Whether redemption code usage is enabled */
  enable_redemption?: boolean
  /** Whether compliance confirmation has been completed */
  payment_compliance_confirmed?: boolean
  /** Current compliance terms version */
  payment_compliance_terms_version?: string
}

/**
 * Preset amount option with optional discount
 */
export interface PresetAmount {
  /** Preset amount value */
  value: number
  /** Optional discount rate (0-1) */
  discount?: number
}

/**
 * Redemption code request
 */
export interface RedemptionRequest {
  /** Redemption code key */
  key: string
}

/**
 * Payment request parameters
 */
export interface PaymentRequest {
  /** Topup amount */
  amount: number
  /** Payment method identifier */
  payment_method: string
}

/**
 * Waffo payment request parameters
 */
export interface WaffoPaymentRequest {
  /** Topup amount */
  amount: number
  /** Optional server-side Waffo payment method index */
  pay_method_index?: number
}

/**
 * Waffo Pancake payment request parameters
 */
export interface WaffoPancakePaymentRequest {
  /** Topup amount */
  amount: number
}

/**
 * BEpusdt payment request parameters
 */
export interface BEpusdtPaymentRequest {
  /** Topup amount */
  amount: number
  /** Server-side BEpusdt payment method index */
  pay_method_index?: number
  /** Prefixed BEpusdt payment identifier (e.g. "bepusdt_usdt.trc20" or "bepusdt_cashier") */
  payment_method?: string
  /** Optional channel index bound in General PayMethods */
  channel_id?: string
}

/**
 * Amount calculation request
 */
export interface AmountRequest {
  /** Topup amount to calculate */
  amount: number
  /** Optional server-side payment method index (used by BEpusdt) */
  pay_method_index?: number
  /** Optional prefixed BEpusdt payment identifier */
  payment_method?: string
  /** Optional channel index bound in General PayMethods */
  channel_id?: string
}

/**
 * Affiliate quota transfer request
 */
export interface AffiliateTransferRequest {
  /** Quota amount to transfer */
  quota: number
}

/**
 * User wallet data
 */
export interface UserWalletData {
  /** User ID */
  id: number
  /** Username */
  username: string
  /** Current quota balance */
  quota: number
  /** Total used quota */
  used_quota: number
  /** Total request count */
  request_count: number
  /** Affiliate quota available for transfer (compat alias of invite_quota) */
  aff_quota: number
  /** Affiliate commission balance available for transfer */
  invite_quota?: number
  /** Total affiliate quota earned (historical) */
  aff_history_quota: number
  /** Number of successful affiliate invites */
  aff_count: number
  /** User group */
  group: string
}

/**
 * Topup record status
 */
export type TopupStatus = 'success' | 'pending' | 'failed' | 'expired'

export interface BillingHistoryFilters {
  page?: number
  pageSize?: number
  orderType?: string
  status?: TopupStatus
  startDate?: string
  endDate?: string
  orderNo?: string
}

/**
 * Topup billing record
 */
export interface TopupRecord {
  /** Record ID */
  id: number
  /** User ID */
  user_id: number
  /** Topup amount (quota) */
  amount: number
  /** Payment amount (actual money paid) */
  money: number
  /** Trade/order number */
  trade_no: string
  /** Payment method type */
  payment_method: string
  payment_provider?: string
  jingsoft_mode?: 'redemption' | 'direct'
  /** Creation timestamp */
  create_time: number
  /** Completion timestamp */
  complete_time?: number
  /** Payment status */
  status: TopupStatus
}

/**
 * Billing history response
 */
export interface BillingHistoryResponse {
  items: TopupRecord[]
  total: number
}

/**
 * Today's credited recharge amount for all users (root only).
 */
export interface TodayTopUpAmount {
  /** Amount in immutable 1/1,000,000 credited-balance units */
  amount: number
}

/**
 * Complete order request (admin only)
 */
export interface CompleteOrderRequest {
  trade_no: string
}
