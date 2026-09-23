/**
 * Only the evidence store opens the evidence directory, so every artefact
 * leaves through a method that takes the case holding it.
 *
 * Reads the source text. A module that is handed the directory and imports
 * any file or directory accessor is one that could read bytes without a case;
 * `statfs` asks the volume how full it is and opens nothing.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STORE = 'evidence/store.ts'

const SOURCES = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
  (path) => path.endsWith('.ts') && !path.endsWith('.test.ts'),
)

/** The members a module takes from `fs`, or `['*']` for a namespace or default import. */
function fsMembers(text: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(/from ['"](?:node:)?fs(?:\/promises)?['"]/g)) {
    const clause = text.slice(text.lastIndexOf('import', match.index) + 'import'.length, match.index).trim()
    if (!clause.startsWith('{') || !clause.endsWith('}')) out.push('*')
    else out.push(...clause.slice(1, -1).split(',').map((one) => one.split(' as ')[0]!.trim()).filter(Boolean))
  }
  return out
}

it('lets no module but the store both hold the evidence directory and open a file', () => {
  const holding = SOURCES.filter((path) => readFileSync(join(SRC, path), 'utf8').includes('EVIDENCE_DIR'))
  expect(holding, 'the scan did not find the store itself, so it reads nothing').toContain(STORE)

  const opening = holding.filter(
    (path) => path !== STORE && fsMembers(readFileSync(join(SRC, path), 'utf8')).some((one) => one !== 'statfs'),
  )
  expect(opening, 'these read the evidence directory without asking the store for a case').toEqual([])
})
