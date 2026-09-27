import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * A kit component does not size itself with a variant a caller cannot outrank.
 *
 * A variant compiles to an attribute selector or a pseudo-class, so it beats
 * the plain class a caller passes -- and `cn` cannot settle it, because the two
 * carry different variants and tailwind-merge keeps both. The caller's class is
 * accepted and does nothing, which is worse than refusing it.
 *
 * The kit's answer is to declare the measurement under the variant and read it
 * plainly: `has-[...]:[--x:2rem]` with `size-[var(--x,...)]`, so the two meet at
 * equal specificity and the merge decides. -> #897
 *
 * **Only where the caller's own class would compete.** A variant selecting a
 * descendant or a pseudo-element -- `[&>svg]:size-4`, `before:w-1` -- styles
 * something the caller's `className` never lands on, so nothing is outranked.
 *
 * This is the third round of one defect: #893 on the slider, #897's
 * separators, then the row's slots. The list was re-derived by hand each time.
 */
const KIT_DIR = dirname(fileURLToPath(import.meta.url))

/** What a caller passes a class for, and what the component may therefore lose. */
const SIZING = 'w|h|size|min-w|max-w|min-h|max-h|basis|gap|gap-x|gap-y'

/** `has-[...]:gap-2`, `last:w-2/3`, `sm:max-w-sm`, `orientation-vertical:w-4`. */
const KEYED = new RegExp(String.raw`(?<![-\w])([-\w[\]=>&_.()]+):(${SIZING})-[\w./[]`, 'g')

/**
 * Sites where no caller `className` reaches the class list, so nothing of
 * theirs can be outranked. Each is an element the component builds and owns.
 */
const NO_CALLER_CLASS = new Set([
  'alert-dialog.tsx', // `modal()` is the panel the component renders itself
  'sheet.tsx', // same: `panel()` takes no caller class
  'radio-group.tsx', // the internal group wrapper
  'slider.tsx', // `SliderTrack`, which #897 names as correctly excluded
  'tabs.tsx', // the motion bar the component animates
  'token-field.tsx', // the input's own multiline shape
])

/** A variant that selects something other than the element itself. */
const reachesElsewhere = (variant: string): boolean =>
  variant.startsWith('[&') || variant === 'before' || variant === 'after'

/** `source` with its comments gone, so prose about a class is not a class. */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(?<!:)\/\/.*$/gm, ' ')

describe('a kit size is not a variant', () => {
  const files = readdirSync(KIT_DIR).filter(
    (name) => name.endsWith('.tsx') && !name.includes('.stories.') && !name.includes('.test.'),
  )

  it('walks the kit it claims to walk', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('leaves no size a caller`s own class cannot win', () => {
    const outranking: string[] = []
    for (const name of files) {
      if (NO_CALLER_CLASS.has(name)) continue
      for (const [whole, variant] of code(readFileSync(join(KIT_DIR, name), 'utf8')).matchAll(
        KEYED,
      )) {
        if (variant === undefined || reachesElsewhere(variant)) continue
        outranking.push(`${name}: ${whole}`)
      }
    }

    expect(
      [...new Set(outranking)].sort(),
      'a caller passing one of these is accepted and ignored: declare the measurement under the variant and read it plainly',
    ).toEqual([])
  })
})
