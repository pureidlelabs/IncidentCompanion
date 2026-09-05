import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **`AppProviders` is the only place the toast region and the toast queue are
 * joined, and nothing renders `App`.**
 *
 * **Read as source rather than rendered, and that is a deliberate floor.**
 * Rendering `App` needs a session, a router and a query client, none of which
 * this claim is about - and the failure being guarded is a wiring mistake in
 * one line of JSX, which is legible in the text. It cannot see a region that
 * renders and draws nothing; `notify-render.test.tsx` covers that half against
 * the real component.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
// `AppProviders`, not `App.tsx`: the region moved there when the app and
// Storybook were put on one provider stack, so a story mounts it too.
const APP = readFileSync(join(HERE, 'app/AppProviders.tsx'), 'utf8')

describe('the app root mounts the toasts', () => {
  it('renders the kit region and hands it the app queue', () => {
    expect(APP, 'AppProviders does not mount ToastRegion, so nothing draws a toast').toMatch(
      /<ToastRegion\b[^>]*queue=\{toastQueue\}/,
    )
  })

  it('takes the region from the kit and the queue from the blocks', () => {
    expect(APP).toMatch(/import \{ ToastRegion \} from '@\/components\/ui\/toast'/)
    expect(APP).toMatch(/import \{ toastQueue \} from '@\/components\/blocks\/notify'/)
  })

  /**
   * A second region subscribed to the same queue draws every toast twice, and
   * React Aria's is an app-level singleton that portals into the top layer.
   */
  it('mounts exactly one', () => {
    expect(APP.match(/<ToastRegion\b/g) ?? []).toHaveLength(1)
  })
})
