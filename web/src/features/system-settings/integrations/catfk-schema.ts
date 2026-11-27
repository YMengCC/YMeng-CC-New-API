import { z } from 'zod'

export const catfkModeSchema = z.enum(['redemption', 'direct'])
export type CatFKMode = z.infer<typeof catfkModeSchema>

export const catfkProductSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-zA-Z0-9_-]{1,64}$/,
      'Use a stable ID with 1–64 letters, digits, underscores or hyphens'
    ),
  name: z.string().trim().min(1, 'Product name is required').max(200),
  goods_key: z.string().trim().min(1, 'CatFK goods key is required').max(512),
  amount: z
    .number()
    .positive('Expected credit must be greater than zero')
    .max(1000000),
})
export type CatFKProduct = z.infer<typeof catfkProductSchema>

export const catfkChannelSchema = z.object({
  id: z.string().trim().min(1).max(128),
  code: z.string().max(128).optional(),
  name: z.string().trim().min(1).max(200),
  icon: z.string().max(2048).default(''),
  payment_type: z.enum(['alipay', 'wxpay']).optional(),
})
export type CatFKChannel = z.infer<typeof catfkChannelSchema>

export const catfkProductsSchema = z
  .array(catfkProductSchema)
  .max(100)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'CatFK product IDs must be unique'
  )

export const catfkChannelsSchema = z
  .array(catfkChannelSchema)
  .max(100)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'CatFK channel IDs must be unique'
  )

export function normalizeCatFKGoodsKey(raw: string): string | null {
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
    if (
      parsed.protocol !== 'https:' ||
      parsed.host !== 'catfk.com' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null
    }
    const cleanPath = parsed.pathname.replace(/\/$/, '')
    if (!cleanPath.startsWith('/item/')) return null
    const key = cleanPath.slice('/item/'.length)
    return /^[a-zA-Z0-9_-]{1,64}$/.test(key) ? key : null
  } catch {
    return null
  }
}

export const catfkDirectGoodsKeysSchema = z
  .array(z.string())
  .max(20)
  .transform((items, ctx) => {
    const normalized: string[] = []
    const seen = new Set<string>()
    for (const raw of items) {
      const key = normalizeCatFKGoodsKey(raw)
      if (!key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid CatFK direct slot settings',
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

export function parseCatFKProducts(value: string): CatFKProduct[] {
  return catfkProductsSchema.parse(JSON.parse(value))
}

export function parseCatFKChannels(value: string): CatFKChannel[] {
  return catfkChannelsSchema.parse(JSON.parse(value))
}

export function parseCatFKDirectGoodsKeys(value: string): string[] {
  return catfkDirectGoodsKeysSchema.parse(JSON.parse(value))
}
