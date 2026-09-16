/**
 * A version the caller cannot have read is one answer, whichever door hears it,
 * and so is a row that is not there. -> `openspec/specs/the-api/spec.md`, #638
 *
 * **Quantified over the doors rather than asserted per door**, which is the
 * half a per-door suite cannot reach: each door passing its own cases says
 * nothing about the two of them agreeing.
 *
 * The service is stubbed, so the guard is what is measured. What this cannot
 * see is the status a real request carries: a pipe refusing ahead of the
 * handler answers before any of this runs.
 */
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'
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

/**
 * The doors, each with a field its own schema will take - the patch has to
 * parse for a case about what happens after the write is attempted.
 */
const DOORS = [
  ['an entity route', SystemsController, { hostname: 'this must not land' }],
  ['the timeline route', TimelineController, { description: 'this must not land' }],
] as const

/**
 * Both doors over one stubbed service, `answers` being what a write resolves
 * to. `get` answers a kind because the timeline reads the row to pick its patch
 * schema; nothing here is about which schema it picked.
 */
function doors(answers: unknown = { ok: true, row: { kind: 'action' } }) {
  const reached = vi.fn().mockResolvedValue(answers)
  const service = {
    get: vi.fn().mockResolvedValue({ kind: 'action' }),
    update: reached,
    remove: reached,
  } as unknown as CollectionService
  return {
    reached,
    each: DOORS.map(([name, Door_, patch]) => {
      const door = new Door_(service) as unknown as Door
      return { name, door, patch }
    }),
  }
}

/**
 * The shapes a `version` arrives in that no reader produced: not a number, out
 * of the column's range, and not whole. Absent is in there too - a client that
 * forgot the parameter is making the same mistake as one that mangled it.
 */
const NOT_A_VERSION = [
  'abc',
  '-1',
  '1.5',
  '9999999999999',
  undefined,
  // Each of these is a number to `Number` and to nobody else: `''` and `'0x10'`
  // are not digits at all, `' 1'` carries whitespace no reader emitted, and
  // `'1e3'` is a version 998 rows away from the one it looks like.
  '',
  ' 1',
  '1e3',
  '0x10',
] as const

describe('a version no reader could have read', () => {
  for (const { name, door } of doors().each) {
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
    for (const { door } of each) {
      await door.remove(CASE, ROW, '3', SESSION).catch(() => null)
    }
    expect(reached).toHaveBeenCalledTimes(each.length)
  })
})

/**
 * **`currentVersion: null` is a row this case cannot see, not a stale one.**
 * The service answers "nothing matched" to both, and answering 409 sends a
 * client off to merge against a row it has no reach to.
 */
describe('a patch against a row that is not in this case', () => {
  for (const { name, door, patch } of doors({ ok: false, currentVersion: null }).each) {
    it(`is 404 from ${name}, not a conflict`, async () => {
      await expect(
        door.update(CASE, ROW, { version: 3, ...patch }, SESSION),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  }
})
