import { BrowserAuthError, EventType, InteractionRequiredAuthError } from '@azure/msal-browser'
import type {
  AccountInfo,
  AuthenticationResult,
  EventCallbackFunction,
  EventMessage,
  IPublicClientApplication,
} from '@azure/msal-browser'
import { describe, expect, it, vi } from 'vitest'

import { isConfigured, msalTokenProvider, signInFailure } from './msalTokenProvider'
import { EMPTY_CONNECTION } from './connectionConfig'

const CONFIG = { tenantId: 'contoso.onmicrosoft.com', clientId: 'client-guid' }

/** `msalTokenProvider`'s own poll rate, which the timings here are written against. */
const POPUP_POLL_MS = 500

const ACCOUNT = {
  homeAccountId: 'home', environment: 'login.microsoftonline.com',
  tenantId: 't', username: 'analyst@contoso.invalid', localAccountId: 'l',
} as AccountInfo

function result(token: string, account: AccountInfo | null = ACCOUNT): AuthenticationResult {
  return {
    accessToken: token, account, expiresOn: new Date('2026-08-03T13:00:00Z'),
    scopes: [], uniqueId: '', tenantId: '', idToken: '', idTokenClaims: {},
    authority: '', fromCache: false, correlationId: '', tokenType: 'Bearer',
  } as unknown as AuthenticationResult
}

/**
 * A stub with only the calls this provider makes, and its spies beside it.
 *
 * Spies returned separately rather than read back off the object:
 * `expect(spy.acquireTokenPopup)` detaches a method from its receiver, which
 * `@typescript-eslint/unbound-method` refuses for a real reason even where a
 * stub does not care.
 */
function fakeMsal(over: Partial<IPublicClientApplication> = {}) {
  const spies = {
    initialize: vi.fn(() => Promise.resolve()),
    getActiveAccount: vi.fn(() => null),
    getAllAccounts: vi.fn(() => []),
    setActiveAccount: vi.fn(),
    acquireTokenSilent: vi.fn(() => Promise.resolve(result('silent-token'))),
    acquireTokenPopup: vi.fn(() => Promise.resolve(result('popup-token'))),
    addEventCallback: vi.fn((_callback: EventCallbackFunction) => 'callback-id'),
    removeEventCallback: vi.fn(),
  }
  const app = { ...spies, ...over } as unknown as IPublicClientApplication
  return { app, ...spies }
}

describe('whether a sign-in can even be attempted', () => {
  it('refuses an empty config rather than letting MSAL throw from its constructor', () => {
    expect(isConfigured(EMPTY_CONNECTION)).toBe(false)
    expect(isConfigured({ ...CONFIG, clientId: '   ' })).toBe(false)
    expect(isConfigured(CONFIG)).toBe(true)
  })

  it('does not require a workspace, which is picked after signing in', () => {
    expect(isConfigured({ ...CONFIG })).toBe(true)
  })
})

