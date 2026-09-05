import { urlOf } from '@/test/fetchArgs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  reportActivity,
  request,
  requestBlob,
  requestBody,
  signIn,
  signOut,
} from './client'
import { getSession, setSession } from './session'

/**
 * **jsdom cannot hold an `HttpOnly` cookie**, so nothing here proves the cookie
 * travels - `document.cookie` cannot see one and the fetch mock is not a
 * browser. What these tests hold is the *contract* that makes it travel:
 * `credentials: 'include'` on every request, no `Authorization` header on any
 * of them, and what the client does with the answers. A served-mode probe is
 * what covers the rest.
 */
function respond(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * What Better Auth answers a successful `sign-in/email` with.
 *
 * **Not snake_case.** The shape this replaces carried `session_access`,
 * `access` and a bearer; none of them exist now, which is why the tests that
 * pinned them are re-anchored rather than adjusted.
 */
function signInBody(overrides: Record<string, unknown> = {}) {
  return {
    redirect: false,
    token: 'a-session-token',
    user: {
      id: 'u1',
      name: 'Analyst One',
      email: 'analyst@example.test',
      emailVerified: false,
      image: null,
    },
    ...overrides,
  }
}

const EMAIL = 'analyst@example.test'

const fetchMock = vi.fn<typeof fetch>()

function initOf(call: number): RequestInit {
  return fetchMock.mock.calls[call]![1]!
}

function headersOf(call: number): Record<string, string> {
  return (initOf(call).headers ?? {}) as Record<string, string>
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  window.localStorage.clear()
  setSession(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('the API client', () => {
  it('never sends an Authorization header, signed in or not', async () => {
    // The property this file used to pin was the opposite one. An
    // `Authorization` header now takes the request down `_authorised`'s
    // *external client* path, which the install-wide API level bounds and which
    // is off by default -- so attaching a bearer as well would break every
    // write on a default install rather than reinforce anything.
    fetchMock.mockResolvedValueOnce(respond(200, signInBody()))
    await signIn(EMAIL, 'secret')
    fetchMock.mockResolvedValueOnce(respond(200, []))
    await request('/cases')
    fetchMock.mockResolvedValueOnce(respond(200, {}))
    await requestBody('/cases/import', new File(['bytes'], 'case.iccase'))

    for (const call of [0, 1, 2]) {
      expect(headersOf(call).authorization).toBeUndefined()
    }
  })

  it('includes credentials on every request, so the session cookie travels', async () => {
    // **The app's own requests only.** Sign-in goes through Better Auth's
    // client, which builds its own fetch and is covered separately below -
    // asserting over it here would be pinning a library's internals.
    fetchMock.mockResolvedValueOnce(respond(200, []))
    await request('/cases')
    fetchMock.mockResolvedValueOnce(respond(200, {}))
    await requestBody('/cases/import', new File(['bytes'], 'case.iccase'))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await reportActivity()

    for (const call of [0, 1, 2]) {
      expect(initOf(call).credentials).toBe('include')
    }
  })

  it('stores the id alongside the name, and nothing else', async () => {
    // **Re-anchored twice, and the property genuinely changed both times.**
    // It pinned `session_access` over `access` while the server reported two
    // rungs; there is no install-wide rung any more. It then pinned the name
    // *alone*, which was the defect: an avatar URL and a row's attribution are
    // keyed on the id, so an identity without one can address nobody. The
    // analyst's own face could not render anywhere in the app.
    fetchMock.mockResolvedValue(respond(200, signInBody()))
    await signIn(EMAIL, 'secret')
    expect(getSession()).toEqual({ userId: 'u1', username: 'Analyst One' })
  })

  it('falls back to the email when the account has no name to show', async () => {
    fetchMock.mockResolvedValue(
      respond(200, signInBody({ user: { id: 'u1', name: '  ', email: EMAIL } })),
    )
    await signIn(EMAIL, 'secret')
    expect(getSession()?.username).toBe(EMAIL)
  })

  it('sends the credential to Better Auth as an email, not a username', async () => {
    fetchMock.mockResolvedValue(respond(200, signInBody()))
    await signIn(EMAIL, 'secret')
    const [url] = fetchMock.mock.calls[0]!
    expect(urlOf(url)).toContain('/api/auth/sign-in/email')
    expect(JSON.parse(initOf(0).body as string)).toMatchObject({
      email: EMAIL,
      password: 'secret',
    })
  })

  it('throws when Better Auth reports a refusal in the body rather than by rejecting', async () => {
    // The trap this pins: a failed sign-in resolves. Reading `data` without
    // checking `error` renders a signed-in analyst with no user.
    fetchMock.mockResolvedValue(respond(401, { message: 'Invalid email or password' }))
    const error = await signIn(EMAIL, 'wrong').catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(ApiError)
    expect(getSession()).toBeNull()
  })

  it('reports a 403 as an ApiError rather than throwing something generic', async () => {
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(respond(403, { error: 'read-only' }))
    const error = await request('/cases/X/timeline/1', { method: 'PATCH', body: {} }).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
    expect((error as ApiError).needsSignIn).toBe(false)
    expect((error as ApiError).message).toBe('read-only')
  })

  /**
   * **The refusal the server actually sends, not the one the client assumed.**
   * A validation failure answers 422 with
   * `{message, errors: [{path, message}]}` - no `error` key at all - so a
   * reader looking only for `error` fell through to `response.statusText` and
   * showed the analyst **"Unprocessable Entity"**.
   *
   * Measured 2026-08-12 against the running server: pressing Create on an
   * empty network-indicator form put that phrase on screen while the body it
   * came from said *"An indicator needs an IP or a domain."*
   */
  it('reports the field message a 422 carries, not the status phrase', async () => {
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(
      respond(422, {
        message: 'Validation failed',
        errors: [{ code: 'custom', path: ['domain'], message: 'An indicator needs an IP or a domain.' }],
      }),
    )
    const error = await request('/cases/X/network_indicators', {
      method: 'POST',
      body: {},
    }).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).message).toBe('An indicator needs an IP or a domain.')
  })

  /** Several refused fields are all named: one of them is not the answer. */
  it('names every field a 422 refused', async () => {
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(
      respond(422, {
        message: 'Validation failed',
        errors: [
          { path: ['name'], message: 'Required.' },
          { path: ['seenAt'], message: 'Not a date.' },
        ],
      }),
    )
    const error = await request('/cases/X/assets', { method: 'POST', body: {} }).catch(
      (thrown: unknown) => thrown,
    )
    expect((error as ApiError).message).toBe('Required. Not a date.')
  })

  /**
   * **A refusal with no field detail still says something.** A 500 carries
   * `message` and no `errors`, and falling through to the status phrase there
   * is the same failure in a rarer shape.
   */
  it('falls back to the body message before the status phrase', async () => {
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(respond(500, { message: 'the case is locked' }))
    const error = await request('/cases/X', { method: 'GET' }).catch((thrown: unknown) => thrown)
    expect((error as ApiError).message).toBe('the case is locked')
  })

  it('routes a 401 to the sign-in screen by dropping the identity', async () => {
    // Dropping it is the whole routing mechanism: `App` renders `SignInForm`
    // whenever `useSession()` is null. Nothing navigates, so the SPA stays
    // mounted on the route the analyst was on.
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(respond(401, { error: 'That session has ended.' }))
    const error = await request('/cases').catch((thrown: unknown) => thrown)
    expect((error as ApiError).needsSignIn).toBe(true)
    expect(getSession()).toBeNull()
  })

  it('does not report an HTML page as malformed JSON', async () => {
    // `/api` answers JSON, so HTML means the request left the API prefix and
    // met `AuthGate`'s 303 to the sign-in path. Surfacing "Unexpected
    // token <" would send the next reader after a parser bug.
    fetchMock.mockResolvedValue(
      new Response('<!doctype html><title>Sign in</title>', { status: 401 }),
    )
    const error = await request('/cases').catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).needsSignIn).toBe(true)
  })

  it('signs out on the server before clearing anything', async () => {
    // Clearing locally is not the control: the cookie is a signed claim, so a
    // copy taken a moment earlier stays valid until the server revokes the
    // session id. A sign-out that only cleared state would pass every other
    // assertion in this file. The path moved to Better Auth's; the property
    // did not.
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(respond(200, { success: true }))
    await signOut()
    const [url] = fetchMock.mock.calls[0]!
    expect(urlOf(url)).toContain('/api/auth/sign-out')
    expect(initOf(0).method).toBe('POST')
    expect(getSession()).toBeNull()
  })

  it('clears local state even when the logout call fails', async () => {
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await signOut()
    expect(getSession()).toBeNull()
  })

  it('stores an identity that is not a credential', async () => {
    // The token is gone from the client entirely; what persists is a name, so
    // a reload can render the shell. A regression that put a bearer back into
    // storage would pass every other test in this file.
    fetchMock.mockResolvedValue(respond(200, signInBody({ token: 'a-session-token' })))
    await signIn(EMAIL, 'secret')
    const stored = [
      ...Object.values(window.localStorage),
      ...Object.values(window.sessionStorage),
      document.cookie,
    ].join('|')
    // Better Auth returns a session token in the body as well as setting the
    // cookie. It must not reach storage: the cookie is the credential, and a
    // copy anywhere a script can read is the thing this whole design removed.
    expect(stored).not.toContain('a-session-token')
    expect(stored).toContain('Analyst One')
  })
})

