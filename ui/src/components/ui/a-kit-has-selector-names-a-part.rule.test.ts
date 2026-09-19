import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * A `:has()` in the kit reaches a part, not an attribute anyone may write.
 *
 * `:has()` matches a descendant, so a selector keyed on `data-size` alone is
 * answered by whatever the caller drops inside -- `IconTile` writes that
 * attribute too, and an `IconTile size="xs"` nested in an `ItemGroup` pulled
 * the whole stack tight. Naming `data-part` in the same compound is what ties
 * the selector to one component's own element. -> #951
 *
 * **The property, not one spelling of it.** Tailwind writes the same selector
 * five ways -- `has-data-[...]`, the arbitrary `has-[[...]]`, and the `not-`,
 * `peer-`, `in-` and `group-` prefixes over either -- and a rule that read
 * only the sugar form was green against the arbitrary form this kit uses.
 *
 * **Scoped to the attribute, not to the nesting.** A descendant `:has()`
 * naming a part is still answered by a nested copy of that part; the direct
 * child combinator is what closes that, and it is a judgement per selector
 * rather than something this can require.
 *
 * `data-part` is not unique across the kit -- `field.tsx` and `input.tsx` both
 * write `part="input"` -- so naming a part narrows a selector without making
 * it exact.
 */
const KIT_DIR = dirname(fileURLToPath(import.meta.url))

/** `has-data-[...]`, however prefixed: the sugar form, whose argument is bare. */
const SUGAR = /(?<![a-z-])(?:(?:group|peer|in|not)-)*has-data-\[/g

/** `has-[...]`, however prefixed: the arbitrary form, whose argument is a selector. */
const ARBITRARY = /(?<![a-z-])(?:(?:group|peer|in|not)-)*has-\[/g

/**
 * The text inside the brackets that `from` opens, or `null` for a bracket that
 * never closes.
 *
 * Counted rather than matched to the next `]`: an arbitrary variant nests
 * them, and `has-[[data-part=item][data-size=xs]]` would otherwise be read as
 * `[data-part=item`.
 */
function argument(source: string, from: number): string | null {
  let depth = 0
  for (let at = from; at < source.length; at += 1) {
    if (source[at] === '[') depth += 1
    if (source[at] === ']') {
      depth -= 1
      if (depth === 0) return source.slice(from + 1, at)
    }
  }
  return null
}

/** Every `data-*` attribute the selector reads, by name. */
function attributesOf(arg: string, sugar: boolean): string[] {
  if (sugar) {
    const name = /^([A-Za-z][\w-]*)/.exec(arg)
    return name?.[1] === undefined ? [] : [name[1]]
  }
  return [...arg.matchAll(/data-([A-Za-z][\w-]*)/g)].flatMap((one) => one[1] ?? [])
}

describe('a kit has-selector names a part', () => {
  const files = readdirSync(KIT_DIR)
    .filter(
      (name) =>
        (name.endsWith('.tsx') || name.endsWith('.ts')) &&
        !name.includes('.stories.') &&
        !name.includes('.test.'),
    )
    .map((name) => join(KIT_DIR, name))

  it('walks the kit it claims to walk', () => {
    // A directory read that matches nothing passes every assertion below it.
    expect(files.length).toBeGreaterThan(50)
  })

  it('reads every spelling Tailwind offers for the same selector', () => {
    // The rule is only as good as what it can see, and the first draft of it
    // was blind to the form the kit it polices actually uses.
    const spellings = [
      "'has-data-[size=xs]:gap-2'",
      "'has-[[data-size=xs]]:gap-2'",
      "'not-has-data-[size=xs]:gap-2'",
      "'peer-has-data-[size=xs]:gap-2'",
      "'in-has-data-[size=xs]:gap-2'",
      "'group-has-data-[size=xs]/item:gap-2'",
      '`has-data-[size=xs]:gap-2`',
      "'has-data-[size]:gap-2'",
      "'md:has-data-[gridSize=xs]:gap-2'",
    ]

    expect(
      spellings.filter((one) => loose(one).length === 0),
      'a spelling the rule cannot see',
    ).toEqual([])
  })

  it('reads a part-scoped selector as scoped, whatever the spelling', () => {
    const scoped = [
      "'has-data-[part=kbd]:pr-1.5'",
      "'has-[>[data-part=item][data-size=xs]]:gap-2'",
      "'group-has-data-[part=item-description]/item:self-start'",
    ]

    expect(
      scoped.flatMap((one) => loose(one)),
      'a scoped selector read as loose',
    ).toEqual([])
  })

  it('leaves no :has() that a nested component can answer for', () => {
    const found = files.flatMap((file) =>
      loose(code(readFileSync(file, 'utf8'))).map(
        (one) => `${file.slice(KIT_DIR.length + 1)}: ${one}`,
      ),
    )

    expect(
      [...new Set(found)].sort(),
      'an unscoped :has() answers to anything nested inside, so name the part as well',
    ).toEqual([])
  })
})

/**
 * `source` with its comments gone.
 *
 * A comment quoting a selector is prose about one, and a rule that refuses the
 * sentence describing a defect is one people route around rather than obey.
 * `//` after a colon is left alone, a URL being the common case.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/.*$/gm, ' ')
}

/** Every `has-` selector in `source` that keys on an attribute without naming a part. */
function loose(source: string): string[] {
  const found: string[] = []
  for (const [pattern, sugar] of [
    [SUGAR, true],
    [ARBITRARY, false],
  ] as const) {
    for (const site of source.matchAll(pattern)) {
      const opens = site.index + site[0].length - 1
      const arg = argument(source, opens)
      if (arg === null) continue
      const attributes = attributesOf(arg, sugar)
      if (attributes.length === 0) continue
      if (!attributes.includes('part')) found.push(`has-${sugar ? 'data-' : ''}[${arg}]`)
    }
  }
  return found
}
