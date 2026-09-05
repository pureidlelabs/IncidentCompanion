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
 */
export const SECTION_ALIASES: Readonly<Record<string, string>> = {
  settings: 'overview',
}

/**
 * The section a slug addresses, following an alias, or `undefined` where the
 * case has no section for it.
 */
export function canonicalSlug(slug: string | undefined): string | undefined {
  if (slug === undefined) return undefined
  // **A fragment is not an address, so as one it means its parent.** The kinds
  // are in `SECTIONS` for their titles and icons and have no screen of their
  // own, so resolving `assets` to itself hands the outlet a slug no element
  // answers and the analyst gets the named refusal.
  const parent = parentOf(slug)
  if (parent !== undefined) return parent
  if (Object.hasOwn(SECTIONS, slug)) return slug
  return Object.hasOwn(SECTION_ALIASES, slug) ? SECTION_ALIASES[slug] : undefined
}

/** The row a fragment belongs to, or `undefined` where the slug is not one. */
export function parentOf(slug: string): string | undefined {
  for (const group of RAIL_GROUPS) {
    for (const row of group.rows) {
      if ((row.children ?? []).includes(slug)) return row.slug
    }
  }
  return undefined
}

/**
 * The section a case opens on.
 */
function firstRailSlug(): string {
  const slug = RAIL_GROUPS[0]?.rows[0]?.slug
  if (slug === undefined) throw new Error('RAIL_GROUPS must declare at least one row')
  return slug
}

export const ENTRY_SLUG: string = firstRailSlug()