describe('the identity restored on reload', () => {
  it('is read back from storage, so a reload does not sign the analyst out', async () => {
    // The defect the cookie work exists to fix. The module reads storage once
    // at import, so a reload is simulated by re-importing it -- `setSession`
    // alone would prove only that the setter works.
    fetchMock.mockResolvedValue(respond(200, signInBody()))
    await signIn(EMAIL, 'secret')

    vi.resetModules()
    const reloaded = await import('./session')
    expect(reloaded.getSession()).toEqual({ userId: 'u1', username: 'Analyst One' })
  })

  /**
   * **Half an identity is no identity.** A hint written before the id existed
   * restores a name the app cannot draw a face or an attribution from, and
   * every consumer would need a branch for it. The cost of dropping it is one
   * sign-in, once - and there is no install where that has to be smoother.
   */
  it('is null when storage holds a name with no id', async () => {
    window.localStorage.setItem(
      'incidentcompanion.identity',
      JSON.stringify({ username: 'Analyst One' }),
    )

    vi.resetModules()
    const reloaded = await import('./session')
    expect(reloaded.getSession()).toBeNull()
  })

  it('is nothing after sign-out, so a reload lands on the sign-in screen', async () => {
    fetchMock.mockResolvedValue(respond(200, signInBody()))
    await signIn(EMAIL, 'secret')
    fetchMock.mockResolvedValue(respond(200, { success: true }))
    await signOut()

    vi.resetModules()
    const reloaded = await import('./session')
    expect(reloaded.getSession()).toBeNull()
  })

  it('is null rather than a crash when storage holds something else', async () => {
    window.localStorage.setItem('incidentcompanion.identity', 'not json')
    vi.resetModules()
    const reloaded = await import('./session')
    expect(reloaded.getSession()).toBeNull()
  })
})

