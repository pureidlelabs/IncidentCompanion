/**
 * The mark a typed method leaves, attacked: can an act end up with no line?
 *
 * **This is the one failure the whole arrangement can have.** A typed method
 * tells the boundary to stay quiet because it has already recorded the act
 * precisely. If it says so and then does not record, nothing does - and the
 * audit is deliberately best-effort, so a failed write is swallowed rather
 * than raised. Silence, on a role change, with nothing anywhere saying so.
 */
import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import { InstallActivityService } from './install-activity.service.js'
import { NAMED } from './named.js'

const caller = (request: object) => ({
  session: { user: { id: 'analyst-1', name: 'Dev Analyst' } },
  headers: {},
  request,
})

describe('the mark a typed method leaves', () => {
  it('is set when the line was written', async () => {
    const written: unknown[] = []
    const db = {
      insert: () => ({ values: (one: unknown) => Promise.resolve(void written.push(one)) }),
    } as never
    const request = {}

    await new InstallActivityService(db).roleChanged(caller(request), 'a@example.test', 'analyst', 'admin')

    expect(written).toHaveLength(1)
    expect((request as Record<symbol, boolean>)[NAMED]).toBe(true)
  })

  /**
   * **Not set when the write failed**, so the boundary records its own
   * vaguer line instead. A less precise line is a great deal better than
   * none, and none is what marking first produces.
   */
  it('is not set when the line was lost', async () => {
    const said = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const db = {
      insert: () => ({ values: () => Promise.reject(new Error('down')) }),
    } as never
    const request = {}

    await new InstallActivityService(db).roleChanged(caller(request), 'a@example.test', 'analyst', 'admin')

    expect(
      (request as Record<symbol, boolean>)[NAMED],
      'a failed named write must not silence the boundary',
    ).toBeUndefined()
    said.mockRestore()
  })
})
