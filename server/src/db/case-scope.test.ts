/**
 * That a case-scoped table is never queried outside the case scope.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * Files that read a scoped table deliberately unscoped, each with the reason.
 */
const EXEMPT: Record<string, string> = {
  'db/schema': 'the declarations themselves',
  'test/': 'fixtures arrange rows across cases through the seed role',
  'demos/': 'the seeder writes every case before any case is open',
  'demo-reports/': 'files the seeded reports on the same seed handle, before any case is open',
  'archive/': 'import creates the case it then fills, inside its own scope',
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

/** The tables whose policies depend on `app.case_id`. */
function scopedTables(): string[] {
  const names = new Set<string>()
  for (const file of sourceFiles(join(SRC, 'db', 'schema'))) {
    const text = readFileSync(file, 'utf8')
    // `export const reports = pgTable(` ... `...caseScoped(t.caseId)]`
    for (const match of text.matchAll(/export const (\w+) = pgTable\(([\s\S]*?)\n\)/g)) {
      if (match[2]?.includes('caseScoped(')) names.add(match[1]!)
    }
  }
  return [...names]
}

describe('reading a case-scoped table', () => {
  it('finds the scoped tables at all, so an empty sweep cannot pass', () => {
    const tables = scopedTables()
    expect(tables.length).toBeGreaterThan(8)
    expect(tables).toContain('changeFeed')
    expect(tables).toContain('reports')
  })

  it('happens inside `withCase`, in every file that does it', () => {
    const tables = scopedTables()
    const pattern = new RegExp(`\\.from\\(\\s*(${tables.join('|')})\\b`)

    const offenders = sourceFiles(SRC)
      .filter((file) => {
        const relative = file.slice(SRC.length + 1)
        if (Object.keys(EXEMPT).some((prefix) => relative.startsWith(prefix))) return false
        const text = readFileSync(file, 'utf8')
        return pattern.test(text) && !text.includes('withCase')
      })
      .map((file) => file.slice(SRC.length + 1))
      .sort()

    expect(
      offenders,
      'row-level security answers nothing here, and the caller reads it as "no data"',
    ).toEqual([])
  })
})
