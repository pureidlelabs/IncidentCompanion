import type { Case } from '@/api/model'

/**
 * What a case-wide search matches, and what it reports about a hit.
 *
 * **One matcher, two surfaces.** The header's search box and the command
 * palette both read this: two different answers to *does this case mention
 * rclone* is drift worth more than the recall a second matcher would buy.
 */

/** Which field of `Case` a section reads, and what the section is called. */
interface Source {
  label: string
  key: keyof Case
  /** What a caller puts after `/cases/{id}/` to open the section, fragment and
   *  all where the section is a view of the entities page. */
  slug: string
  /** Which fields are tried, in order, for a hit's title. */
  titles: readonly string[]
}

/**
 * The ten tables a case-wide search reads.
 *
 * `key` is the wire's name for the collection and the label is the analyst's:
 * for Assets the two differ, because the case holds `systems`.
 */
const SOURCES: readonly Source[] = [
  { label: 'Timeline', key: 'timeline', slug: 'timeline', titles: ['description', 'eventSource', 'tactic', 'technique', 'actionType'] },
  { label: 'Assets', key: 'systems', slug: 'entities#assets', titles: ['hostname'] },
  { label: 'Accounts', key: 'accounts', slug: 'entities#accounts', titles: ['accountName'] },
  { label: 'Network', key: 'networkIndicators', slug: 'entities#network', titles: ['value'] },
  { label: 'Impact', key: 'impact', slug: 'impact', titles: ['label'] },
  { label: 'Malware', key: 'malware', slug: 'entities#malware', titles: ['filename', 'hash'] },
  { label: 'Cloud Apps', key: 'cloudApps', slug: 'entities#cloud-apps', titles: ['appName'] },
  { label: 'Evidence', key: 'evidence', slug: 'evidence', titles: ['name', 'location'] },
  { label: 'Actions', key: 'actions', slug: 'actions', titles: ['task'] },
  { label: 'Case notes', key: 'casenotes', slug: 'notes', titles: ['note'] },
]

/**
 * `id` is a uuid nobody types; `colour` is a hex string a numeric query would
 * otherwise match half the case through.
 */
const SKIP = new Set(['id', 'colour', 'caseId', 'version', 'createdBy', 'updatedBy'])

/**
 * Whether a field holds a stored reference rather than something on screen.
 *
 * **The name is the whole test, and it is what the tier has to go on.** The
 * reference registry lives on the server's schemas and the client reads it
 * through `GET /api/specs`, which this tier does not fetch - so the shape of
 * the name is the available signal. A field called `systemId` or `accountIds`
 * holds a uuid, and matching one makes the first eight characters of any id a
 * query that returns half the case.
 */
function isReference(name: string): boolean {
  return /(?:^|[a-z])Ids?$/.test(name)
}

/**
 * Every row in the case that carries a title, by its id.
 *
 * **A reference is matched on what it displays, not on what it stores.** A
 * search for a hostname has to find the timeline entries pointing at that
 * asset, not only the asset row - which is the whole reason this screen exists
 * beside the per-table filters.
 */
function displayed(kase: Case): ReadonlyMap<string, string> {
  const names = new Map<string, string>()
  for (const source of SOURCES) {
    const rows = kase[source.key]
    if (!Array.isArray(rows)) continue
    for (const row of rows as readonly Record<string, unknown>[]) {
      const id = row.id
      if (typeof id !== 'string') continue
      names.set(id, titleOf(row, source.titles))
    }
  }
  return names
}

/** What a field contributes to the haystack: its own value, or what it points at. */
function shown(
  name: string,
  value: unknown,
  names: ReadonlyMap<string, string>,
): string | undefined {
  if (SKIP.has(name)) return undefined
  if (isReference(name)) {
    const ids = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
    const labels = ids
      .filter((one): one is string => typeof one === 'string')
      .map((one) => names.get(one))
      .filter((one): one is string => one !== undefined && one !== '(untitled)')
    return labels.length === 0 ? undefined : labels.join(', ')
  }
  if (typeof value !== 'string' || value === '') return undefined
  return value
}

/** One row that matched, and which of its fields did it. */
export interface Hit {
  section: string
  id: string
  title: string
  /** Field name to the value that matched, capped at three. */
  matched: readonly { field: string; value: string }[]
}

/** A section with at least one hit in it. */
export interface HitGroup {
  label: string
  /** What follows `/cases/{id}/` for this group's rows, for a caller that
   *  opens one. */
  slug: string
  /** The case field this section reads, for a caller that opens it rather than displaying it. */
  key: keyof Case
  hits: readonly Hit[]
}

/**
 * Every row of the case mentioning every term, grouped by table.
 *
 * An empty query matches nothing rather than everything: "the screen just
 * opened" and "a query matched the whole case" must not look the same.
 */
export function searchCase(kase: Case, query: string): HitGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const names = displayed(kase)
  const groups: HitGroup[] = []
  for (const source of SOURCES) {
    const rows = kase[source.key]
    if (!Array.isArray(rows)) continue
    const hits: Hit[] = []
    for (const row of rows as readonly Record<string, unknown>[]) {
      const fields = Object.entries(row)
        .map(([name, value]) => ({ field: name, value: shown(name, value, names) }))
        .filter((one): one is { field: string; value: string } => one.value !== undefined)
      const hay = fields.map((one) => one.value.toLowerCase()).join(' ')
      if (!terms.every((term) => hay.includes(term))) continue
      const matched = fields
        .filter((one) => terms.some((term) => one.value.toLowerCase().includes(term)))
        .slice(0, 3)
      hits.push({
        section: source.label,
        id: typeof row.id === 'string' ? row.id : `${source.label}:${String(hits.length)}`,
        title: titleOf(row, source.titles),
        matched,
      })
    }
    if (hits.length > 0)
      groups.push({ label: source.label, slug: source.slug, key: source.key, hits })
  }
  return groups
}

/** The first of the section's title fields that holds anything. */
function titleOf(row: Record<string, unknown>, titles: readonly string[]): string {
  for (const name of titles) {
    const value = row[name]
    if (typeof value === 'string' && value !== '') return value
  }
  return '(untitled)'
}
