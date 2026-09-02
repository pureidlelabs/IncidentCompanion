import { QueryClient } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'


import { App } from './App'
import { AppProviders } from './app/AppProviders'
import { RootError } from './app/RootError'
import './styles/index.css'

/**
 * **Nothing retries, reads included.** Every refusal this API makes is a
 * decision - 401 no session, 403 refused, 404 no such entry, 422 the case
 * refused the data - and retrying a decision only delays showing it. A
 * transport failure is not retried either: the app is on this machine, so not
 * reachable means down rather than flaky.
 *
 * **A 409 is the one that used to be excepted, and it was the lock's.** Reads
 * retried it three times because a whole-case lock answered 409 for *nothing is
 * open for editing*, which became answerable on its own. This server answers
 * 409 only on a versioned write, where it means another analyst wrote first -
 * `openapi.ts` says *"Not a retry, raise a merge review"* - so firing again
 * would overwrite their work. The analyst pressed the button once.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 5_000, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
})

const mount = document.getElementById('root')
if (!mount) throw new Error('index.html has no #root to mount into')

/**
 * **Before the first render, because the first render asks for a case.** A
 * screen mounted ahead of the transport would put its query on the network,
 * where the demo build has nothing listening.
 *
 * Dynamically imported so the demo's handler and its seeded case are a chunk
 * a self-hosted install never fetches.
 */
if (import.meta.env.VITE_DEMO === '1') {
  const { installDemo } = await import('./demo/install')
  await installDemo()
}

createRoot(mount).render(
  <StrictMode>
    {/* Outside the providers: a throw in one of them is a white page too. */}
    <RootError>
      {/* **The ground, from `next-themes`.** It writes `data-theme` on the
          root, resolves `system` through `matchMedia`, and persists the
          choice - the whole of what `useGround`, `theme-preference.ts` and an
          inline script in `index.html` did between them, minus the read logic
          that was duplicated across two of the three.

          **The configuration is one object, spread**, and it lives in
          `theme-preference.ts` beside the storage key `public/theme.js` reads.
          A test that retypes the props asserts a copy of the configuration
          rather than the configuration - which is how `attribute="class"` and
          a drifted `storageKey` both stayed green across three tiers. */}
      <AppProviders client={client}>
        <App />
      </AppProviders>
    </RootError>
  </StrictMode>,
)
