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
import { useLayoutEffect } from 'react'

// The attribute contract is documented with the styles ("Home depth" in
// styles/index.css); this file only feeds the --depth-* values.
const TILT_SELECTOR = '[data-depth-tilt], [data-depth-group] > *'
const PARALLAX_SELECTOR = '[data-depth]'
const LAYER_SELECTOR = '[data-depth-layer]'
const SCENE_SELECTOR = '[data-home-scene]'

const PARALLAX_STEP_PX = 3.8
const LAYER_STEP_PX = 2.6
const GROUP_TILT_DEG = 8
const LIFT_PX = 16
const HOVER_RISE_PX = 3.5
const MAGNETIC_PX = 3.5
const PRESS_DEPTH_PX = 6
const PRESS_SCALE = 0.03
// Tilted ancestors of the hovered element tilt too, up to this many.
const MAX_TILT_CHAIN = 3

const TILT_EASE = 0.15
const PARALLAX_EASE = 0.075
const SPOT_EASE = 0.16
const SETTLED = 0.002
const PIXEL_SETTLED = 0.35

interface Pose {
  rx: number
  ry: number
  z: number
  press: number
  nx: number
  ny: number
  glare: number
}

interface TiltState {
  current: Pose
  target: Pose
  layers: HTMLElement[]
}

const REST_POSE: Pose = { rx: 0, ry: 0, z: 0, press: 0, nx: 0, ny: 0, glare: 0 }
const POSE_KEYS = Object.keys(REST_POSE) as (keyof Pose)[]

const TILT_PROPERTIES = [
  '--depth-rx',
  '--depth-ry',
  '--depth-z',
  '--depth-lift',
  '--depth-sx',
  '--depth-sy',
  '--depth-mx',
  '--depth-my',
  '--depth-scale',
  '--depth-glare',
  '--depth-glare-x',
  '--depth-glare-y',
]

// Drives the home page's pointer effects: one listener for the whole page and
// one animation frame loop that stops as soon as every value has settled.
class HomeDepthController {
  private pointerX = 0
  private pointerY = 0
  private parallaxX = 0
  private parallaxY = 0
  private targetSpotX = 0
  private targetSpotY = 0
  private currentSpotX = 0
  private currentSpotY = 0
  private targetSpotOpacity = 0
  private currentSpotOpacity = 0
  private spotInitialized = false
  private sceneElement: HTMLElement | null = null
  private tilts = new Map<HTMLElement, TiltState>()
  private hovered: HTMLElement[] = []
  private frameId = 0

  start(): void {
    document.documentElement.setAttribute('data-home-pointer', '')
    window.addEventListener('pointermove', this.handlePointerMove, {
      passive: true,
    })
    window.addEventListener('pointerdown', this.handlePointerDown, {
      passive: true,
    })
    window.addEventListener('pointerup', this.handlePointerUp, {
      passive: true,
    })
    window.addEventListener('pointercancel', this.handlePointerUp, {
      passive: true,
    })
    window.addEventListener('pointerout', this.handlePointerOut, {
      passive: true,
    })
    window.addEventListener('scroll', this.handleScroll, { passive: true })
  }

  stop(): void {
    document.documentElement.removeAttribute('data-home-pointer')
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerdown', this.handlePointerDown)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('pointercancel', this.handlePointerUp)
    window.removeEventListener('pointerout', this.handlePointerOut)
    window.removeEventListener('scroll', this.handleScroll)
    if (this.frameId) cancelAnimationFrame(this.frameId)
    this.frameId = 0

    for (const element of this.tilts.keys()) this.releaseTilt(element)
    this.tilts.clear()
    this.hovered = []
    for (const element of document.querySelectorAll<HTMLElement>(
      PARALLAX_SELECTOR
    )) {
      element.style.removeProperty('--depth-x')
      element.style.removeProperty('--depth-y')
    }
    const scene = this.getScene()
    if (scene) {
      scene.style.removeProperty('--home-spot-x')
      scene.style.removeProperty('--home-spot-y')
      scene.style.removeProperty('--home-spot-opacity')
    }
    this.sceneElement = null
  }

  private getScene(): HTMLElement | null {
    if (this.sceneElement && this.sceneElement.isConnected) {
      return this.sceneElement
    }
    this.sceneElement = document.querySelector<HTMLElement>(SCENE_SELECTOR)
    return this.sceneElement
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return

    const vw = Math.max(window.innerWidth, 1)
    const vh = Math.max(window.innerHeight, 1)
    this.pointerX = (event.clientX / vw) * 2 - 1
    this.pointerY = (event.clientY / vh) * 2 - 1

    this.targetSpotX = event.clientX
    this.targetSpotY = event.clientY
    this.targetSpotOpacity = 1
    if (!this.spotInitialized) {
      this.currentSpotX = event.clientX
      this.currentSpotY = event.clientY
      this.spotInitialized = true
    }

    const chain: HTMLElement[] = []
    let node =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(TILT_SELECTOR)
        : null
    while (node && chain.length < MAX_TILT_CHAIN) {
      chain.push(node)
      node = node.parentElement?.closest<HTMLElement>(TILT_SELECTOR) ?? null
    }

    for (const element of this.hovered) {
      if (!chain.includes(element)) this.rest(element)
    }
    for (const element of chain) {
      this.aim(element, event.clientX, event.clientY)
    }
    this.hovered = chain
    this.requestFrame()
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    for (const element of this.hovered) {
      const state = this.tilts.get(element)
      if (!state) continue
      state.target.press = 1
      // Lets the styles swap the raised bevel for a pressed one.
      element.setAttribute('data-depth-pressed', '')
    }
    this.requestFrame()
  }