describe('multipart requests', () => {
  it('sends a file as the whole body, with no content-type of its own set', async () => {
    // The browser writes `content-type` from the `File`, which is what the
    // evidence row records - a header set by hand would overwrite it.
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(respond(200, { case_id: 'INC-1' }))
    const file = new File(['bytes'], 'case.iccase', { type: 'application/octet-stream' })

    await requestBody('/cases/import', file)

    const [url] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/cases/import')
    expect(initOf(0).method).toBe('POST')
    expect(initOf(0).body).toBe(file)
  })

  it('maps a 422 the same way request() does', async () => {
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(respond(422, { error: 'archive is encrypted' }))
    const error = await requestBody('/cases/import', new File([''], 'x')).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('archive is encrypted')
  })
})

describe('binary responses', () => {
  it('reads the blob and the filename Content-Disposition names, on success', async () => {
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(
      new Response('bytes', {
        status: 200,
        headers: { 'content-disposition': 'attachment; filename="INC-1.iccase"' },
      }),
    )

    const result = await requestBlob('/cases/INC-1/archive', { passphrase: 'x' })

    expect(result.filename).toBe('INC-1.iccase')
    expect(await result.blob.text()).toBe('bytes')
    expect(initOf(0).method).toBe('POST')
    expect(JSON.parse(initOf(0).body as string)).toEqual({ passphrase: 'x' })
  })

  it('falls back to a generic name when the server sends none', async () => {
    fetchMock.mockResolvedValue(new Response('bytes', { status: 200 }))
    const result = await requestBlob('/cases/INC-1/archive')
    expect(result.filename).toBe('export')
  })

  it('maps a refusal the same way request() does, never as a blob', async () => {
    fetchMock.mockResolvedValue(respond(422, { error: '`passphrase` must be at least 12 characters' }))
    const error = await requestBlob('/cases/INC-1/archive', { passphrase: 'x' }).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('`passphrase` must be at least 12 characters')
  })

  it('drops the session on a 401, like every other route', async () => {
    setSession({ userId: 'u-a', username: 'a' })
    fetchMock.mockResolvedValue(respond(401, { error: 'session expired' }))
    await requestBlob('/cases/INC-1/archive').catch(() => undefined)
    expect(getSession()).toBeNull()
  })
})

describe('reporting activity', () => {
  it('touches the session, which is what the idle window is made of', async () => {
    // **Re-anchored when the backend changed, not relaxed.** The retired
    // Python tier answered `POST /activity` and advanced an idle clock with
    // it. Node has no such
    // route - the sweep caught every pointer event posting to a 404 - and its
    // idle window *is* the session's expiry, which a read moves forward. The
    // property held here is unchanged: a real input event reaches whatever
    // owns the clock.
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    await reportActivity()
    const [url] = fetchMock.mock.calls[0]!
    // Absolute, not relative to the SPA's /ui/ base -- `/ui/api/...` would be
    // answered by the SPA fallback with a 200 and advance no clock.
    expect(url).toBe('/api/auth/get-session')
    expect(initOf(0).method).toBe('GET')
  })

  it('swallows a failure, because the server-side gate is the control', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await expect(reportActivity()).resolves.toBeUndefined()
  })
})

