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
import type { Message, MessageSource } from '../../types'

/**
 * Normalize a citation URL. Only absolute http(s) URLs are accepted, so that
 * javascript:, data: or relative links from upstream never become anchors.
 */
export function toSafeCitationUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

/**
 * Extract URL citations from Chat Completions `annotations`
 * (`message.annotations` or streaming `delta.annotations`).
 */
export function extractUrlCitations(annotations: unknown): MessageSource[] {
  if (!Array.isArray(annotations)) return []

  const sources: MessageSource[] = []
  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== 'object') continue
    const { type, url_citation: citation } = annotation as {
      type?: unknown
      url_citation?: { url?: unknown; title?: unknown }
    }
    if (type !== 'url_citation' || !citation) continue

    const href = toSafeCitationUrl(citation.url)
    if (!href) continue
    const title =
      typeof citation.title === 'string' && citation.title.trim()
        ? citation.title.trim()
        : href
    sources.push({ href, title })
  }

  return mergeMessageSources([], sources)
}

/**
 * Append citations, keeping the first entry seen for each URL.
 */
export function mergeMessageSources(
  current: MessageSource[],
  incoming: MessageSource[]
): MessageSource[] {
  if (incoming.length === 0) return current

  const seen = new Set(current.map((source) => source.href))
  const merged = [...current]
  for (const source of incoming) {
    if (seen.has(source.href)) continue
    seen.add(source.href)
    merged.push(source)
  }

  return merged.length === current.length ? current : merged
}

export function applyMessageSources(
  message: Message,
  sources: MessageSource[]
): Message {
  const merged = mergeMessageSources(message.sources ?? [], sources)
  return merged === message.sources || merged.length === 0
    ? message
    : { ...message, sources: merged }
}
