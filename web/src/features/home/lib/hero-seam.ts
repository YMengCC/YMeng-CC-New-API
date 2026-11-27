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
export const HERO_DESKTOP_MIN_WIDTH = 1024
const XL_MIN_WIDTH = 1280
const XXL_MIN_WIDTH = 1536

// Matches `.home-split`'s `--seam-top` / `--seam-bottom` custom properties in
// styles/index.css so particle colors and constellation links switch cleanly on
// the shifted paper seam.
export function getHeroSeamX(y: number, width: number, height: number): number {
  let seamTopPx = 25.5 * 16
  let seamBottomPx = 20.5 * 16
  if (width >= XXL_MIN_WIDTH) {
    seamTopPx = 32 * 16
    seamBottomPx = 24.5 * 16
  } else if (width >= XL_MIN_WIDTH) {
    seamTopPx = 29.5 * 16
    seamBottomPx = 22.5 * 16
  }
  const progress = Math.min(Math.max(y / Math.max(height, 1), 0), 1)
  return seamTopPx - (seamTopPx - seamBottomPx) * progress
}
