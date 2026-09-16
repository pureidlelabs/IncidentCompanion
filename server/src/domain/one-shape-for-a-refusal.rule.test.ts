/**
 * **A refusal body is spelled in one place, and every route asks for it.**
 *
 * Four spellings of a 422 reached the client, three of them built at the call
 * site, and the one nobody hand-rolled disagreed with the rest -- it sent a
 * tree where the client reads a list, so most refusals in the application named
 * no field at all. A second spelling cannot be caught by a type: both build an
 * object, and only the client notices, at the moment an analyst is already
 * looking at a failure. -> #633
 *
 * **Read off the source, for the same reason.** Nothing at runtime can tell a
 * copy of the shape from a call to the helper.
 *
 * **The exception class is not what is banned.** A route whose body carries
 * more than the refusal -- the library editor sends a re-rendered form beside
 * it -- raises its own `UnprocessableEntityException` and spreads the builder
 * into it, which is the shape working rather than being worked around.
 *
 * **What this does not cover:** a spelling whose whitespace differs, since the
 * search is textual and nothing formats `server/` on commit; and a route that
 * refuses with the wrong *status*, which `wire/refusals.ts` decides.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { globSync } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..')

/**
 * Where each shape is allowed to be spelled: its home, and nowhere else.
 *
 * **Matched on the shape, not on one spelling of it.** A tuple wrapped over
 * four lines and a validation body carrying its own sentence are both the shape
 * escaping, and a search for `messages: [[` or for the words *Validation
 * failed* sees neither.
 */
const SHAPES = [
  {
    what: 'the validation body',
    spelling: /errors:\s*\w+\.error\.issues/,
    home: 'domain/refusal.ts',
    athome: /errors: error\.issues/,
  },
  {
    what: 'the Written tuple',
    spelling: /messages:\s*\[\s*\[/,
    home: 'domain/written.ts',
    athome: /messages: \[\[text, 'positive'\]\]/,
  },
  {
    what: 'the Written tuple, built by mapping',
    spelling: /map\(\(text\) => \[text, 'negative'\]\)/,
    home: 'domain/written.ts',
    athome: /map\(\(text\) => \[text, 'negative'\]\)/,
  },
]

/** Every shipping source file, tests and the shapes' own homes aside. */
function shipping(): string[] {
  return globSync('**/*.ts', { cwd: SRC, ignore: ['**/*.test.ts', '**/*.d.ts'] })
}

describe('the one spelling of a refusal', () => {
  it.each(SHAPES)('has $what nowhere but $home', ({ spelling, home }) => {
    const elsewhere = shipping()
      .filter((file) => file !== home)
      .filter((file) => spelling.test(readFileSync(join(SRC, file), 'utf8')))

    expect(
      elsewhere,
      `these spell a refusal body themselves rather than asking ${home} for it`,
    ).toEqual([])
  })

  /**
   * **The home still spells it**, so moving a builder out leaves this red
   * rather than green over a search that now covers nothing.
   */
  it.each(SHAPES)('finds $what still built in $home', ({ athome, home }) => {
    expect(readFileSync(join(SRC, home), 'utf8')).toMatch(athome)
  })

  /**
   * The helpers exist to be asked, so a run in which nothing asks is a run
   * that would pass over a tree nobody had rewired.
   */
  it('finds the routes asking for them', () => {
    const asking = shipping().filter((file) => {
      const text = readFileSync(join(SRC, file), 'utf8')
      return /\b(refusedBody|refused|written)\(/.test(text)
    })

    expect(asking.length, 'no route asks for a refusal body').toBeGreaterThan(10)
  })
})
