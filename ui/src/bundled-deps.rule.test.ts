/**
 * **Every package the browser bundle contains is declared by `ui`.**
 */
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const UI = HERE
const CONTRACT = join(HERE, '../../server/src/domain')
const MANIFEST = join(HERE, '../package.json')

/** A bare specifier's package: `@scope/name` or `name`, dropping any subpath. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

/**
 * Bare runtime specifiers in one file, as package names.
 */
function bareImports(source: string): readonly string[] {
  const found: string[] = []
  for (const match of source.matchAll(/^\s*import\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
    const specifier = match[1] ?? ''
    if (specifier === '' || /^(\.|@\/|@contract\/|node:)/.test(specifier)) continue
    found.push(packageOf(specifier))
  }
  return found
}

function productFiles(root: string): readonly string[] {
  return globSync('**/*.{ts,tsx}', { cwd: root, absolute: true }).filter(
    (path) => !/\.(test|stories)\.tsx?$/.test(path),
  )
}

describe('the client declares every package it bundles', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])

  const ui = productFiles(UI)
  const contract = productFiles(CONTRACT)

  // Without these the sweeps below pass over an empty list, which is what a
  // moved directory or a renamed alias target looks like from here.
  it('finds both halves of the bundle', () => {
    expect(ui.length, 'no client source found').toBeGreaterThan(50)
    expect(contract.length, 'no contract source found; has the alias moved?').toBeGreaterThan(10)
  })

  it('declares what the contract module pulls in', () => {
    const undeclared = new Map<string, string[]>()
    for (const file of contract) {
      for (const pkg of bareImports(readFileSync(file, 'utf8'))) {
        if (declared.has(pkg)) continue
        undeclared.set(pkg, [...(undeclared.get(pkg) ?? []), relative(CONTRACT, file)])
      }
    }

    const said = [...undeclared]
      .map(([pkg, files]) => `${pkg} (${String(files.length)} files, e.g. ${files[0] ?? '?'})`)
      .join('; ')
    expect(
      said,
      'server/src/domain is bundled into the browser through the @contract alias, ' +
        'so ui/package.json declares what it imports',
    ).toBe('')
  })

  it('declares what the client itself imports', () => {
    const undeclared = new Set<string>()
    for (const file of ui) {
      for (const pkg of bareImports(readFileSync(file, 'utf8'))) {
        if (!declared.has(pkg)) undeclared.add(pkg)
      }
    }
    expect([...undeclared].sort().join(', ')).toBe('')
  })
})
