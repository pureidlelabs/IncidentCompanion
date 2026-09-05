/**
 * Where the bundle is looked for.
 */
import { describe, expect, it } from 'vitest'

import { bundlePath } from './spa.module.js'

describe('where the bundle is looked for', () => {
  it('takes UI_DIR when the deployment names one', () => {
    const at = bundlePath({ get: () => '/srv/incidentcompanion/ui' } as never)
    expect(at).toBe('/srv/incidentcompanion/ui')
  })

  it('falls back to a path derived from this file, not the working directory', () => {
    // `cwd` is whatever the launcher was started from; the module's own
    // location is not.
    const at = bundlePath({ get: () => undefined } as never)
    expect(at.endsWith('/ui/dist')).toBe(true)
    expect(at.startsWith('/')).toBe(true)
  })
})
