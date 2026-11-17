import { useLayoutEffect } from 'react'

// The attribute contract is documented with the styles ("Home depth" in
// styles/index.css); this file only feeds the --depth-* values.
const TILT_SELECTOR = '[data-depth-tilt], [data-depth-group] > *'
const PARALLAX_SELECTOR = '[data-depth]'
const LAYER_SELECTOR = '[data-depth-layer]'

const PARALLAX_STEP_PX = 2.2
const LAYER_STEP_PX = 1.6
const GROUP_TILT_DEG = 8
const LIFT_PX = 12
const PRESS_DEPTH_PX = 6
const PRESS_SCALE = 0.03
// Tilted ancestors of the hovered element tilt too, up to this many.
const MAX_TILT_CHAIN = 3

const TILT_EASE = 0.14
const PARALLAX_EASE = 0.06
const SETTLED = 0.002

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
  private tilts = new Map<HTMLElement, TiltState>()
  private hovered: HTMLElement[] = []
  private frameId = 0

  start() {
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

  stop() {
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
    for (const element of document.querySelectorAll<HTMLElement>(
      PARALLAX_SELECTOR
    )) {
      element.style.removeProperty('--depth-x')
      element.style.removeProperty('--depth-y')
    }
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return

    this.pointerX = (event.clientX / window.innerWidth) * 2 - 1
    this.pointerY = (event.clientY / window.innerHeight) * 2 - 1

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

  private handlePointerDown = (event: PointerEvent) => {
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

  private handlePointerUp = () => {
    for (const [element, state] of this.tilts) {
      state.target.press = 0
      element.removeAttribute('data-depth-pressed')
    }
    this.requestFrame()
  }

  private handlePointerOut = (event: PointerEvent) => {
    // A null relatedTarget means the pointer left the window.
    if (event.relatedTarget) return
    this.pointerX = 0
    this.pointerY = 0
    for (const element of this.hovered) this.rest(element)
    this.hovered = []
    this.requestFrame()
  }

  // The page moves under a still pointer, so the hovered element is stale.
  private handleScroll = () => {
    if (this.hovered.length === 0) return
    for (const element of this.hovered) this.rest(element)
    this.hovered = []
    this.requestFrame()
  }

  private aim(element: HTMLElement, clientX: number, clientY: number) {
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

  private rest(element: HTMLElement) {
    const state = this.tilts.get(element)
    if (!state) return
    state.target = { ...REST_POSE }
  }

  private requestFrame() {
    if (this.frameId) return
    this.frameId = requestAnimationFrame(this.tick)
  }

  private tick = () => {
    this.frameId = 0
    let moving = false

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

  private writeTilt(element: HTMLElement, state: TiltState) {
    const pose = state.current
    const style = element.style
    style.setProperty('--depth-rx', `${pose.rx.toFixed(3)}deg`)
    style.setProperty('--depth-ry', `${pose.ry.toFixed(3)}deg`)
    style.setProperty(
      '--depth-z',
      `${(pose.z - pose.press * (LIFT_PX + PRESS_DEPTH_PX)).toFixed(2)}px`
    )
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

  private releaseTilt(element: HTMLElement) {
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
// parallax, float, breathing and entrances are gated behind data-home-motion.
// Touch screens keep the entrances and float but get no pointer effects.
export function useHomeDepth(enabled: boolean) {
  // Before paint, so the hero's entrances start with their 3D keyframes.
  useLayoutEffect(() => {
    if (!enabled) return

    const root = document.documentElement
    root.setAttribute('data-home-depth', '')

    const wantsMotion = !window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
    if (!wantsMotion) {
      return () => root.removeAttribute('data-home-depth')
    }

    root.setAttribute('data-home-motion', '')
    const controller = window.matchMedia('(hover: hover) and (pointer: fine)')
      .matches
      ? new HomeDepthController()
      : null
    controller?.start()

    return () => {
      controller?.stop()
      root.removeAttribute('data-home-motion')
      root.removeAttribute('data-home-depth')
    }
  }, [enabled])
}
