/**
 * A version the caller cannot have read is one answer, whichever door hears it.
 *
 * **Quantified over the doors rather than asserted per door**, which is what a
 * per-door test cannot do: each door's own suite was green on three different
 * statuses for one mistake. -> `openspec/specs/the-api/spec.md`, #638
 *
 * The service is stubbed, so the guard is what is measured. What this cannot
 * see is the status a real request carries: a pipe refusing ahead of the
 * handler answers before any of this runs.
 */
import { UnprocessableEntityException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { SystemsController } from './entities.controller.js'
import { TimelineController } from './timeline.controller.js'
import type { CollectionService } from './collection.service.js'

const CASE = '00000000-0000-4000-8000-000000000001'
const ROW = '00000000-0000-4000-8000-000000000002'
const SESSION = { user: { id: 'u-analyst' } } as never

interface Door {
  update(caseId: string, id: string, body: unknown, session: never): Promise<unknown>
  remove(caseId: string, id: string, version: string, session: never): Promise<unknown>
}

function doors() {
  const reached = vi.fn()
  const service = {
    get: reached.mockResolvedValue({ kind: 'action' }),
    update: reached,
    remove: reached,
  } as unknown as CollectionService
  return {
    reached,
    each: [
      ['an entity route', new SystemsController(service) as unknown as Door],
      ['the timeline route', new TimelineController(service) as unknown as Door],
    ] as const,
  }
}

/**
 * The shapes a `version` arrives in that no reader produced: not a number, out
 * of the column's range, and not whole. Absent is in there too - a client that
 * forgot the parameter is making the same mistake as one that mangled it.
 */
const NOT_A_VERSION = ['abc', '-1', '1.5', '9999999999999', undefined] as const

describe('a version no reader could have read', () => {
  for (const [name, door] of doors().each) {
    it.each(NOT_A_VERSION)(`is refused at 422 by ${name} on delete, given %s`, async (version) => {
      await expect(
        door.remove(CASE, ROW, version as string, SESSION),
      ).rejects.toBeInstanceOf(UnprocessableEntityException)
    })

    it.each(NOT_A_VERSION)(`is refused at 422 by ${name} on patch, given %s`, async (version) => {
      await expect(
        door.update(CASE, ROW, { version, description: 'this must not land' }, SESSION),
      ).rejects.toBeInstanceOf(UnprocessableEntityException)
    })
  }

  it('reaches no door with a version that parses, so the refusals above are the guard', async () => {
    const { reached, each } = doors()
    for (const [, door] of each) {
      await door.remove(CASE, ROW, '3', SESSION).catch(() => null)
    }
    expect(reached).toHaveBeenCalledTimes(each.length)
  })
})