describe('acquiring a token', () => {
  it('signs in interactively when no account is cached', async () => {
    const { app, ...spy } = fakeMsal()
    const provider = msalTokenProvider(CONFIG, { application: app })

    expect(await provider.acquireToken(['scope'])).toBe('popup-token')
    expect(spy.acquireTokenSilent).not.toHaveBeenCalled()
    expect(spy.setActiveAccount).toHaveBeenCalledWith(ACCOUNT)
  })

  it('reuses a cached token instead of a popup per page', async () => {
    const { app, ...spy } = fakeMsal({ getAllAccounts: vi.fn(() => [ACCOUNT]) })
    const provider = msalTokenProvider(CONFIG, { application: app })

    expect(await provider.acquireToken(['scope'])).toBe('silent-token')
    expect(await provider.acquireToken(['scope'])).toBe('silent-token')
    expect(spy.acquireTokenPopup).not.toHaveBeenCalled()
  })

  it('falls back to a popup only when Azure says interaction is required', async () => {
    const { app } = fakeMsal({
      getAllAccounts: vi.fn(() => [ACCOUNT]),
      acquireTokenSilent: vi.fn(() =>
        Promise.reject(new InteractionRequiredAuthError('consent_required', 'correlation-1'))),
    })
    const provider = msalTokenProvider(CONFIG, { application: app })

    expect(await provider.acquireToken(['scope'])).toBe('popup-token')
  })

  it('does not open a popup for a failure that is not about interaction', async () => {
    const { app, ...spy } = fakeMsal({
      getAllAccounts: vi.fn(() => [ACCOUNT]),
      acquireTokenSilent: vi.fn(() => Promise.reject(new Error('network down'))),
    })
    const provider = msalTokenProvider(CONFIG, { application: app })

    await expect(provider.acquireToken(['scope'])).rejects.toThrow('network down')
    expect(spy.acquireTokenPopup).not.toHaveBeenCalled()
  })

  it('answers a closed popup instead of sitting on an unsettled call', async () => {
    const popup = { closed: false }
    const opened = vi.fn(() => new Promise<AuthenticationResult>(() => undefined))
    const { app, ...spy } = fakeMsal({ acquireTokenPopup: opened })
    const provider = msalTokenProvider(CONFIG, { application: app })

    const asked = provider.acquireToken(['scope'])
    await vi.waitFor(() => {
      expect(spy.addEventCallback).toHaveBeenCalled()
    })
    const announce = spy.addEventCallback.mock.calls[0]![0]
    announce({
      eventType: EventType.POPUP_OPENED,
      payload: { popupWindow: popup as unknown as Window },
    } as EventMessage)
    popup.closed = true

    await expect(asked).rejects.toMatchObject({ errorCode: 'user_cancelled' })
    expect(opened).toHaveBeenCalledWith(
      expect.objectContaining({ overrideInteractionInProgress: true }))
    expect(spy.removeEventCallback).toHaveBeenCalledWith('callback-id')
  })

  /**
   * **A sign-in that worked closes the popup too**, and the token call is
   * still in flight when it does. Whether the exchange beats the poll is the
   * machine's business, so the stub settles after a tick the poll is certain
   * to have run through.
   */
  it('lets a sign-in finish after its own popup has closed', async () => {
    const popup = { closed: false }
    const exchanging = vi.fn(() => new Promise<AuthenticationResult>((resolve) => {
      setTimeout(() => { resolve(result('popup-token')) }, POPUP_POLL_MS + 400)
    }))
    const { app, ...spy } = fakeMsal({ acquireTokenPopup: exchanging })
    const provider = msalTokenProvider(CONFIG, { application: app })

    const asked = provider.acquireToken(['scope'])
    await vi.waitFor(() => {
      expect(spy.addEventCallback).toHaveBeenCalled()
    })
    spy.addEventCallback.mock.calls[0]![0]({
      eventType: EventType.POPUP_OPENED,
      payload: { popupWindow: popup as unknown as Window },
    } as EventMessage)
    popup.closed = true

    expect(await asked).toBe('popup-token')
  })

  it('initialises once however many tokens are asked for', async () => {
    const { app, ...spy } = fakeMsal({ getAllAccounts: vi.fn(() => [ACCOUNT]) })
    const provider = msalTokenProvider(CONFIG, { application: app })

    await Promise.all([provider.acquireToken(['a']), provider.acquireToken(['b'])])
    await provider.acquireToken(['c'])

    expect(spy.initialize).toHaveBeenCalledTimes(1)
  })
})

describe('who is signed in', () => {
  it('is null until a token has actually been acquired', () => {
    const provider = msalTokenProvider(CONFIG, { application: fakeMsal().app })
    expect(provider.session()).toBeNull()
  })

  it('names the account and when its token expires', async () => {
    const provider = msalTokenProvider(CONFIG, { application: fakeMsal().app })
    await provider.acquireToken(['scope'])

    expect(provider.session()).toEqual({
      identity: 'analyst@contoso.invalid',
      expiresOn: Math.floor(new Date('2026-08-03T13:00:00Z').getTime() / 1000),
    })
  })
})

describe('what the analyst is told went wrong', () => {
  it('names a blocked popup as a popup, not as a sign-in failure', () => {
    expect(signInFailure(new BrowserAuthError('popup_window_error', 'blocked')))
      .toMatch(/Allow popups/)
  })

  it('separates a cancelled sign-in from a failed one', () => {
    expect(signInFailure(new BrowserAuthError('user_cancelled', 'closed')))
      .toBe('Sign-in was cancelled.')
  })

  it('passes an ordinary failure through with its own message', () => {
    // AADSTS codes are the useful part of a misconfigured registration and
    // this must not swallow them: 50011 is the redirect URI not matching,
    // which is the mistake this integration is most likely to meet.
    expect(signInFailure(new Error('AADSTS50011: redirect URI mismatch')))
      .toBe('AADSTS50011: redirect URI mismatch')
  })

  it('has something to say about a thrown non-error', () => {
    expect(signInFailure('nope')).toBe('Could not sign in to Azure.')
  })
})
