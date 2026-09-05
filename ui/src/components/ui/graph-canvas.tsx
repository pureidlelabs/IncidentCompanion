import { useEffect, useRef, useState } from 'react'
// Types only: cytoscape itself is loaded lazily, and a value import here would
// pull the engine into the bundle every screen shares.
import type { Core } from 'cytoscape'

import { cn } from '@/lib/cn'

/** What a caller presses to move the view. Handed over once the engine mounts. */
export interface GraphViewport {
  /** Multiplies the zoom about the pane's centre, never a corner. */
  zoomBy: (factor: number) => void
  /** Fits every element in the pane, with a margin. */
  fitToPane: () => void
  /** The engine itself, for a caller that has to reach past this box. */
  core: Core
}

export interface GraphCanvasProps {
  /** Handed the viewport once mounted, and `null` when it goes. */
  onViewport?: ((viewport: GraphViewport | null) => void) | undefined
  /** The engine is up. Nothing has been added to it yet. */
  onReady?: (() => void) | undefined
  /**
   * The engine could not be loaded or started, so nothing will ever be drawn.
   *
   * A caller that has another way to show the same data owes the analyst that
   * way instead of an empty box.
   */
  onFailed?: (() => void) | undefined
  /**
   * The pane changed size, after the engine's own canvas has been resized.
   *
   * Re-placing anything the caller positions itself, and deciding what the
   * view should show afterwards, are the caller's: a graph that puts a node
   * somewhere by hand has to put it there again, and this box does not know
   * which nodes those are.
   */
  onResize?: (() => void) | undefined
  className?: string | undefined
}

/**
 * A cytoscape engine, mounted in a box that resizes with its pane.
 *
 * **The mount, and nothing about any particular graph.** What is drawn, how it
 * is painted, how it is placed, what a right-click offers and what a selection
 * shows are all the caller's -- it is handed the engine and does that work
 * against it. Everything here is what is the same whatever is being drawn, and
 * a layout run is not: the arrangement is where a graph's design lives.
 *
 * **Loaded on demand.** cytoscape and its layout are a large dependency that
 * two screens use, so a static import would put them in the bundle every
 * screen waits for.
 *
 * **Sized, never positioned.** cytoscape sets `position: relative` on whatever
 * element it is handed, which beats an `absolute inset-0` here and leaves the
 * element 0px tall inside a pane with a height -- a graph invisible under a
 * frame that looks correct.
 *
 * Nothing it draws is in the DOM: the picture is pixels on a `<canvas>`, so a
 * test asserts what the caller draws around it, and the drawing itself is
 * judged by looking.
 */
export function GraphCanvas({
  onViewport,
  onReady,
  onResize,
  onFailed,
  className,
}: GraphCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const core = useRef<Core | null>(null)
  const [ready, setReady] = useState(false)

  // **Written in an effect, not during render.** The latest-ref idiom is
  // usually a bare assignment in the body, which is a write during render:
  // `react-hooks/refs` refuses it, and a thrown-away render would still have
  // written. Everything below reads these long after commit.
  const publish = useRef(onViewport)
  const arrived = useRef(onReady)
  const resized = useRef(onResize)
  const broke = useRef(onFailed)
  useEffect(() => {
    publish.current = onViewport
    arrived.current = onReady
    resized.current = onResize
    broke.current = onFailed
  })

  useEffect(() => {
    let cancelled = false
    let cy: Core | null = null

    async function start(): Promise<void> {
      const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
        import('cytoscape'),
        import('cytoscape-fcose'),
      ])
      if (cancelled || !host.current) return
      cytoscape.use(fcose)
      cy = cytoscape({
        container: host.current,
        elements: [],
        wheelSensitivity: 0.2,
        minZoom: 0.2,
        maxZoom: 3,
      })
      core.current = cy
      setReady(true)
      arrived.current?.()
      publish.current?.({
        zoomBy: (factor) => {
          const engine = core.current
          if (!engine) return
          // About the middle of the pane: zooming toward a corner walks the
          // drawing off screen.
          engine.zoom({
            level: engine.zoom() * factor,
            renderedPosition: { x: engine.width() / 2, y: engine.height() / 2 },
          })
        },
        fitToPane: () => {
          core.current?.fit(undefined, 30)
        },
        core: cy,
      })
    }

    // A dynamic import can fail -- an offline reload, a chunk that 404s after
    // a deploy -- and a swallowed rejection is a pane that stays empty with
    // nothing said.
    start().catch(() => {
      if (!cancelled) broke.current?.()
    })
    return () => {
      cancelled = true
      publish.current?.(null)
      cy?.destroy()
      core.current = null
      setReady(false)
    }
  }, [])

  // The pane is resizable: the rail folds, the window changes. cytoscape 3.34
  // watches its own container and resizes its canvases, so `cy.resize()` here is
  // for a browser where it falls back to a window listener. What this observer
  // is for is `onResize`, which nothing else fires and which a caller placing
  // nodes by hand has to have.
  useEffect(() => {
    const container = host.current
    if (!container || !ready) return
    const observer = new ResizeObserver(() => {
      const cy = core.current
      if (!cy) return
      cy.resize()
      resized.current?.()
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [ready])

  return <div ref={host} data-slot="graph-canvas" className={cn('size-full', className)} />
}
