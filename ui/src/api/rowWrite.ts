/**
 * The one door a versioned write of case data leaves by.
 *
 * Writes to one record leave one after another from this tab, and a write
 * queued behind the tab's own earlier write states the version that write
 * produced. Nothing here reads a version from the cache: the caller hands in
 * the version the analyst read, typed so that one taken anywhere else does not
 * compile. -> `openspec/specs/state/design.md`
 */
import type { QueryClient } from '@tanstack/react-query'

declare const READ: unique symbol

/** A version as the analyst read it. Minted by `drawn`, never at send time. */
export type Read = number & { readonly [READ]: true }

/** A row as the analyst read it: the version on it is the one a write against it states. */
export type Drawn<T extends { version: number }> = Omit<T, 'version'> & { version: Read }

/**
 * The row as it is drawn now, for a write the analyst makes against what they see.
 *
 * Call it where the analyst reads the row -- a field they begin changing, a
 * selection they act on, a control they press on a drawn row -- and never where
 * the request is sent.
 */
export function drawn<T extends { version: number }>(row: T): Drawn<T> {
  return row as unknown as Drawn<T>
}

/** One record's writes from this tab, and the versions this tab's own answers moved it through. */
interface Lane {
  tail: Promise<unknown>
  moved: Map<number, number>
}

const LANES = new WeakMap<QueryClient, Map<string, Lane>>()

function laneOf(client: QueryClient, key: string): Lane {
  let lanes = LANES.get(client)
  if (!lanes) {
    lanes = new Map()
    LANES.set(client, lanes)
  }
  let lane = lanes.get(key)
  if (!lane) {
    lane = { tail: Promise.resolve(), moved: new Map() }
    lanes.set(key, lane)
  }
  return lane
}

/** The version to state for a write read at `read`, through this tab's own answers only. */
function advance(lane: Lane, read: number): number {
  let version = read
  for (let next = lane.moved.get(version); next !== undefined; next = lane.moved.get(version)) {
    version = next
  }
  return version
}

/**
 * The row an edit writes against, at the version the analyst read; null for a create.
 *
 * @throws where an edit arrives with no read version, which would otherwise be written as a new row
 */
export function editedAt<T extends object>(
  editing: T | null | undefined,
  read: Read | undefined,
): (T & { version: Read }) | null {
  if (!editing) return null
  if (read === undefined) throw new Error('An edit reached its save without the version it was read at.')
  return { ...editing, version: read }
}

/** The key a record's writes are ordered by. */
export function rowKey(caseId: string, table: string, id: string): string {
  return `${caseId}:${table}:${id}`
}

/**
 * Send one write to one record after this tab's earlier writes to it.
 *
 * @param send - issues the request stating the version it is given.
 * @param reached - the version the answer says the record is on now; omitted
 *   for a write that leaves no record, which moves nothing a later write reads.
 * @returns the answer, or the refusal, of this write alone.
 */
export function writeRow<A>(
  client: QueryClient,
  key: string,
  read: Read,
  send: (version: number) => Promise<A>,
  reached?: (answer: A) => number,
): Promise<A> {
  const lane = laneOf(client, key)
  const run = lane.tail.then(async () => {
    const version = advance(lane, read)
    const answer = await send(version)
    if (reached) lane.moved.set(version, reached(answer))
    return answer
  })
  lane.tail = run.catch(() => undefined)
  return run
}

/**
 * Send one request naming several records, after this tab's earlier writes to each.
 *
 * The answer says which records took it and not what they became, so it moves
 * nothing a later write reads.
 */
export function writeRows<A>(
  client: QueryClient,
  rows: readonly { key: string; read: Read }[],
  send: (versions: number[]) => Promise<A>,
): Promise<A> {
  const named = rows.map((row) => ({ read: row.read, lane: laneOf(client, row.key) }))
  const run = Promise.all(named.map(({ lane }) => lane.tail)).then(() =>
    send(named.map(({ lane, read }) => advance(lane, read))),
  )
  const settled = run.catch(() => undefined)
  for (const { lane } of named) lane.tail = settled
  return run
}
