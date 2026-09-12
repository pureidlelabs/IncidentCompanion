/**
 * **The captured demo case is not shipped to an install.**
 *
 * `fixtures/campaign.json` is a 291KB capture for tests and stories, and a
 * default import of a whole JSON document is not tree-shaken per key: whatever
 * one line reads, the document arrives whole. So an operator's browser
 * downloaded an invented incident, with named hosts and accounts, on every
 * cold load.
 *
 * **Asserted on the import graph rather than on the built bundle.** A grep for
 * a needle in `dist/assets` is what found this, and it is the wrong guard to
 * leave behind: it needs a build, it names a symptom 291KB downstream of the
 * cause, and it passes the day the bundler happens to split differently.
 *
 * **`demo/` is exempt and that is the design.** `main.tsx` reaches it through
 * a dynamic import gated on `VITE_DEMO`, so the demo's copy is a chunk a
 * self-hosted install never fetches -- the comment there says so. The exemption
 * is the directory, not the import, because a static import from anywhere in
 * `demo/` would still only land in that chunk.
 */
import { readFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const UI = dirname(fileURLToPath(import.meta.url))

/** A test, a story, a fixture or the demo chunk may read a fixture. */
const MAY_READ = /(\.(test|stories)\.tsx?$)|(^fixtures\/)|(^demo\/)/

/**
 * **Any fixture, and at the first hop.** Refusing `@/fixtures/campaign` alone
 * would pass a module importing `@/fixtures/report-demo`, which imports the
 * capture -- which is what `report-workspace.tsx` did to default a prop to the
 * demo's first report. The directory is the boundary, so the rule holds
 * however the fixtures are arranged among themselves.
 *
 * **`reportBlockKinds` is the one exception, and a temporary one.** It stands
 * in for a route that is not built, which two shipping modules read
 * deliberately; hiding it would break them, and wiring the route is #166. It is
 * named so the exception is visible rather than a silent hole.
 */
const STANDS_IN_FOR_AN_UNBUILT_ROUTE = 'reportBlockKinds'

function importsAFixture(source: string): boolean {
  const specifiers = [
    ...source.matchAll(/^\s*import\s+(?!type\s)[^'"]*?from\s+['"](@\/fixtures\/[^'"]+)['"]/gm),
  ].map((match) => match[1] ?? '')
  return specifiers.some((one) => !one.endsWith(STANDS_IN_FOR_AN_UNBUILT_ROUTE))
}

describe('the captured demo case', () => {
  const offenders = globSync('**/*.{ts,tsx}', { cwd: UI, absolute: true })
    .filter((path) => !MAY_READ.test(relative(UI, path)))
    .filter((path) => importsAFixture(readFileSync(path, 'utf8')))
    .map((path) => relative(UI, path))

  it('is read by no module an install downloads', () => {
    expect(
      offenders,
      'these ship to an operator and pull the demo capture in with them. Move what ' +
        'they take into `fixtures/`, which tests and stories reach and a build drops',
    ).toEqual([])
  })

  /**
   * The rule is worth nothing if the pattern stopped matching the imports it
   * is written against, so it is asserted against a file that really has one.
   */
  it('recognises the import it is written to refuse', () => {
    const known = globSync('fixtures/**/*.{ts,tsx}', { cwd: UI, absolute: true }).filter((path) =>
      importsAFixture(readFileSync(path, 'utf8')),
    )
    expect(known, 'no file imports a fixture, so this rule matches nothing').not.toEqual([])
  })
})
