import type { Case, CollectionName } from '@/api/model'
import type { FieldToneSpec, Specs } from '@/api/specs'
import type { ReferenceOptions } from '@/components/blocks/entity-dialog'
import { campaignCase } from '@/fixtures/campaign'

/**
 * The entity family's model: the kinds, the row shape one grid can hold them
 * all in, and the narrowing every scope shares.
 */

export type EntityScope = 'all' | 'assets' | 'accounts' | 'network' | 'malware' | 'cloud-apps'

export interface EntityKind {
  slug: Exclude<EntityScope, 'all'>
  /** The analyst's word, and the scope row's label. */
  title: string
  collection: CollectionName
  /** The form `GET /api/specs` publishes this kind's fields under. */
  form: string
  rows: (kase: Case) => readonly Record<string, unknown>[]
  /**
   * The five shared columns, from one stored row.
   */
  project: (
    row: Record<string, unknown>,
    names: EntityNames,
  ) => Pick<
    EntityRowView,
    'identity' | 'state' | 'stateField' | 'linked' | 'detailParts' | 'source'
  >
}

/** One entity of any kind, projected onto the shape the mixed grid draws. */
export interface EntityRowView {
  id: string
  /** The kind's title, which is what the Kind column and the facet carry. */
  kind: string
  slug: EntityKind['slug']
  collection: CollectionName
  /** The version a write off this row would present. */
  version: number
  identity: string
  state: string
  /** The field `state` was read from, so `specs.fieldTones` can paint it. */
  stateField: string
  linked: string
  /** `detail` as its parts, each naming the field it came from so it can be
   *  painted. A joined string cannot be. */
  detailParts: readonly { value: string; field?: string }[]
  /** The parts joined, which is what the Detail column sorts on. */
  detail: string
  source: string
  /**
   * Whether the server calls this row's state a concern.
   */
  attention: boolean | undefined
  /** The entry as stored, for the expanded row. */
  fields: Readonly<Record<string, unknown>>
}

/** id to display name, per reference target a kind can point at. */
export interface EntityNames {
  system: ReadonlyMap<string, string>
  account: ReadonlyMap<string, string>
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const named = (map: ReadonlyMap<string, string>, id: unknown): string =>
  text(map.get(text(id))) || (text(id) ? '\u2014' : '')

/** The two id-to-name maps every kind resolves a reference through. */
export function entityNames(kase: Case): EntityNames {
  return {
    system: new Map(kase.systems.map((row) => [row.id, row.hostname])),
    account: new Map(kase.accounts.map((row) => [row.id, row.accountName])),
  }
}

/**
 * The five kinds, in rail order.
 */
export const ENTITY_KINDS: readonly EntityKind[] = [
  {
    slug: 'assets',
    title: 'Assets',
    collection: 'systems',
    form: 'SYSTEM_FIELDS',
    rows: (kase) => kase.systems,
    project: (row) => ({
      identity: text(row.hostname),
      state: text(row.verdict),
      stateField: 'verdict',
      linked: text(row.zone),
      detailParts: [
        { value: text(row.systemType) },
        { value: text(row.analysisStatus), field: 'analysisStatus' },
      ],
      source: text(row.source),
    }),
  },
  {
    slug: 'accounts',
    title: 'Accounts',
    collection: 'accounts',
    form: 'ACCOUNT_FIELDS',
    rows: (kase) => kase.accounts,
    project: (row) => ({
      identity: text(row.accountName),
      // Not the raw boolean: "false" in a state column reads as a verdict.
      state: row.disabled === true ? 'disabled' : 'active',
      stateField: 'disabled',
      linked: text(row.domain),
      detailParts: [{ value: text(row.privileges) }],
      source: text(row.source),
    }),
  },
  {
    slug: 'network',
    title: 'Network',
    collection: 'network_indicators',
    form: 'NETWORK_FIELDS',
    rows: (kase) => kase.networkIndicators,
    project: (row, names) => ({
      identity: text(row.value),
      state: text(row.disposition),
      stateField: 'disposition',
      linked: named(names.system, row.systemId),
      detailParts: [{ value: text(row.context) }],
      source: text(row.source),
    }),
  },
  {
    slug: 'malware',
    title: 'Malware',
    collection: 'malware',
    form: 'MALWARE_FIELDS',
    rows: (kase) => kase.malware,
    project: (row, names) => ({
      identity: text(row.filename),
      state: text(row.verdict),
      stateField: 'verdict',
      linked: named(names.system, row.systemId),
      // The account leads and the hash follows: without the account, searching
      // an account name found every kind naming it except the malware
      // attributed to it. The hash truncates to nothing at this width anyway.
      detailParts: [{ value: named(names.account, row.accountId) }, { value: text(row.hash) }],
      source: text(row.source),
    }),
  },
  {
    slug: 'cloud-apps',
    title: 'Cloud Apps',
    collection: 'cloud_apps',
    form: 'CLOUD_APP_FIELDS',
    rows: (kase) => kase.cloudApps,
    project: (row, names) => ({
      identity: text(row.appName),
      state: text(row.verifiedPublisher),
      stateField: 'verifiedPublisher',
      linked: named(names.account, row.accountId),
      detailParts: [{ value: text(row.publisher) }, { value: text(row.requestedScopes) }],
      source: text(row.source),
    }),
  },
]

/**
 * What every reference field on a form can offer, keyed by the collection it
 * points at -- every collection a form can reach, not the two a screen happens
 * to remember.
 */
export function referenceOptions(kase: Case): ReferenceOptions {
  const out: Partial<Record<CollectionName, ReadonlyMap<string, string>>> = {}
  const names = entityNames(kase)
  for (const kind of ENTITY_KINDS) {
    out[kind.collection] = new Map(
      kind.rows(kase).map((row) => [text(row.id), kind.project(row, names).identity]),
    )
  }
  out.evidence = new Map(
    kase.evidence.map((row) => [text(row.id), text(row.name) || text(row.type)]),
  )
  /**
   * **Beside evidence rather than in `ENTITY_KINDS`.**
   */
  out.methods = new Map(
    kase.methods.map((row) => [text(row.id), text(row.name) || text(row.established)]),
  )
  return out
}

/** The kind a slug names, or `undefined` for `'all'` and anything unknown. */
export function kindFor(scope: string): EntityKind | undefined {
  return ENTITY_KINDS.find((kind) => kind.slug === scope)
}

/**
 * Every entity in the case, one shape, in rail order.
 */
export function entityRows(kase: Case, fieldTones: Specs['fieldTones']): EntityRowView[] {
  const names = entityNames(kase)
  return ENTITY_KINDS.flatMap((kind) =>
    kind.rows(kase).map((row) => {
      const projected = kind.project(row, names)
      const parts = projected.detailParts.filter((part) => part.value)
      const mapped = fieldTones[projected.stateField]
      const tone = mapped?.[projected.state.trim().toLowerCase()]
      return {
        id: text(row.id),
        kind: kind.title,
        slug: kind.slug,
        collection: kind.collection,
        version: typeof row.version === 'number' ? row.version : -1,
        ...projected,
        detailParts: parts,
        detail: parts.map((part) => part.value).join(' \u00b7 '),
        attention: mapped === undefined ? undefined : tone?.fill === 'solid',
        fields: row,
      }
    }),
  )
}

/** The served tone for a row's state, or `undefined` where nothing maps it. */
export function toneOf(
  row: EntityRowView,
  fieldTones: Specs['fieldTones'],
): FieldToneSpec | undefined {
  return fieldTones[row.stateField]?.[row.state.trim().toLowerCase()]
}

/**
 * AND across whitespace-separated terms, over the Identity column alone -- the
 * column the toolbar's badge names ("Entity"), which is `Identity` unscoped
 * and the kind's own identifying column when scoped.
 */
export function matchesEntity(row: EntityRowView, query: string): boolean {
  if (!query.trim()) return true
  const hay = row.identity.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term))
}

