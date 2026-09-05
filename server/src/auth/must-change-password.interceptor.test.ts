/**
 * The hold on an account that owes its own password.
 */
import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { MustChangePasswordInterceptor } from './must-change-password.interceptor.js'

/** An execution context carrying one request, which is all the guard reads. */
function contextFor(
  path: string,
  session?: { user?: { mustChangePassword?: boolean } },
  type = 'http',
) {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => ({ path, url: path, session }) }),
  } as never
}

const interceptor = new MustChangePasswordInterceptor()

/** Stands in for the rest of the chain; `true` means the request went through. */
const next = { handle: () => true as never }

/** Whether a request would be served. Throws exactly as the interceptor does. */
const allows = (context: never): boolean =>
  interceptor.intercept(context, next) as unknown as boolean
const held = { user: { mustChangePassword: true } }

describe('an account that owes its own password', () => {
  it('may reach the change route', () => {
    expect(allows(contextFor('/api/change-password', held))).toBe(true)
  })

  it("may reach authentication's own surface, or it cannot sign out", () => {
    // Dropping this locks the analyst in: the change screen reads the session
    // to know whose password it is changing, and Sign out is the only other
    // way off the screen.
    expect(allows(contextFor('/api/auth/get-session', held))).toBe(true)
    expect(allows(contextFor('/api/auth/sign-out', held))).toBe(true)
  })

  it('is refused the case it was created to work on', () => {
    expect(() => allows(contextFor('/api/cases', held))).toThrow(ForbiddenException)
  })

  it('is refused a read, not only a write', () => {
    // A held account is not a read-only account. It is an account that has not
    // finished being created, and a case is exactly what it must not see with
    // a password its administrator also knows.
    expect(() => allows(contextFor('/api/cases/abc/timeline', held))).toThrow(
      ForbiddenException,
    )
  })

  it('is refused the accounts pane, which is where it would lift its own hold', () => {
    expect(() => allows(contextFor('/api/accounts', held))).toThrow(
      ForbiddenException,
    )
  })

  it('says why, so a client that did not ask can route on the answer', () => {
    try {
      allows(contextFor('/api/cases', held))
      expect.unreachable('a held account reached the case list')
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        mustChangePassword: true,
      })
    }
  })
})

describe('the paths that stay open', () => {
  it('does not open a route that merely begins like an allowed one', () => {
    // The reason the list is exact rather than prefixes: a route added later
    // and named to sit beside the change screen would otherwise inherit its
    // exemption, and nobody would have decided that.
    expect(() =>
      allows(contextFor('/api/change-password-policy', held)),
    ).toThrow(ForbiddenException)
  })

  it('opens the whole of authentication and nothing shaped like it', () => {
    expect(allows(contextFor('/api/auth/callback/x', held))).toBe(true)
    expect(() => allows(contextFor('/api/authorship', held))).toThrow(
      ForbiddenException,
    )
  })

  it('decides on the path and not on the query a client appended', () => {
    expect(allows(contextFor('/api/change-password?next=/cases', held))).toBe(true)
  })
})

describe('an account that owes nothing', () => {
  it('is let through everywhere', () => {
    const free = { user: { mustChangePassword: false } }
    expect(allows(contextFor('/api/cases', free))).toBe(true)
  })

  it('is let through when the flag is absent rather than false', () => {
    // A bearer, a probe, or a row written before the column existed. Treating
    // absent as held would lock out every one of them.
    expect(allows(contextFor('/api/cases', { user: {} }))).toBe(true)
  })

  it('leaves an unauthenticated request to the guard that owns it', () => {
    // Answering 403 here would turn every anonymous request into the wrong
    // error, and hide a genuine sign-in problem behind a password-change one.
    expect(allows(contextFor('/api/cases', undefined))).toBe(true)
  })

  it('ignores a non-http context rather than reading a request that is not there', () => {
    expect(allows(contextFor('/api/cases', held, 'ws'))).toBe(true)
  })
})
