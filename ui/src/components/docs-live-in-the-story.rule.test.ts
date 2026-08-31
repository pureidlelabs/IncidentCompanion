import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A component's documentation is its JSDoc, and there is no second file.**
 *
 * Storybook builds the page from the meta's block, each story's block and the
 * props table `react-docgen-typescript` reads out of the types; the MCP server
 * hands that same assembly to an agent already structured. A sibling `.mdx`
 * carries the same claims in a file the types do not reach and Vale does not
 * lint -- `vale ui/src/components/ui/table.mdx` answered `0 files`, walking
 * nothing, because `.mdx` is in neither `[formats]` nor any section.
 *
 * **This covers all three tiers and is red where the comb has not reached**,
 * which is the intent rather than a state to be worked around. The failing list
 * is the backlog: it names every story still to be looked at, and it only
 * shortens. A grandfathering list would hide exactly the entries somebody has
 * to open.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every story file in the interface, all three tiers.
 *
 * A control, a composition and a screen are documented and driven the same way,
 * so a rule that reached only the kit would leave two thirds of the gallery
 * carrying the defects it names.
 */
const STORIES = glob.sync(`${SRC}/**/*.stories.tsx`)

/** Every exported story in a file, as `[name, whatever sits directly above it]`. */
function storiesIn(text: string): { name: string; above: string }[] {
  const out: { name: string; above: string }[] = []
  const pattern = /^export const (\w+): Story\b/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(0, match.index).trimEnd()
    const lines = before.split('\n')
    let at = lines.length - 1
    while (at >= 0 && (lines[at]?.trim() === '' || lines[at]?.trim().startsWith('//'))) {
      at -= 1
    }
    out.push({ name: match[1] ?? '', above: lines[at] ?? '' })
  }
  return out
}

/** The body of one story export, up to the next export or doc block. */
function bodyOf(text: string, name: string): string {
  const start = text.indexOf(`export const ${name}: Story`)
  if (start === -1) return ''
  const rest = text.slice(start + 1)
  const end = rest.search(/\nexport const |\n\/\*\*/)
  return end === -1 ? rest : rest.slice(0, end)
}

describe('a component is documented where it is defined', () => {
  it('finds every tier to read', () => {
    // A glob that stopped matching would leave every rule below iterating
    // nothing and reporting clean, which is the silent-scope failure
    // `.vale.ini` warns about at the top of itself.
    expect(STORIES.length, 'no story files found').toBeGreaterThan(200)
  })

  it('keeps documentation out of a sibling `.mdx`', () => {
    const stray = glob
      .sync(`${SRC}/**/*.mdx`)
      .map((path) => relative(SRC, path).replaceAll('\\', '/'))
      .sort()

    expect(
      stray,
      'a component page is built from JSDoc: the meta block, each story block ' +
        'and the generated props table. An `.mdx` beside the component is a ' +
        'second description of the same thing, and no linter reaches it.',
    ).toEqual([])
  })

  it('gives every story its own block', () => {
    const bare: string[] = []
    for (const path of STORIES) {
      const name = relative(SRC, path).replaceAll('\\', '/')
      for (const story of storiesIn(readFileSync(path, 'utf8'))) {
        if (!story.above.endsWith('*/')) bare.push(`${name}: ${story.name}`)
      }
    }

    expect(
      bare.sort(),
      'a story with no block of its own renders on the docs page under its ' +
        'name and nothing else. Say what the story shows that its neighbours ' +
        'do not.',
    ).toEqual([])
  })

  it('leaves no story whose render ignores its args', () => {
    const dead: string[] = []
    for (const path of STORIES) {
      const name = relative(SRC, path).replaceAll('\\', '/')
      const text = readFileSync(path, 'utf8')
      for (const story of storiesIn(text)) {
        const body = bodyOf(text, story.name)
        // `render: () =>` with no parameter cannot reach the story's own args,
        // so the Controls panel offers knobs that change nothing on screen.
        if (/\bargs:\s*\{\s*\w/.test(body) && /\brender:\s*\(\)\s*=>/.test(body)) {
          dead.push(`${name}: ${story.name}`)
        }
      }
    }

    expect(
      dead.sort(),
      'this story declares `args` and renders without them, so the Controls ' +
        'panel is decorative. Take `(args)` and spread it.',
    ).toEqual([])
  })
})
