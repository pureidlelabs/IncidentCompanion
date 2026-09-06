/**
 * The gate: a route that changes the installation has to write the audit line.
 *
 * **Six call sites are defensible by hand; the seventh is not.** The failure
 * this exists to stop is not any of the routes written today - it is the one
 * added in three months by somebody who has never read this file, which lands
 * green, ships, and leaves the log quietly incomplete. An audit with a hole in
 * it is worse than none, because the hole is invisible from the log itself.
 *
 * Reads the source text and imports nothing, so it needs no database.
 *
 * **What it cannot see**, stated rather than left to be discovered: it checks
 * that the file mentions the writer, not that the *right* event reaches it on
 * the *right* branch. A route that records `accountCreated` when it disabled
 * something passes here. That is a real gap and the remedy is the route's own
 * test - this one closes the larger hole, which is recording nothing at all.
 *
 * **A key-name sweep is not here, and is not wanted.** Grepping every
 * `detail: { ... }` for the word `password` is what a test looks like when the
 * type system has been given nothing to work with. The typed methods on
 * `InstallActivityService` are what stand in its place: a call site cannot put
 * a secret in an attribute bag it does not construct, and `passwordReset(caller,
 * username)` has nowhere to put one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : []
  })
}

/** A method decorator that writes: everything but `@Get`. */
const WRITES = /@(Post|Put|Patch|Delete)\(/

/**
 * Either way in to the log - the injected service, or the function the Better
 * Auth hooks call because they run outside the container.
 */
const RECORDS = /InstallActivityService|recordInstallActivity/

/**
 * Files that hold an admin-gated write and are therefore in scope.
 *
 * **`@AdminOnly()` is the surface, and it is greppable on purpose.** It is one
 * decorator rather than a bare `@Roles`, which is what lets this test enumerate
 * the installation's write surface instead of a list somebody maintains. A
 * hand-kept list is the thing that goes stale in exactly the case this gate is
 * for.
 */
function adminWriteFiles(): string[] {
  return sources().filter((path) => {
    const text = readFileSync(path, 'utf8')
    return text.includes('@AdminOnly()') && WRITES.test(text)
  })
}

describe('every admin-gated write records what it did', () => {
  /**
   * Without this the sweep below can pass over an empty list - and an empty
   * list is exactly what a renamed decorator produces, which is the failure
   * that would make this whole file inert while reporting success.
   */
  it('finds the admin-gated write routes at all', () => {
    const found = adminWriteFiles().map((f) => relative(SRC, f))
    expect(found.length).toBeGreaterThanOrEqual(3)
    expect(found).toContain('accounts/accounts.controller.ts')
  })

  it.each(adminWriteFiles().map((f) => [relative(SRC, f), f]))('%s', (name, path) => {
    const text = readFileSync(path, 'utf8')
    expect(
      RECORDS.test(text),
      `${name} holds an admin-gated write and never reaches the audit log. ` +
        'Inject InstallActivityService and record what the route did, or the ' +
        'installation has a change nothing can account for.',
    ).toBe(true)
  })
})

describe('the audit vocabulary', () => {
  /**
   * **`channel` is a stored derivation, and drift is what that costs.** The
   * column is what a reader tab and a future collector select on, so an event
   * with no entry in `CHANNEL_OF` would either fail to insert or land in
   * whichever stream the map happens to answer for - and a line in the wrong
   * log is one nobody looking for it will find.
   *
   * The map is typed `Record<InstallEvent, InstallChannel>`, so this is
   * belt-and-braces over a compile error. It is here because the compile error
   * is the kind somebody silences with a cast at the moment they are adding an
   * event and thinking about something else.
   */
  it('gives every event a channel', async () => {
    const { CHANNEL_OF, installActivity, installChannel } = await import(
      '../db/schema/install-activity.js'
    )
    const channels = new Set<string>(installChannel.enumValues)

    for (const event of installActivity.event.enumValues) {
      expect(channels, `${event} has no channel`).toContain(CHANNEL_OF[event])
    }
  })

  /**
   * **A value nothing writes is a reader promise with no data behind it.** The
   * enum is the contract a future filter row is drawn from, so an event that
   * exists in the schema and in no call site renders an empty tab.
   *
   * `install_started` is exempt: it is written at boot rather than at a route.
   */
  it('has a writer for every event it declares', async () => {
    const { installActivity } = await import('../db/schema/install-activity.js')
    // **Not the schema file, which is where the enum is declared.** Including
    // it makes every value its own writer, so the sweep passes on a table
    // nothing has ever written to.
    const everywhere = sources()
      .filter((f) => !f.endsWith('db/schema/install-activity.ts'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')

    const unwritten = installActivity.event.enumValues.filter(
      (value) => !everywhere.includes(`'${value}'`),
    )
    expect(unwritten, 'declared in the enum and written by nothing').toEqual([])
  })
})
