/**
 * **Every place the browser is handed markup to trust is named here.**
 *
 * **A ratchet rather than a control**: it does not say the sink is safe, it
 * says how many there are and which. A new one fails here and its author has
 * to say, in this list, what sanitises it. -> #152
 *
 * **What this does not cover:** whether the named sink sanitises -- that is
 * `prose-schema.test.ts` -- and the export formats, which are drawn
 * server-side from a node tree and read by Word or a PDF viewer rather than by
 * a browser.
 */
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)))

/**
 * Every way the browser can be handed a string and asked to parse it as markup.
 *
 * Wider than what the tree uses: a sink nobody has reached for yet is the one
 * that arrives without anybody thinking about it.
 */
const SINKS = /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML/

/**
 * The sinks this application has, and what makes each one safe.
 *
 * A path here is a promise that somebody read it. Adding one without reading
 * it is the failure this list exists to make visible rather than to prevent.
 */
const NAMED: Readonly<Record<string, string>> = {
  'components/blocks/report-paper-page.tsx':
    'the written prose of a report, through `markdownToHtml`, whose ProseMirror ' +
    'schema has no node that can hold markup -- measured in prose-schema.test.ts',
}

/** Production files only: a test may build a hostile DOM to measure it. */
const FILES = globSync(['**/*.ts', '**/*.tsx'], { cwd: SRC, absolute: true }).filter(
  (path) => !/\.(test|stories)\.tsx?$/.test(path),
)

describe('the markup sinks are named', () => {
  /** A sweep over nothing passes, and looks exactly like order. */
  it('sweeps the client it is about', () => {
    expect(FILES.length, 'the glob matched no client source at all').toBeGreaterThan(200)
  })

  it('finds no sink this list does not name', () => {
    const found = FILES.filter((path) => SINKS.test(readFileSync(path, 'utf8'))).map((path) =>
      relative(SRC, path),
    )

    expect(
      found.filter((path) => !(path in NAMED)).sort(),
      'a file hands the browser markup to parse and nothing here says what makes it safe. ' +
        'Imported case data reaches the DOM through these, so a new one owes an entry in ' +
        '`NAMED` saying what sanitises it, and a test that measures that claim.',
    ).toEqual([])
  })

  /** The other direction: a list that outlives what it names reads as coverage. */
  it('names no sink the client no longer has', () => {
    const found = new Set(
      FILES.filter((path) => SINKS.test(readFileSync(path, 'utf8'))).map((path) =>
        relative(SRC, path),
      ),
    )

    expect(
      Object.keys(NAMED).filter((path) => !found.has(path)).sort(),
      'this list names a sink that is not there any more',
    ).toEqual([])
  })
})
