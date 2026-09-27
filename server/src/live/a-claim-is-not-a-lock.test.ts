/**
 * **A claim warns; it does not lock** -- and the way that stays true is that
 * nothing outside `live/` asks the channel anything but the two questions a
 * write is allowed to ask.
 *
 * > Nothing MUST be built on a claim as though it were a lock.
 *
 * **What the channel can be asked is read off the channel itself**, so a
 * method added to it is refused here by default rather than missed by a
 * hand-written list. `test/a-claimed-row-is-written-through-every-door.test.ts`
 * is the behavioural half, over every door that exists.
 *
 * Reads the source for how the channel is reached, `this.<name>?.<member>(`,
 * so a channel passed around under another name is not seen.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { CaseChannel } from './case-channel.service.js'

const SRC = fileURLToPath(new URL('..', import.meta.url))

/** Everything the channel answers, derived rather than listed. */
const SURFACE = Object.getOwnPropertyNames(CaseChannel.prototype).filter((name) => name !== 'constructor')

/**
 * What code outside `live/` may ask: announce a write it has made, and ask who
 * is present before a case is deleted. Neither reads a claim.
 */
const MAY_ASK = ['announce', 'othersOn']

/** How a class holding the channel or its store declares it. */
const HOLDS = /(\w+)\??\s*:\s*(?:Pick<\s*)?(CaseChannel|PresenceStore|PresenceCoordinator)\b/g

const outsideLive = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name))
  .map((entry) => join(entry.parentPath, entry.name))
  .filter((path) => !relative(SRC, path).startsWith('live/'))

/** Every `holder.member` reached outside `live/`, as `file: holder.member`. */
function asked(): { file: string; kind: string; member: string }[] {
  const found: { file: string; kind: string; member: string }[] = []
  for (const path of outsideLive) {
    const code = readFileSync(path, 'utf8')
    for (const [, name, kind] of code.matchAll(HOLDS)) {
      for (const [, member] of code.matchAll(new RegExp(String.raw`(?<![\w-])${name!}\??\.(\w+)`, 'g'))) {
        found.push({ file: relative(SRC, path), kind: kind!, member: member! })
      }
    }
  }
  return found
}

describe('a claim is not a lock', () => {
  const reached = asked()

  it('asks the channel nothing outside live/ but what a write may ask', () => {
    const offenders = reached
      .filter((one) => one.kind !== 'CaseChannel' || !MAY_ASK.includes(one.member))
      .map((one) => `${one.file}: ${one.kind}.${one.member}`)

    expect(offenders, 'a claim, or the store behind it, is read outside live/').toEqual([])
  })

  /**
   * **The vacuity guards.** A sweep that finds no holder, or an allowance that
   * names a member the channel no longer has, reports the property held while
   * looking at nothing.
   */
  it('finds the write path holding the channel and announcing through it', () => {
    const holders = new Set(reached.filter((one) => one.member === 'announce').map((one) => one.file))
    expect([...holders]).toEqual(
      expect.arrayContaining(['collections/collection.service.ts', 'cases/cases.service.ts']),
    )
  })

  it('allows only members the channel has, and forbids every other one', () => {
    expect(SURFACE).toEqual(expect.arrayContaining(MAY_ASK))
    expect(SURFACE.filter((member) => !MAY_ASK.includes(member)), 'the channel answers nothing else').not.toEqual([])
  })
})
