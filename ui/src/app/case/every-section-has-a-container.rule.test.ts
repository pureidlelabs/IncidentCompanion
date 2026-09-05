import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { RAIL_GROUPS } from '@/components/blocks/case-sections'

/**
 * **Every rail section is drawn from the screens tier, and stays that way.**
 *
 * The point of the tier is that Storybook and the app render the same file. A
 * section wired to the old feature component breaks that for one screen and
 * nothing says so: the suite passes, the story is right, and the app draws
 * something the gallery has never shown.
 *
 * This is a ratchet rather than an audit. Twenty-four of twenty-four are
 * converted as of this test, so the useful claim is no longer "how many" but
 * "a new section arrives with a container or it does not arrive". A slug added
 * to `case-sections.ts` with no entry in `ELEMENTS` fails here.
 *
 * **The registry it reads is `ui/src/components/blocks/case-sections.ts`**, which is the one the
 * router resolves against, and not `ui/src/app/case/section-elements.tsx`,
 * which stopped being what the app renders the moment the outlet came off it -
 * a ratchet pointed at a registry nothing mounts is green whatever the app
 * does.
 *
 * **It reads both files as text on purpose.** Importing `section-elements`
 * evaluates every container and the whole query layer under them, which is a
 * module graph this assertion has no use for.
 */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const SRC = resolve(HERE, '../..')

const elements = readFileSync(resolve(HERE, 'section-elements.tsx'), 'utf8')
const sections = readFileSync(resolve(SRC, 'components/blocks/case-sections.ts'), 'utf8')

/** The keys of a map in `section-elements`, quoted or bare. */
function keysOf(map: 'ELEMENTS' | 'NOT_YET'): ReadonlySet<string> {
  const after = elements.split(`${map}:`)[1] ?? elements.split(map)[1] ?? ''
  const body = after.split('\n}')[0] ?? ''
  return new Set([...body.matchAll(/^ {2}'?([a-z-]+)'?:/gm)].map((one) => one[1] ?? ''))
}

/** Every slug the app has decided about, either way. */
function decided(): ReadonlySet<string> {
  return new Set([...keysOf('ELEMENTS'), ...keysOf('NOT_YET')])
}

/** The keys of a top-level record in `case-sections`, quoted or bare. */
function railKeysOf(record: 'SECTIONS' | 'SECTION_ALIASES'): ReadonlySet<string> {
  const after = sections.split(`export const ${record}`)[1] ?? ''
  const body = after.split('\n}')[0] ?? ''
  return new Set([...body.matchAll(/^ {2}'?([a-z][a-z0-9_-]*)'?:/gm)].map((one) => one[1] ?? ''))
}

/** Each alias and the slug it resolves to. */
function aliases(): ReadonlyMap<string, string> {
  const after = sections.split('export const SECTION_ALIASES')[1] ?? ''
  const body = after.split('\n}')[0] ?? ''
  return new Map(
    [...body.matchAll(/^ {2}'?([a-z][a-z0-9_-]*)'?: '([a-z][a-z0-9_-]*)'/gm)].map((one) => [
      one[1] ?? '',
      one[2] ?? '',
    ]),
  )
}

/** Every slug an address can carry: the sections, and the aliases onto them. */
function slugs(): ReadonlySet<string> {
  return new Set([...railKeysOf('SECTIONS'), ...railKeysOf('SECTION_ALIASES')])
}

/** Every slug a rail row navigates to. A child is a fragment, not a section. */
function addressed(): ReadonlySet<string> {
  return new Set(RAIL_GROUPS.flatMap((group) => group.rows.map((row) => row.slug)))
}

/** Every slug the rail draws as a fragment of its parent's page. */
function fragments(): ReadonlySet<string> {
  return new Set(RAIL_GROUPS.flatMap((group) => group.rows.flatMap((row) => row.children ?? [])))
}

describe('every rail section is drawn from the screens tier', () => {
  it('has decided about every slug the rail addresses', () => {
    const undecided = [...addressed()].filter((slug) => !decided().has(slug)).sort()
    expect(
      undecided,
      'these rail rows land on a slug in neither ELEMENTS nor NOT_YET, so ' +
        'nobody has said whether it is drawn from the screens tier. Add a ' +
        'container, or an entry in NOT_YET saying what it is waiting for.',
    ).toEqual([])
  })

  /**
   * **Narrowing this to the rows is what hid five orphans.** The assertion
   * above once read every key of `SECTIONS`; scoping it to what the rail
   * *addresses* left `assets`, `accounts`, `network`, `malware` and
   * `cloud-apps` in the identity record with no element behind them, so
   * `canonicalSlug` resolved each one and the route rendered a refusal.
   *
   * So every key is still accounted for -- it is a row the rail addresses, or
   * a fragment of one, or an alias onto something drawn. A sixth kind is a
   * fragment and passes; a slug that is neither is the state this catches.
   */
  it('accounts for every slug in the identity record', () => {
    const stray = [...railKeysOf('SECTIONS')]
      .filter((slug) => !addressed().has(slug) && !fragments().has(slug))
      .sort()
    expect(
      stray,
      'these sit in SECTIONS but the rail neither addresses them nor draws ' +
        'them as a fragment, so canonicalSlug resolves an address that renders ' +
        'the not-found state. Make it a fragment, an alias, or take it out.',
    ).toEqual([])
  })

  /**
   * The vacuity guard for the assertion above: a rail that yielded no
   * addresses would pass it over nothing.
   */
  it('reads a rail that actually offers rows', () => {
    expect(addressed().size).toBeGreaterThan(15)
  })

  /**
   * An alias is an address, so it lands on a screen or it is a dead bookmark
   * that renders the not-found state - which is the one outcome indistinguishable
   * from the link never having worked.
   */
  it('lands every old spelling on a section that has a container', () => {
    const dangling = [...aliases()]
      .filter(([, target]) => !decided().has(target))
      .map(([alias, target]) => `${alias} -> ${target}`)
      .sort()
    expect(dangling).toEqual([])
    // And there is an alias to check, so this is never vacuous.
    expect(aliases().size).toBeGreaterThan(0)
  })

  it('keeps a reason on everything held back', () => {
    const empty = [...keysOf('NOT_YET')].filter(
      (slug) => !new RegExp(`${slug}:[\\s\\S]{40,}?'`).test(elements),
    )
    expect(
      empty,
      'a slug held back with no reason is indistinguishable from one nobody ' +
        'got round to. Say what it is waiting for.',
    ).toEqual([])
  })

  it('registers nothing the rail does not offer', () => {
    const stray = [...decided()].filter((slug) => !slugs().has(slug)).sort()
    expect(
      stray,
      'these containers are registered under a slug no rail row uses, so ' +
        'nothing renders them. Either the slug was renamed or the entry is dead.',
    ).toEqual([])
  })

  it('reads a registry that is actually there', () => {
    // Both halves are regexes over source text, and a regex that matches
    // nothing reports the same empty set as a tree in perfect order. This is
    // what stops the two assertions above passing vacuously.
    expect(slugs().size).toBeGreaterThan(20)
    // The five entity kinds stopped being addresses when they became views of
    // one page, so this floor is below their count rather than above it.
    expect(keysOf('ELEMENTS').size).toBeGreaterThan(15)
  })
})
