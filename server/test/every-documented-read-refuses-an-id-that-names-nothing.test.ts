/**
 * **Every documented read refuses an id that names nothing.**
 *
 * A read that answers 200 to an id the install never issued has invented an
 * answer, and a stale link then reads as an empty screen rather than as a
 * refusal. -> #812
 *
 * **Walked from the published document**, so a route is swept on the day it is
 * documented. `operations()` fills `{slug}` with a slug the install really
 * serves, which is what the shape sweep needs and the opposite of what this
 * one needs, so the request paths are built from the template here.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { OpenAPIObject } from '@nestjs/swagger'

import {
  boot,
  bootable,
  operations,
  sharedAdmin,
  type Harness,
  type Operation,
  type Persona,
} from './app-harness.js'

const runnable = await bootable()

/** A well-formed id that no fixture mints, so every lookup misses. */
const NOWHERE = '00000000-0000-4000-8000-000000000000'

const filled = (template: string, value: string): string =>
  template.replace(/\{[^}]+\}/g, value)

const publishes = (document: OpenAPIObject, template: string): string[] =>
  Object.keys(document.paths?.[template]?.get?.responses ?? {})

describe.skipIf(!runnable)('every documented read refuses an id that names nothing', () => {
  let harness: Harness
  let admin: Persona
  let reads: Operation[]

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    reads = operations(harness.document).filter(
      (one) => one.method === 'GET' && one.template.includes('{'),
    )
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **The administrator, so a refusal below is the lookup rather than the
   * door.** Signed in as nobody, every read answers 401 and the sweeps prove
   * nothing about any handler.
   */
  it('sweeps the reads that have something to look up', () => {
    expect(admin.role).toBe('admin')
    expect(reads.length).toBeGreaterThan(30)
  })

  it('answers a published 404 to an id that names nothing', async () => {
    const wrong: string[] = []
    for (const one of reads) {
      const response = await fetch(`${harness.base}${filled(one.template, NOWHERE)}`, {
        headers: { cookie: admin.cookie },
      })
      const published = publishes(harness.document, one.template)
      if (response.status !== 404 || !published.includes('404')) {
        wrong.push(
          `GET ${one.template} -> ${String(response.status)}` +
            ` (published ${published.join(',')}): ${(await response.text()).slice(0, 120)}`,
        )
      }
    }
    expect(wrong.sort()).toEqual([])
  }, 180_000)

  /**
   * The same sweep with an id that is not an id at all.
   *
   * **Not held to 404**, because which of 400 and 404 is right depends on
   * whether the parameter is a uuid: a library slug that is nonsense is a slug
   * naming nothing. Held to the document instead, so whichever it is, a
   * generated client has a branch for it -- and to 4xx, because every
   * operation publishes 500 and a stack trace is the value having reached a
   * query. -> #853
   *
   * **Both directions.** A read publishes no body, so a 400 on one can only be
   * the parameter -- which makes an unanswered 400 a route documented as
   * parsing a uuid that does no such thing, and that is the half a
   * status-is-published test cannot see.
   */
  it('refuses an id that is not well formed with a status it publishes', async () => {
    const wrong: string[] = []
    for (const one of reads) {
      const response = await fetch(`${harness.base}${filled(one.template, 'not-a-uuid')}`, {
        headers: { cookie: admin.cookie },
      })
      const published = publishes(harness.document, one.template)
      if (
        response.status < 400 ||
        response.status >= 500 ||
        !published.includes(String(response.status)) ||
        (published.includes('400') && response.status !== 400)
      ) {
        wrong.push(
          `GET ${one.template} -> ${String(response.status)}` +
            ` (published ${published.join(',')})`,
        )
      }
    }
    expect(wrong.sort()).toEqual([])
  }, 180_000)
})