  private handlePointerUp = (): void => {
    for (const [element, state] of this.tilts) {
      state.target.press = 0
      element.removeAttribute('data-depth-pressed')
    }
    this.requestFrame()
  }

  private handlePointerOut = (event: PointerEvent): void => {
    // A null relatedTarget means the pointer left the window.
    if (event.relatedTarget) return
    this.pointerX = 0
    this.pointerY = 0
    this.targetSpotOpacity = 0
    for (const element of this.hovered) this.rest(element)
    this.hovered = []
    this.requestFrame()
  }

  // The page moves under a still pointer, so the hovered element is stale.
  private handleScroll = (): void => {
    if (this.hovered.length === 0) return
    for (const element of this.hovered) this.rest(element)
    this.hovered = []
    this.requestFrame()
  }

  private aim(element: HTMLElement, clientX: number, clientY: number): void {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const nx = Math.max(
      -1,
      Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1)
    )
    const ny = Math.max(
      -1,
      Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1)
    )
    const maxDeg =
      element.dataset.depthTilt === undefined
        ? GROUP_TILT_DEG
        : Number(element.dataset.depthTilt) || 0

    let state = this.tilts.get(element)
    if (!state) {
      state = {
        current: { ...REST_POSE },
        target: { ...REST_POSE },
        layers: [...element.querySelectorAll<HTMLElement>(LAYER_SELECTOR)],
      }
      this.tilts.set(element, state)
      element.setAttribute('data-depth-active', '')
    }

    state.target.rx = -ny * maxDeg
    state.target.ry = nx * maxDeg
    state.target.z = maxDeg > 0 ? LIFT_PX : 0
    state.target.nx = nx
    state.target.ny = ny
    state.target.glare = 1
  }

  private rest(element: HTMLElement): void {
    const state = this.tilts.get(element)
    if (!state) return
    state.target = { ...REST_POSE }
  }

  private requestFrame(): void {
    if (this.frameId) return
    this.frameId = requestAnimationFrame(this.tick)
  }

  private tick = (): void => {
    this.frameId = 0
    let moving = false

    // Smoothly interpolate scene-wide cursor spotlight
    const spotDx = this.targetSpotX - this.currentSpotX
    const spotDy = this.targetSpotY - this.currentSpotY
    const spotDo = this.targetSpotOpacity - this.currentSpotOpacity
    const spotMoving =
      Math.abs(spotDx) > PIXEL_SETTLED ||
      Math.abs(spotDy) > PIXEL_SETTLED ||
      Math.abs(spotDo) > SETTLED
    const spotNeedsSnap =
      !spotMoving && this.currentSpotOpacity !== this.targetSpotOpacity
    if (spotMoving || spotNeedsSnap) {
      if (spotMoving) {
        this.currentSpotX += spotDx * SPOT_EASE
        this.currentSpotY += spotDy * SPOT_EASE
        this.currentSpotOpacity += spotDo * SPOT_EASE
        moving = true
      } else {
        this.currentSpotX = this.targetSpotX
        this.currentSpotY = this.targetSpotY
        this.currentSpotOpacity = this.targetSpotOpacity
      }
      const scene = this.getScene()
      if (scene) {
        scene.style.setProperty(
          '--home-spot-x',
          `${this.currentSpotX.toFixed(1)}px`
        )
        scene.style.setProperty(
          '--home-spot-y',
          `${this.currentSpotY.toFixed(1)}px`
        )
        scene.style.setProperty(
          '--home-spot-opacity',
          this.currentSpotOpacity.toFixed(3)
        )
      }
    }

    const dx = this.pointerX - this.parallaxX
    const dy = this.pointerY - this.parallaxY
    if (Math.abs(dx) > SETTLED || Math.abs(dy) > SETTLED) {
      this.parallaxX += dx * PARALLAX_EASE
      this.parallaxY += dy * PARALLAX_EASE
      moving = true
      for (const element of document.querySelectorAll<HTMLElement>(
        PARALLAX_SELECTOR
      )) {
        const shift = (Number(element.dataset.depth) || 0) * PARALLAX_STEP_PX
        element.style.setProperty(
          '--depth-x',
          `${(this.parallaxX * shift).toFixed(2)}px`
        )
        element.style.setProperty(
          '--depth-y',
          `${(this.parallaxY * shift).toFixed(2)}px`
        )
      }
    }

    for (const [element, state] of this.tilts) {
      let settled = true
      for (const key of POSE_KEYS) {
        const delta = state.target[key] - state.current[key]
        if (Math.abs(delta) > SETTLED) {
          state.current[key] += delta * TILT_EASE
          settled = false
        } else {
          state.current[key] = state.target[key]
        }
      }

      const resting = POSE_KEYS.every((key) => state.target[key] === 0)
      if (settled && resting) {
        this.releaseTilt(element)
        this.tilts.delete(element)
        continue
      }
      if (!settled) moving = true
      this.writeTilt(element, state)
    }

    if (moving) this.requestFrame()
  }

  private writeTilt(element: HTMLElement, state: TiltState): void {
    const pose = state.current
    const style = element.style
    const liftRatio = LIFT_PX > 0 ? pose.z / LIFT_PX : 0
    const rise = liftRatio * HOVER_RISE_PX * (1 - pose.press)
    const isMagnetic = element.hasAttribute('data-depth-magnetic')

    style.setProperty('--depth-rx', `${pose.rx.toFixed(3)}deg`)
    style.setProperty('--depth-ry', `${pose.ry.toFixed(3)}deg`)
    style.setProperty(
      '--depth-z',
      `${(pose.z - pose.press * (LIFT_PX + PRESS_DEPTH_PX)).toFixed(2)}px`
    )
    style.setProperty('--depth-lift', `${rise.toFixed(2)}px`)
    style.setProperty('--depth-sx', `${(-pose.ry * 1.35).toFixed(2)}px`)
    style.setProperty(
      '--depth-sy',
      `${(10 + pose.rx * 1.15 + liftRatio * 14).toFixed(2)}px`
    )
    if (isMagnetic) {
      style.setProperty(
        '--depth-mx',
        `${(pose.nx * MAGNETIC_PX * pose.glare).toFixed(2)}px`
      )
      style.setProperty(
        '--depth-my',
        `${(pose.ny * MAGNETIC_PX * pose.glare).toFixed(2)}px`
      )
    }
    style.setProperty(
      '--depth-scale',
      (1 - pose.press * PRESS_SCALE).toFixed(4)
    )
    style.setProperty('--depth-glare', pose.glare.toFixed(3))
    style.setProperty('--depth-glare-x', `${((pose.nx + 1) * 50).toFixed(1)}%`)
    style.setProperty('--depth-glare-y', `${((pose.ny + 1) * 50).toFixed(1)}%`)

    for (const layer of state.layers) {
      const shift = (Number(layer.dataset.depthLayer) || 0) * LAYER_STEP_PX
      layer.style.setProperty('--depth-lx', `${(pose.nx * shift).toFixed(2)}px`)
      layer.style.setProperty('--depth-ly', `${(pose.ny * shift).toFixed(2)}px`)
    }
  }

  private releaseTilt(element: HTMLElement): void {
    element.removeAttribute('data-depth-active')
    element.removeAttribute('data-depth-pressed')
    for (const property of TILT_PROPERTIES) {
      element.style.removeProperty(property)
    }
    const state = this.tilts.get(element)
    for (const layer of state?.layers ?? []) {
      layer.style.removeProperty('--depth-lx')
      layer.style.removeProperty('--depth-ly')
    }
  }
}

