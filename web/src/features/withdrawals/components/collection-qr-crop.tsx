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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  clampCropRect,
  cropCollectionQr,
  getCropMinSize,
  resizeCropRect,
  squareFromDrag,
  type CropRect,
} from '@/features/withdrawals/lib/collection-qr-crop'
import { validateCollectionQr } from '@/features/withdrawals/lib/validation'

type DragMode = 'draw' | 'move' | 'resize'

const cornerPosition: Record<string, string> = {
  nw: 'top-0 left-0',
  ne: 'top-0 right-0',
  sw: 'bottom-0 left-0',
  se: 'right-0 bottom-0',
}

interface DragState {
  mode: DragMode
  corner: string
  pointerId: number
  startX: number
  startY: number
  startRect: CropRect | null
}

interface CollectionQrCropProps {
  file: File
  onCropReady: (file: File | null) => void
  onError: (message: string) => void
  onCropping: (cropping: boolean) => void
}

export function CollectionQrCrop(props: CollectionQrCropProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [rect, setRect] = useState<CropRect | null>(null)
  const [cropping, setCropping] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const version = useRef(0)
  const callbacks = useRef(props)
  callbacks.current = props

  useEffect(() => {
    const next = URL.createObjectURL(props.file)
    setUrl(next)
    setRect(null)
    setNatural({ width: 0, height: 0 })
    return () => URL.revokeObjectURL(next)
  }, [props.file])

  const geo =
    natural.width && natural.height
      ? {
          width: natural.width,
          height: natural.height,
          minSize: getCropMinSize(natural.width, natural.height),
        }
      : null

  const commit = async (next: CropRect) => {
    const id = ++version.current
    setCropping(true)
    callbacks.current.onCropping(true)
    callbacks.current.onError('')
    callbacks.current.onCropReady(null)
    try {
      const cropped = await cropCollectionQr(props.file, next)
      await validateCollectionQr(cropped)
      if (id !== version.current) return
      callbacks.current.onCropReady(cropped)
    } catch (cause) {
      if (id !== version.current) return
      callbacks.current.onError(
        cause instanceof Error ? cause.message : 'Collection QR cropping failed'
      )
    } finally {
      if (id === version.current) {
        setCropping(false)
        callbacks.current.onCropping(false)
      }
    }
  }

  const updateRect = (next: CropRect) => {
    setRect(next)
    if (geo) void commit(next)
  }

  const point = (event: React.PointerEvent) => {
    const box = wrapper.current?.getBoundingClientRect()
    if (!box || !geo || box.width === 0 || box.height === 0) return null
    return {
      x: ((event.clientX - box.left) / box.width) * geo.width,
      y: ((event.clientY - box.top) / box.height) * geo.height,
    }
  }

  const start = (event: React.PointerEvent, mode: DragMode, corner: string) => {
    if (!geo) return
    const current = point(event)
    if (!current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = {
      mode,
      corner,
      pointerId: event.pointerId,
      startX: current.x,
      startY: current.y,
      startRect: rect,
    }
    if (mode === 'draw') {
      const next = squareFromDrag(current, current, geo)
      setRect(next)
      callbacks.current.onCropReady(null)
      callbacks.current.onError('')
    }
  }

  const move = (event: React.PointerEvent) => {
    const state = drag.current
    const current = point(event)
    if (!state || !current || !geo) return
    const dx = current.x - state.startX
    const dy = current.y - state.startY
    if (state.mode === 'draw') {
      setRect(
        squareFromDrag({ x: state.startX, y: state.startY }, current, geo)
      )
      return
    }
    if (!state.startRect) return
    if (state.mode === 'move') {
      setRect(
        clampCropRect(
          {
            x: state.startRect.x + dx,
            y: state.startRect.y + dy,
            size: state.startRect.size,
          },
          geo
        )
      )
      return
    }
    setRect(resizeCropRect(state.startRect, state.corner, dx, dy, geo))
  }

  const end = () => {
    const state = drag.current
    drag.current = null
    if (!state) return
    setRect((current) => {
      if (current && geo) void commit(current)
      return current
    })
  }

  const nudge = (event: React.KeyboardEvent) => {
    if (!rect || !geo) return
    const step = event.shiftKey ? 8 : 1
    const deltas: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }
    const delta = deltas[event.key]
    if (!delta) return
    event.preventDefault()
    if (event.shiftKey) {
      const size = Math.max(geo.minSize, rect.size + delta.x + delta.y)
      updateRect(
        clampCropRect(
          { x: rect.x + rect.size - size, y: rect.y + rect.size - size, size },
          geo
        )
      )
      return
    }
    updateRect(
      clampCropRect(
        { x: rect.x + delta.x, y: rect.y + delta.y, size: rect.size },
        geo
      )
    )
  }

  const style =
    rect && geo
      ? {
          left: `${(rect.x / geo.width) * 100}%`,
          top: `${(rect.y / geo.height) * 100}%`,
          width: `${(rect.size / geo.width) * 100}%`,
          height: `${(rect.size / geo.height) * 100}%`,
        }
      : undefined

  return (
    <div className='space-y-2'>
      <div
        ref={wrapper}
        role='group'
        tabIndex={0}
        aria-label={t('QR code crop area')}
        aria-describedby='collection-qr-crop-help'
        className='relative touch-none overflow-hidden rounded-md border bg-black/5 outline-none select-none focus-visible:ring-3'
        onKeyDown={nudge}
        onPointerDown={(event) => start(event, 'draw', 'se')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        {url ? (
          <img
            src={url}
            alt={t('Collection QR code preview')}
            draggable={false}
            className='block h-auto w-full select-none'
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />
        ) : null}
        {rect ? (
          <div
            data-slot='qr-crop-selection'
            className='absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]'
            style={style}
            onPointerDown={(event) => {
              event.stopPropagation()
              start(event, 'move', '')
            }}
          >
            {['nw', 'ne', 'sw', 'se'].map((corner) => (
              <span
                key={corner}
                data-corner={corner}
                aria-hidden='true'
                className={`absolute -m-1.5 size-3 rounded-full border-2 border-white bg-black/60 ${cornerPosition[corner]}`}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  start(event, 'resize', corner)
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
      <p id='collection-qr-crop-help' className='text-muted-foreground text-xs'>
        {t(
          'Drag on the image to select a square area around the QR code. Drag the selection to move it, drag a corner to resize, or use the arrow keys.'
        )}
      </p>
      {cropping ? <p role='status'>{t('Cropping image...')}</p> : null}
    </div>
  )
}
