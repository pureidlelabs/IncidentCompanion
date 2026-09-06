/**
 * What a family of components does not agree about.
 *
 * Every other instrument here asks *does what is on screen work*. This one
 * asks *is everything that should be here, here* - it drives every component's
 * Storybook stories in one browser, enumerates what a person can actually
 * reach on each, and reports the capabilities a family disagrees about.
 *
 * The browser half lives in `affordance-audit.audit.ts`. What is here is the
 * decidable half: which family a component is in, what an accessible name
 * collapses to, and what counts as a disagreement. All of it is pure, and
 * `test/affordance-audit.test.ts` holds it.
 *
 * **Reachable, not present.** A control at `opacity: 0` that no gesture
 * reveals is absent for this purpose, and the enumerator's `blocked` field is
 * how the report says so rather than counting it. jsdom finds a button
 * whatever its opacity, and the geometry probe measures the box of an element
 * that exists - so neither of the other tiers can make this distinction, which
 * is the whole reason this one drives a browser.
 */

/** One Storybook index entry, narrowed to what the audit reads. */
export interface StoryEntry {
  readonly id: string
  readonly title: string
  readonly name: string
  readonly importPath: string
  readonly type?: string
}

export type Surface = 'block' | 'screen'

export interface Component {
  readonly surface: Surface
  /** The source file's basename, with `.stories.tsx` removed. */
  readonly slug: string
  readonly importPath: string
  readonly title: string
  readonly stories: readonly StoryEntry[]
}

/**
 * Words naming the *shape* of a component rather than the component.
 *
 * `familyOf` is what reads them: a component's family is what it *is*, and
 * that is the shape word in its own name. A component naming none is in no
 * family.
 */
const SHAPE_WORDS = new Set([
  'table',
  'form',
  'section',
  'list',
  'pane',
  'dialog',
  'control',
  'view',
  'screen',
  'wizard',
  'sheet',
])

/**
 * Words carrying no capability, dropped from an accessible name before it is
 * collapsed to a key.
 *
 * `More for DC-01` and `More` are the same affordance, and the preposition is
 * the only thing between them.
 */
const NAME_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'for',
  'of',
  'in',
  'on',
  'to',
  'this',
  'item',
  'row',
  'entry',
])

/** `KillchainCoverageSection` or `cloud-apps` to `['killchain','coverage','section']`. */
export function wordsOf(slug: string): string[] {
  return slug
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase())
}

/**
 * The surface a story's source file sits on, or `null` when it is on neither.
 *
 * The kit (`components/ui`) is out of scope: a family is a
 * set of components that owe each other the same controls, and a primitive
 * owes nothing to the screens built from it.
 */
export function surfaceOf(importPath: string): Surface | null {
  const path = importPath.replace(/^\.\//, '')
  if (path.startsWith('src/screens/')) return 'screen'
  if (path.startsWith('src/components/blocks/')) return 'block'
  return null
}

export function slugOf(importPath: string): string {
  const base = importPath.slice(importPath.lastIndexOf('/') + 1)
  return base.replace(/\.stories\.tsx?$/, '')
}

/**
 * Group a Storybook index into per-component buckets, one per source file.
 *
 * Docs entries are dropped: they render MDX rather than the component, so
 * every affordance on one belongs to Storybook.
 */
export function componentsOf(entries: readonly StoryEntry[]): Component[] {
  const buckets = new Map<string, StoryEntry[]>()
  for (const entry of entries) {
    if (entry.type === 'docs') continue
    if (!surfaceOf(entry.importPath)) continue
    const held = buckets.get(entry.importPath)
    if (held) held.push(entry)
    else buckets.set(entry.importPath, [entry])
  }

  const out: Component[] = []
  for (const [importPath, stories] of buckets) {
    const surface = surfaceOf(importPath)
    if (!surface) continue
    out.push({
      surface,
      slug: slugOf(importPath),
      importPath,
      title: stories[0]?.title ?? '',
      stories,
    })
  }
  return out.sort((left, right) => left.importPath.localeCompare(right.importPath))
}

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Whether a word is data rather than vocabulary - an entity's own name. */
function isDataWord(raw: string): boolean {
  if (/\d/.test(raw)) return true
  if (/[._@/\\-]/.test(raw)) return true
  // `DC`, `SOC`, `AAD` - an identifier rather than a word.
  if (/^[A-Z]{2,}$/.test(raw)) return true
  return false
}

/**
 * One control's capability, collapsed so two wordings of it compare.
 *
 * `Edit DC-01 in full` and `Edit` are the same affordance under two labels,
 * and every row in a table names a different entity - so a key is the role
 * plus the leading run of vocabulary words, stopping at the first word that is
 * data.
 *
 * **It collapses rather than distinguishes, deliberately.** Two different
 * actions sharing a first word (`Add note`, `Add entity`) stay apart because
 * the run continues past the verb; two spellings of one action come together.
 * Where it is wrong it is wrong towards a missed finding rather than a false
 * one, which is the direction a list has to be wrong in to stay usable.
 */
export function affordanceKey(role: string, name: string): string {
  const words: string[] = []
  for (const raw of name.split(/\s+/)) {
    const bare = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    if (bare.length === 0) continue
    if (isDataWord(bare)) break
    const lower = bare.toLowerCase()
    if (NAME_STOPWORDS.has(lower)) continue
    words.push(lower)
    if (words.length === 3) break
  }
  return `${role}:${words.join(' ')}`
}

/**
 * Roles a person acts on. A container role names no capability of its own.
 *
 * Here rather than beside the browser half so `parseSnapshot` is testable
 * without one.
 */
export const INTERACTIVE = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'textbox',
  'searchbox',
  'combobox',
  'slider',
  'spinbutton',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'option',
  'treeitem',
])

