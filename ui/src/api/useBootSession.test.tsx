import { urlOf } from '@/test/fetchArgs'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getSession, resetSessionForTest, setSession } from '@/api/session'
import { SignInContainer } from '@/app/auth/SignInContainer'

import { useBootSession } from './useBootSession'
import { useSession } from '@/api/useSession'

/**
 * The gap `useBootSession` closes: an analyst with a valid cookie and no
 * `localStorage` hint (signed in elsewhere, or a cleared browser) must not be
 * shown React's own sign-in form. Mirrors `signInRouting.test.tsx`'s stand-in
 * shell rather than mounting `App` - the real router's `/ui/` basename
 * matches nothing at jsdom's `http://localhost/`.
 */
function Shell() {
  // **The hold is read here too, and checked before the session**, because
  // that is the order `App` uses: signing in sets a session, so a shell that
  // tested the session first could never show the change screen.
  const { probing, mustChangePassword } = useBootSession()
  const session = useSession()
  if (probing) return <p>probing</p>
  if (mustChangePassword) return <p>change your password</p>
  return session ? <p>Workspace for {session.username}</p> : <SignInContainer onMustChangePassword={() => undefined} />
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  resetSessionForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetSessionForTest()
})

describe('booting with no local identity hint', () => {
  it('seeds the identity and skips the sign-in screen when a session exists', async () => {
    // Better Auth's `get-session`, which replaced `/api/whoami`. It answers
    // with the user record, which is the whole of the hint.
    fetchMock.mockResolvedValue(
      respond(200, { session: { id: 's1' }, user: { id: 'u1', name: 'Analyst One', email: 'analyst@example.test' } }),
    )
    render(<Shell />)

    await waitFor(() => {
      expect(screen.getByText('Workspace for Analyst One')).toBeInTheDocument()
    })
    // The id is the half that matters: the probe is where an analyst who
    // signed in elsewhere gets an identity, and one without an id can address
    // nobody - no avatar, no attribution.
    expect(getSession()).toEqual({ userId: 'u1', username: 'Analyst One' })
    const [url] = fetchMock.mock.calls[0]!
    expect(urlOf(url)).toContain('/api/auth/get-session')
  })

  it('sends an account that owes its own password to the change screen', async () => {
    // **The reload case, which is the one a local flag cannot serve.** The
    // hold lives on the account; a refresh loses whatever the sign-in returned,
    // and without reading it here the workspace mounts over an account the
    // server refuses on every request, with nowhere to send the analyst.
    fetchMock.mockResolvedValue(
      respond(200, {
        session: { id: 's1' },
        user: {
          id: 'u1',
          name: 'Analyst One',
          email: 'analyst@example.test',
          mustChangePassword: true,
        },
      }),
    )
    render(<Shell />)

    await waitFor(() => {
      expect(screen.getByText('change your password')).toBeInTheDocument()
    })
    expect(screen.queryByText('Workspace for Analyst One')).not.toBeInTheDocument()
  })

  it('does not hold an account whose flag is absent rather than false', async () => {
    // A server that has not been told about the field, or a row predating it.
    // Reading absent as held would lock every analyst out of the app.
    fetchMock.mockResolvedValue(
      respond(200, { session: { id: 's1' }, user: { id: 'u1', name: 'Analyst One', email: 'analyst@example.test' } }),
    )
    render(<Shell />)

    await waitFor(() => {
      expect(screen.getByText('Workspace for Analyst One')).toBeInTheDocument()
    })
  })

  it('falls through to the sign-in form on a 401', async () => {
    fetchMock.mockResolvedValue(respond(401, { error: 'Sign in.' }))
    render(<Shell />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^Sign in to/ })).toBeInTheDocument()
    })
    expect(getSession()).toBeNull()
  })
})

describe('booting with a local identity hint already present', () => {
  /**
   * **Re-anchored on the property, not the mechanism.** This asserted
   * `fetchMock` was never called, which held "the hint renders without waiting
   * for a probe" by way of "there is no probe at all". The second is no longer
   * true - the hint is reconciled in the background - and the first is what
   * mattered: nothing blocks on the network when the answer is already known.
   */
  it('renders the workspace straight away, without waiting on a probe', () => {
    // `setSession`, not a raw `localStorage` write: `session.ts` reads its
    // module-level `current` once at import, so writing the store directly
    // would not be seen by `getSession()` inside this same test run.
    setSession({ userId: 'u-analyst', username: 'analyst' })
    // Never resolves. If the render waited on it, nothing would be on screen.
    fetchMock.mockReturnValue(new Promise<Response>(() => undefined))
    render(<Shell />)

    expect(screen.getByText('Workspace for analyst')).toBeInTheDocument()
    expect(screen.queryByText('probing')).not.toBeInTheDocument()
  })

  it('reconciles a hint that has gone stale against the server', async () => {
    // **Re-anchored onto the display name.** The property is that a stored
    // hint is a *cache* rather than a copy that drifts: it was written once at
    // sign-in and never refreshed, so an account renamed under a live session
    // showed the old name until the analyst signed out and back in.
    //
    // It used to ride on `role`, which the Node side does not serve yet. When
    // roles land, this is the test that should gain a case rather than the one
    // to write from scratch.
    setSession({ userId: 'u-Old Name', username: 'Old Name' })
    fetchMock.mockResolvedValue(
      respond(200, { session: { id: 's1' }, user: { id: 'u1', name: 'Analyst One', email: 'analyst@example.test' } }),
    )
    render(<Shell />)

    await waitFor(() => {
      expect(getSession()?.username).toBe('Analyst One')
    })
  })

  it('keeps the hint when the reconcile fails', async () => {
    // A dropped network or a server mid-restart must not sign anyone out: the
    // hint is a render cache, and the first real 401 is what clears it.
    setSession({ userId: 'u-analyst', username: 'analyst' })
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<Shell />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(getSession()).toEqual({ userId: 'u-analyst', username: 'analyst' })
    expect(screen.getByText('Workspace for analyst')).toBeInTheDocument()
  })
})
