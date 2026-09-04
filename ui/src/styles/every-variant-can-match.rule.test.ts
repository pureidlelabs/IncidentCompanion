import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import fg from 'fast-glob'
import { describe, expect, it } from 'vitest'

/**
 * **A `data-[…]` variant names an attribute something sets.**
 *
 * An arbitrary variant is a valid class whatever it names, so one keyed to an
 * attribute no component writes compiles, matches nothing, and is invisible to
 * every other tier: the unit suites lay nothing out, the story tier asserts no
 * geometry, and a lint sees a well-formed string. The rule it was meant to
 * express is simply absent, and the screen looks like a defect nobody wrote.
 *
 * The check is a spelling one, so it holds only for attributes written into
 * this tree. A variant keyed to something a dependency sets on its own DOM
 * belongs in `EXTERNAL`, with the library that sets it.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '..')

/**
 * Attributes set by a library rather than by this tree.
 *
 * React Aria writes its own state onto the DOM nodes it renders, so a variant
 * reading one of these is matching something real that no file here assigns.
 */
const EXTERNAL = new Set([
  'rac',
  'focus-visible',
  'focused',
  'hovered',
  'pressed',
  'selected',
  'disabled',
  'placeholder',
  'invalid',
  'expanded',
  'orientation',
  'placement',
  'state',
  'side',
  'sort',
  'layout',
  'type',
  'level',
  'has-submenu',
  'open',
])

const files = fg
  .sync(['**/*.tsx', '**/*.ts'], { cwd: SRC, absolute: true })
  .filter((one) => !/\.(test|stories)\.tsx?$/.test(one))

const sources = new Map(files.map((one) => [one, readFileSync(one, 'utf8')]))
const everything = [...sources.values()].join('\n')

/** Every attribute a `data-[x=y]` or `group-data-[x=y]` variant reads. */
function attributesRead(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const [file, text] of sources) {
    for (const match of text.matchAll(/(?:group-)?data-\[([a-z][a-z0-9-]*)=/g)) {
      const attr = match[1] ?? ''
      if (EXTERNAL.has(attr)) continue
      found.set(attr, [...(found.get(attr) ?? []), relative(SRC, file)])
    }
  }
  return found
}

/** Whether anything in the tree writes that attribute. */
function isWritten(attr: string): boolean {
  return (
    new RegExp(`\\bdata-${attr}\\s*=`).test(everything) ||
    new RegExp(`['"\`]data-${attr}['"\`]`).test(everything) ||
    new RegExp(`\\b${attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}\\s*:`).test(
      everything,
    )
  )
}

describe('a data variant names an attribute something sets', () => {
  it('reads variants at all, so the rule is never vacuous', () => {
    expect(attributesRead().size).toBeGreaterThan(0)
  })

  it('has something writing every attribute a variant reads', () => {
    const dead = [...attributesRead()]
      .filter(([attr]) => !isWritten(attr))
      .map(([attr, where]) => `data-${attr} <- ${where.join(', ')}`)
      .sort()

    expect(
      dead,
      'these variants are keyed to an attribute nothing in ui/src writes, so they ' +
        'match nothing and the rule they were meant to express is absent. Either ' +
        'set the attribute or write the rule against the state the component holds.',
    ).toEqual([])
  })
})
