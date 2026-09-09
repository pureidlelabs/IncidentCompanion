/**
 * The stored hint keeps the one mark the evaluation build sets on it.
 */
import { describe, expect, it, vi } from 'vitest'

describe('a stored session hint', () => {
  it('keeps the demo mark, and carries none where none was stored', async () => {
    vi.resetModules()
    window.localStorage.setItem(
      'incidentcompanion.identity',
      JSON.stringify({ userId: 'demo', username: 'Demo analyst', demo: true }),
    )
    const marked = await import('./session')
    expect(marked.getSession()).toEqual({ userId: 'demo', username: 'Demo analyst', demo: true })

    vi.resetModules()
    window.localStorage.setItem(
      'incidentcompanion.identity',
      JSON.stringify({ userId: 'u1', username: 'r.okonkwo', demo: 'yes' }),
    )
    const plain = await import('./session')
    expect(plain.getSession()).toEqual({ userId: 'u1', username: 'r.okonkwo' })
    window.localStorage.clear()
  })
})
