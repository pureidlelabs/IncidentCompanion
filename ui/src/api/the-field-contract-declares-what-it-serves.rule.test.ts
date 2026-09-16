import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import served from '@/fixtures/specs.json'

/**
 * **A property the contract declares and the document never carries is a
 * branch of the client nothing can reach.**
 *
 * Read against the committed document rather than the types: `specs.json` is
 * held equal to what the route answers by `specs.controller.test.ts`.
 *
 * **Forms only.** `ComplianceFieldSpec` has its own reader, and its
 * `optionLabels` *is* served.
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
