/**
 * **A heading pack shipped in this bundle is a fixture, and no component reads
 * one.**
 *
 * A report's headings are resolved by the language pack the server serves, in
 * the language that report is produced in. The screen used to resolve them
 * from a map compiled into the client, so an analyst who set a report to Dutch
 * read English headings over a document that would export in Dutch -- and
 * nothing went red, because an invented English word is indistinguishable from
 * a resolved one. -> #513
 *
 * `DEMO_HEADINGS` survives as demo data: the shipped layouts this bundle draws
 * as a fixture carry chip labels, and stories need words rather than keys.
 * That is the same map, and the only thing keeping it out of the product is
 * where it is imported. So the rule is a sweep rather than a type.
 *
 * **What this does not cover:** a component building the pack itself, under
 * any other name. This refuses the one that exists, not the idea.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', '..')

/** Where demo data is allowed to be read. */
const FIXTURE = /\.(?:test|stories)\.tsx?$|[\\/]fixtures[\\/]/

describe('the bundled heading pack', () => {
  const files = globSync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })

  it('finds the client code at all', () => {
    // Without this the sweep below passes over an empty list, which is what a
    // moved directory looks like from here.
    expect(files.length).toBeGreaterThan(50)
  })

  it('is read by fixtures and stories, and by nothing an analyst sees', () => {
    const read = files.filter((path) => {
      if (FIXTURE.test(path)) return false
      // Its own module declares it; reading it there is not importing it.
      if (path.endsWith(join('blocks', 'report-layouts.ts'))) return false
      return /\bDEMO_HEADINGS\b/.test(readFileSync(path, 'utf8'))
    })

    expect(
      read.map((path) => relative(SRC, path)).sort(),
      'a component resolves headings from a map in the bundle, so a report in any other ' +
        'language draws English over a document that will not be in English',
    ).toEqual([])
  })
})