export interface EntityFilter {
  /** Free text, matched over displayed values. Spans every kind at every scope. */
  q: string
  /** Kind titles, empty for all. Meaningful at the unscoped scope only. */
  kinds: readonly string[]
  /** `'attention'`, `'clear'`, or `''` for both. */
  attention: string
}

export const NO_FILTER: EntityFilter = { q: '', kinds: [], attention: '' }

export function isNarrowed(filter: EntityFilter): boolean {
  return Boolean(filter.q.trim() || filter.kinds.length || filter.attention)
}

/** The rows the search leaves, whatever the scope. The scope row counts these. */
export function searchEntities(
  rows: readonly EntityRowView[],
  filter: EntityFilter,
): EntityRowView[] {
  return rows.filter((row) => matchesEntity(row, filter.q))
}

/** The search, then the chips. The chips narrow within one scope. */
export function applyEntityFilter(
  rows: readonly EntityRowView[],
  filter: EntityFilter,
): EntityRowView[] {
  return searchEntities(rows, filter).filter((row) => {
    if (filter.kinds.length && !filter.kinds.includes(row.kind)) return false
    // `=== false` rather than `!row.attention`: a row the server has no
    // opinion on belongs to neither chip.
    if (filter.attention === 'attention' && row.attention !== true) return false
    if (filter.attention === 'clear' && row.attention !== false) return false
    return true
  })
}

/**
 * How many rows sit either side of the attention line, for the chips.
 */
export function attentionCounts(rows: readonly EntityRowView[]): {
  attention: number
  clear: number
} {
  return {
    attention: rows.filter((row) => row.attention === true).length,
    clear: rows.filter((row) => row.attention === false).length,
  }
}

/**
 * The campaign demo with every collection a screen in this tier draws emptied.
 */
export const EMPTY_CASE: Case = {
  ...campaignCase,
  systems: [],
  accounts: [],
  networkIndicators: [],
  malware: [],
  cloudApps: [],
  evidence: [],
  actions: [],
}

/**
 * The `Case` property each kind's rows are stored on -- a third spelling of
 * the same five kinds beside the slug and the collection, differing from
 * both on three of them (`network` is `network_indicators` on the wire and
 * `networkIndicators` on the document).
 */
const CASE_KEY = {
  assets: 'systems',
  accounts: 'accounts',
  network: 'networkIndicators',
  malware: 'malware',
  'cloud-apps': 'cloudApps',
} as const satisfies Record<EntityKind['slug'], keyof Case>

/**
 * The case with `row` merged over the row of that id in its kind, or appended
 * where the kind holds no such id.
 */
export function withRow(
  kase: Case,
  slug: EntityKind['slug'],
  row: Record<string, unknown>,
): Case {
  const key = CASE_KEY[slug]
  const rows = kase[key] as readonly { id: string }[]
  const id = String(row.id)
  const next = rows.some((one) => one.id === id)
    ? rows.map((one) => (one.id === id ? { ...one, ...row } : one))
    : [...rows, row]
  return { ...kase, [key]: next }
}

/**
 * The case with `patch` written over every named row of one kind.
 */
export function withPatched(
  kase: Case,
  slug: EntityKind['slug'],
  ids: readonly string[],
  patch: Record<string, unknown>,
): Case {
  const key = CASE_KEY[slug]
  const chosen = new Set(ids)
  const rows = kase[key] as readonly { id: string }[]
  return {
    ...kase,
    [key]: rows.map((one) => (chosen.has(one.id) ? { ...one, ...patch } : one)),
  }
}
