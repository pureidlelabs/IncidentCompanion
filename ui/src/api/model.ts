/**
 * The client's model types: one door, so every screen crosses the boundary in
 * one place.
 *
 * **Nothing here is generated.** The row types are `server/src/domain/wire.ts`,
 * read through `@contract/*` as `import type`, so a schema change is a compile
 * error in the same `tsc` pass.
 *
 * Screens import a *named row* - `AccountEntry`, not
 * `CollectionEntry['accounts']` - because a section's
 * `useState<AccountEntry | null>` is what its dialog renders from, and the
 * envelope has to be on the name the screen holds.
 *
 * **Nothing enforces that, and this used to cite a test that does not exist.**
 * `model.boundary.test.ts` has never been in this repository; the arrow made a
 * convention read as a guarded one. It is a convention.
 */
import type { CaseRow, CollectionRows, RowMeta } from '@contract/wire'


/**
 * What an impact row is, from the server's own declaration.
 *
 * **Through `CollectionEntry`, not `ImpactRow` directly**, so it carries the
 * same envelope as every other row - it was the first collection to move and
 * predates the rest arriving, which left it the one row with the full
 * `RowMeta` on it.
 */
export type ImpactEntry = CollectionEntry['impact']

/**
 * Every case-owned row carries the version a write has to present.
 *
 * A write presents the version it read and the server refuses one that does
 * not, so this is the field that makes a write legal at all.
 *
 * **Only `version`, though the wire sends the whole of `RowMeta`.** The rest -
 * `caseId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` - is served and
 * read by nothing here; the only `updatedAt` the client reads is a *case*
 * summary's and the only `createdAt` a report's, both already declared. Adding
 * five fields nothing consumes would put five invented values into every
 * fixture and story that exists to render a row, which buys a type that is
 * more complete and no more correct. Widen it when a screen needs one.
 * -> `wire.ts`'s `RowMeta`
 */
type Owned<T> = T & Pick<RowMeta, 'version'>

/**
 * A contract row as the client holds it: the payload, plus `version`.
 *
 * **Not the whole of `RowMeta`** - `Owned` exists to keep the other five
 * fields off.
 *
 * **`id` is exempt**, because it lives in `RowMeta` and is the row's identity
 * - omitting it left every row failing a `{ id: string }` constraint, in 549
 * places.
 *
 * **`createdAt` is not, and is added to notes alone.** Requiring it everywhere
 * put it into every table fixture in the suite for the benefit of one screen,
 * which is the cost this whole envelope exists to avoid.
 *
 * **Distributive, because one collection is a union.** `Omit` on a union
 * collapses it to the keys both halves share - so `Held<TimelineRow>` became a
 * single shape with the event's own fields silently dropped, and every screen
 * that read one failed to compile for the wrong reason. `T extends unknown ?`
 * makes it apply per member and keep the union.
 */
type Held<T> = T extends unknown ? Owned<Omit<T, Exclude<keyof RowMeta, 'id'>>> : never

/**
 * Every collection the contract declares, as this client holds it: table name
 * on the wire -> the entry type it holds.
 *
 * **`exfiltration` is gone rather than renamed.** It described one of six
 * things that can happen to data and had no room for the other five; `impact`
 * carries the disposition as a column. -> `server/src/domain/entities/impact.ts`
 */
type ContractEntries = Omit<
  { [K in keyof CollectionRows]: Held<CollectionRows[K]> },
  'casenotes'
> & {
  /**
   * **Notes carry the server's stamp**, because they are ordered by it and
   * nothing else on the screen says when one was written. It is the server's
   * to set: a note used to be captured with a client-side `dateAdded`, and the
   * Node row has no such field - so the whole body was refused and no note
   * could be added to any case.
   */
  casenotes: Held<CollectionRows['casenotes']> & Pick<RowMeta, 'createdAt'>

  /**
   * **A report is listed by when it was made and when it last moved**, so the
   * index needs both stamps the server sets. They are not in the domain schema
   * for the same reason `casenotes` keeps its own: an analyst does not type
   * them, so they are not fields of the thing -- they are facts about the row.
   */
  reports: Held<CollectionRows['reports']> & Pick<RowMeta, 'createdAt' | 'updatedAt'>

  /**
   * **The union, with each half's own keys readable as absent on the other.**
   * Applied here rather than on the exported alias, because `useCollection`
   * reads this map - so a screen holding `CollectionEntry['timeline']` got the
   * bare union and could not name `severity` at all.
   */
  timeline: EitherHalf<Held<CollectionRows['timeline']>>
}

/** Every collection, from the server's own schemas. */
export type CollectionEntry = ContractEntries

