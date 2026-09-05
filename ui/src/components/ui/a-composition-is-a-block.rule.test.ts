import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **A component is a primitive; a thing built out of primitives is a block.**
 */
const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Shared plumbing every primitive draws on, so importing it says nothing about
 * the tier. `rac` is the vendor re-export and `field` is the label, help
 * text and error row that every field wears.
 */
const PLUMBING = new Set(['rac', 'field', 'cn'])

/**
 * The primitives that are genuinely built from other primitives, each because
 * the vendor builds it that way.
 */
const COMPOSITE_PRIMITIVES = new Set([
  'select', // list-box in a popover: what a select is
  'combobox', // the same, with a text input
  'datetime-input', // React Aria's own DatePicker composition
  'sheet', // a dialog that enters from an edge
  'sidebar', // a rail with collapsible buttons
  // React Aria's own Button: the docs require the ProgressBar to be in the
  // accessibility tree as soon as the button is pending, so a spinner inside
  // it is how the vendor builds this primitive rather than a composition.
  'button',
])

/** What this module imports from the kit, minus plumbing and its own parts. */
function composes(file: string, text: string): string[] {
  const stem = file.replace(/\.tsx$/, '')
  const found = text.matchAll(/from '(?:\.\/|@\/components\/ui\/)([\w.-]+)'/g)
  return [
    ...new Set(
      [...found]
        .map((hit) => hit[1] ?? '')
        .filter((dep) => dep !== stem && !PLUMBING.has(dep) && !dep.startsWith(stem)),
    ),
  ].sort()
}

describe('a composition is a block', () => {
  const modules = readdirSync(HERE).filter(
    (name) => name.endsWith('.tsx') && !name.includes('.stories.') && !name.includes('.test.'),
  )

  it('finds kit modules to read', () => {
    expect(modules.length).toBeGreaterThan(50)
  })

  it('keeps compositions out of the kit', () => {
    const built: string[] = []
    for (const file of modules) {
      const stem = file.replace(/\.tsx$/, '')
      if (COMPOSITE_PRIMITIVES.has(stem)) continue
      const parts = composes(file, readFileSync(join(HERE, file), 'utf8'))
      if (parts.length >= 2) built.push(`${file} <- ${parts.join(', ')}`)
    }
    expect(
      built.sort(),
      'these are built out of the kit rather than being part of it, so they ' +
        'belong in blocks/ -- add a name to COMPOSITE_PRIMITIVES only when the ' +
        'vendor builds that primitive the same way',
    ).toEqual([])
  })
})
