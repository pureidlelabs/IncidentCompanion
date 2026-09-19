import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * A kit rule keys off a value its own type can produce.
 *
 * A component writes an attribute from a union and then styles against that
 * attribute in the same file. Nothing relates the two, so a key can outlive
 * the value it was written for -- and dead styling reads as a supported
 * option to whoever copies it. `Item` carried `size=sm` rules against a
 * `'default' | 'xs'` union. -> #947
 *
 * **Only where the same file declares the union.** A value arriving from
 * elsewhere -- a vocabulary, a parent's state, React Aria -- is not this
 * file's to check, and guessing at it would make the rule wrong rather than
 * strict.
 */
const KIT_DIR = dirname(fileURLToPath(import.meta.url))

/** `data-[size=sm]`, `group-data-[size=sm]/item`, `has-data-[state=open]`. */
const KEYED = /data-\[([a-z-]+)=([a-z0-9-]+)\]/g

/**
 * Every value the file's own declarations of `attribute` allow.
 *
 * **All of them, not the first.** A kit file often declares one prop name
 * twice for two components -- `toggle-button.tsx` has `variant?: 'outline' |
 * 'ghost'` and `variant?: 'segmented' | 'spaced'` -- so reading the first
 * would refuse a rule keyed on the second's value, which is correct code.
 *
 * **A declaration carrying no literal is not a union.** An alias
 * (`variant?: RadioVariant`) or a union wrapped past the print width yields
 * nothing here, and the attribute goes unchecked rather than wrongly refused:
 * guessing at what an alias resolves to would make this rule wrong instead of
 * strict.
 */
const union = (source: string, attribute: string): string[] => {
  const found = [...source.matchAll(new RegExp(`\\b${attribute}\\?:\\s*([^\\n]+)`, 'g'))]
  return found.flatMap((one) =>
    (one[1]?.match(/'([a-z0-9-]+)'/g) ?? []).map((literal) => literal.slice(1, -1)),
  )
}

describe('a kit rule keys a value the type allows', () => {
  const files = readdirSync(KIT_DIR)
    .filter(
      (name) => name.endsWith('.tsx') && !name.includes('.stories.') && !name.includes('.test.'),
    )
    .map((name) => join(KIT_DIR, name))

  it('walks the kit it claims to walk', () => {
    // A directory read that matches nothing passes every assertion below it.
    // The floor is the sibling rule's, over the same file set.
    // -> `a-composition-is-a-block.rule.test.ts`
    expect(files.length).toBeGreaterThan(50)
  })

  it('leaves no rule keyed on a value nothing can write', () => {
    const dead: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const [, attribute, value] of source.matchAll(KEYED)) {
        if (attribute === undefined || value === undefined) continue
        const allowed = union(source, attribute)
        if (allowed.length === 0) continue
        if (!allowed.includes(value)) {
          const where = file.slice(KIT_DIR.length + 1)
          dead.push(`${where} keys data-${attribute}=${value}, which is not ${allowed.join(' | ')}`)
        }
      }
    }

    expect(
      [...new Set(dead)].sort(),
      'these rules can never match, and read as a supported option to whoever copies them',
    ).toEqual([])
  })
})