describe('the field errors a 422 carries', () => {
  /**
   * **The server already sends them and the client threw them away.** Measured
   * against the running app - `POST /network_indicators` with an empty value,
   * an unknown triage and a key the schema has no place for answers:
   *
   *     {"message":"Validation failed","errors":[
   *       {"code":"too_small","path":["value"],"message":"Too small: ..."},
   *       {"code":"invalid_value","path":["triage"],"message":"Invalid option: ..."},
   *       {"code":"unrecognized_keys","keys":["kind"],"path":[],"message":"..."}]}
   *
   * Everything a refusal toast needs to say *which* field is wrong is in there.
   * Until this, the toast showed `error.message` alone - "Validation failed" -
   * which names nothing the analyst can act on.
   */
  it('names the field each issue is about', () => {
    const error = new ApiError(422, 'Validation failed', {
      message: 'Validation failed',
      errors: [
        { code: 'too_small', path: ['value'], message: 'Too small: expected >=1 characters' },
        { code: 'invalid_value', path: ['triage'], message: 'Invalid option' },
      ],
    })

    expect(error.fieldErrors).toEqual([
      { field: 'value', message: 'Too small: expected >=1 characters' },
      { field: 'triage', message: 'Invalid option' },
    ])
  })

  /**
   * **An unrecognised key has an empty `path`**, and the names are in `keys`
   * instead. Joining the path alone would draw a detail row with no field on
   * it, which reads as a fault in the toast rather than in the write.
   */
  it('falls back to the keys an unrecognised-key issue names', () => {
    const error = new ApiError(422, 'Validation failed', {
      errors: [
        { code: 'unrecognized_keys', keys: ['kind'], path: [], message: 'Unrecognized key: "kind"' },
      ],
    })

    expect(error.fieldErrors).toEqual([{ field: 'kind', message: 'Unrecognized key: "kind"' }])
  })

  /**
   * A nested path is joined, so a field inside an object is named the way the
   * form names it rather than as `[object Object]` or a bare leaf that two
   * branches could both claim.
   */
  it('joins a nested path', () => {
    const error = new ApiError(422, 'Validation failed', {
      errors: [{ path: ['fields', 'severity'], message: 'Invalid option' }],
    })

    expect(error.fieldErrors[0]?.field).toBe('fields.severity')
  })

  /**
   * **Empty rather than thrown, for every shape that is not a Zod issue list.**
   * A 409, a 500 with an HTML body and a network failure all reach the same
   * reporter, and a toast that throws while reporting a failure loses the
   * failure as well as itself.
   */
  it('is empty for a body carrying no issues', () => {
    expect(new ApiError(409, 'Conflict', { heldBy: 'Ada' }).fieldErrors).toEqual([])
    expect(new ApiError(500, 'Server error', null).fieldErrors).toEqual([])
    expect(new ApiError(500, 'Server error', '<html>').fieldErrors).toEqual([])
    expect(new ApiError(422, 'Validation failed', { errors: 'not a list' }).fieldErrors).toEqual([])
  })

  /**
   * **A non-iterable `errors` would throw rather than be skipped**, and the
   * string case above does not catch it: a string iterates, and every
   * character falls out of the object check one line down. Found by
   * break-verify - swapping the `Array.isArray` guard for an `undefined` check
   * left the suite green.
   */
  it('is empty for an errors field that cannot be iterated', () => {
    expect(() => new ApiError(422, 'Validation failed', { errors: 42 })).not.toThrow()
    expect(new ApiError(422, 'Validation failed', { errors: 42 }).fieldErrors).toEqual([])
  })

  /**
   * An issue with no usable message is dropped rather than drawn blank: a
   * detail row saying nothing is worse than one fewer row, because it reads as
   * a field the analyst cannot see the problem with.
   */
  it('drops an issue with no message', () => {
    const error = new ApiError(422, 'Validation failed', {
      errors: [{ path: ['value'] }, { path: ['triage'], message: 'Invalid option' }],
    })

    expect(error.fieldErrors).toEqual([{ field: 'triage', message: 'Invalid option' }])
  })

  /**
   * **An empty string is a message that is present and says nothing**, which
   * the missing-message case above does not reach - `typeof '' === 'string'`.
   * Found by break-verify: dropping the emptiness half of that guard left
   * every other case green.
   */
  it('drops an issue whose message is empty', () => {
    const error = new ApiError(422, 'Validation failed', {
      errors: [{ path: ['value'], message: '' }],
    })

    expect(error.fieldErrors).toEqual([])
  })
})
