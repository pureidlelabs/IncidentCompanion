/**
 * What the published document promises a caller, beyond the shapes.
 *
 * **A client is generated from this document**, so anything it omits is
 * something the generated client does not do. Two omissions were found by
 * reading the document rather than the code, and neither is visible from any
 * route's own tests: no operation said it needs the session cookie, and no
 * operation published `403` -- including the ones whose whole purpose is to
 * answer it.
 *
 * `openapi.test.ts` covers the document's *shape*. This covers its *contract*.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { OpenAPIObject } from '@nestjs/swagger'

import { boot, bootable, type Harness } from './app-harness.js'

const RUNNABLE = await bootable()

describe.skipIf(!RUNNABLE)('the published contract', () => {
  let harness: Harness
  let document: OpenAPIObject

  beforeAll(async () => {
    harness = await boot()
    document = harness.document
  })

  afterAll(async () => {
    await harness.close()
  })

  it('says the API needs the session cookie', () => {
    /**
     * **A scheme nothing requires is decoration.** `addCookieAuth` registers
     * `components.securitySchemes.cookie`, and a generator reads that and does
     * nothing with it until an operation or the document declares it required.
     * Measured before this: every one of the operations carried no `security`.
     */
    const cookie = document.components?.securitySchemes?.['cookie']
    expect(cookie, 'the cookie scheme is not registered at all').toBeDefined()

    expect(
      document.security,
      'no operation and no document-level requirement names the cookie scheme, ' +
        'so a generated client will not send one and every call it makes is 401',
    ).toContainEqual({ cookie: [] })
  })

  it('publishes 403 on every route that refuses an analyst', () => {
    /**
     * The eight admin-only routes. Their refusal is the documented behaviour a
     * caller most needs to handle, and it was the one code the document did not
     * mention anywhere.
     */
    const withoutIt: string[] = []
    for (const [path, item] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(item ?? {})) {
        if (typeof operation !== 'object' || operation === null) continue
        const responses = (operation as { responses?: Record<string, unknown> }).responses ?? {}
        // An operation that publishes 401 is behind the guard; of those, the
        // ones that also refuse an analyst are what this is about. We cannot
        // read `@Roles` from here, so the assertion is the weaker, honest one:
        // *some* operation must publish 403, and the count must not regress.
        if (responses['403']) withoutIt.push(`${method.toUpperCase()} ${path}`)
      }
    }

    expect(
      withoutIt.length,
      'no operation publishes 403, so a caller reading the document has no way ' +
        'to know which routes refuse an analyst',
    ).toBeGreaterThanOrEqual(8)
  })

  it('does not claim a transport it no longer has', () => {
    /**
     * **The description is hand-written and outlived the stack.** It told every
     * API reader the server speaks TLS only with no plaintext port to fall back
     * to. Since nginx took the transport the Node process serves plaintext on
     * 8080 and publishes no port at all, so the sentence was false about the
     * server and true only of the door in front of it.
     */
    const description = document.info?.description ?? ''
    expect(description).not.toMatch(/speaks TLS only/i)
    expect(description).not.toMatch(/no plaintext port/i)
  })
})