/**
 * Roles that give a control a *place*, as against the wrappers between it and
 * one.
 *
 * A cell, a group of two divs and a paragraph are between a button and the row
 * it belongs to, and pairing on the nearest ancestor of any kind puts every
 * table control at ordinal 0 - the position then carries nothing. What is
 * wanted is the row, the toolbar or the menu, which is the thing a person
 * would name when saying where the control is.
 */
const LANDMARK = new Set([
  'row',
  // A sortable column's button sits in one, and being able to say so is what
  // keeps a column out of the sibling check: an entity's columns are its own.
  'columnheader',
  'toolbar',
  'menu',
  'menubar',
  'listbox',
  'tablist',
  'dialog',
  'banner',
  'navigation',
  'main',
  'region',
  'form',
  'list',
  'article',
  'search',
  'tabpanel',
  'tree',
  'treegrid',
  'grid',
  'table',
  'complementary',
  'contentinfo',
])

/**
 * Landmarks whose accessible name is their contents rather than their
 * identity, and so is dropped.
 *
 * A row is called after the cells in it. Keeping that, two tables in a family
 * have different containers for every control the moment one column is
 * renamed - which is the case this whole positional reading was added for.
 */
const NAMELESS = new Set(['row', 'article', 'table', 'grid', 'list', 'tree', 'treegrid'])

/**
 * One line of a Playwright ARIA snapshot, as an indent, a role and a name.
 *
 * The snapshot is YAML-shaped - `- button "Edit DC-01" [disabled]` - and the
 * indent is what carries the tree. Every line is read, not only the
 * interactive ones: a `cell` names no capability and is still what stands
 * between a button and its row.
 */
const SNAPSHOT_LINE = /^(\s*)-\s+([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?/

export interface SnapshotNode {
  readonly role: string
  readonly name: string
  /** The nearest landmark ancestor, as an `affordanceKey`. Empty at the root. */
  readonly container: string
  /** Its index among the interactive controls of that landmark. */
  readonly ordinal: number
}

/**
 * Every control in an ARIA snapshot, with its landmark and its place in it.
 *
 * The container is an `affordanceKey` rather than the raw name, so the row for
 * `DC-01` and the row for `SRV-02` are one container and a control keeps the
 * same place on every row.
 */
export function parseSnapshot(yaml: string): SnapshotNode[] {
  const out: SnapshotNode[] = []
  const stack: { indent: number; label: string; landmark: boolean; count: number }[] = []
  let loose = 0
  for (const line of yaml.split('\n')) {
    const found = SNAPSHOT_LINE.exec(line)
    if (!found) continue
    const indent = (found[1] ?? '').length
    const role = found[2] ?? ''
    const name = (found[3] ?? '').replace(/\\(.)/g, '$1')
    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? -1) >= indent) stack.pop()
    if (INTERACTIVE.has(role)) {
      let at = stack.length - 1
      while (at >= 0 && !(stack[at]?.landmark ?? false)) at -= 1
      const holder = at >= 0 ? stack[at] : undefined
      const ordinal = holder ? holder.count : loose
      if (holder) holder.count += 1
      else loose += 1
      out.push({ role, name, container: holder?.label ?? '', ordinal })
    }
    stack.push({
      indent,
      // **A row is named by what is in it**, so the header row of a table is
      // called after its columns and renaming a column renames the container.
      label: NAMELESS.has(role) ? `${role}:` : affordanceKey(role, name),
      landmark: LANDMARK.has(role),
      count: 0,
    })
  }
  return out
}

