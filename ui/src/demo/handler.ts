/**
 * What answers a request when there is no server: the demo's whole API.
 *
 * **A route this does not implement refuses**, so a route added to the client
 * later is absent from the demo loudly rather than as a screen drawing nothing.
 * `coverage.rule.test.ts` is what makes that a decision rather than an
 * omission.
 */
import { COLLECTION_SCHEMAS, TIMELINE_WRITE_SCHEMAS } from '@contract/collections'
import { patchSchema } from '@contract/field-spec'

import about from './catalogue/about.json'
import collections from './catalogue/collections.json'
import specs from './catalogue/specs.json'

import { COLLECTION_TO_CASE_KEY } from '@/api/model'
import { fromWire } from '@/api/naming'
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

/**
 * A patch, judged before it is applied.
 *
 * `patchSchema` is the route's own: every field optional, and strict, so a name
 * the collection does not have and a value it will not take are both refused.
 * It catches a required field cleared to empty as well, which is why the row it
 * would become is not parsed a second time here - a stored row carries the
 * fields the store manages, and the write schema is strict against those.
 */
function patchProblems(
  collection: string,
  row: Record<string, unknown>,
  body: Record<string, unknown>,
): Response | null {
  const schema = schemaFor(collection, { ...row, ...body })
  if (schema === null) return refuse(501, UNAVAILABLE)

  const judged = patchSchema(schema).safeParse(body)
  return judged.success ? null : refuseDraft(judged.error.issues)
}

function create(state: DemoState, collection: string, body: Record<string, unknown>): Response {
  const rows = rowsOf(state, collection)
  if (rows === null) return refuse(501, UNAVAILABLE)

  // **Refused whole, because the second half cannot be served.** An evidence
  // record is written and then its bytes are posted; taking the record and
  // refusing the upload leaves a row in the table with no file behind it and a
  // refusal card over the top of it.
  if (collection === 'evidence') return refuse(501, UNAVAILABLE)

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

  const refused = patchProblems(collection, row, body)
  if (refused !== null) return refused

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
 * What the rail reads instead of the whole document, counted off the store.
 *
 * Counted rather than stored: a written count is a second description of the
 * collections, and the rail would keep showing 88 after the analyst deleted an
 * entry.
 */
function railSummary(state: DemoState): Record<string, unknown> {
  const counts = Object.fromEntries(
    Object.keys(COLLECTION_TO_CASE_KEY).map((collection) => [
      collection,
      rowsOf(state, collection)?.length ?? 0,
    ]),
  )
  const reports = (rowsOf(state, 'reports') ?? []).map((report) => ({
    id: report.id,
    label: report.label,
    sentAt: report.sentAt ?? null,
  }))

  return {
    id: state.kase.id,
    title: state.kase.title,
    reference: state.kase.reference,
    customer: state.kase.customer,
    isDemo: true,
    version: state.kase.version,
    counts,
    attention: {},
    reports,
  }
}

/**
 * The worked case, as the picker's demo pane asks for it.
 *
 * Every field is the case's own. `scale` is counted rather than written: a
 * sentence about how big the case is, kept beside a case whose size the visitor
 * can change, goes wrong the first time they add a system.
 */
function demoCards(state: DemoState): Record<string, unknown>[] {
  const systems = rowsOf(state, 'systems')?.length ?? 0
  const entries = rowsOf(state, 'timeline')?.length ?? 0
  return [
    {
      id: state.kase.id,
      reference: state.kase.reference,
      customer: state.kase.customer,
      title: state.kase.title,
      // The captured case carries no classification - `incidentClass`,
      // `rsitClass` and `severity` are all empty on it - so the caption says
      // what is true rather than a category nobody set.
      scenario: state.kase.status,
      scale: `${String(systems)} systems, ${String(entries)} timeline entries`,
      glyph: 'lock',
      summary: state.kase.summary,
    },
  ]
}

/** The landing screen's list, which is the one case there is. */
function recentCases(state: DemoState): Record<string, unknown> {
  return {
    pinned: [],
    recent: [
      {
        caseId: state.kase.id,
        title: state.kase.title,
        reference: state.kase.reference,
        customer: state.kase.customer,
        status: state.kase.status,
        section: 'timeline',
        visitedAt: state.kase.updatedAt,
        pinned: false,
      },
    ],
  }
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

  // **Camelised, because this substitutes for `fetch` and the server's own
  // middleware sits above that.** `client.ts` snake-cases every body on the way
  // out and `CamelCaseBodyMiddleware` undoes it on `ALL_ROUTES` before any
  // schema runs. Without this the schemas - which are camelCase - refuse every
  // field whose name is more than one word, so an entry with an event source
  // was refused here and accepted by an install.
  const body =
    typeof init.body === 'string'
      ? fromWire<Record<string, unknown>>(JSON.parse(init.body))
      : {}
  const at = path.split('/').filter((piece) => piece !== '')

  await Promise.resolve()

  // Nothing is behind this to be unwell, and a demo whose first impression is
  // a "server is not responding" banner has answered the wrong question.
  // **Exactly `/health`, not everything beneath it.** `/health/activity` and
  // `/health/resources` are different shapes, and answering them a health
  // report is what took the Health screen down rather than refusing it.
  if (at[0] === 'health' && at.length === 1 && method === 'GET') {
    return json({ status: 'ok', details: {} })
  }

  // **Captured from this tree's own controllers at build time**, by
  // `server/scripts/demo-catalogue.mts`. Both routes are constants the server
  // derives from the schemas, so capturing beats describing them again - and
  // eleven case screens draw nothing at all without `specs`.
  // **Each names its own depth.** Matching on the first segment alone answers
  // `/specs/anything/at/all` with the specs document, so a route added under one
  // of these later would be served the wrong body instead of refusing - and the
  // coverage guard, which reads first segments, would not see it either.
  if (at.length === 1 && method === 'GET') {
    if (at[0] === 'specs') return json(specs)
    if (at[0] === 'collections') return json(collections)
    if (at[0] === 'about') return json(about)
    if (at[0] === 'demos') return json(demoCards(state))
    if (at[0] === 'recent-cases') return json(recentCases(state))
  }

  // The landing screen records a visit as the analyst opens a case, and pins or
  // forgets one. There is nowhere for any of that to go here, and refusing it
  // would draw a refusal over a screen that is working.
  if (at[0] === 'recent-cases' && method !== 'GET' && at.length <= 3) return done()

  if (at[0] === 'cases' && at.length === 1 && method === 'GET') return json(summaries(state))

  if (at[0] === 'cases' && at.length >= 2) {
    if (at[1] !== state.kase.id) return refuse(404, 'No such case.')

    if (at.length === 2 && method === 'GET') return json(state.kase)
    if (at.length === 3 && at[2] === 'summary' && method === 'GET') return json(railSummary(state))
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

    // **`bulk` and `order` are the collection's own verbs, not row ids.** Read
    // as ids they reached the single-row patch, which answered `No such entry.`
    // for a bulk edit - a refusal that is not the demo's and is not true.
    const row = at[3] ?? ''
    if (at.length === 4 && (row === 'bulk' || row === 'order')) return refuse(501, UNAVAILABLE)
    if (at.length === 4 && method === 'PATCH') return patch(state, collection, row, body)
    if (at.length === 4 && method === 'DELETE') return remove(state, collection, row)
  }

  return refuse(501, UNAVAILABLE)
}
