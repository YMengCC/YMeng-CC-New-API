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
export interface CropRect {
  x: number
  y: number
  size: number
}

export interface CropGeometry {
  minSize: number
  width: number
  height: number
}

export const CROP_MIN_SIZE = 64

export function getCropMinSize(width: number, height: number): number {
  return Math.max(1, Math.min(CROP_MIN_SIZE, width, height))
}

/** Clamp a square so its edges stay inside the image and its side is at least minSize. */
export function clampCropRect(rect: CropRect, geo: CropGeometry): CropRect {
  const size = Math.max(geo.minSize, Math.min(rect.size, geo.width, geo.height))
  return {
    x: Math.max(0, Math.min(rect.x, geo.width - size)),
    y: Math.max(0, Math.min(rect.y, geo.height - size)),
    size,
  }
}

/** Build a square from a drag between two points, keeping it inside the image. */
export function squareFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  geo: CropGeometry
): CropRect {
  const side = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
  let x = end.x >= start.x ? start.x : start.x - side
  let y = end.y >= start.y ? start.y : start.y - side
  x = Math.max(0, x)
  y = Math.max(0, y)
  const size = Math.max(
    geo.minSize,
    Math.min(side, geo.width - x, geo.height - y)
  )
  return clampCropRect({ x, y, size }, geo)
}

/** Resize from a corner, keeping the opposite corner anchored and the square inside the image. */
export function resizeCropRect(
  rect: CropRect,
  corner: string,
  dx: number,
  dy: number,
  geo: CropGeometry
): CropRect {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.size
  const bottom = rect.y + rect.size
  let x = left
  let y = top
  let size = rect.size

  if (corner === 'se') {
    size = Math.max(rect.size + dx, rect.size + dy)
  } else if (corner === 'nw') {
    size = Math.max(rect.size - dx, rect.size - dy)
    x = right - size
    y = bottom - size
  } else if (corner === 'ne') {
    size = Math.max(rect.size + dx, rect.size - dy)
    y = bottom - size
  } else if (corner === 'sw') {
    size = Math.max(rect.size - dx, rect.size + dy)
    x = right - size
  }
  return clampCropRect({ x, y, size }, geo)
}

export async function cropCollectionQr(
  source: Blob,
  rect: CropRect
): Promise<File> {
  const url = URL.createObjectURL(source)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load collection QR code'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = rect.size
    canvas.height = rect.size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Collection QR cropping is unavailable')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, rect.size, rect.size)
    context.drawImage(
      image,
      rect.x,
      rect.y,
      rect.size,
      rect.size,
      0,
      0,
      rect.size,
      rect.size
    )
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('Collection QR cropping is unavailable'))
      }, 'image/png')
    })
    return new File([blob], 'collection-qr.png', { type: 'image/png' })
  } finally {
    URL.revokeObjectURL(url)
  }
}
