/**
 * The retention route, attacked: can it quietly shorten the window?
 */
import { UnprocessableEntityException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { AuditRetentionController, putBodySchema } from './retention.controller.js'
import { RETENTION_FLOOR_DAYS } from '../db/schema/install-activity.js'
import { RETENTION_KEY } from '../install-activity/prune.service.js'

interface Line {
  event: string
  detail?: Record<string, string> | undefined
}

function harness(current = 365) {
  const lines: Line[] = []
  let held = current
  const settings = {
    all: () => Promise.resolve({ [RETENTION_KEY]: held }),
    set: (_key: string, value: unknown) => {
      held = value as number
      return Promise.resolve()
    },
  }
  const activity = {
    retentionChanged: (_caller: unknown, from: number, to: number) => {
      lines.push({ event: 'audit_retention_changed', detail: { from: String(from), to: String(to) } })
      return Promise.resolve()
    },
  }
  return {
    lines,
    held: () => held,
    controller: new AuditRetentionController(settings as never, activity as never),
  }
}

const session = { user: { id: 'admin-1', name: 'Dev Analyst' } } as never
const request = { headers: {} }

describe('the audit retention route', () => {
  it('states the floor, so a screen need not hard-code it', async () => {
    const { controller } = harness()

    const view = await controller.read()

    expect(view.days).toBe(365)
    expect(view.floorDays).toBe(RETENTION_FLOOR_DAYS)
  })

  /**
   * **The floor is the point.** Below it, an administrator could shrink the
   * window to nothing and the pruner would take everything on its next pass.
   */
  it.each([RETENTION_FLOOR_DAYS - 1, 1, 0, -30])(
    'refuses %i days, which is under the floor',
    async (days) => {
      const { controller, held } = harness()

      /**
       * **Asserted on the body, not the message.**
       */
      const refused = await controller
        .set({ days }, session, request)
        .catch((why: unknown) => why)
      expect(refused).toBeInstanceOf(UnprocessableEntityException)
      const body = (refused as UnprocessableEntityException).getResponse() as {
        messages: [string, string][]
      }
      expect(body.messages[0]?.[0], 'the refusal must say why').toMatch(/at least/i)
      expect(held(), 'a refused change must not have been applied').toBe(365)
    },
  )

  /**
   * **A fraction is the pipe's to refuse, not this route's.**
   */
  it('declares an integer, so a fraction is refused before the handler', async () => {
    expect(() => putBodySchema.parse({ days: 90.5 })).toThrow()
    expect(() => putBodySchema.parse({ days: 90 })).not.toThrow()
  })

  /**
   * **Shortening leaves a line saying so, with both numbers.**
   */
  it('records a shortening, with what it was and what it became', async () => {
    const { controller, lines, held } = harness(365)

    await controller.set({ days: 30 }, session, request)

    expect(held()).toBe(30)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.detail).toEqual({ from: '365', to: '30' })
  })

  it('records a lengthening too', async () => {
    const { controller, lines } = harness(90)

    await controller.set({ days: 365 }, session, request)

    expect(lines[0]?.detail).toEqual({ from: '90', to: '365' })
  })

  /**
   * **Read before write, or the line cannot say what it changed from.**
   */
  it('reports the old value, not the new one', async () => {
    const { controller, lines } = harness(365)

    await controller.set({ days: 60 }, session, request)

    expect(lines[0]?.detail?.['from'], 'from must predate the write').toBe('365')
  })
})
