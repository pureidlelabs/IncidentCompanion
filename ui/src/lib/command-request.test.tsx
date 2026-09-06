import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { COMMAND_PARAM, commandPath, useCommandRequest } from './command-request'

/**
 * A command arrives on the URL, so its name is whatever somebody typed there.
 *
 * **The attack is a name off the prototype.** `constructor` and `toString` sit
 * on every object, so a bare index hands back a function for a command the
 * caller never registered, and a check for `undefined` waves it through. This
 * is the same trap `canonicalSlug` refuses with `Object.hasOwn`.
 */
function Probe({ handlers }: { handlers: Record<string, () => void> }) {
  useCommandRequest(handlers)
  return null
}

function askFor(value: string) {
  window.history.replaceState(null, '', `/cases/abc/timeline?${COMMAND_PARAM}=${value}`)
}

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useCommandRequest', () => {
  it('runs a command the caller registered, once, and clears it', () => {
    const ran = vi.fn()
    askFor('new-entry')
    render(<Probe handlers={{ 'new-entry': ran }} />)

    expect(ran).toHaveBeenCalledTimes(1)
    expect(new URLSearchParams(window.location.search).get(COMMAND_PARAM)).toBeNull()
  })

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'])(
    'refuses %s, which is on the prototype and not a registered command',
    (name) => {
      const ran = vi.fn()
      askFor(name)
      expect(() => render(<Probe handlers={{ 'new-entry': ran }} />)).not.toThrow()
      expect(ran).not.toHaveBeenCalled()
      // **The parameter surviving is what says nothing dispatched.** `ran` not
      // being called is satisfied by the defect too: `constructor` and
      // `toString` are functions, so a bare index dispatches one of those
      // instead and the registered handler is untouched either way. Clearing
      // happens only once a handler is found, so the parameter still being
      // there is the state the bug cannot produce.
      expect(new URLSearchParams(window.location.search).get(COMMAND_PARAM)).toBe(name)
    },
  )

  it('leaves an unknown command alone rather than clearing it', () => {
    askFor('no-such-command')
    render(<Probe handlers={{ 'new-entry': vi.fn() }} />)

    // Not cleared: clearing a parameter nothing answered would hide a typo in
    // a link somebody sent.
    expect(new URLSearchParams(window.location.search).get(COMMAND_PARAM)).toBe('no-such-command')
  })

  it('builds an address a section can read back', () => {
    expect(commandPath('/cases/abc', 'timeline', 'new-entry')).toBe(
      `/cases/abc/timeline?${COMMAND_PARAM}=new-entry`,
    )
  })
})