/** One thing a person can reach on a rendered story. */
export interface Affordance {
  readonly role: string
  readonly name: string
  /** Which pass surfaced it - `rest`, `hover`, `menu`, `contextmenu`. */
  readonly via: string
  /** Set when the control is in the DOM and no gesture made it reachable. */
  readonly blocked?: string
  /** The landmark it sits in, from `parseSnapshot`. Absent on a hand-made one. */
  readonly container?: string
  /** Its place among that landmark's controls. */
  readonly ordinal?: number
}

/** One story's reading, kept apart so a per-state defect is still visible. */
export interface StoryAffordances {
  readonly storyId: string
  readonly affordances: readonly Affordance[]
}

/**
 * A capability's shape, with the row's own subject taken off.
 *
 * `Edit Ransom note readme_decrypt.txt found` and `Edit DC-01` are one
 * affordance on two rows, and only the second reduces to `edit` on its own -
 * a description written as prose keeps its words, because they are words. For
 * deciding *whether a story ever revealed a control of this kind*, one word is
 * the right resolution: the audit hovers the first rows only, so row four's
 * cluster is never reached and would otherwise be reported dark on every table
 * in the app.
 */
function shapeKey(key: string): string {
  const at = key.indexOf(':')
  return `${key.slice(0, at)}:${key.slice(at + 1).split(' ')[0] ?? ''}`
}

/**
 * Controls that are in a story's DOM and that nothing in that story reveals.
 *
 * **Asked per story, because the union across a component's stories hides
 * exactly the defect this audit was built after.** A row-action cluster held
 * at `opacity: 0` is reachable in the selection story, where being ticked
 * reveals it, so the component's union says the capability is present - and it
 * is, in one state out of many.
 *
 * This needs no twin, so it is the half of the audit that also covers a
 * component nothing can be paired with.
 */
export function unreachableWithinStories(
  perStory: readonly StoryAffordances[],
): { key: string; storyId: string; why: string; names: string[] }[] {
  const out: { key: string; storyId: string; why: string; names: string[] }[] = []
  for (const story of perStory) {
    const reached = new Set(
      story.affordances
        .filter((one) => !one.blocked)
        .map((one) => shapeKey(affordanceKey(one.role, one.name))),
    )
    const seen = new Set<string>()
    for (const one of story.affordances) {
      if (!one.blocked) continue
      const key = affordanceKey(one.role, one.name)
      if (reached.has(shapeKey(key)) || seen.has(key)) continue
      seen.add(key)
      out.push({
        key,
        storyId: story.storyId,
        why: one.blocked,
        // Four names, because a table of thirty rows would otherwise put
        // thirty spellings of one finding into the report.
        names: [
          ...new Set(
            story.affordances
              .filter((it) => it.blocked && affordanceKey(it.role, it.name) === key)
              .map((it) => it.name),
          ),
        ].slice(0, 4),
      })
    }
  }
  return out
}

/**
 * The family a component belongs to: what it *is*, out of what it calls
 * itself.
 *
 * `AccountsTable`, `EvidenceTable` and `ActionsTable` are all tables and owe
 * each other the same row controls; `SignInForm` and `OverviewForm` are both
 * forms. The shape word is already how a screen pairs with its twin
 * (`SHAPE_WORDS`), so nothing is listed by hand and a screen added tomorrow
 * joins its family by being named.
 *
 * **The Storybook title was tried first and is worse.** Its last-but-one
 * segment is a menu category rather than a shape: `Screens/Case` holds a
 * timeline, a graph, two forms and a notes list, so the check reports
 * disagreements between screens that were never alike.
 *
 * **The surface is part of the key**, because a block is not a small screen.
 * `data-table` has no filter bar and is not missing one; mixed in with the
 * table *screens* it reports their toolbar controls as its own gap.
 *
 * A component naming no shape is in no family. That is most of the singular
 * screens - a picker, a palette, a report index - and a bucket of everything
 * unnamed is the grab-bag this rule exists to refuse.
 */
