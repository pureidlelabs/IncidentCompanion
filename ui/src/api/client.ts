/**
 * The one place a request leaves the UI, and the one place the credential is
 * decided.
 */

import { authClient } from './authClient'
import { fromWire, toWire } from './naming'
import { setSession, type Session } from './session'

/** One refused field, as a refusal surface can draw it. */
export interface FieldError {
  /** The field the analyst sees, dotted where the path is nested. */
  readonly field: string
  /** The server's own sentence about it. */
  readonly message: string
}

/**
 * The fields a 422 named, or nothing.
 */
function fieldErrorsOf(body: unknown): readonly FieldError[] {
  if (typeof body !== 'object' || body === null) return []
  const issues = (body as { errors?: unknown }).errors
  if (!Array.isArray(issues)) return []

  const named: FieldError[] = []
  // **`unknown[]`, not a cast to the issue shape.** Casting told the compiler
  // every element is an object, which made the two guards below read as
  // unnecessary conditions - and they are the whole reason a body carrying
  // `errors: 'not a list'` answers nothing instead of a row per character.
  for (const entry of issues as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const issue = entry as { path?: unknown; keys?: unknown; message?: unknown }
    if (typeof issue.message !== 'string' || issue.message === '') continue
    const path = Array.isArray(issue.path) ? issue.path.map(String) : []
    const keys = Array.isArray(issue.keys) ? issue.keys.map(String) : []
    named.push({ field: (path.length > 0 ? path : keys).join('.'), message: issue.message })
  }
  return named
}

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  /**
   * The fields a validation failure named, empty for every other refusal.
   */
  readonly fieldErrors: readonly FieldError[]

  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.fieldErrors = fieldErrorsOf(body)
  }

  /** No session, a signed-out one, or one gone idle - sign in again. */
  get needsSignIn(): boolean {
    return this.status === 401
  }

  /**
   * Another analyst wrote this row first, so the version sent is behind.
   */
  get writeConflict(): boolean {
    return this.status === 409
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sent as JSON, keys rewritten to snake_case on the way out. */
  body?: Record<string, unknown>
  signal?: AbortSignal
  /**
   * Return the body exactly as it arrived, with no key conversion.
   */
  raw?: boolean
}

/**
 * Relative on purpose.
 */
const BASE = '/api'
export const API_BASE = BASE

/**
 * What makes the session cookie travel, on every request without exception.
 */
export const CREDENTIALS: RequestCredentials = 'include'

/**
 * What actually goes to the network, so the demo build can answer instead.
 */
let transport: typeof fetch = (input, init) => fetch(input, init)

export function setTransport(substitute: typeof fetch): void {
  transport = substitute
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (options.body) headers['content-type'] = 'application/json'

  const method = options.method ?? 'GET'
  const init: RequestInit = {
    method,
    headers,
    credentials: CREDENTIALS,
    ...(options.body ? { body: JSON.stringify(toWire(options.body)) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  }

  const response = await transport(`${BASE}${path}`, init)
  return finishResponse<T>(response, options.raw)
}

/**
 * What a refused response actually says, in the order the server says it.
 */
function refusalText(parsed: unknown, response: Response): string {
  const body = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}

  if (Array.isArray(body.errors)) {
    const said = body.errors
      .map((entry) =>
        typeof entry === 'object' && entry !== null && 'message' in entry
          ? String((entry as { message: unknown }).message)
          : '',
      )
      .filter((line) => line.length > 0)
    if (said.length > 0) return said.join(' ')
  }

  for (const key of ['message', 'error'] as const) {
    const said = body[key]
    // Nest answers `message` as an array on some refusals and a string on
    // others, and `String(['a','b'])` is `"a,b"` - a sentence with a comma
    // where the space should be.
    if (Array.isArray(said) && said.length > 0) return said.map(String).join(' ')
    if (typeof said === 'string' && said.length > 0) return said
  }

  return response.statusText || `HTTP ${String(response.status)}`
}

/**
 * The error mapping and body parse shared by every fetch this file makes,
 * `request()`'s JSON round trip and `requestBody()`'s file upload alike.
 */
async function finishResponse<T>(
  response: Response,
  /** See `RequestOptions.raw`. Multipart never sets it: no upload answers specs. */
  raw = false,
): Promise<T> {
  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      // `AuthGate` answers an unauthenticated *browser* request with a 303 to
      // the HTML sign-in page. `/api` is delegated and answers JSON, so HTML
      // here means the request left the API prefix; reporting it as "invalid
      // JSON" hides that.
      parsed = { error: text.slice(0, 200) }
    }
  }

  if (!response.ok) {
    const message = refusalText(parsed, response)
    // **This is what routes to the sign-in screen**, and it is client-side:
    // dropping the identity re-renders `App` onto `SignInForm` with the SPA
    // still mounted. A hard navigation to `/login` instead would throw away
    // the route the analyst was on and hand them a second product's sign-in for
    // the same session. Done here rather than at each call site so one dead
    // session does not have to be discovered by every query in flight.
    if (response.status === 401) setSession(null)
    throw new ApiError(response.status, message, parsed)
  }

  return raw ? (parsed as T) : fromWire<T>(parsed)
}

