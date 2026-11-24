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
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

interface HeroParticlesProps {
  className?: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  depth: number
  baseAlpha: number
  phase: number
  twinkleSpeed: number
  hueVariant: number
}

const DESKTOP_MIN_WIDTH = 1024
const TABLET_MIN_WIDTH = 768
const POINTER_RADIUS = 155
const LINK_DISTANCE_DESKTOP = 112
const LINK_DISTANCE_TABLET = 92

function createParticle(
  width: number,
  height: number,
  index: number
): Particle {
  // Deterministic-looking initial spread mixed with organic variance
  const depth = 0.4 + ((index * 37) % 61) / 100
  const speedScale = 0.14 + depth * 0.22
  const angle = ((index * 137.5) % 360) * (Math.PI / 180)
  return {
    x: Math.random() * Math.max(width, 1),
    y: Math.random() * Math.max(height, 1),
    vx: Math.cos(angle) * speedScale,
    vy: Math.sin(angle) * speedScale - 0.06 * depth,
    radius: 0.9 + depth * 1.35,
    depth,
    baseAlpha: 0.14 + depth * 0.24,
    phase: (index * 0.85) % (Math.PI * 2),
    twinkleSpeed: 0.008 + ((index * 19) % 14) * 0.001,
    hueVariant: index % 2,
  }
}

function getTargetCount(width: number, finePointer: boolean): number {
  if (!finePointer || width < TABLET_MIN_WIDTH) return 14
  if (width < DESKTOP_MIN_WIDTH) return 26
  return 42
}

function isPaperSide(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  if (width >= DESKTOP_MIN_WIDTH) {
    const seamRatio = 0.48 - 0.14 * (y / Math.max(height, 1))
    return x < width * seamRatio
  }
  return y > height * 0.56
}

