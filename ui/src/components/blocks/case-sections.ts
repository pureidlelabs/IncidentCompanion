import {
  Archive,
  Boxes,
  Bug,
  Check,
  Clock,
  CloudDownload,
  FileText,
  Fingerprint,
  Footprints,
  Gavel,
  GitCommitHorizontal,
  LayoutGrid,
  LineChart,
  Monitor,
  Network,
  Newspaper,
  NotebookPen,
  Search,
  ShieldAlert,
  Upload,
  User,
  Waypoints,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Every section of a case, and the shape the rail draws them in.
 *
 * **One source, because three consumers already disagreed.** The rail was
 * written out by hand in each place that needed one: `timeline.stories` drew
 * four rows, `entities.stories` drew its own, and the app drew twenty from a
 * registry the gallery could not reach. A row added in one appeared in none of
 * the others.
 *
 * **Identity only -- no screen, no element.** What a slug renders is the
 * router's business and differs between the gallery and the app; what it is
 * called and which icon it carries does not. Keeping the element out is what
 * lets a story draw the whole rail without importing thirty screens.
 */
export interface SectionIdentity {
  title: string
  icon: LucideIcon
}

/** What each slug is called, and the icon it carries. */
export const SECTIONS: Readonly<Record<string, SectionIdentity>> = {
  overview: { title: 'Case overview', icon: LineChart },
  timeline: { title: 'Timeline', icon: Clock },
  entities: { title: 'Entities', icon: Boxes },
  assets: { title: 'Assets', icon: Monitor },
  accounts: { title: 'Accounts', icon: User },
  network: { title: 'Network', icon: Network },
  malware: { title: 'Malware', icon: Bug },
  'cloud-apps': { title: 'Cloud Apps', icon: LayoutGrid },
  'investigation-graph': { title: 'Investigation graph', icon: Waypoints },
  'timeline-graph': { title: 'Timeline graph', icon: GitCommitHorizontal },
  'killchain-coverage': { title: 'Kill chain coverage', icon: Footprints },
  methods: { title: 'Methods', icon: Search },
  evidence: { title: 'Evidence', icon: FileText },
  impact: { title: 'Impact', icon: ShieldAlert },
  actions: { title: 'Actions', icon: Check },
  notes: { title: 'Case notes', icon: NotebookPen },
  compliance: { title: 'Compliance', icon: Gavel },
  report: { title: 'Report', icon: Newspaper },
  import: { title: 'Import Data', icon: Upload },
  'import-sentinel': { title: 'Import from Sentinel', icon: CloudDownload },
  archive: { title: 'Case archive', icon: Archive },
  indicators: { title: 'Indicators', icon: Fingerprint },
}

export interface RailRowSpec {
  slug: string
  /** Views of this row's page, as fragments on its address. Not sections. */
  children?: readonly string[]
  /** The row carries a sub-rail whose fold control sits back on the row, so
   *  its link stops short of the right edge. */
  hasSubrail?: true
}

export interface RailGroupSpec {
  /** `null` renders the rows with no heading and no fold. */
  label: string | null
  rows: readonly RailRowSpec[]
}

/**
 * The rail's own structure.
 *
 * **Not every section is a row.** `accounts`, `network`, `malware` and
 * `cloud-apps` are kinds of the entities page rather than places, so a section
 * missing here is a decision rather than an omission.
 */
export const RAIL_GROUPS: readonly RailGroupSpec[] = [
  { label: null, rows: [{ slug: 'overview' }] },
  {
    label: 'Collect',
    rows: [
      { slug: 'timeline' },
      // One page, and a door to each kind on it. The children are fragments of
      // the entities page rather than sections of their own, so a sixth kind
      // joins this list and needs no route.
      { slug: 'entities', children: ['assets', 'accounts', 'network', 'malware', 'cloud-apps'] },
      { slug: 'evidence' },
      { slug: 'methods' },
      { slug: 'impact' },
      { slug: 'import' },
      { slug: 'import-sentinel' },
    ],
  },
  {
    label: 'Correlate',
    rows: [
      { slug: 'investigation-graph' },
      { slug: 'timeline-graph' },
      { slug: 'killchain-coverage' },
    ],
  },
  {
    label: 'Report',
    rows: [
      { slug: 'compliance' },
      { slug: 'report', hasSubrail: true },
      { slug: 'archive' },
      { slug: 'indicators' },
    ],
  },
  { label: 'Case', rows: [{ slug: 'notes' }, { slug: 'actions' }] },
]

/** The group a slug sits in, so a child section can hold its parent row open. */
export function groupHolding(slug: string): RailGroupSpec | undefined {
  return RAIL_GROUPS.find((group) =>
    group.rows.some((row) => row.slug === slug || (row.children ?? []).includes(slug)),
  )
}

/**
 * Slugs that used to address a section and still resolve to it.
 *
 * **An alias resolves rather than redirects**: the URL an analyst bookmarked
 * goes on working and the section it named is what renders, so a stale link
 * never becomes a screen that quietly stands for a different one.
 *
 * `settings` was a rail row until Case settings was folded into the overview's
 * tabs; the row went and the addresses in history did not.
 */
export const SECTION_ALIASES: Readonly<Record<string, string>> = {
  settings: 'overview',
}

/**
 * The section a slug addresses, following an alias, or `undefined` where the
 * case has no section for it.
 *
 * `Object.hasOwn` on both lookups rather than `in` or an index: `constructor`
 * and `toString` are on every object's prototype, so a plain membership test
 * makes them slugs and a plain index hands back a function.
 *
 * Answers `undefined` rather than falling back to `ENTRY_SLUG`, which the
 * outlet turns into a named refusal - a typed slug landing silently on the
 * overview looks exactly like a link that worked.
 */
export function canonicalSlug(slug: string | undefined): string | undefined {
  if (slug === undefined) return undefined
  if (Object.hasOwn(SECTIONS, slug)) return slug
  return Object.hasOwn(SECTION_ALIASES, slug) ? SECTION_ALIASES[slug] : undefined
}

/**
 * The section a case opens on.
 *
 * **The rail's first row is the landing page, and one list decides both.** Two
 * would let the row an analyst meets first and the index redirect disagree;
 * reordering `RAIL_GROUPS` moves where every case opens, which is the decision
 * rather than a side effect of it.
 *
 * The throw is unreachable while `RAIL_GROUPS` is the literal above, and is
 * here so this exports `string` rather than `string | undefined`.
 */
function firstRailSlug(): string {
  const slug = RAIL_GROUPS[0]?.rows[0]?.slug
  if (slug === undefined) throw new Error('RAIL_GROUPS must declare at least one row')
  return slug
}

export const ENTRY_SLUG: string = firstRailSlug()
