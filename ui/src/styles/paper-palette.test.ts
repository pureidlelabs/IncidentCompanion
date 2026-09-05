import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **The paper preview and the document it predicts are one palette.**
 *
 * A report is read in Word, which has no theme to consult, so the document
 * bakes hex where the app reads a token. That split is deliberate. What is not
 * deliberate is the two drifting: the preview then shows an analyst a report
 * that does not exist, and nothing says so, because each half is internally
 * consistent and renders correctly on its own.
 *
 * **Measured 2026-08-27: six of the seven `--paper-*` tokens disagreed with
 * `palette.ts`** -- the heading accent was a slate blue against the document's
 * indigo, the rule and the muted ink were both wrong, and the marking band was
 * a different black with a different red. The token block's own comment claimed
 * the values were "the report's own" while six of them were not, which is why
 * this file asserts the pair rather than a reader trusting a sentence.
 *
 * `server/src/report/document/palette.ts` records the same class of bug caught
 * one layer in: *"while both hexes lived in both painters nothing could assert
 * the pair -- which is how a header at 1.08:1 against it shipped in two
 * documents at once."* This is that lesson applied across the tier boundary.
 *
 * ## Which side wins
 *
 * The document. It is what a recipient actually receives, its values are
 * contrast-measured on paper, and `ACCENT` is deliberately the same hex the
 * Python corpus uses so both backends produce one design. A disagreement is
 * the preview being wrong.
 */
const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const TOKENS = join(HERE, 'standards.css')
const PALETTE = join(HERE, '..', '..', '..', 'server', 'src', 'report', 'document', 'palette.ts')

/** `--paper-*` token -> the export in the document's palette it must equal. */
const PAIRS: Readonly<Record<string, string>> = {
  '--color-paper': 'PAPER',
  '--color-paper-ink': 'INK',
  '--color-paper-ink-muted': 'MUTED',
  '--color-paper-rule': 'RULE',
  '--color-paper-accent': 'ACCENT',
  '--color-paper-banner': 'TLP_GROUND',
}

function tokenValue(css: string, name: string): string | null {
  return new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css)?.[1]?.toLowerCase() ?? null
}

function exportValue(ts: string, name: string): string | null {
  return new RegExp(`export const ${name} = '(#[0-9a-fA-F]{3,8})'`).exec(ts)?.[1]?.toLowerCase() ?? null
}

describe('the paper preview shows the document that will print', () => {
  const css = readFileSync(TOKENS, 'utf8')
  const ts = readFileSync(PALETTE, 'utf8')

  it('finds both palettes', () => {
    expect(css).toContain('--color-paper-accent')
    expect(ts).toContain('export const ACCENT')
  })

  it('gives every paired value the same hex on both sides', () => {
    const apart: string[] = []
    for (const [token, exported] of Object.entries(PAIRS)) {
      const here = tokenValue(css, token)
      const there = exportValue(ts, exported)
      if (here === null) apart.push(`${token} is not declared in standards.css`)
      else if (there === null) apart.push(`${exported} is not exported from palette.ts`)
      else if (here !== there) apart.push(`${token} is ${here}, ${exported} is ${there}`)
    }
    expect(
      apart.sort(),
      'the preview and the document must agree, and the document wins: it is ' +
        'what a recipient receives and its values are measured on paper. Bring ' +
        'the token to the palette, not the other way round.',
    ).toEqual([])
  })
})
