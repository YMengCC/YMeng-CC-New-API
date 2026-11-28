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
import { z } from 'zod'

export const JINGSOFT_MODES = ['auto', 'direct', 'redemption'] as const
export const DEFAULT_JINGSOFT_MODE = 'auto' as const

export const jingSoftModeSchema = z.enum(JINGSOFT_MODES)
export type JingSoftMode = z.infer<typeof jingSoftModeSchema>

export type JingSoftModeMeta = {
  labelKey: string
  descriptionKey: string
  recommended?: boolean
}

export const JINGSOFT_MODE_META: Record<JingSoftMode, JingSoftModeMeta> = {
  auto: {
    labelKey: 'Auto fallback',
    descriptionKey:
      'Uses Direct top-up by default; automatically falls back to Redemption code top-up if the merchant token expires, and resumes Direct top-up once updated.',
    recommended: true,
  },
  direct: {
    labelKey: 'Direct top-up',
    descriptionKey:
      'Supports preset and custom amounts with no QQ required, auto-replenishes placeholder stock, and keeps existing orders on their original mode.',
  },
  redemption: {
    labelKey: 'Redemption code top-up',
    descriptionKey:
      'Sells mapped fixed-tier products only; buyers enter a QQ number for JingSoft order lookup and receive balance by redeeming real codes.',
  },
}

export function isJingSoftMode(value: unknown): value is JingSoftMode {
  return value === 'auto' || value === 'direct' || value === 'redemption'
}

export function normalizeJingSoftMode(value: unknown): JingSoftMode {
  return isJingSoftMode(value) ? value : DEFAULT_JINGSOFT_MODE
}

export function parseJingSoftModes(raw?: string): JingSoftMode[] {
  if (!raw?.trim()) return [...JINGSOFT_MODES]
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...JINGSOFT_MODES]
    const ordered: JingSoftMode[] = []
    for (const item of parsed) {
      if (isJingSoftMode(item) && !ordered.includes(item)) {
        ordered.push(item)
      }
    }
    for (const fallbackMode of JINGSOFT_MODES) {
      if (!ordered.includes(fallbackMode)) {
        ordered.push(fallbackMode)
      }
    }
    return ordered
  } catch {
    return [...JINGSOFT_MODES]
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname
    .trim()
    .toLowerCase()
    .replaceAll(/^\[|\]$/g, '')
  if (
    !lower ||
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  ) {
    return true
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower)
  if (!ipv4Match) return false
  const parts = ipv4Match.slice(1).map((part) => Number.parseInt(part, 10))
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

export function normalizeJingSoftBaseURL(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (
    trimmed.length > 2048 ||
    trimmed.includes('\r') ||
    trimmed.includes('\n') ||
    trimmed.includes('\0')
  ) {
    return null
  }
  try {
    const parsed = new URL(trimmed)
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      isPrivateOrLocalHost(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null
    }
    const cleanPath = parsed.pathname.replace(/\/$/, '')
    if (cleanPath !== '') return null
    return parsed.origin
  } catch {
    return null
  }
}

export function extractJingSoftStoreUrlParts(
  raw: string
): { baseUrl: string; storeToken: string } | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('https://')) return null
  try {
    const parsed = new URL(trimmed)
    const baseUrl = normalizeJingSoftBaseURL(parsed.origin)
    if (
      !baseUrl ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null
    }
    const cleanPath = parsed.pathname.replace(/\/$/, '')
    if (!cleanPath.startsWith('/shop/')) return null
    const storeToken = cleanPath.slice('/shop/'.length)
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(storeToken)) return null
    return { baseUrl, storeToken }
  } catch {
    return null
  }
}

export function normalizeJingSoftGoodsKey(
  raw: string,
  baseUrl?: string
): string | null {
  const trimmed = raw.trim()
  if (
    !trimmed ||
    trimmed.length > 512 ||
    trimmed.includes('\r') ||
    trimmed.includes('\n') ||
    trimmed.includes('\0')
  ) {
    return null
  }
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    return trimmed
  }
  try {
    const parsed = new URL(trimmed)
    const parsedOrigin = normalizeJingSoftBaseURL(parsed.origin)
    if (
      !parsedOrigin ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null
    }
    if (baseUrl && baseUrl.trim() !== '') {
      const expectedOrigin = normalizeJingSoftBaseURL(baseUrl)
      if (expectedOrigin && parsedOrigin !== expectedOrigin) {
        return null
      }
    }
    const cleanPath = parsed.pathname.replace(/\/$/, '')
    if (!cleanPath.startsWith('/item/')) return null
    const key = cleanPath.slice('/item/'.length)
    return /^[a-zA-Z0-9_-]{1,64}$/.test(key) ? key : null
  } catch {
    return null
  }
}

export const jingSoftProductSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-zA-Z0-9_-]{1,64}$/,
      'Use a stable ID with 1–64 letters, digits, underscores or hyphens'
    ),
  name: z.string().trim().min(1, 'Product name is required').max(200),
  goods_key: z
    .string()
    .trim()
    .min(1, 'JingSoft goods key is required')
    .max(512)
    .refine(
      (val) => normalizeJingSoftGoodsKey(val) !== null,
      'JingSoft goods key is required'
    ),
  amount: z
    .number()
    .positive('Expected credit must be greater than zero')
    .max(1000000),
})
export type JingSoftProduct = z.infer<typeof jingSoftProductSchema>