export function HeroParticles(props: HeroParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const desktopPointerQuery = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (min-width: 768px)'
    )

    let width = 0
    let height = 0
    let dpr = 1
    let canvasLeft = 0
    let canvasTop = 0
    let frameId = 0
    let inView = true
    let pointerActive = false
    let pointerX = -9999
    let pointerY = -9999
    let finePointer = desktopPointerQuery.matches
    let particles: Particle[] = []

    const syncBounds = () => {
      const rect = canvas.getBoundingClientRect()
      canvasLeft = rect.left
      canvasTop = rect.top
      const nextWidth = Math.max(Math.round(rect.width), 1)
      const nextHeight = Math.max(Math.round(rect.height), 1)
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2)

      if (
        nextWidth === width &&
        nextHeight === height &&
        nextDpr === dpr &&
        particles.length > 0
      ) {
        return
      }

      width = nextWidth
      height = nextHeight
      dpr = nextDpr
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = getTargetCount(width, finePointer)
      if (particles.length === 0) {
        particles = Array.from({ length: count }, (_, i) =>
          createParticle(width, height, i)
        )
      } else if (particles.length > count) {
        particles.length = count
      } else {
        while (particles.length < count) {
          particles.push(createParticle(width, height, particles.length))
        }
      }
    }

    const updateScrollOffset = () => {
      const rect = canvas.getBoundingClientRect()
      canvasLeft = rect.left
      canvasTop = rect.top
    }

    const canRun = () =>
      !reducedMotionQuery.matches && !document.hidden && inView

    const draw = () => {
      frameId = 0
      if (!canRun()) return

      ctx.clearRect(0, 0, width, height)
      const isDark = document.documentElement.classList.contains('dark')
      let linkDistance = 0
      if (finePointer && width >= DESKTOP_MIN_WIDTH) {
        linkDistance = LINK_DISTANCE_DESKTOP
      } else if (finePointer && width >= TABLET_MIN_WIDTH) {
        linkDistance = LINK_DISTANCE_TABLET
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.phase += p.twinkleSpeed
        p.x += p.vx
        p.y += p.vy

        if (finePointer && pointerActive) {
          const dx = p.x - pointerX
          const dy = p.y - pointerY
          const distSq = dx * dx + dy * dy
          if (distSq > 1 && distSq < POINTER_RADIUS * POINTER_RADIUS) {
            const dist = Math.sqrt(distSq)
            const force = (1 - dist / POINTER_RADIUS) * 0.35 * p.depth
            p.x += (dx / dist) * force
            p.y += (dy / dist) * force
          }
        }

        if (p.x < -12) p.x = width + 12
        else if (p.x > width + 12) p.x = -12
        if (p.y < -12) p.y = height + 12
        else if (p.y > height + 12) p.y = -12
      }

      // Subtle constellation filaments on the developer console side
      if (linkDistance > 0) {
        const linkDistSq = linkDistance * linkDistance
        ctx.lineWidth = 0.6
        for (let i = 0; i < particles.length; i++) {
          const a = particles[i]
          const aOnPaper = isPaperSide(a.x, a.y, width, height)
          if (aOnPaper) continue

          for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j]
            if (isPaperSide(b.x, b.y, width, height)) continue
            const dx = a.x - b.x
            const dy = a.y - b.y
            const distSq = dx * dx + dy * dy
            if (distSq < linkDistSq) {
              const ratio = 1 - Math.sqrt(distSq) / linkDistance
              const lineAlpha = ratio * (isDark ? 0.11 : 0.085)
              ctx.strokeStyle = isDark
                ? `rgba(129, 140, 248, ${lineAlpha.toFixed(3)})`
                : `rgba(79, 70, 229, ${lineAlpha.toFixed(3)})`
              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.stroke()
            }
          }

          if (pointerActive) {
            const pdx = a.x - pointerX
            const pdy = a.y - pointerY
            const pDistSq = pdx * pdx + pdy * pdy
            const tetherLimit = POINTER_RADIUS * 0.85
            if (pDistSq < tetherLimit * tetherLimit) {
              const ratio = 1 - Math.sqrt(pDistSq) / tetherLimit
              const tetherAlpha = ratio * (isDark ? 0.18 : 0.13)
              ctx.strokeStyle = isDark
                ? `rgba(147, 197, 253, ${tetherAlpha.toFixed(3)})`
                : `rgba(59, 130, 246, ${tetherAlpha.toFixed(3)})`
              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(pointerX, pointerY)
              ctx.stroke()
            }
          }
        }
      }

      // Render luminous motes
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const paper = isPaperSide(p.x, p.y, width, height)
        const twinkle = 0.72 + 0.28 * Math.sin(p.phase)
        let alpha = p.baseAlpha * twinkle

        if (finePointer && pointerActive) {
          const dx = p.x - pointerX
          const dy = p.y - pointerY
          const distSq = dx * dx + dy * dy
          if (distSq < POINTER_RADIUS * POINTER_RADIUS) {
            const boost = 1 - Math.sqrt(distSq) / POINTER_RADIUS
            alpha = Math.min(0.55, alpha + boost * 0.22)
          }
        }

        let rgb = '96, 165, 250'
        if (paper) {
          rgb = isDark ? '232, 188, 118' : '198, 142, 62'
        } else if (p.hueVariant === 1) {
          rgb = isDark ? '167, 139, 250' : '124, 58, 237'
        } else {
          rgb = isDark ? '96, 165, 250' : '37, 99, 235'
        }

        ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()

        if (p.depth > 0.78) {
          ctx.fillStyle = `rgba(${rgb}, ${(alpha * 0.22).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius * 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      frameId = requestAnimationFrame(draw)
    }

    const startLoop = () => {
      if (!frameId && canRun()) {
        frameId = requestAnimationFrame(draw)
      }
    }

    const stopLoop = () => {
      if (frameId) {
        cancelAnimationFrame(frameId)
        frameId = 0
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer || event.pointerType === 'touch') return
      pointerX = event.clientX - canvasLeft
      pointerY = event.clientY - canvasTop
      pointerActive =
        pointerX >= -40 &&
        pointerX <= width + 40 &&
        pointerY >= -40 &&
        pointerY <= height + 40
    }

    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget) return
      pointerActive = false
    }

    const handlePointerMediaChange = () => {
      finePointer = desktopPointerQuery.matches
      if (!finePointer) {
        pointerActive = false
      }
      syncBounds()
    }

    const handleReducedMotionChange = () => {
      if (reducedMotionQuery.matches) {
        stopLoop()
        ctx.clearRect(0, 0, width, height)
      } else {
        syncBounds()
        startLoop()
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLoop()
      } else {
        startLoop()
      }
    }

    if (!reducedMotionQuery.matches) {
      syncBounds()
      startLoop()
    }

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(syncBounds)
      resizeObserver.observe(canvas)
    } else {
      window.addEventListener('resize', syncBounds, { passive: true })
    }

    let intersectionObserver: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          inView = entry.isIntersecting
          if (inView) startLoop()
          else stopLoop()
        },
        { threshold: 0 }
      )
      intersectionObserver.observe(canvas)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerout', handlePointerOut, { passive: true })
    window.addEventListener('scroll', updateScrollOffset, { passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    desktopPointerQuery.addEventListener('change', handlePointerMediaChange)
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange)

    return () => {
      stopLoop()
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      window.removeEventListener('resize', syncBounds)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerout', handlePointerOut)
      window.removeEventListener('scroll', updateScrollOffset)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      desktopPointerQuery.removeEventListener(
        'change',
        handlePointerMediaChange
      )
      reducedMotionQuery.removeEventListener(
        'change',
        handleReducedMotionChange
      )
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden='true'
      data-home-particles=''
      className={cn(
        'pointer-events-none absolute inset-0 -z-[5] h-full w-full [mask-image:radial-gradient(ellipse_92%_88%_at_50%_46%,black_58%,transparent_100%)]',
        props.className
      )}
    />
  )
}
