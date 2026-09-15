import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import served from '@/fixtures/specs.json'

/**
 * **A property the contract declares and the document never carries is a
 * branch of the client nothing can reach.**
 *
 * `FieldSpec` is this application's reading of `GET /api/specs`, written by
 * hand rather than generated. A property nobody serves compiles, renders and
 * is read by whatever draws the field -- and the branch reading it is dead for
 * every field there is, which is not visible from either side on its own.
 *
 * The cost is not the dead branch. It is that the property looks like the
 * answer to a problem: #661 was raised, and a pull request opened, on the
 * belief that a select was drawing raw values because a renderer had dropped
 * `optionLabels`. Nothing served one, so nothing an analyst could see was
 * different either way.
 *
 * **Read against the committed document rather than the types.**
 * `server/src/specs` and this interface are two descriptions of one wire, and
 * comparing a description with a description proves nothing; `specs.json` is
 * held equal to what the route answers by
 * `server/src/specs/specs.controller.test.ts`.
 *
 * **Fields only, and the forms only.** The compliance block is a different
 * shape with a different reader -- `ComplianceFieldSpec` carries an
 * `optionLabels` that *is* served and drawn -- so this asks about `forms`
 * rather than about the whole document.
 */
const HERE = dirname(fileURLToPath(import.meta.url))

/** Python's spelling to this interface's, the same conversion the client applies. */
function toCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/** Every property `FieldSpec` declares, read off the interface body. */
function declaredOnFieldSpec(): string[] {
  const source = readFileSync(resolve(HERE, 'specs.ts'), 'utf8')
  const body = /export interface FieldSpec[^{]*\{([\s\S]*?)\n\}/.exec(source)
  expect(body, 'FieldSpec is no longer an interface this can read').not.toBeNull()
  return [...body![1]!.matchAll(/^ {2}(\w+)\??:/gm)].map(([, name]) => name!)
}

describe('the field contract', () => {
  const forms = (served as { forms: Record<string, { fields: (Record<string, unknown> | null)[] }> })
    .forms

  const carried = new Set<string>()
  for (const form of Object.values(forms)) {
    for (const field of form.fields) {
      if (field) for (const key of Object.keys(field)) carried.add(toCamel(key))
    }
  }

  it('reads a document with forms in it', () => {
    expect(Object.keys(forms).length).toBeGreaterThan(5)
    expect(carried.size).toBeGreaterThan(10)
  })

  it('declares no property the served forms never carry', () => {
    const unserved = declaredOnFieldSpec().filter((name) => !carried.has(name))

    expect(
      unserved.sort(),
      'these are declared on the wire contract and served by nothing, so whatever reads them ' +
        'is a branch no field reaches',
    ).toEqual([])
  })
})
