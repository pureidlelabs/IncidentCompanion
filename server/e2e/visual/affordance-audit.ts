/**
 * What a family of components does not agree about.
 */

/** One Storybook index entry, narrowed to what the audit reads. */
export interface StoryEntry {
  readonly id: string
  readonly title: string
  readonly name: string
  readonly importPath: string
  readonly type?: string
}

/** What kind of surface a component covers, which decides its family. */
export type Surface = 'block' | 'screen'

/** One component the audit drives, with every story it is reached through. */
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
 */
export function surfaceOf(importPath: string): Surface | null {
  const path = importPath.replace(/^\.\//, '')
  if (path.startsWith('src/screens/')) return 'screen'
  if (path.startsWith('src/components/blocks/')) return 'block'
  return null
}

/** The file's own name, with the story extension taken off. */
export function slugOf(importPath: string): string {
  const base = importPath.slice(importPath.lastIndexOf('/') + 1)
  return base.replace(/\.stories\.tsx?$/, '')
}

/**
 * Group a Storybook index into per-component buckets, one per source file.
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

/** An accessible name, lowercased and stripped of punctuation and runs of space. */
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
 */
const NAMELESS = new Set(['row', 'article', 'table', 'grid', 'list', 'tree', 'treegrid'])

/**
 * One line of a Playwright ARIA snapshot, as an indent, a role and a name.
 */
const SNAPSHOT_LINE = /^(\s*)-\s+([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?/

/** A control the snapshot holds, with the place it holds it in. */
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
      // Measured: the report index's header row was `row:report stage` on one
      // tier and something else on the other, and nothing in it could line up
      // with anything.
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
 */
function shapeKey(key: string): string {
  const at = key.indexOf(':')
  return `${key.slice(0, at)}:${key.slice(at + 1).split(' ')[0] ?? ''}`
}

/**
 * Controls that are in a story's DOM and that nothing in that story reveals.
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
 */
export function familyOf(surface: string, slug: string): string {
  const shape = wordsOf(slug).filter((word) => SHAPE_WORDS.has(word))
  return shape.length === 0 ? '' : `${surface}/${shape.join('+')}`
}

/**
 * What one component can be said to *do*, out of everything it was read to
 * hold.
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

/** One screen's reading, keyed for comparison against its siblings. */
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
