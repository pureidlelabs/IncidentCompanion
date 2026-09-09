import { readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

import { cn, tv } from './cn'

describe('the merge knows the scale tokens.css adds', () => {
  it('keeps a project size next to a tone', () => {
    // Unconfigured, `text-micro` is read as a colour and the tone wins.
    expect(cn('text-micro text-on-primary')).toBe('text-micro text-on-primary')
    expect(cn('text-2xs text-ink-muted')).toBe('text-2xs text-ink-muted')
    expect(cn('text-data text-ink')).toBe('text-data text-ink')
  })

  it('still resolves two sizes to the last', () => {
    expect(cn('text-sm text-micro')).toBe('text-micro')
    expect(cn('text-micro text-xs')).toBe('text-xs')
    expect(cn('tracking-tight tracking-micro')).toBe('tracking-micro')
  })

  it('and tv merges on the same scale', () => {
    const look = tv({
      variants: {
        size: { sm: 'size-6 text-micro' },
        tone: { primary: 'bg-primary text-on-primary' },
      },
    })
    expect(look({ size: 'sm', tone: 'primary' })).toBe(
      'size-6 text-micro bg-primary text-on-primary',
    )
  })
})

describe('tv comes from here', () => {
  // A `tv` taken from the package merges on Tailwind's scale alone, and the
  // class it drops is invisible at the call site.
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const files = glob.sync('**/*.{ts,tsx}', { cwd: SRC, absolute: true })

  it('reads the kit', () => {
    expect(files.some((f) => f.endsWith('button.tsx'))).toBe(true)
  })

  it('and nothing else takes tv from the package', () => {
    const offenders = files
      .filter((f) => !f.endsWith(`${sep}lib${sep}cn.ts`))
      .filter((f) =>
        /import\s*\{[^}]*\btv\b[^}]*\}\s*from\s*'tailwind-variants'/.test(readFileSync(f, 'utf8')),
      )
    expect(offenders.map((f) => relative(SRC, f))).toEqual([])
  })
})

describe('the icon utility is one group', () => {
  it('resolves two icon sizes to the last', () => {
    expect(cn('icon-4', 'icon-3')).toBe('icon-3')
    expect(cn('icon-4 text-sm', 'icon-3.5')).toBe('text-sm icon-3.5')
  })

  it('so a size variant beats the base', () => {
    const button = tv({ base: 'icon-4', variants: { size: { sm: 'h-6 icon-3.5' } } })
    expect(button({ size: 'sm' })).toBe('h-6 icon-3.5')
  })
})
