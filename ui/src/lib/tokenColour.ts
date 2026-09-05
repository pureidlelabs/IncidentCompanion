/**
 * A CSS custom property's value, as something a canvas library can parse.
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