export function familyOf(surface: string, slug: string): string {
  const shape = wordsOf(slug).filter((word) => SHAPE_WORDS.has(word))
  return shape.length === 0 ? '' : `${surface}/${shape.join('+')}`
}

/**
 * What one component can be said to *do*, out of everything it was read to
 * hold.
 *
 * Two things are dropped, and both were measured noise in the sibling check:
 * a control nothing reveals is not a capability, and **a sortable column is a
 * column**. Every entity table names its own columns, so counting them gave
 * one disagreement per column per screen.
 */
export function capabilitiesOf(readings: readonly Affordance[]): string[] {
  return [
    ...new Set(
      readings
        .filter((one) => !one.blocked && !(one.container ?? '').startsWith('columnheader:'))
        .map((one) => affordanceKey(one.role, one.name)),
    ),
  ].sort()
}

export interface FamilyMember {
  readonly family: string
  readonly member: string
  readonly keys: readonly string[]
}

/** One capability a family does not agree about. */
export interface SiblingGap {
  readonly family: string
  readonly key: string
  readonly have: string[]
  readonly lack: string[]
  /** Which side is the minority - the finding is always about that side. */
  readonly odd: 'have' | 'lack'
}

/**
 * Capabilities a family of screens disagrees about, where the disagreement is
 * one-sided enough to be a defect rather than a design.
 *
 * **Across a family, not across two renderings of one screen.** A screen
 * compared against itself is blind to the screens that should behave alike and
 * do not, and the comparison across a family reads the same data.
 *
 * Three rules keep it off the backlog nobody clears, and each answers a
 * measured source of noise:
 *
 * - **A key nothing else in the app uses is one screen's own label**, not a
 *   capability its siblings lack. Every entity screen has its own columns and
 *   its own fields, and without this the report is one finding per column.
 * - **An even split is two designs.** The finding is the minority in either
 *   direction: the majority having it is the ordinary shape, and the minority
 *   having it is how the row-expansion defect was found.
 * - **A family of two has no majority**, so nothing there is odd. That falls
 *   out of the second rule rather than needing a minimum: one of two is half,
 *   and half is an even split, so a minimum here would be dead code.
 */
export function siblingGaps(
  members: readonly FamilyMember[],
  options: { oddShare?: number } = {},
): SiblingGap[] {
  const oddShare = options.oddShare ?? 1 / 3

  const spread = new Map<string, Set<string>>()
  for (const one of members) {
    for (const key of one.keys) {
      const held = spread.get(key) ?? new Set<string>()
      held.add(`${one.family}/${one.member}`)
      spread.set(key, held)
    }
  }

  const families = new Map<string, FamilyMember[]>()
  for (const one of members) {
    if (one.family === '') continue
    families.set(one.family, [...(families.get(one.family) ?? []), one])
  }

  const out: SiblingGap[] = []
  for (const [family, kin] of families) {
    const asked = new Set(kin.flatMap((one) => one.keys))
    for (const key of [...asked].sort()) {
      if ((spread.get(key)?.size ?? 0) < 2) continue
      const have = kin.filter((one) => one.keys.includes(key)).map((one) => one.member)
      const lack = kin.filter((one) => !one.keys.includes(key)).map((one) => one.member)
      if (have.length === 0 || lack.length === 0) continue
      const odd = have.length <= lack.length ? 'have' : 'lack'
      const smaller = Math.min(have.length, lack.length)
      if (smaller / kin.length > oddShare) continue
      out.push({ family, key, have, lack, odd })
    }
  }
  return out.sort(
    (left, right) =>
      Math.min(left.have.length, left.lack.length) - Math.min(right.have.length, right.lack.length) ||
      left.family.localeCompare(right.family) ||
      left.key.localeCompare(right.key),
  )
}