interface BodyOptions {
  headers?: Record<string, string>
  /** `POST` by default; the route's own verb otherwise. */
  method?: 'POST' | 'PUT'
}

/**
 * A file as the whole request body - no envelope, no form field.
 */
export async function requestBody<T>(
  path: string,
  file: Blob,
  { headers = {}, method = 'POST' }: BodyOptions = {},
): Promise<T> {
  const response = await transport(`${BASE}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': file.type || 'application/octet-stream',
      ...headers,
    },
    credentials: CREDENTIALS,
    body: file,
  })
  return finishResponse<T>(response)
}

export interface BlobResponse {
  blob: Blob
  filename: string
}

/**
 * The third response shape: bytes with a `Content-Disposition`, not JSON.
 */
export async function requestBlob(path: string, body: Record<string, unknown> = {}): Promise<BlobResponse> {
  const response = await transport(`${BASE}${path}`, {
    method: 'POST',
    headers: { accept: 'application/octet-stream', 'content-type': 'application/json' },
    credentials: CREDENTIALS,
    body: JSON.stringify(toWire(body)),
  })

  if (!response.ok) {
    const text = await response.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { error: text.slice(0, 200) }
      }
    }
    // Through the same reader as the JSON path: this one carried its own copy
    // of the `error`-only lookup, so a download refused for a named reason
    // reported the status phrase while the JSON path reported the reason.
    const message = refusalText(parsed, response)
    if (response.status === 401) setSession(null)
    throw new ApiError(response.status, message, parsed)
  }

  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'export'
  return { blob: await response.blob(), filename }
}

interface LoginResponse {
  /** Null whenever the install-wide API level is off, which is its default.
   *  Nothing here reads it: the bearer is for external clients. */
  token: string | null
  tokenType: string
  username: string
  /**
   * The account was given its password by somebody else and owes its own.
   */
  mustChangePassword?: boolean
  /** `users.ROLES`. `null` for a bearer whose username names no account. */
  role?: string | null
}

/**
 * Sign in. The server sets the session cookie; what comes back here is a name.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<{ mustChangePassword: boolean }> {
  const { data, error } = await authClient.signIn.email({ email, password })
  /* eslint-disable @typescript-eslint/no-unnecessary-condition --
     the rule reads Better Auth's declared type, which says `error` cannot be
     set on this call. It can: a refusal comes back in the *result* rather than
     as a throw, which is the whole reason this branch exists. Deleting it on
     the type's word turns a wrong password into a successful sign-in with no
     user. */
  // Better Auth reports a refusal in the result rather than by throwing, so an
  // unchecked `error` reads as a successful sign-in with no user.
  if (error || !data) {
    throw new ApiError(error?.status ?? 401, error?.message ?? 'Could not sign in.', error)
  }
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  setSession(identityFrom(data.user))
  // **Read off the user Better Auth just returned, not assumed.** This was a
  // hardcoded `false` while the server had no such field, so the forced screen
  // existed and nothing could ever route to it.
  const held = (data.user as { mustChangePassword?: unknown }).mustChangePassword
  return { mustChangePassword: held === true }
}

/**
 * The identity, from Better Auth's user. **The only place one is built.**
 */
export function identityFrom(
  user: { id: string; name?: string | null; email: string },
): Session {
  return { userId: user.id, username: user.name?.trim() || user.email }
}

/** Whether this install still needs claiming - the read half of `/setup`. */
export async function installIsUnclaimed(): Promise<boolean> {
  const result = await request<{ unclaimed: boolean }>('/setup')
  return result.unclaimed
}

/**
 * Claim a fresh install: create its first admin and sign in as them.
 */
export async function claimInstall(fields: {
  token: string
  username: string
  password: string
  repeat: string
}): Promise<void> {
  await request<LoginResponse>('/setup', { method: 'POST', body: fields })
  await adoptServerIdentity()
}

/**
 * Ask who this cookie is, and hold that as the identity.
 */
async function adoptServerIdentity(): Promise<void> {
  const { data } = await authClient.getSession()
  setSession(data?.user ? identityFrom(data.user) : null)
}

/**
 * Replace your own password, and pick the identity up afterwards.
 */
export async function changeOwnPassword(fields: {
  current: string
  password: string
  repeat: string
}): Promise<void> {
  await request<{ changed: boolean }>('/change-password', {
    method: 'POST',
    body: fields,
  })
  await adoptServerIdentity()
}

/**
 * Where the browser says somebody is actually at the keyboard.
 */
const ACTIVITY_PATH = '/api/auth/get-session'

/**
 * Report that the analyst just did something. Answers 204 and is never read.
 */
export async function reportActivity(): Promise<void> {
  try {
    await transport(ACTIVITY_PATH, {
      // A read: what advances the clock is the session being *used*, and a
      // read is the smallest thing that counts as using it.
      method: 'GET',
      credentials: CREDENTIALS,
      keepalive: true,
    })
  } catch {
    /* the gate is the control; a lost report is not */
  }
}

/**
 * Sign out, server-side first.
 */
export async function signOut(): Promise<void> {
  try {
    await authClient.signOut()
  } catch {
    /* already dead, or unreachable - clear regardless */
  }
  setSession(null)
}
