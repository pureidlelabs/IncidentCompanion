import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Core, ElementDefinition } from 'cytoscape'
import { useState } from 'react'
import { expect, waitFor } from 'storybook/test'

import { tokenColour } from '@/lib/tokenColour'

import { Button } from './button'
import { GraphCanvas, type GraphViewport } from './graph-canvas'

/**
 * A cytoscape engine, mounted in a box that resizes with its pane.
 *
 * **The mount, and nothing else.** Every story here does its own adding,
 * painting and laying out against the engine it is handed -- which is the
 * point: the arrangement is where a graph's design lives, so the box holding
 * one must have no opinion about it.
 *
 * Nothing it draws is in the DOM. The picture is pixels on a `<canvas>`, so
 * these assert the box and the viewport it publishes; the drawing is judged by
 * looking.
 */
const meta = {
  title: 'Components/GraphCanvas',
  component: GraphCanvas,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      // A flex column with a height: the box fills what it is given, and
      // `flex-1` against a parent that is not a flex container is nothing.
      <div className="flex h-[420px] w-full flex-col p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GraphCanvas>

export default meta
type Story = StoryObj<typeof meta>

/** A ring of nodes, each joined to the next. */
function ring(count: number): ElementDefinition[] {
  const nodes: ElementDefinition[] = Array.from({ length: count }, (_, at) => ({
    data: { id: `n${String(at)}`, label: `Node ${String(at + 1)}` },
  }))
  const edges: ElementDefinition[] = nodes.map((_, at) => ({
    data: {
      id: `e${String(at)}`,
      source: `n${String(at)}`,
      target: `n${String((at + 1) % count)}`,
    },
  }))
  return [...nodes, ...edges]
}

/**
 * What a caller does with the engine once it has one.
 *
 * The colours are read off the document rather than written here: cytoscape
 * paints to a canvas, where a CSS variable never resolves, so a caller
 * resolves its tokens first and hands the results over. That is what the real
 * caller does, and a story that hardcoded a pair would not show it.
 */
function draw(core: Core, elements: ElementDefinition[]): void {
  core.add(elements)
  const ground = core.container() ?? document.body
  core
    .style()
    .resetToDefault()
    .selector('node')
    .style({
      'background-color': tokenColour(ground, '--ink-muted'),
      label: 'data(label)',
      'font-size': 10,
    })
    .selector('edge')
    .style({ 'line-color': tokenColour(ground, '--border'), width: 1.2 })
    .update()
  core.layout({ name: 'fcose', animate: false } as never).run()
  core.fit(undefined, 30)
}

/**
 * Nine nodes, added and laid out by the caller.
 *
 * What the `play` can settle is that the engine mounted and took the box's whole
 * size: cytoscape draws onto backing canvases it sizes from the container, so a
 * box that reported the wrong size gives a picture that is cropped or blurred
 * rather than one that is missing. **Whether the arrangement is any good is
 * judged by looking**, and no assertion here stands in for that.
 */
export const Populated: Story = {
  name: 'A caller drawing a small graph',
  args: {
    onViewport: (viewport) => {
      if (viewport !== null) draw(viewport.core, ring(9))
    },
  },
  play: async ({ canvasElement, step }) => {
    const box = canvasElement.querySelector<HTMLElement>('[data-slot="graph-canvas"]')!

    await step('The engine painted', async () => {
      await waitFor(() => {
        void expect(box.querySelectorAll('canvas').length).toBeGreaterThan(0)
      })
    })

    // Against the pane it was given, not against itself: a box measured
    // against its own rectangle fills it at every width, which is the assertion
    // this one replaced.
    await step('And it took the whole pane it was given', async () => {
      const pane = box.parentElement!
      const padding = getComputedStyle(pane)
      const content = (axis: 'width' | 'height', sides: [string, string]) =>
        pane.getBoundingClientRect()[axis] -
        Number.parseFloat(padding.getPropertyValue(sides[0])) -
        Number.parseFloat(padding.getPropertyValue(sides[1]))

      await expect(box.getBoundingClientRect().width).toBeCloseTo(
        content('width', ['padding-left', 'padding-right']),
        0,
      )
      await expect(box.getBoundingClientRect().height).toBeCloseTo(
        content('height', ['padding-top', 'padding-bottom']),
        0,
      )
    })
  },
}

/**
 * A caller that adds nothing: a box, rather than an error.
 *
 * The engine still mounts and still fills the pane, so a screen whose graph has
 * no elements yet holds its layout instead of collapsing and reflowing once the
 * first node arrives.
 */
export const Empty: Story = {
  name: 'Nothing drawn',
  play: async ({ canvasElement }) => {
    const box = canvasElement.querySelector<HTMLElement>('[data-slot="graph-canvas"]')!

    await waitFor(() => {
      void expect(box.querySelectorAll('canvas').length).toBeGreaterThan(0)
    })
    await expect(box.getBoundingClientRect().height).toBeGreaterThan(100)
  },
}

/**
 * The viewport it publishes, driven from outside.
 *
 * The controls belong to whatever frames this, so the box hands them over
 * rather than drawing a toolbar of its own.
 */
export const Driven: Story = {
  name: 'Zoomed from outside',
  render: () => {
    function Framed() {
      const [viewport, setViewport] = useState<GraphViewport | null>(null)
      return (
        <div className="flex size-full flex-col gap-2">
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              isDisabled={viewport === null}
              onPress={() => {
                viewport?.zoomBy(1.4)
              }}
            >
              Zoom in
            </Button>
            <Button
              variant="outline"
              size="sm"
              isDisabled={viewport === null}
              onPress={() => {
                viewport?.fitToPane()
              }}
            >
              Fit
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <GraphCanvas
              onViewport={(published) => {
                setViewport(published)
                if (published !== null) draw(published.core, ring(6))
              }}
              // What gets re-placed on a resize is the caller's: this one
              // positions nothing by hand, so it only re-fits.
              onResize={() => {
                setViewport((held) => {
                  held?.fitToPane()
                  return held
                })
              }}
            />
          </div>
        </div>
      )
    }
    return <Framed />
  },
  play: async ({ canvas }) => {
    // The controls arm only once the engine has mounted and handed its
    // viewport over, which is the contract this story exists for.
    await waitFor(async () => {
      void expect(await canvas.findByRole('button', { name: 'Fit' })).toBeEnabled()
    })
  },
}

/**
 * The pane changes size, and `onResize` fires.
 *
 * **The canvas following the pane is cytoscape's own doing**, measured: version
 * 3.34.2 registers a `ResizeObserver` on the container it is handed, and pulling
 * this component's observer out entirely leaves the backing canvases still
 * halving with the pane. So a story asserting the picture resizes would be a
 * story about the library.
 *
 * What is this component's is the callback. A caller that places nodes by hand
 * -- a fixed layout, a pinned root -- has to re-place them when the pane
 * changes, and nothing in the engine tells it to. The `play` halves the pane and
 * watches the count go up.
 */
export const ResizesWithItsPane: Story = {
  name: 'The pane shrinks under it',
  render: () => {
    function Counted() {
      const [times, setTimes] = useState(0)
      return (
        <div className="flex size-full flex-col gap-2">
          <p className="shrink-0 text-sm text-ink-muted">
            Resized <span data-testid="resize-count">{times}</span> times
          </p>
          <div className="flex min-h-0 flex-1 flex-col">
            <GraphCanvas
              onViewport={(published) => {
                if (published !== null) draw(published.core, ring(6))
              }}
              onResize={() => {
                setTimes((at) => at + 1)
              }}
            />
          </div>
        </div>
      )
    }
    return <Counted />
  },
  play: async ({ canvas, canvasElement, step }) => {
    const pane = canvasElement.firstElementChild as HTMLElement
    const count = () => Number(canvas.getByTestId('resize-count').textContent)

    let before = 0
    await step('The engine mounted', async () => {
      await waitFor(() => {
        void expect(
          canvasElement.querySelector('[data-slot="graph-canvas"]')!.querySelectorAll('canvas')
            .length,
        ).toBeGreaterThan(0)
      })
      before = count()
    })

    await step('The pane halves, and the caller is told', async () => {
      pane.style.width = '50%'
      await waitFor(
        () => {
          void expect(count()).toBeGreaterThan(before)
        },
        { timeout: 3000 },
      )
    })
  },
}
