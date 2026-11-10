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

const FENCE_START_PATTERN = /^\s{0,3}(`{3,}|~{3,})([^\n]*)$/
const FENCE_END_PATTERN = /^\s{0,3}(`{3,}|~{3,})\s*$/
const HTML_LANGUAGES = new Set(['html', 'htm', 'svg'])
const LANGUAGE_ALIASES: Record<string, string> = {
  csharp: 'c#',
  golang: 'go',
  js: 'javascript',
  md: 'markdown',
  mdx: 'markdown',
  shell: 'bash',
  shellscript: 'bash',
  ts: 'typescript',
}

const HTML_DOCUMENT_PATTERN =
  /^\s*(<!doctype\s+html|<!DOCTYPE\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i

export type MessageSegment = {
  key: string
  kind: 'markdown' | 'code'
  content: string
  language: string
  isOpen: boolean
}

export function normalizeSegmentLanguage(language: string): string {
  const normalized = language.trim().toLowerCase().split(/\s+/)[0] ?? ''
  return LANGUAGE_ALIASES[normalized] ?? normalized
}

export function isHtmlLanguage(language: string): boolean {
  return HTML_LANGUAGES.has(normalizeSegmentLanguage(language))
}

export function isHtmlContent(content: string, language: string): boolean {
  return isHtmlLanguage(language) || HTML_DOCUMENT_PATTERN.test(content)
}

export function hasHtmlPreview(segment: MessageSegment): boolean {
  return (
    segment.kind === 'code' && isHtmlContent(segment.content, segment.language)
  )
}

function getFenceMarker(line: string): { char: string; length: number } | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/)
  if (!match) return null
  return { char: match[1][0], length: match[1].length }
}

function isClosingFence(
  line: string,
  marker: { char: string; length: number }
): boolean {
  const candidate = getFenceMarker(line)
  const endMatch = line.match(FENCE_END_PATTERN)
  return Boolean(
    endMatch &&
    candidate &&
    candidate.char === marker.char &&
    candidate.length >= marker.length
  )
}

/**
 * Split a response into prose and fenced-code segments. Streaming responses can
 * end with an unclosed fence, so the trailing block is marked `isOpen`.
 */
export function splitMessageSegments(content: string): MessageSegment[] {
  const lines = content.split('\n')
  const segments: MessageSegment[] = []
  let proseLines: string[] = []
  let codeLines: string[] = []
  let marker: { char: string; length: number } | null = null
  let language = ''

  const flushProse = () => {
    const text = proseLines.join('\n').trim()
    if (text) {
      segments.push({
        key: `markdown-${segments.length}`,
        kind: 'markdown',
        content: text,
        language: 'markdown',
        isOpen: false,
      })
    }
    proseLines = []
  }

  const flushCode = (isOpen: boolean) => {
    segments.push({
      key: `code-${segments.length}`,
      kind: 'code',
      content: codeLines.join('\n'),
      language: normalizeSegmentLanguage(language) || 'plaintext',
      isOpen,
    })
    codeLines = []
    language = ''
    marker = null
  }

  for (const line of lines) {
    if (!marker) {
      const startMatch = line.match(FENCE_START_PATTERN)
      const startMarker = getFenceMarker(line)
      if (startMatch && startMarker) {
        flushProse()
        marker = startMarker
        language = startMatch[2].trim()
        continue
      }

      proseLines.push(line)
      continue
    }

    if (isClosingFence(line, marker)) {
      flushCode(false)
      continue
    }

    codeLines.push(line)
  }

  if (marker) {
    flushCode(true)
  } else {
    flushProse()
  }

  return segments
}
