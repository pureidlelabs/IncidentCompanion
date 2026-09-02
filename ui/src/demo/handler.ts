/**
 * What answers a request when there is no server: the demo's whole API.
 *
 * **A route this does not implement refuses**, so a route added to the client
 * later is absent from the demo loudly rather than as a screen drawing nothing.
 * `coverage.rule.test.ts` is what makes that a decision rather than an
 * omission.
 */
import { COLLECTION_SCHEMAS, TIMELINE_WRITE_SCHEMAS } from '@contract/collections'

import { COLLECTION_TO_CASE_KEY } from '@/api/model'
import type { EntitySchema } from '@/api/validateDraft'

import type { DemoState } from './state'

/** What a screen is told when it asks for something only the server can do. */
export const UNAVAILABLE = 'Not available in the demo - this one runs on the server.'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const refuse = (status: number, message: string): Response => json({ message }, status)

/** Empty body, as the routes that answer 204 do. */
const done = (): Response => new Response(null, { status: 204 })

/**
 * The write schema for one collection, or nothing where the demo cannot check
 * a draft.
 *
 * The timeline discriminates on `kind`; every other collection has a single
 * schema. A collection with neither is refused rather than written unchecked.
 */
function schemaFor(collection: string, body: Record<string, unknown>): EntitySchema | null {
  if (collection === 'timeline') {
    const kind = typeof body.kind === 'string' ? body.kind : ''
    const kinds: Record<string, EntitySchema | undefined> = TIMELINE_WRITE_SCHEMAS
    return kinds[kind] ?? null
  }
  return COLLECTION_SCHEMAS[collection] ?? null
}

/** The rows one collection holds, or nothing when the case has no such key. */
function rowsOf(state: DemoState, collection: string): Record<string, unknown>[] | null {
  const keys: Record<string, string | undefined> = COLLECTION_TO_CASE_KEY
  const key = keys[collection]
  if (key === undefined) return null
  const rows = (state.kase as unknown as Record<string, unknown>)[key]
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : null
}

/**
 * A refusal in the shape the client already reads.
 *
 * `client.ts` looks for `errors[].message` before `message`, so a draft refused
 * here draws the same per-field card as one refused by the route.
 */
function refuseDraft(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Response {
  return json(
    {
      message: 'The entry was not accepted.',
      errors: issues.map((issue) => ({ path: issue.path.map(String), message: issue.message })),
    },
    422,
  )
}

function create(state: DemoState, collection: string, body: Record<string, unknown>): Response {
  const rows = rowsOf(state, collection)
  if (rows === null) return refuse(501, UNAVAILABLE)

  const schema = schemaFor(collection, body)
  if (schema === null) return refuse(501, UNAVAILABLE)

  const parsed = schema.safeParse(body)
  if (!parsed.success) return refuseDraft(parsed.error.issues)

  const now = new Date().toISOString()
  const row = {
    ...(parsed.data),
    id: crypto.randomUUID(),
    caseId: state.kase.id,
    createdAt: now,
    updatedAt: now,
    createdBy: DEMO_ANALYST,
    updatedBy: DEMO_ANALYST,
    version: 1,
  }
  rows.push(row)
  return json(row, 201)
}

/** Whoever the demo says is signed in. Every row it writes is attributed here. */
export const DEMO_ANALYST = 'demo'

function patch(
  state: DemoState,
  collection: string,
  id: string,
  body: Record<string, unknown>,
): Response {
  const rows = rowsOf(state, collection)
  const row = rows?.find((candidate) => candidate.id === id)
  if (rows === null || row === undefined) return refuse(404, 'No such entry.')

  Object.assign(row, body, {
    updatedAt: new Date().toISOString(),
    updatedBy: DEMO_ANALYST,
    version: typeof row.version === 'number' ? row.version + 1 : 1,
  })
  return json(row)
}

function remove(state: DemoState, collection: string, id: string): Response {
  const rows = rowsOf(state, collection)
  if (rows === null) return refuse(501, UNAVAILABLE)
  const at = rows.findIndex((candidate) => candidate.id === id)
  if (at === -1) return refuse(404, 'No such entry.')
  rows.splice(at, 1)
  return done()
}

/** The card the picker draws, taken from the case rather than described twice. */
function summaries(state: DemoState): Record<string, unknown>[] {
  const kase = state.kase as unknown as Record<string, unknown>
  const wanted = [
    'id',
    'reference',
    'title',
    'customer',
    'status',
    'severity',
    'incidentClass',
    'openedAt',
    'closedAt',
    'createdAt',
    'updatedAt',
    'analyst',
    'isDemo',
  ]
  return [Object.fromEntries(wanted.map((key) => [key, kase[key]]))]
}

/**
 * Answer one request against the store.
 *
 * Returns a `Response` rather than a parsed body so that `client.ts` maps a
 * refusal, converts the wire shape and drops a dead session exactly as it does
 * for the server - the demo substitutes for `fetch`, not for the client.
 */
export async function handle(state: DemoState, url: string, init: RequestInit): Promise<Response> {
  const path = new URL(url, 'http://demo.invalid').pathname.replace(/^\/api/, '')
  const method = (init.method ?? 'GET').toUpperCase()
  const body =
    typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
  const at = path.split('/').filter((piece) => piece !== '')

  await Promise.resolve()

  if (at[0] === 'cases' && at.length === 1 && method === 'GET') return json(summaries(state))

  if (at[0] === 'cases' && at.length >= 2) {
    if (at[1] !== state.kase.id) return refuse(404, 'No such case.')

    if (at.length === 2 && method === 'GET') return json(state.kase)
    if (at.length === 2 && method === 'PATCH') {
      Object.assign(state.kase, body, { updatedAt: new Date().toISOString() })
      return json(state.kase)
    }

    const collection = at[2] ?? ''
    if (at.length === 3 && method === 'GET') {
      const rows = rowsOf(state, collection)
      return rows === null ? refuse(501, UNAVAILABLE) : json(rows)
    }
    if (at.length === 3 && method === 'POST') return create(state, collection, body)
    if (at.length === 4 && method === 'PATCH') return patch(state, collection, at[3] ?? '', body)
    if (at.length === 4 && method === 'DELETE') return remove(state, collection, at[3] ?? '')
  }

  return refuse(501, UNAVAILABLE)
}
