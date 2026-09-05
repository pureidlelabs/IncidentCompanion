import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * **A screen composes blocks and components, and reaches nothing else.**
 */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)))

/**
 * Import and re-export specifiers, in either quote.
 */
const IMPORT = /(?:\bfrom|\bimport\s*\()\s*['"]([^'"]+)['"]/g

/** Prose may name a path the code may not import - this file's own docstrings do. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** What a screen may reach, by the alias the app resolves it under. */
const ALLOWED = [
  '@/components/blocks/',
  '@/components/ui/',
  '@/fixtures/',
  '@/lib/',
  '@/api/',
  /**
   * **The wire contract, and it is not a tier.**
   */
  '@contract/',
]

describe('a screen is composed, not drawn', () => {
  const files = glob
    .sync('**/*.{ts,tsx}', { cwd: HERE, absolute: true })
    .map((path) => path.split('\\').join('/'))
  const stories = files.filter((path) => path.endsWith('.stories.tsx'))
  const screens = files.filter(
    (path) => path.endsWith('.tsx') && !path.endsWith('.stories.tsx') && !path.endsWith('.test.tsx'),
  )

  it('finds the tier to read', () => {
    expect(screens.length).toBeGreaterThan(0)
  })

  it('gives every screen a story', () => {
    const unseen = screens
      .filter((path) => !stories.includes(path.replace(/\.tsx$/, '.stories.tsx')))
      .map((path) => relative(HERE, path))
      .sort()
    expect(unseen, 'these screens have no story, so they are not in Storybook').toEqual([])
  })

  /**
   * Every source file in the tier, tests included: a test reaching into
   * `app/` is a screen's test aimed at the app, which is the same
   * finding one file further out.
   */
  it('reaches only blocks and components', () => {
    const wrong: string[] = []
    for (const file of files) {
      const text = withoutComments(readFileSync(file, 'utf8'))
      for (const [, spec] of text.matchAll(IMPORT)) {
        if (spec === undefined) continue
        const here = relative(HERE, file)

        // A relative specifier is judged by where it lands. Inside the tier is
        // a screen reading its own module; anywhere else is the `@/` rule
        // dodged by spelling, which is how the first cut was walked past.
        if (spec.startsWith('.')) {
          const landed = resolve(dirname(file), spec)
          if (landed !== HERE && !landed.startsWith(`${HERE}/`)) {
            wrong.push(`${here} -> ${spec}  (a relative path out of the tier; use the @/ form)`)
          }
          continue
        }

        if (ALLOWED.some((prefix) => spec.startsWith(prefix))) continue
        // A bare package name is a dependency, not a tier. `@/` and `@contract/`
        // are the two project aliases, so anything else starting with one of
        // them is a path this rule has an opinion about.
        if (spec.startsWith('@/') || spec.startsWith('@contract/')) {
          wrong.push(`${here} -> ${spec}  (outside the tier)`)
        }
      }
    }
    expect(wrong.sort()).toEqual([])
  })

  it('titles every story under Screens/', () => {
    const wrong: string[] = []
    for (const story of stories) {
      const title = /^\s*title: '([^']+)'/m.exec(readFileSync(story, 'utf8'))?.[1] ?? ''
      if (!title.startsWith('Screens/')) wrong.push(`${relative(HERE, story)} -> ${title || '(none)'}`)
    }
    expect(wrong.sort()).toEqual([])
  })
})
