/**
 * The browser's own Azure sign-in: auth code + PKCE, through MSAL.
 *
 * **The server never sees an Azure credential.** The token is acquired here,
 * held by MSAL in this tab, and sent to ARM by `armSource`, so the outbound
 * call is the browser's and the app keeps its no-outbound-request rule.
 *
 * **The app registration is the analyst's, not this app's.** `tenantId` and
 * `clientId` come out of `ConnectionConfig`, which the Connect phase collects
 * and `localStorage` holds; nothing is baked in, and PKCE stores no secret. The
 * registration must be an **SPA platform** app whose redirect URI is the served
 * origin exactly - it moves if the SPA's mount prefix moves - with delegated
 * `https://management.azure.com/user_impersonation` and no Graph permission.
 *
 * **Popup, not redirect**: a redirect discards the wizard's phase, workspace
 * and incident selection. A popup blocker refusing it is reported as its own
 * failure rather than as a sign-in error.
 *
 * **Never run against Azure.** Whether `login.microsoftonline.com`'s token
 * endpoint answers browser JS for a given registration's code exchange is
 * unmeasured; ARM's own CORS is measured and is not the open question.
 */

// **Types only, so nothing here pulls MSAL into the main chunk.** The library
// is `await import`ed on the first token - see `loadMsal`. Statically imported
// it puts a couple of hundred kilobytes on a bundle every screen pays for, to
// serve one screen most installs never open.
import type * as Msal from '@azure/msal-browser'
import type {
  AccountInfo,
  AuthenticationResult,
  IPublicClientApplication,
} from '@azure/msal-browser'

import { ARM_SCOPE } from './armSource'
import type { ConnectionConfig } from './connectionConfig'
import type { ImporterSession, TokenProvider } from './source'

/** Where the analyst's directory lives. `tenantId` may be a GUID or a domain. */
function authorityFor(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}`
}

/**
 * Whether the coordinates are complete enough to attempt a sign-in.
 *
 * Checked before building anything: MSAL throws on an empty `clientId` from
 * its constructor, which surfaces as a crash on the screen rather than as the
 * Connect phase saying what is missing.
 */
export function isConfigured(config: ConnectionConfig): boolean {
  return Boolean(config.tenantId.trim() && config.clientId.trim())
}

export interface MsalOptions {
  /** Injected by the tests. Production builds the real one. */
  application?: IPublicClientApplication
  /** The page this app is served from; the registration must match it. */
  redirectUri?: string
}

/** The library, fetched once and shared by every provider in the tab. */
let msal: Promise<typeof Msal> | null = null
const loadMsal = () => (msal ??= import('@azure/msal-browser'))

async function buildApplication(
  config: ConnectionConfig, options: MsalOptions,
): Promise<IPublicClientApplication> {
  const { PublicClientApplication } = await loadMsal()
  return new PublicClientApplication({
    auth: {
      clientId: config.clientId.trim(),
      authority: authorityFor(config.tenantId.trim()),
      redirectUri: options.redirectUri ?? window.location.origin + import.meta.env.BASE_URL,
    },
    cache: {
      // In memory, deliberately. `sessionStorage` and `localStorage` both put
      // an Azure access token where another script on this origin can read it
      // and where it outlives the tab. A sign-in per session is the price, and
      // it is one interaction.
      cacheLocation: 'memoryStorage',
    },
  })
}

/**
 * What went wrong, said in terms of the thing the analyst can change.
 *
 * MSAL's own messages name protocol conditions (`popup_window_error`,
 * `invalid_client`) that mean nothing beside a form asking for a tenant and a
 * client id. The three worth separating are the three with different fixes.
 */
export function signInFailure(thrown: unknown): string {
  // Read off `errorCode` rather than `instanceof BrowserAuthError`: this is
  // called from a render path, and an `instanceof` would need the library
  // loaded to classify an error raised because it could not be.
  const code = thrown instanceof Error && 'errorCode' in thrown
    ? String((thrown as { errorCode: unknown }).errorCode)
    : ''
  if (code === 'popup_window_error' || code === 'empty_window_error') {
    return 'The sign-in window was blocked. Allow popups for this app and try again.'
  }
  if (code === 'user_cancelled') return 'Sign-in was cancelled.'
  if (thrown instanceof Error && thrown.message) return thrown.message
  return 'Could not sign in to Azure.'
}

/**
 * A `TokenProvider` over one set of connection coordinates.
 *
 * **Silent first, interactive only when Azure says it must be.** A token
 * already in MSAL's cache is reused, so a listing that spans several pages
 * does not put a popup in front of the analyst per page; the popup is opened
 * only for `InteractionRequiredAuthError`, which is Azure asking for consent
 * or a fresh factor.
 */
export function msalTokenProvider(
  config: ConnectionConfig, options: MsalOptions = {},
): TokenProvider & { session: () => ImporterSession | null } {
  let ready: Promise<IPublicClientApplication> | null = null
  let account: AccountInfo | null = null
  let expiresOn = 0

  // `initialize` is required before any other call in MSAL 5. The promise is
  // kept rather than a boolean so two concurrent acquisitions share one load
  // and one initialise, instead of racing to build two applications.
  const initialised = () => (ready ??= (async () => {
    const built = options.application ?? await buildApplication(config, options)
    await built.initialize()
    return built
  })())

  async function acquire(scopes: string[]): Promise<AuthenticationResult> {
    const app = await initialised()
    account ??= app.getActiveAccount() ?? app.getAllAccounts()[0] ?? null
    if (account) {
      try {
        return await app.acquireTokenSilent({ scopes, account })
      } catch (thrown) {
        // Anything that is not "Azure needs the human" is a real failure and
        // must not be answered by opening a popup: a network error retried
        // interactively reads to the analyst as being asked to sign in twice.
        const { InteractionRequiredAuthError } = await loadMsal()
        if (!(thrown instanceof InteractionRequiredAuthError)) throw thrown
      }
    }
    const result = await app.acquireTokenPopup({ scopes })
    // Assigned unconditionally: `setActiveAccount` takes null, and an
    // interactive result that names no account genuinely is no session - which
    // is what `session()` should then answer.
    account = result.account
    app.setActiveAccount(result.account)
    return result
  }

  return {
    acquireToken: async (scopes: readonly string[]): Promise<string> => {
      const result = await acquire([...scopes])
      expiresOn = result.expiresOn ? Math.floor(result.expiresOn.getTime() / 1000) : 0
      return result.accessToken
    },

    /**
     * Who is signed in, for the Connect phase to show. Null before the first
     * token - the identity is the token's, not the config's, and showing the
     * configured tenant as though it were an account would claim a sign-in
     * that has not happened.
     */
    session: (): ImporterSession | null =>
      account ? { identity: account.username || (account.name ?? 'signed in'), expiresOn } : null,
  }
}

/** The scope every ARM call runs under. One, and it is not Graph. */
export const SENTINEL_SCOPES = [ARM_SCOPE] as const