/**
 * The same envelope on each entry type by name.
 *
 * **Screens hold a row, not a `CollectionEntry['accounts']`.** A section's
 * `useState<AccountEntry | null>` is what the pencil's dialog is rendered
 * from and what its save presents a version off, so the envelope has to be on
 * the name the screen imports or the fix stops at the collection map. These
 * shadow the `export *` above, which is exactly what that language rule is
 * for.
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
 * **Every key of either half, with the other half's marked absent.** A
 * timeline list holds both kinds at once, so `entry.severity` is a fair thing
 * to write - what was wrong was the type saying it is always a value. Here it
 * is `undefined` on an action, so `?? '\u2014'` is required rather than
 * optional, and a screen that forgets it does not compile.
 *
 * Narrow with `isEvent` where the *behaviour* differs; use this where a mixed
 * list is being rendered.
 */
type AllKeysOf<U> = U extends unknown ? keyof U : never

/**
 * `All` is a defaulted parameter on purpose: it is evaluated against the whole
 * union *before* the conditional distributes, so each member learns the other
 * member's keys. Computing it inside the branch gives `keyof U` of one member
 * and adds nothing.
 */
type EitherHalf<U, All extends PropertyKey = AllKeysOf<U>> = U extends unknown
  ? U & Partial<Record<Exclude<All, keyof U>, undefined>>
  : never

/**
 * A timeline row, and it is **a union rather than one flat shape**.
 *
 * `timelineToWire` projects an action through `actionSchema` and an event
 * through `eventSchema`, so an action reaches the client with no `severity`,
 * no `tactic`, no `sourceTool` and no `hideFromGraph` - those keys are absent,
 * not null, and a flat type saying otherwise reads event fields off an action
 * and gets `undefined`. -> `server/src/domain/entities/timeline.ts`
 */
export type TimelineEntry = CollectionEntry['timeline']

/** The event half: what the attacker did, with a tactic and a severity. */
export type TimelineEvent = Extract<TimelineEntry, { kind: 'event' }>

/** The action half: what the SOC did. No tactic, and deliberately no severity. */
export type TimelineAction = Extract<TimelineEntry, { kind: 'action' }>

/**
 * **Narrow before reading an event-only field.** The alternative is optional
 * chaining, which compiles and silently renders an empty cell on the half of
 * the rows that never carry the value.
 */
export function isEvent(entry: TimelineEntry): entry is TimelineEvent {
  return entry.kind === 'event'
}

export function isAction(entry: TimelineEntry): entry is TimelineAction {
  return entry.kind === 'action'
}

export type CollectionName = keyof CollectionEntry

/**
 * **The case's arrays are the same rows the collection map describes.** They
 * were left generated once and the two disagreed silently: a screen reading a
 * table off the whole case held rows with no `version`, so its writes could
 * not be typed at all while the collection routes' could. Whatever a row is,
 * it is that in both places.
 */
export interface Case extends CaseRow, CollectionRowArrays {
  impact: CollectionEntry['impact'][]
}

/**
 * **Every collection the case carries, keyed as the case document keys it.**
 * Derived from `CollectionsByCaseKey` rather than from the generated `Case`,
 * which is what the intersection with `GeneratedCase` used to supply - the
 * generated shape is no longer part of this type at all.
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
 *
 * **The order is the order the archive screen and the import table walk**, so
 * it is kept deliberately rather than sorted.
 *
 * -> `server/src/specs/collections.controller.ts`, which declares the same
 * split server-side and is the authority if the two ever disagree.
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
 * **`evidence` is absent, and that is the point.** An evidence row exists to
 * say a file is held, and its bytes arrive on their own route - so a batch or
 * generic create would mint records claiming files nobody uploaded.
 *
 * **`reports` and `report_blocks` are absent too**, which the generated list
 * got wrong: the server marks both `bulk: false` in `domain/collections.ts`,
 * because anything written into a report is reviewable and a bulk selection
 * has never been able to name one. Inert while the server filters first, and
 * an offer the client had no business making.
 */
export const BATCH_CREATABLE_COLLECTION_NAMES: readonly CollectionName[] = [
  'accounts',
  'actions',
  'casenotes',
  'cloud_apps',
  'impact',
  'malware',
  /**
   * **Batchable where `evidence` is not.** A method row describes an act and
   * holds no bytes, so a batch door mints nothing claiming a file nobody
   * uploaded - which is the one reason evidence is excluded.
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
 *
 * **Written out rather than derived from the generated map.** The values have
 * to stay *literal* types: `kase[COLLECTION_TO_CASE_KEY[name]].length` only
 * typechecks while each value narrows to one key, and `Object.fromEntries`
 * widens every one of them to `keyof Case` - which includes the scalars, so
 * the read then has no `.length`.
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
 *
 * **Beside the type rather than in the screen that first wanted it.** The
 * import page and the case activity feed both turn a collection into a word,
 * and a second map is a second thing to update when a collection is renamed.
 * Exhaustive over `CollectionName`, so a new collection fails to compile here
 * instead of rendering `undefined` on two screens.
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

