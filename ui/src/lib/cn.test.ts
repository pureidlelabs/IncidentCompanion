/**
 * `cn` keeps a size and a colour apart, including the sizes this project added.
 *
 * **tailwind-merge reads `text-*` by shape, and a name it does not know is a
 * colour.** So a custom size and a colour looked like two colours, and the
 * merge kept the last -- silently, at any call site that passes both through
 * `cn` or a `tv` variant. Nothing else in this tree can see it: the class is
 * gone before the browser is involved, so there is no rule to inspect and jsdom
 * has no styles to read.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { cn, OWN_TEXT_SIZES } from './cn'

describe('cn', () => {
  it('keeps a custom size when a colour follows it', () => {
    expect(cn('text-micro text-ink-muted')).toBe('text-micro text-ink-muted')
    expect(cn('text-data text-ink-muted')).toBe('text-data text-ink-muted')
    expect(cn('text-2xs text-ink-muted')).toBe('text-2xs text-ink-muted')
  })

  it('keeps a colour when a custom size follows it', () => {
    // The shape that shipped: `cn('text-ink', mono && 'font-mono text-data')`.
    expect(cn('text-ink', 'font-mono text-data')).toBe('text-ink font-mono text-data')
  })

  it('still lets one size beat another, which is what the merge is for', () => {
    expect(cn('text-micro', 'text-lg')).toBe('text-lg')
    expect(cn('text-lg', 'text-data')).toBe('text-data')
    expect(cn('text-ink-muted', 'text-ink')).toBe('text-ink')
  })

  it('still merges everything it did before', () => {
    expect(cn('px-2', 'px-3')).toBe('px-3')
    expect(cn('text-sm text-ink-muted')).toBe('text-sm text-ink-muted')
  })

  /**
   * The list is a claim about `scale.css` rather than a preference, so it is
   * read back from it. A size added to the scale and not declared here is the
   * defect this file exists for, and it would otherwise ship silently.
   */
  it('declares every size the scale adds beyond Tailwind own', () => {
    const scale = readFileSync(join(process.cwd(), 'src', 'styles', 'scale.css'), 'utf8')
      // Comments out: a comment naming `--text-x:` is not a declaration of one.
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = [...scale.matchAll(/^\s*--text-([a-z0-9-]+):/gm)].map((m) => m[1]!)
    expect(declared.length).toBeGreaterThan(5)

    const tailwindOwn = new Set(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'])
    const ours = declared.filter((name) => !tailwindOwn.has(name)).sort()
    expect(ours).toEqual([...OWN_TEXT_SIZES].sort())
  })
})
