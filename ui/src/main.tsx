import { QueryClient } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'


import { App } from './App'
import { AppProviders } from './app/AppProviders'
import { RootError } from './app/RootError'
import './styles/index.css'

/**
 * **Nothing retries, reads included.**
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
 * **Before the first render, because the first render asks for a case.**
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
