import { afterAll, beforeAll } from 'vitest'

/**
 * Give jsdom a `getAnimations()` for one test file.
 */
export function stubAnimations(): void {
  const target = Element.prototype as { getAnimations?: () => Animation[] }
  const had = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations')

  beforeAll(() => {
    target.getAnimations = () => []
  })

  afterAll(() => {
    if (had) Object.defineProperty(Element.prototype, 'getAnimations', had)
    else delete target.getAnimations
  })
}