// Turns on the home page's 3D look and motion (see "Home depth" in
// styles/index.css). The static relief is lit by a fixed light, not motion, so
// it stays on for reduced-motion readers; only the pointer-driven tilt,
// parallax, spotlight, float, breathing and entrances are gated behind
// data-home-motion. Touch/mobile viewports keep entrances and float while
// automatically disabling pointer effects.
export function useHomeDepth(enabled: boolean): void {
  // Before paint, so the hero's entrances start with their 3D keyframes.
  useLayoutEffect(() => {
    if (!enabled) return

    const root = document.documentElement
    root.setAttribute('data-home-depth', '')

    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )
    const desktopPointerQuery = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (min-width: 768px)'
    )

    let controller: HomeDepthController | null = null

    const syncController = () => {
      const wantsMotion = !reducedMotionQuery.matches
      if (!wantsMotion) {
        controller?.stop()
        controller = null
        root.removeAttribute('data-home-motion')
        return
      }

      root.setAttribute('data-home-motion', '')
      const wantsPointer = desktopPointerQuery.matches
      if (wantsPointer && !controller) {
        controller = new HomeDepthController()
        controller.start()
      } else if (!wantsPointer && controller) {
        controller.stop()
        controller = null
      }
    }

    syncController()
    reducedMotionQuery.addEventListener('change', syncController)
    desktopPointerQuery.addEventListener('change', syncController)

    return () => {
      reducedMotionQuery.removeEventListener('change', syncController)
      desktopPointerQuery.removeEventListener('change', syncController)
      controller?.stop()
      root.removeAttribute('data-home-pointer')
      root.removeAttribute('data-home-motion')
      root.removeAttribute('data-home-depth')
    }
  }, [enabled])
}
