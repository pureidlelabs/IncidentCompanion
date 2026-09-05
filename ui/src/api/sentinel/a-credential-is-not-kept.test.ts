/**
 * **The platform credential dies with the tab, and only the platform's name
 * survives it.**
 *
 * `incident-import` asks for exactly that split: *when their browser session
 * ends, the credential is gone, and what remains is only enough to identify
 * which platform to offer next time.*
 *
 * The provider's own comment says why it is the cache location that decides:
 * *"`sessionStorage` and `localStorage` both put an Azure access token where
 * another script on this origin can read it and where it outlives the tab."*
 * Nothing asserted it, and changing one string is all it would take -- a
 * change that leaves every existing test green, because a token cached
 * anywhere still satisfies *reuses a cached token instead of a popup*.
 */
import { describe, expect, it, vi } from 'vitest'

import { msalTokenProvider } from './msalTokenProvider'
import { EMPTY_CONNECTION, loadConnection, saveConnection, CONNECTION_KEY } from './connectionConfig'

/** What the application was constructed with, captured from the constructor. */
const built: Record<string, unknown>[] = []

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: class {
    constructor(config: Record<string, unknown>) {
      built.push(config)
    }
    initialize() {
      return Promise.resolve()
    }
    getAllAccounts() {
      return []
    }
    acquireTokenSilent() {
      return Promise.reject(new Error('not needed by this file'))
    }
  },
  InteractionRequiredAuthError: class extends Error {},
  BrowserAuthError: class extends Error {},
}))

const CONFIG = { ...EMPTY_CONNECTION, tenantId: 'contoso.onmicrosoft.com', clientId: 'client-guid' }

describe('the credential an importer holds', () => {
  it('is cached where a closed tab takes it with it', async () => {
    built.length = 0
    const provider = msalTokenProvider(CONFIG)

    // Any acquisition builds the application; the token itself is not the
    // subject and the stub refuses it.
    await provider.acquireToken([]).catch(() => undefined)

    expect(built, 'no application was built, so nothing was asserted about its cache').toHaveLength(
      1,
    )

    const cache = built[0]?.cache as { cacheLocation?: string } | undefined
    expect(
      cache?.cacheLocation,
      'the access token is cached somewhere that outlives the tab, and somewhere another ' +
        'script on this origin can read it',
    ).toBe('memoryStorage')
  })

  /**
   * The other half. What persists must be enough to offer the same platform
   * again and no more, so this asserts on the raw stored text rather than the
   * parsed shape: a token added to `ConnectionConfig` would round-trip through
   * `loadConnection` perfectly well.
   */
  it('leaves behind the platform to offer and nothing that could be used as one', () => {
    saveConnection(CONFIG)

    const raw = window.localStorage.getItem(CONNECTION_KEY) ?? ''
    expect(raw, 'nothing was stored, so this asserts nothing about what remains').not.toBe('')

    for (const secret of ['token', 'secret', 'bearer', 'password', 'assertion', 'credential']) {
      expect(
        raw.toLowerCase().includes(secret),
        `what outlives the session names a ${secret}, so the credential is kept after all`,
      ).toBe(false)
    }

    expect(loadConnection().tenantId, 'the platform cannot be offered again').toBe(CONFIG.tenantId)
  })
})
