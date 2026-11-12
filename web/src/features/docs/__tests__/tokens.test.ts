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
import { describe, expect, it } from 'vitest'

import { applyDocsTokens, resolveDocsBaseUrl } from '../lib/tokens'

describe('resolveDocsBaseUrl', () => {
  it('prefers the first configured API address', () => {
    expect(
      resolveDocsBaseUrl(
        'https://api.example.com',
        'https://server.example.com',
        'https://origin.example.com'
      )
    ).toBe('https://api.example.com')
  })

  it('falls back to server_address when the API address is empty or whitespace', () => {
    expect(
      resolveDocsBaseUrl('', 'https://server.example.com', 'https://origin')
    ).toBe('https://server.example.com')
    expect(
      resolveDocsBaseUrl('   ', 'https://server.example.com', 'https://origin')
    ).toBe('https://server.example.com')
    expect(
      resolveDocsBaseUrl(
        undefined,
        'https://server.example.com',
        'https://origin'
      )
    ).toBe('https://server.example.com')
  })

  it('falls back to the current origin when nothing is configured', () => {
    expect(resolveDocsBaseUrl('', '', 'https://origin.example.com')).toBe(
      'https://origin.example.com'
    )
    expect(
      resolveDocsBaseUrl(null, undefined, 'https://origin.example.com')
    ).toBe('https://origin.example.com')
  })

  it('strips trailing slashes from every source', () => {
    expect(resolveDocsBaseUrl('https://api.example.com/', '', 'x')).toBe(
      'https://api.example.com'
    )
    expect(resolveDocsBaseUrl('', 'https://server.example.com///', 'x')).toBe(
      'https://server.example.com'
    )
    expect(resolveDocsBaseUrl('', '', 'https://origin.example.com/')).toBe(
      'https://origin.example.com'
    )
  })
})

describe('applyDocsTokens', () => {
  const tokens = { baseUrl: 'https://api.example.com', systemName: '示例站点' }

  it('replaces tokens in prose and keeps /v1 and /v1beta suffixes', () => {
    const markdown =
      'OpenAI 兼容地址为 `{{BASE_URL}}/v1`，Gemini 使用 `{{BASE_URL}}/v1beta`。'

    const result = applyDocsTokens(markdown, tokens)

    expect(result).toBe(
      'OpenAI 兼容地址为 `https://api.example.com/v1`，Gemini 使用 `https://api.example.com/v1beta`。'
    )
  })

  it('replaces tokens inside fenced code blocks', () => {
    const markdown = [
      '```bash',
      'curl {{BASE_URL}}/v1/chat/completions \\',
      '  -H "Authorization: Bearer YOUR_API_KEY"',
      '```',
    ].join('\n')

    const result = applyDocsTokens(markdown, tokens)

    expect(result).toContain('curl https://api.example.com/v1/chat/completions')
    expect(result).not.toContain('{{BASE_URL}}')
  })

  it('replaces the brand token everywhere and keeps replacement values literal', () => {
    const markdown =
      '欢迎使用 {{SYSTEM_NAME}}。{{SYSTEM_NAME}} 的地址是 {{BASE_URL}}。'

    const result = applyDocsTokens(markdown, {
      baseUrl: 'https://api.example.com',
      systemName: '站点 $& 名称',
    })

    expect(result).toBe(
      '欢迎使用 站点 $& 名称。站点 $& 名称 的地址是 https://api.example.com。'
    )
  })
})
