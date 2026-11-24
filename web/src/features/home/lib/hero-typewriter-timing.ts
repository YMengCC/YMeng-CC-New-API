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
export const HERO_HOLD_STEP_MS = 2300
export const HERO_NEXT_PHRASE_DELAY_MS = 340

const PUNCTUATION_CHARS = new Set([
  ',',
  '，',
  '.',
  '。',
  '·',
  '!',
  '！',
  '?',
  '？',
])
const CJK_CHAR_PATTERN = /[\u2E80-\u9FFF\uF900-\uFAFF]/

export function getHeroTypeDelayMs(char: string): number {
  if (PUNCTUATION_CHARS.has(char)) return 175
  if (char === '~') return 55
  if (char === ' ') return 48
  if (CJK_CHAR_PATTERN.test(char)) return 82
  return 65
}

export function getHeroDeleteDelayMs(deletedCount: number): number {
  if (deletedCount < 2) return 48
  if (deletedCount < 5) return 34
  return 22
}
