/**
 * The client's model types: one door, so every screen crosses the boundary in
 * one place.
 */
import type { CaseRow, CollectionRows, RowMeta } from '@contract/wire'


/**
 * What an impact row is, from the server's own declaration.
 */
export type ImpactEntry = CollectionEntry['impact']

/**
 * Every case-owned row carries the version a write has to present.
 */
type Owned<T> = T & Pick<RowMeta, 'version'>

/**
 * A contract row as the client holds it: the payload, plus `version`.
 */
type Held<T> = T extends unknown ? Owned<Omit<T, Exclude<keyof RowMeta, 'id'>>> : never

/**
 * Every collection the contract declares, as this client holds it: table name
 * on the wire -> the entry type it holds.
 */
type ContractEntries = Omit<
  { [K in keyof CollectionRows]: Held<CollectionRows[K]> },
  'casenotes'
> & {
  /**
   * **Notes carry the server's stamp**, because they are ordered by it and
   * nothing else on the screen says when one was written.
   */
  casenotes: Held<CollectionRows['casenotes']> & Pick<RowMeta, 'createdAt'>

  /**
   * **A report is listed by when it was made and when it last moved**, so the
   * index needs both stamps the server sets.
   */
  reports: Held<CollectionRows['reports']> & Pick<RowMeta, 'createdAt' | 'updatedAt'>

  /**
   * **The union, with each half's own keys readable as absent on the other.**
   */
  timeline: EitherHalf<Held<CollectionRows['timeline']>>
}

/** Every collection, from the server's own schemas. */
export type CollectionEntry = ContractEntries

/**
 * The same envelope on each entry type by name.
 */
export type AccountEntry = CollectionEntry['accounts']
export type ActionEntry = CollectionEntry['actions']
export type CaseNote = CollectionEntry['casenotes']
export type CloudAppEntry = CollectionEntry['cloud_apps']
export type EvidenceEntry = CollectionEntry['evidence']
export type MalwareEntry = CollectionEntry['malware']
export type MethodEntry = CollectionEntry['methods']
export type NetworkIndicator = CollectionEntry['network_indicators']
export type ReportBlock = CollectionEntry['report_blocks']
export type Report = CollectionEntry['reports']
export type SystemEntry = CollectionEntry['systems']
/**
 * **Every key of either half, with the other half's marked absent.**
 */
type AllKeysOf<U> = U extends unknown ? keyof U : never

/**
 * `All` is a defaulted parameter on purpose: it is evaluated against the whole
 * union *before* the conditional distributes, so each member learns the other
 * member's keys.
 */
type EitherHalf<U, All extends PropertyKey = AllKeysOf<U>> = U extends unknown
  ? U & Partial<Record<Exclude<All, keyof U>, undefined>>
  : never

/**
 * A timeline row, and it is **a union rather than one flat shape**.
 */
export type TimelineEntry = CollectionEntry['timeline']

/** The event half: what the attacker did, with a tactic and a severity. */
export type TimelineEvent = Extract<TimelineEntry, { kind: 'event' }>

/** The action half: what the SOC did. No tactic, and deliberately no severity. */
export type TimelineAction = Extract<TimelineEntry, { kind: 'action' }>

/**
 * **Narrow before reading an event-only field.**
 */
export function isEvent(entry: TimelineEntry): entry is TimelineEvent {
  return entry.kind === 'event'
}

export function isAction(entry: TimelineEntry): entry is TimelineAction {
  return entry.kind === 'action'
}

export type CollectionName = keyof CollectionEntry

/**
 * **The case's arrays are the same rows the collection map describes.**
 */
export interface Case extends CaseRow, CollectionRowArrays {
  impact: CollectionEntry['impact'][]
}

/**
 * **Every collection the case carries, keyed as the case document keys it.**
 */
type CollectionRowArrays = {
  [K in keyof CollectionsByCaseKey]: CollectionsByCaseKey[K][]
}

/** Case key -> the row type that key holds. The mirror of `COLLECTION_TO_CASE_KEY`. */
interface CollectionsByCaseKey {
  accounts: CollectionEntry['accounts']
  actions: CollectionEntry['actions']
  casenotes: CollectionEntry['casenotes']
  cloudApps: CollectionEntry['cloud_apps']
  evidence: CollectionEntry['evidence']
  malware: CollectionEntry['malware']
  methods: CollectionEntry['methods']
  networkIndicators: CollectionEntry['network_indicators']
  reportBlocks: CollectionEntry['report_blocks']
  reports: CollectionEntry['reports']
  systems: CollectionEntry['systems']
  timeline: CollectionEntry['timeline']
}

/**
 * Which collections exist, and which accept which kind of create.
 */
export const COLLECTION_NAMES: readonly CollectionName[] = [
  'accounts',
  'actions',
  'casenotes',
  'cloud_apps',
  'evidence',
  'impact',
  'malware',
  'methods',
  'network_indicators',
  'report_blocks',
  'reports',
  'systems',
  'timeline',
]

/**
 * **`evidence` is absent, and that is the point.**
 */
export const BATCH_CREATABLE_COLLECTION_NAMES: readonly CollectionName[] = [
  'accounts',
  'actions',
  'casenotes',
  'cloud_apps',
  'impact',
  'malware',
  /**
   * **Batchable where `evidence` is not.**
   */
  'methods',
  'network_indicators',
  'systems',
  'timeline',
]
export type BatchCreatableCollectionName = CollectionName

export const GENERIC_CREATE_COLLECTION_NAMES: readonly CollectionName[] =
  BATCH_CREATABLE_COLLECTION_NAMES
export type GenericCreateCollectionName = CollectionName

/**
 * A table's URL segment -> its key on `Case`.
 */
export const COLLECTION_TO_CASE_KEY = {
  accounts: 'accounts',
  actions: 'actions',
  casenotes: 'casenotes',
  cloud_apps: 'cloudApps',
  evidence: 'evidence',
  impact: 'impact',
  malware: 'malware',
  methods: 'methods',
  network_indicators: 'networkIndicators',
  report_blocks: 'reportBlocks',
  reports: 'reports',
  systems: 'systems',
  timeline: 'timeline',
} as const satisfies Record<CollectionName, keyof Case>

/**
 * What an analyst calls each collection - the rail's own titles, never the
 * wire's snake_case name.
 */
export const COLLECTION_LABELS: Record<CollectionName, string> = {
  timeline: 'Timeline',
  systems: 'Assets',
  accounts: 'Accounts',
  network_indicators: 'Network',
  impact: 'Impact',
  malware: 'Malware',
  cloud_apps: 'Cloud Apps',
  evidence: 'Evidence',
  methods: 'Methods',
  actions: 'Actions',
  casenotes: 'Case notes',
  reports: 'Reports',
  report_blocks: 'Report blocks',
}

