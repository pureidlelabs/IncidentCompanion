import { useEffect, useRef } from 'react'

import { cn } from '@/lib/cn'

/**
 * The unauthenticated screens' ground: entities and the relations between
 * them, drifting.
 */

/** One node per this many CSS pixels, tuned at the 720x900 panel the split
 *  gives it. */
const AREA_PER_NODE = 10_000

/** Links per node, to its nearest neighbours - a relation map, not a mesh. */
const LINKS_PER_NODE = 3

/** Beyond this a pair is not neighbours and gets no link. */
const LINK_REACH = 250

/** How far the pointer's energy carries, in CSS pixels. */
const POINTER_REACH = 190

/**
 * Retina past this buys nothing on an out-of-focus field and costs fill rate
 * quadratically. pureidle caps at the same number for the same reason.
 */
const MAX_DPR = 1.5

interface Node {
  hx: number
  hy: number
  x: number
  y: number
  amp: number
  w1: number
  w2: number
  p1: number
  p2: number
  degree: number
  radius: number
}

interface Edge {
  a: number
  b: number
  phase: number
  speed: number
  live: boolean
}

function build(width: number, height: number): { nodes: Node[]; edges: Edge[] } {
  const count = Math.max(12, Math.round((width * height) / AREA_PER_NODE))
  const nodes: Node[] = []
  for (let i = 0; i < count; i++) {
    const hx = 20 + Math.random() * (width - 40)
    const hy = 20 + Math.random() * (height - 40)
    nodes.push({
      hx,
      hy,
      x: hx,
      y: hy,
      amp: 7 + Math.random() * 9,
      w1: 0.18 + Math.random() * 0.26,
      w2: 0.18 + Math.random() * 0.26,
      p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2,
      degree: 0,
      radius: 0,
    })
  }

  const edges: Edge[] = []
  nodes.forEach((node, i) => {
    const near = nodes
      .map((other, j) => ({ j, d: Math.hypot(other.hx - node.hx, other.hy - node.hy) }))
      .filter((candidate) => candidate.j !== i)
      .sort((one, two) => one.d - two.d)
    for (let k = 0; k < LINKS_PER_NODE; k++) {
      const pick = near[k]
      if (!pick || pick.d > LINK_REACH) continue
      edges.push({
        a: i,
        b: pick.j,
        phase: Math.random(),
        speed: 0.12 + Math.random() * 0.24,
        live: Math.random() < 0.34,
      })
      node.degree++
      const other = nodes[pick.j]
      if (other) other.degree++
    }
  })

  for (const node of nodes) node.radius = 1.5 + Math.min(node.degree, 8) * 0.42
  return { nodes, edges }
}

/**
 * The two colours the field draws in, resolved from the tokens on `host`.
 */
function palette(host: HTMLElement) {
  const style = getComputedStyle(host)
  return {
    dim: style.getPropertyValue('--ink-muted').trim() || style.color,
    lit: style.getPropertyValue('--primary').trim() || style.color,
  }
}

export function AmbientField({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let nodes: Node[] = []
    let edges: Edge[] = []
    let colours = palette(host)
    let clock = 0
    let frame = 0
    let rebuild = 0
    const pointer = { x: 0, y: 0, on: false }

    const still = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function heat(x: number, y: number) {
      if (!pointer.on) return 0
      const d = Math.hypot(x - pointer.x, y - pointer.y)
      if (d > POINTER_REACH) return 0
      const t = 1 - d / POINTER_REACH
      return t * t
    }

    function draw(dt: number) {
      if (!ctx) return
      clock += dt
      ctx.clearRect(0, 0, width, height)

      for (const node of nodes) {
        node.x = node.hx + node.amp * Math.sin(clock * node.w1 + node.p1)
        node.y = node.hy + node.amp * Math.cos(clock * node.w2 + node.p2)
      }

      ctx.lineWidth = 1
      for (const edge of edges) {
        const a = nodes[edge.a]
        const b = nodes[edge.b]
        if (!a || !b) continue
        const warm = Math.max(heat(a.x, a.y), heat(b.x, b.y))
        // A long link is a weak one: keeps the eye on local structure rather
        // than on the few pairs the orbits have pulled apart.
        const fade = Math.max(0.25, 1 - Math.hypot(a.x - b.x, a.y - b.y) / 300)
        ctx.strokeStyle = colours.dim
        ctx.globalAlpha = (0.3 + warm * 0.45) * fade
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()

        // The pointer wakes a dormant link as well as speeding a live one -
        // without that two thirds of the field never answers the cursor.
        if (!edge.live && warm < 0.3) continue
        edge.phase = (edge.phase + dt * edge.speed * (1 + warm * 2)) % 1.6
        if (edge.phase > 1) continue
        ctx.globalAlpha = 1
        ctx.fillStyle = colours.lit
        ctx.beginPath()
        ctx.arc(
          a.x + (b.x - a.x) * edge.phase,
          a.y + (b.y - a.y) * edge.phase,
          2 + warm * 1.4,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      for (const node of nodes) {
        const warm = heat(node.x, node.y)
        ctx.globalAlpha = 0.45 + warm * 0.55
        ctx.fillStyle = warm > 0.25 ? colours.lit : colours.dim
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius + warm * 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    /**
     * Rescale the graph into the new box; do not regenerate it.
     */
    function resize() {
      if (!host || !canvas || !ctx) return
      const box = host.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return

      const previousWidth = width
      const previousHeight = height
      width = box.width
      height = box.height

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${String(width)}px`
      canvas.style.height = `${String(height)}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (!nodes.length) {
        ;({ nodes, edges } = build(width, height))
      } else if (previousWidth > 0 && previousHeight > 0) {
        const sx = width / previousWidth
        const sy = height / previousHeight
        for (const node of nodes) {
          node.hx *= sx
          node.hy *= sy
        }
      }

      window.clearTimeout(rebuild)
      rebuild = window.setTimeout(() => {
        const wanted = Math.max(12, Math.round((width * height) / AREA_PER_NODE))
        if (Math.abs(wanted - nodes.length) / nodes.length > 0.3) {
          ;({ nodes, edges } = build(width, height))
        }
      }, 250)

      draw(0)
    }

    let last = performance.now()
    function loop(now: number) {
      // Clamped: a backgrounded tab resumes with a gap of seconds, which would
      // jump every pulse to a new position rather than continuing it.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      draw(dt)
      frame = requestAnimationFrame(loop)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)

    // The ground is `<html data-theme>`, written by the pre-paint script and
    // by the switcher. Canvas cannot inherit a custom property, so the colours
    // are re-resolved when it moves rather than re-read every frame.
    const ground = new MutationObserver(() => {
      colours = palette(host)
    })
    ground.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    // Arrow consts rather than `function` declarations: a hoisted declaration
    // is typed against `canvas`'s declared type, not the narrowing the early
    // return above already established, so it reads as possibly-null.
    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect()
      pointer.x = event.clientX - box.left
      pointer.y = event.clientY - box.top
      pointer.on = true
    }
    const onLeave = () => {
      pointer.on = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerleave', onLeave)

    resize()
    if (still) frame = requestAnimationFrame(loop)

    return () => {
      // Not cancelling leaves a loop running behind the signed-in app for the
      // life of the tab, invisibly.
      cancelAnimationFrame(frame)
      window.clearTimeout(rebuild)
      observer.disconnect()
      ground.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    // `pointer-events-none` because it is decoration: the pointer is read off
    // `window`, so the layer never needs events of its own and must not take
    // them from whatever the screen puts over it.
    <div
      ref={hostRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
