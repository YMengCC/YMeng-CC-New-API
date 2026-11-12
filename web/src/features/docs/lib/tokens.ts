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
/**
 * Resolve the site's public API base URL with the same priority as the API
 * keys page: first configured API address → status.server_address → current
 * origin. Trailing slashes are stripped so `{{BASE_URL}}/v1` never doubles up.
 */
export function resolveDocsBaseUrl(
  apiInfoUrl: string | null | undefined,
  serverAddress: string | null | undefined,
  fallbackOrigin: string
): string {
  for (const candidate of [apiInfoUrl, serverAddress, fallbackOrigin]) {
    const trimmed = candidate?.trim()
    if (trimmed) {
      return trimmed.replace(/\/+$/, '')
    }
  }
  return fallbackOrigin.trim().replace(/\/+$/, '')
}

export interface DocsTokens {
  baseUrl: string
  systemName: string
}

/**
 * Substitute authoring tokens in markdown source (prose and code blocks alike).
 * Function replacements keep `$` sequences in values literal.
 */
export function applyDocsTokens(markdown: string, tokens: DocsTokens): string {
  return markdown
    .replaceAll('{{BASE_URL}}', () => tokens.baseUrl)
    .replaceAll('{{SYSTEM_NAME}}', () => tokens.systemName)
}
