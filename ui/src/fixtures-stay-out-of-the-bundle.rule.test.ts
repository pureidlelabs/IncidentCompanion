/**
 * **The captured demo case is not read by anything an install downloads.**
 *
 * A default import of a whole JSON document is not tree-shaken per key, so one
 * line reading one field brings the document. What that costs a browser, and
 * which modules were doing it, belong to the commit that moved them.
 *
 * **Asserted on the import graph rather than on the built bundle**, because a
 * grep for a needle in `dist` needs a build, names a symptom rather than a
 * cause, and passes the day the bundler splits differently.
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
 * **Every static shape, because the defect needs only one.** A re-export, a
 * bare side-effect import and a `require()` all put the bytes in the importing
 * chunk exactly as a named import does, and the test matches a relative
 * spelling as well as the alias -- `vite.config.ts` aliases `@` to `src`, so
 * the two reach one module.
 *
 * **A dynamic `import()` is allowed, being a chunk boundary** -- the fixture
 * is emitted as its own file and requested when that branch runs, which is
 * the property this rule defends rather than an exception to it.
 *
 * **What that gives up**: a dynamic import on a path every visitor walks,
 * which is a chunk arriving late rather than a fixture in the first payload.
 * No rule here tells the two apart; a reader of the diff does.
 */
function importsAFixture(source: string): boolean {
  const specifiers = [
    // `from '...'` covers both an import and a re-export; the other two arms
    // are a `require()` and a bare side-effect import.
    ...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
  ].map((match) => match[1] ?? '')

  return specifiers.some((one) => /^(@\/fixtures\/|\.{1,2}\/(\.\.\/)*fixtures\/)/.test(one))
}

describe('the captured demo case', () => {
  const swept = globSync('**/*.{ts,tsx}', { cwd: UI, absolute: true })
  const offenders = swept
    .filter((path) => !MAY_READ.test(relative(UI, path)))
    .filter((path) => importsAFixture(readFileSync(path, 'utf8')))
    .map((path) => relative(UI, path))

  /**
   * **The sweep is asserted to have swept.** A glob matching nothing yields
   * `[]`, which is this rule's pass condition, so the rule would go green
   * having read no file at all. Three sibling rule tests here guard the same
   * way, for the same reason.
   */
  it('sweeps the client it is written about', () => {
    expect(swept.length, 'no client source found; has `ui/src` moved?').toBeGreaterThan(200)
  })

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