export const jingSoftChannelSchema = z.object({
  id: z.string().trim().min(1).max(128),
  code: z.string().max(128).optional(),
  name: z.string().trim().min(1).max(200),
  icon: z.string().max(2048).default(''),
  payment_type: z.enum(['alipay', 'wxpay']).optional(),
})
export type JingSoftChannel = z.infer<typeof jingSoftChannelSchema>

export const jingSoftDiscoveredProductSchema = z.object({
  goods_key: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  price_cny: z.string().default(''),
  stock_count: z.number().int().min(0).default(0),
  in_stock: z.boolean().default(false),
  contact_format: z.string().optional(),
  limit_count: z.number().int().optional(),
  compatible: z.boolean().default(true),
})
export type JingSoftDiscoveredProduct = z.infer<
  typeof jingSoftDiscoveredProductSchema
>

export const jingSoftCompatibilityResultSchema = z.object({
  compatible: z.boolean(),
  base_url: z.string(),
  protocol_verified: z.boolean(),
  store_verified: z.boolean(),
  shop_name: z.string().optional(),
  channel_count: z.number().int().default(0),
  supported_channel_count: z.number().int().default(0),
  product_count: z.number().int().default(0),
  merchant_token_checked: z.boolean().default(false),
  merchant_token_valid: z.boolean().default(false),
  message_key: z.string().optional(),
})
export type JingSoftCompatibilityResult = z.infer<
  typeof jingSoftCompatibilityResultSchema
>

export const jingSoftProductsSchema = z
  .array(jingSoftProductSchema)
  .max(100)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'JingSoft product IDs must be unique'
  )

export const jingSoftChannelsSchema = z
  .array(jingSoftChannelSchema)
  .max(100)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'JingSoft channel IDs must be unique'
  )

export const jingSoftDirectGoodsKeysSchema = z
  .array(z.string())
  .max(20)
  .transform((items, ctx) => {
    const normalized: string[] = []
    const seen = new Set<string>()
    for (const raw of items) {
      const key = normalizeJingSoftGoodsKey(raw)
      if (!key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid JingSoft direct slot settings',
        })
        return z.NEVER
      }
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Direct-credit slot keys must be unique',
        })
        return z.NEVER
      }
      seen.add(key)
      normalized.push(key)
    }
    return normalized
  })

export function parseJingSoftProducts(value: string): JingSoftProduct[] {
  return jingSoftProductsSchema.parse(JSON.parse(value))
}

export function parseJingSoftChannels(value: string): JingSoftChannel[] {
  return jingSoftChannelsSchema.parse(JSON.parse(value))
}

export function parseJingSoftDirectGoodsKeys(value: string): string[] {
  return jingSoftDirectGoodsKeysSchema.parse(JSON.parse(value))
}

export function makeUniqueJingSoftProductId(
  preferredKey: string,
  existingIds: Set<string>
): string {
  const sanitized =
    preferredKey.replaceAll(/[^a-zA-Z0-9_-]/g, '_').slice(0, 56) || 'tier'
  if (!existingIds.has(sanitized)) return sanitized
  for (let index = 2; index <= 999; index += 1) {
    const candidate = `${sanitized}_${index}`
    if (!existingIds.has(candidate)) return candidate
  }
  return `${sanitized}_${Date.now() % 10000}`
}

export function inferJingSoftExpectedUSD(
  item: Pick<JingSoftDiscoveredProduct, 'name' | 'price_cny'>,
  presetOptions: number[],
  priceRatio: number,
  discounts: Record<number, number> = {}
): number | null {
  const priceCny = Number.parseFloat(item.price_cny)
  const validPresets = presetOptions.filter(
    (value) => Number.isFinite(value) && value > 0
  )

  if (
    Number.isFinite(priceCny) &&
    priceCny > 0 &&
    Number.isFinite(priceRatio) &&
    priceRatio > 0 &&
    validPresets.length > 0
  ) {
    let bestPreset: number | null = null
    let bestRelativeDiff = Number.POSITIVE_INFINITY
    for (const preset of validPresets) {
      const discount = discounts[preset]
      const effectiveDiscount =
        Number.isFinite(discount) && discount > 0 ? discount : 1
      const expectedCny = preset * priceRatio * effectiveDiscount
      if (expectedCny <= 0) continue
      const absDiff = Math.abs(priceCny - expectedCny)
      const relDiff = absDiff / expectedCny
      if ((absDiff <= 0.05 || relDiff <= 0.03) && relDiff < bestRelativeDiff) {
        bestRelativeDiff = relDiff
        bestPreset = preset
      }
    }
    if (bestPreset !== null) return bestPreset
  }

  // Fallback: match explicit USD / dollar / 刀 tier mention in product title against configured presets.
  const usdTitleMatch =
    /(?:\$\s*|usd\s*)(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:usd|美金|美元|刀)/i.exec(
      item.name
    )
  if (usdTitleMatch) {
    const mentioned = Number.parseFloat(
      usdTitleMatch[1] ?? usdTitleMatch[2] ?? ''
    )
    if (Number.isFinite(mentioned) && mentioned > 0) {
      const matchedPreset = validPresets.find(
        (preset) => Math.abs(preset - mentioned) < 1e-6
      )
      if (matchedPreset !== undefined) return matchedPreset
      if (validPresets.length === 0) return mentioned
    }
  }

  if (
    validPresets.length === 0 &&
    Number.isFinite(priceCny) &&
    priceCny > 0 &&
    Number.isFinite(priceRatio) &&
    priceRatio > 0
  ) {
    const computed = Number((priceCny / priceRatio).toFixed(2))
    return computed > 0 ? computed : null
  }

  return null
}
