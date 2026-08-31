/**
 * A CSS custom property's value, as something a canvas library can parse.
 *
 * `tokens.css` is written in `oklch()`. Cytoscape has its own colour parser
 * which does not know that function and silently falls back to its default -
 * the whole graph paints grey with no error anywhere. Neither
 * `getComputedStyle` nor a canvas `fillStyle` round-trip converts it: Chrome
 * preserves `oklch()` in both. Painting one pixel and reading the bytes back
 * is the only step that actually leaves the colour space.
 *
 * **Lives in `lib/`, not beside the component that needs it.** A component may
 * carry no literal colour - `src/styles/tokens.test.ts` scans `components/`
 * and `features/` for exactly that - and the conversion has to produce colour
 * syntax by definition. It is a DOM utility, not a visual decision.
 */
export function tokenColour(within: Element, token: string): string {
  const probe = document.createElement('span')
  probe.style.display = 'none'
  probe.style.color = `var(${token})`
  within.appendChild(probe)
  const value = getComputedStyle(probe).color
  probe.remove()

  const surface = document.createElement('canvas')
  surface.width = 1
  surface.height = 1
  const ink = surface.getContext('2d', { willReadFrequently: true })
  if (!ink) return value
  ink.fillStyle = value
  ink.fillRect(0, 0, 1, 1)
  const [r, g, b] = ink.getImageData(0, 0, 1, 1).data
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`
}
