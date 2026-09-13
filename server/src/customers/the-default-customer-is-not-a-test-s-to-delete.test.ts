/**
 * **No file sweeps the install's default customer out from under the others.**
 *
 * **Structural, because nothing else can see it.** The suite shares one
 * database across every file, so a teardown that empties `customers` removes a
 * row the whole install depends on -- `cases.service.ts` opens every case
 * under it and `defaultCustomer` mints it again on the next call, which is
 * exactly why the damage stays invisible until something references it.
 *
 * `cases.customerId` references that row with `onDelete: 'restrict'`, so an
 * unscoped sweep now fails whenever any case exists anywhere in the shared
 * database. Which files have left a case behind depends on the shard and the
 * order, so the failure moves between files and never reproduces alone -- the
 * shape that gets a test re-run rather than read.
 *
 * **Textual, and this is what it does not check**: that a scoped delete names
 * rows the file actually made. It asks only whether a delete is scoped at all,
 * which is the difference between removing your own customers and removing
 * everybody's.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * Files that empty the table deliberately, each with the reason.
 *
 * **A name here is a claim that the whole install may lose its default**, so
 * the only reason that qualifies is one where nothing else can observe it.
 */
const EXEMPT: Record<string, string> = {
  'customers/an-install-with-nobody-onboarded-still-opens-a-case.test.ts':
    'empties it inside a transaction that always rolls back, and removes the cases first, ' +
    'because what it asserts is what an install with no customers does',
}

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testFiles(full)
    return entry.name.endsWith('.test.ts') ? [full] : []
  })
}

/** A delete of the whole table: `delete(customers)` with no `.where` after it. */
const UNSCOPED = /\.delete\(\s*customers\s*\)(?!\s*\.where\b)/

describe('sweeping the customers table', () => {
  it('finds the files at all, so an empty sweep cannot pass', () => {
    const walked = testFiles(SRC)

    expect(walked.length, 'no test file was walked, so this asserts on nothing').toBeGreaterThan(50)
    expect(
      walked.some((one) => UNSCOPED.test(readFileSync(one, 'utf8'))),
      'the pattern matches nothing anywhere, including the file it is exempted for',
    ).toBe(true)
  })

  it('happens nowhere that another file can see', () => {
    const offenders = testFiles(SRC)
      .map((file) => file.slice(SRC.length + 1))
      .filter((relative) => !(relative in EXEMPT))
      .filter((relative) => UNSCOPED.test(readFileSync(join(SRC, relative), 'utf8')))
      .sort()

    expect(
      offenders,
      'these empty the customers table, which takes the install default every case is opened ' +
        'under and fails outright once any case exists -- call `clearCustomers` from ' +
        '`test/customers.ts` instead',
    ).toEqual([])
  })
})
