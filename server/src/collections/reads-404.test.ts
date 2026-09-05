/**
 * A read for a row that is not there answers 404, not 200 with nothing in it.
 *
 * Returning the service's answer straight through sent **200 with an empty
 * body**, which a client cannot tell from a row whose every field is blank -
 * `useCollection` caches `undefined` as the entry and the screen draws an
 * empty card rather than saying the entry is gone.
 *
 * **What this no longer covers**: `CollectionService.get` throws
 * `NotFoundException` itself now, so the `row === undefined` guard these tests
 * drive is unreachable from a real request, and the sentence an analyst meets
 * is the service's rather than either one asserted here. The stub is kept
 * because the guard is still in the handlers; it is belt-and-braces, and this
 * file is what says so.
 *
 * **Driven through the controller rather than over HTTP**, so it needs no
 * database.
 */
import { NotFoundException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { SystemsController } from './entities.controller.js'
import { TimelineController } from './timeline.controller.js'

const CASE = '11111111-1111-4111-8111-111111111111'
const MISSING = '22222222-2222-4222-8222-222222222222'

/** Answers `undefined` for every read, which is the missing-row case. */
const emptyService = { get: () => Promise.resolve(undefined) } as never

describe('reading a row that is not there', () => {
  it('is a 404 from an entity collection, not an empty 200', async () => {
    const controller = new SystemsController(emptyService)
    await expect(controller.get(CASE, MISSING)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('is a 404 from the timeline, which has its own controller', async () => {
    const controller = new TimelineController(emptyService, undefined)
    await expect(controller.get(CASE, MISSING)).rejects.toBeInstanceOf(NotFoundException)
  })
})
