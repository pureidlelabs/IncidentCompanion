import { useEffect, useState } from 'react'
import { RouterProvider } from 'react-router-dom'

import { installIsUnclaimed } from '@/api/client'
import { router } from '@/app/routes'
import { BackendBanner } from '@/components/blocks/backend-banner'
import { ChangePasswordContainer } from '@/app/auth/ChangePasswordContainer'
import { FirstRunContainer } from '@/app/auth/FirstRunContainer'
import { SignInContainer } from '@/app/auth/SignInContainer'
import { useActivityReporter } from '@/api/useActivityReporter'
import { useBootSession } from '@/api/useBootSession'
import { useSession } from '@/api/useSession'

/**
 * Signed out, there is one screen and no routes.
 *
 * The router is mounted only once a session exists, so no route guards itself
 * and no screen renders against a 401. **This is also where a 401 lands**: the
 * client drops the identity on one, `useSession` re-renders, and the sign-in
 * screen replaces the workspace without a navigation - the SPA stays mounted and
 * the URL is still the section the analyst was on, so signing back in returns
 * them to it.
 *
 * **Renders nothing while `useBootSession` probes.** With no hint, an
 * already-valid cookie and no cookie at all are indistinguishable until the
 * probe answers - rendering the sign-in screen first would flash it in front of an
 * analyst who is already signed in, for the one round trip it takes.
 *
 * **Three unauthenticated screens now, not one**, and the identity alone
 * cannot pick between them:
 *
 * - *Unclaimed* is a property of the install, not of the caller, so it is
 *   asked of `GET /api/setup`. Without it a fresh install answers a sign-in
 *   with "that username and password do not match" - true, useless, and it
 *   blames the analyst for a store that has no accounts to match.
 * - *A password change owed* is a signed-in state with no identity written:
 *   `signIn` deliberately holds the identity back there, because mounting the
 *   router for a session that reaches exactly one route gives the analyst a
 *   workspace whose every request 403s.
 *
 * `AuthFrame` docks the theme control itself, so nothing is mounted here -
 * signed in, `CaseShell` and `PickerShell` dock `RailGroundSwitcher` at their
 * own rail's foot instead.
 */
export function App() {
  const session = useSession()
  const { probing, mustChangePassword: heldOnBoot } = useBootSession()
  const [unclaimed, setUnclaimed] = useState<boolean | null>(null)
  const [heldOnSignIn, setHeldOnSignIn] = useState(false)
  // **The one thing that clears the hold, and nothing else can.** Neither
  // source below is asked again after a change: the probe runs once per mount
  // and the sign-in answer is remembered, so without this the analyst replaces
  // their password and stays on the change screen until they reload.
  const [chosenOwn, setChosenOwn] = useState(false)
  // **Either source, and the boot probe is the one that survives a reload.**
  // The sign-in answer is what makes the screen appear without a round trip;
  // the probe is what keeps it there when the analyst refreshes instead of
  // filling the form in.
  const mustChangePassword = !chosenOwn && (heldOnBoot || heldOnSignIn)
  useActivityReporter(session !== null)

  // Asked once, and only while nobody is signed in: a session is proof the
  // install is claimed, so the probe would be answering a settled question on
  // every boot an analyst actually has.
  useEffect(() => {
    if (session !== null || probing) return
    let live = true
    void installIsUnclaimed()
      .then((answer) => {
        if (live) setUnclaimed(answer)
      })
      // A failure here is not a claimed install and must not be read as one:
      // showing the sign-in form is the safe wrong answer, since it refuses
      // rather than offering to create an admin.
      .catch(() => {
        if (live) setUnclaimed(false)
      })
    return () => {
      live = false
    }
  }, [session, probing])

  if (probing) return null

  return (
    <>
      {/*
        **The hold is tested before the session**, and that order is the whole
        of it: signing in *sets* a session, so with the branches the other way
        round the workspace won and the change screen was unreachable on the
        one path that always reaches it.
      */}
      {mustChangePassword ? (
        <ChangePasswordContainer onChanged={() => setChosenOwn(true)} />
      ) : session ? (
        <RouterProvider router={router} />
      ) : unclaimed === null ? null : unclaimed ? (
        <FirstRunContainer />
      ) : (
        <SignInContainer onMustChangePassword={() => setHeldOnSignIn(true)} />
      )}
      {/*
        **Outside the branch, so it draws on the sign-in screen too.** A
        backend that cannot reach Postgres refuses every sign-in with a
        credentials error, which blames the analyst for an outage - this is
        the one screen where knowing the cause changes what they do.
        `/api/health` is public, so the poll needs no session.
      */}
      <BackendBanner />
      {/* The toast region is in `AppProviders`, so a story mounts it too. */}
    </>
  )
}
