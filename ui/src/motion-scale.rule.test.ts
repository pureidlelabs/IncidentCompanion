import { readFileSync } from 'node:fs'

import { glob } from 'glob'
import { describe, expect, it } from 'vitest'

/**
 * Every scale a thing arrives from is one of the named three.
 *
 * **Read from source, because the defect is invisible one file at a time.**
 * Nothing renders wrongly when a tick grows from 0.7 and the icon beside it
 * grows from 0.6 - each looks considered on its own, and the vocabulary is
 * only visible with the whole tree in front of you. That is the same reason
 * `blocks.test.ts` reads source rather than the DOM.
 *
 * **A nudge within a percent of 1 is a different axis and keeps its literal.**
 * A card lifting under the pointer and settling under the press says *this
 * takes a touch*; it is not a claim about where the thing came from, there are
 * two of them, and a vocabulary entry used once is worse than a number.
 */
const VOCABULARY = 'src/lib/motion.ts'

/** A `scale:` given a number, with the number. */
const LITERAL = /\bscale:\s*(-?\d+(?:\.\d+)?)/g

describe('the arrival scales are a vocabulary, not seven numbers', () => {
  it('is spelled as a literal only where the vocabulary is defined', () => {
    const offenders: string[] = []
    const swept = glob.sync('src/**/*.{ts,tsx}', { cwd: process.cwd() })

    // **The glob is relative to where vitest was started.** Run from anywhere
    // but `ui/`, it matches nothing, every file below is skipped and the
    // assertion passes over an empty sweep -- which is the shape `CLAUDE.md`
    // records for Vale, arriving here through the working directory.
    expect(swept.length, 'the sweep found no source at all, so it proves nothing').toBeGreaterThan(
      100,
    )

    for (const file of swept) {
      if (file === VOCABULARY) continue
      // A story is where a scale is demonstrated at several values on purpose,
      // and a test names the numbers it is asserting on.
      if (/\.(test|stories)\.tsx?$/.test(file)) continue
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(LITERAL)) {
        const value = match[1] ?? ''
        if (Math.abs(Number(value) - 1) <= 0.02) continue
        offenders.push(`${file}: scale: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('offers one entry per kind of thing that arrives, and no more', async () => {
    const { SCALE } = (await import('./lib/motion')) as { SCALE: Record<string, number> }
    expect(Object.keys(SCALE).sort()).toEqual(['glyph', 'mark', 'surface'])
  })
})
