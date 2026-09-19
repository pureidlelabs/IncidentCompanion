import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * A `:has()` in the kit reaches a part, not an attribute anyone may write.
 *
 * `has-data-[...]` compiles to an unscoped `:has()`, so it matches any
 * descendant carrying the attribute rather than the component's own element.
 * `data-part` is a component's own name and cannot be answered for by
 * something nested inside it; `data-size`, `data-state` and the rest are
 * written by whatever the caller drops in. -> #951
 *
 * **The sibling rule cannot see this.** It compares a value against the union
 * declared in the same file, and an unscoped selector is correct against that
 * union while being wrong about which element it reaches.
 * -> `a-kit-rule-keys-a-value-the-type-allows.rule.test.ts`
 */
const KIT_DIR = dirname(fileURLToPath(import.meta.url))

/** `has-data-[size=xs]`, `group-has-data-[part=item-description]/item`. */
const HAS = /(?:^|[:\s'"])(?:group-)?has-data-\[([a-z-]+)=([a-z0-9-]+)\]/g

describe('a kit has-selector names a part', () => {
  const files = readdirSync(KIT_DIR)
    .filter(
      (name) => name.endsWith('.tsx') && !name.includes('.stories.') && !name.includes('.test.'),
    )
    .map((name) => join(KIT_DIR, name))

  it('walks the kit it claims to walk', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('leaves no :has() that a nested component can answer for', () => {
    const loose: string[] = []
    for (const file of files) {
      for (const [, attribute] of readFileSync(file, 'utf8').matchAll(HAS)) {
        if (attribute === 'part') continue
        loose.push(`${file.slice(KIT_DIR.length + 1)} keys has-data-${attribute ?? ''}`)
      }
    }

    expect(
      [...new Set(loose)].sort(),
      'an unscoped :has() answers to anything nested inside, so name the part as well',
    ).toEqual([])
  })
})
