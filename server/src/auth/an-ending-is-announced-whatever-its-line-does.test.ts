/**
 * A session's ending reaches its open connections even when the audit line
 * for it cannot be written. -> `openspec/specs/live/spec.md`
 */
import { afterEach, describe, expect, it } from 'vitest'

import { authOptions } from './auth.config.js'
import { onSessionEnded } from './session-ended.js'

describe('a sign-out whose line cannot be written', () => {
  const heard: [string, string, boolean][] = []
  const stop = onSessionEnded((userId, sessionId, recorded) => {
    heard.push([userId, sessionId, recorded])
  })
  afterEach(() => {
    heard.length = 0
  })

  it('is still announced, as unrecorded', async () => {
    const failing = {
      select: () => {
        throw new Error('the store did not answer')
      },
    }
    const hook = authOptions(failing as never, 'not-a-real-secret-for-tests', 'https://127.0.0.1:8124')
      .databaseHooks.session.delete.after

    await hook({ id: 's-1', userId: 'u-1' }, { path: '/sign-out' }).catch(() => undefined)
    stop()

    expect(heard).toEqual([['u-1', 's-1', false]])
  })
})
