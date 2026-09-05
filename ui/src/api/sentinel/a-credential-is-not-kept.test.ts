/**
 * **The platform credential dies with the tab, and only the platform's name
 * survives it.**
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
   * The other half.
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
