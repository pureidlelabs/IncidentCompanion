import { useEffect, useState } from 'react'

import { authClient } from '@/api/authClient'
import { identityFrom } from '@/api/client'
import { getSession, setSession } from '@/api/session'

/**
 * Seeds the display identity from an already-valid session cookie on boot, and
 * reconciles a stored one against the server.
 *
 * **The gap this closes**: an analyst signed in elsewhere - another tab, or a
 * `localStorage` clear on this one - arrives with a cookie that already
 * authorises every call, and nothing else asks the session route who that is.
 * Only this session's own sign-in writes the hint, so without this the SPA
 * shows its sign-in form over a session the server already has.
 *
 * **Only the *absence* of a hint blocks.** With one the screen renders from it
 * immediately and the probe runs behind it, so nothing the analyst waits for is
 * spent.
 *
 * **The reconcile is not optional.** A stored hint is a cache of the session
 * route's answer, and a field added to that answer - or a role changed under a
 * live session - leaves every already-signed-in browser holding a hint without
 * it. Reconciling once per boot is what makes the hint a cache rather than a
 * copy that drifts.
 *
 * A 401 and a network failure are the same outcome *when there is no hint*:
 * fall through to sign-in. With a hint, both leave it alone - the first real
 * 401 clears it (`client.ts`), and signing somebody out because a probe failed
 * is worse than a stale name.
 */
export function useBootSession(): { probing: boolean; mustChangePassword: boolean } {
  const [probing, setProbing] = useState(() => getSession() === null)
  const [mustChangePassword, setMustChangePassword] = useState(false)

  useEffect(() => {
    let cancelled = false
    authClient
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        // No session is not an error here - Better Auth answers `null` rather
        // than 401 - so the hint is left alone exactly as on a failed probe.
        if (data?.user) setSession(identityFrom(data.user))
        // **Read here rather than remembered from the sign-in.** The hold has
        // to survive a reload: it lives on the account, and a page refresh
        // otherwise mounted the workspace over an account the server refuses
        // on every request, with nowhere to send the analyst.
        const held = (data?.user as { mustChangePassword?: unknown } | undefined)
          ?.mustChangePassword
        setMustChangePassword(held === true)
      })
      .catch(() => {
        // No cookie, an expired one, or the server unreachable. With no hint,
        // `SignInForm` is the fallback for all three, exactly as an explicit
        // sign-in failure already renders it; with one, it stands.
      })
      .finally(() => {
        if (!cancelled) setProbing(false)
      })
    return () => {
      cancelled = true
    }
    // Once per mount, whether or not a hint was there - `probing` as a
    // dependency would re-run this the moment the first probe cleared it.
  }, [])

  return { probing, mustChangePassword }
}
