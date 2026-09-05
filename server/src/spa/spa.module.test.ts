/**
 * Where the bundle is looked for.
 *
 * **What the SPA must not answer is asserted through a real request**, in
 * `test/a-data-request-is-never-a-page.test.ts`. It was asserted here, against
 * a copy of the exclusion list and a model of Express' matcher, and the copy
 * had drifted: it named `/api/{*path}` where the shipping list names
 * `/assets`, so the exclusion the browser depends on was tested by nothing
 * while every case here passed.
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
