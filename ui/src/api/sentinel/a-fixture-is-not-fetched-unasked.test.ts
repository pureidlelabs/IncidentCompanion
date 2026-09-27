import { describe, expect, it, vi } from 'vitest'

import { demoImporterAsked, demoSourceFromUrl } from './demoSource'

import type * as SentinelFixture from '@/fixtures/sentinel-source'

/**
 * The fixture module is reached only by the address that asks for it.
 *
 * **A file of its own, because the claim is that nothing loaded it.** A mock
 * factory runs once per file and `vi.resetModules` does not reset the mock
 * registry, so a count of zero is only answerable where no other case can
 * have raised it. -> #988
 *
 * The import *graph* is `fixtures-stay-out-of-the-bundle.rule.test.ts`'s to
 * judge; this counts loads.
 */
const loaded = vi.hoisted(() => ({ times: 0 }))

vi.mock('@/fixtures/sentinel-source', async (importOriginal) => {
  loaded.times += 1
  return await importOriginal<typeof SentinelFixture>()
})

describe('the demo importer', () => {
  it('is not asked for by an address that did not name it', async () => {
    expect(demoImporterAsked('?section=timeline')).toBe(false)
    await expect(demoSourceFromUrl('?section=timeline')).resolves.toBeNull()
    expect(loaded.times, 'the fixture was loaded by a path that does not use it').toBe(0)
  })
})
