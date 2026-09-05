import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { openingTags } from '@/test/openingTags'

/**
 * A password field is `Input`, never a raw `<input>`.
 *
 * A manager reads an unannotated password field as a *sign-in* field: it
 * offers the analyst's account password for an archive passphrase, and offers
 * to save the passphrase over the stored login. Three such fields shipped in
 * one branch, two of them already setting `autoComplete="new-password"` -
 * which is why the attribute is not what this rule checks for.
 *
 * **What routing them through `Input` buys is one place to fix that**, not a
 * set of attributes it already carries. It carries none: a blanket
 * `NO_PASSWORD_MANAGER` was removed with the app's own input, on the reading
 * that nothing had been seen injecting. A field that *is* seen opts out at the
 * call site - `NewReportDialog`'s Name is the one that has been.
 *
 * **The tag is parsed, not pattern-matched**, by the shared walker in
 * `@/test/openingTags` - `blocks.test.ts`'s detail-grid rule reads tags the
 * same way, and two walkers would drift exactly like the blocks they guard.
 *
 * **Source text, not the DOM.** jsdom renders a raw password field and a
 * `Input` identically apart from the attributes, and the per-screen tests
 * beside the two archive forms assert those; this catches the fourth screen
 * before anyone writes a test for it.
 */

const KIT = dirname(fileURLToPath(import.meta.url))
const SRC = join(KIT, '..', '..')

/** This file names the pattern it bans, in a regex and in its own prose. */
const SELF = 'components/ui/password-fields.test.ts'

function tracked(): { path: string; text: string }[] {
  const listed = execFileSync('git', ['ls-files', '--', '*.tsx'], {
    cwd: SRC,
    encoding: 'utf8',
  })
  return listed
    .split('\n')
    .filter((path) => path !== '' && path !== SELF)
    .map((path) => ({ path, text: readFileSync(join(SRC, path), 'utf8') }))
}

/**
 * Prose may name the pattern the code may not use, and this file's own does.
 *
 * The same trap `blocks.test.ts` records: a rule matched against raw text fails
 * the file that documents it, and the next reader deletes the explanation
 * rather than the defect. Found when a test harness carried a comment saying
 * why it does not use a raw password input.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** `type="password"`, `type='password'` and `type={'password'}` alike. */
const PASSWORD_TYPE = /\btype=\{?\s*['"`]password['"`]/

describe('password fields come from the kit', () => {
  const sources = tracked()

  it('finds source to read', () => {
    expect(sources.length).toBeGreaterThan(50)
  })

  it('parses an opening tag past the house style', () => {
    // The guard on the guard: a tag written the way this app writes them must
    // still be seen whole. A regex stopping at the first `>` would cut this
    // one inside `cn()` and miss the `type` that follows.
    const houseStyle = [
      '<input',
      "  {...ids}",
      "  className={cn(controlBase, 'h-control-md')}",
      '  type="password"',
      '/>',
    ].join('\n')
    const tags = openingTags(houseStyle, 'input')
    expect(tags).toHaveLength(1)
    expect(PASSWORD_TYPE.test(tags[0]!)).toBe(true)
  })

  it('does not run one tag into the next through a comment', () => {
    // The file input above the passphrase field, as it is really written: an
    // apostrophe in a `//` comment used to open a string state that ate the
    // tag's own `>`, so a clean file input and a raw password field below it
    // were read as one tag - and the sweep then blamed the wrong element.
    const pair = [
      '<input',
      '  type="file"',
      "  // jsdom's validation, and the button's own guard",
      '/>',
      '<input type="text" />',
    ].join('\n')
    const tags = openingTags(pair, 'input')
    expect(tags).toHaveLength(2)
    expect(tags.some((tag) => PASSWORD_TYPE.test(tag))).toBe(false)
  })

  it('has no raw <input type="password"> anywhere under src', () => {
    const offenders = sources
      .filter(({ text }) =>
        openingTags(withoutComments(text), 'input').some((tag) => PASSWORD_TYPE.test(tag)),
      )
      .map(({ path }) => path)
    expect(
      offenders,
      'use Input from components/ui/input -- it carries the password-manager opt-outs',
    ).toEqual([])
  })
})
