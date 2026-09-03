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
import { CASE_COLLECTIONS } from '../src/cases/cases.service.js'

const RUNNABLE = await bootable()

describe.skipIf(!RUNNABLE)('the published contract', () => {
  let harness: Harness
  let document: OpenAPIObject

  /**
   * **90s, like every other file that boots the app.** This one carried no
   * budget and took vitest's 10s default, so on a loaded machine `boot()`
   * timed out -- and a hook that times out **skips** its cases rather than
   * failing them. Measured: `4 skipped` and `rc=0`, which is #61's shape
   * arriving through a hook rather than through a missing service.
   */
  beforeAll(async () => {
    harness = await boot()
    document = harness.document
  }, 90_000)

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

  /**
   * **Anything a caller may later change arrives carrying what a write will be
   * checked against** -- `the-api`'s read requirement, and the half nobody
   * would write a test for.
   *
   * The conflict itself is asserted where writes are: a second write naming a
   * consumed version is refused. What nothing held is that a caller can *get*
   * the version in the first place. A record that stopped publishing it would
   * break no read -- the rows still arrive, the screens still draw -- and every
   * write against it would begin failing, far from the change.
   *
   * **Read off the published document rather than a live row**, because it is
   * the document a client is generated from: a schema that omits `version`
   * produces a client with nowhere to put it, whatever the server happens to
   * send.
   */
  it('publishes a version on every record a caller can write back', () => {
    const components = (document.components?.schemas ?? {}) as Record<
      string,
      { properties?: Record<string, unknown> }
    >

    /**
     * **The stored records a caller writes back, named rather than derived.**
     *
     * Two filters were tried and both were wrong, which is why this is a list.
     * *Carries a `caseId`* pulls in `StartedDto` -- what *starting an import*
     * answers with, a result naming the case it made rather than a record
     * anybody writes to, and it publishes no version correctly. Adding
     * *carries `updatedAt`* then drops `ComplianceRecordDto`, which does not
     * publish that stamp and is very much written back.
     *
     * There is no property in the document that separates a stored row from an
     * operation's result, so the honest form is to name them and to fail when
     * the set moves. **Two, not thirteen**: one implementation serves every
     * entity collection, so the twelve share `EntityRowDto`.
     */
    const WRITTEN_BACK = ['ComplianceRecordDto_Output', 'EntityRowDto_Output']

    const missing = WRITTEN_BACK.filter((name) => !components[name])
    expect(
      missing,
      'a record this sweep is about is no longer published under that name',
    ).toEqual([])

    const rows = WRITTEN_BACK.map((name) => [name, components[name]!] as const)

    const without = rows
      .filter(([, schema]) => !('version' in (schema.properties ?? {})))
      .map(([name]) => name)

    expect(
      without,
      'these records publish no version, so a generated client cannot write one back ' +
        'and every write against them is refused for a reason the document never gave',
    ).toEqual([])
  })

  /**
   * **Every route the application actually serves is in the document**, which
   * is what *derived from what is served rather than maintained beside it*
   * means when it is checked rather than asserted.
   *
   * The subject list is the running router, so a route added without a
   * decorator the generator reads shows up here and nowhere else: its own
   * tests pass, the document is silent, and a generated client simply does not
   * have the call.
   */
  it('documents every route it serves', () => {
    const express = harness.app.getHttpAdapter().getInstance() as {
      router?: { stack: unknown[] }
      _router?: { stack: unknown[] }
    }
    const stack = (express.router ?? express._router)?.stack ?? []

    /**
     * Not everything mounted is ours to document. Better Auth serves its own
     * routes under `/api/auth` behind one handler, the reference UI and its
     * document are pages rather than API calls, and the SPA catch-all answers
     * every address the client owns.
     */
    const NOT_OURS = /^\/api\/(auth|docs)\b/

    const served = new Set<string>()
    for (const layer of stack as { route?: { path?: unknown; methods?: Record<string, boolean> } }[]) {
      const path = layer.route?.path
      if (typeof path !== 'string' || !path.startsWith('/api/')) continue
      if (NOT_OURS.test(path)) continue
      for (const [method, on] of Object.entries(layer.route?.methods ?? {})) {
        if (on && method !== '_all') served.add(`${method.toUpperCase()} ${path}`)
      }
    }

    expect(
      served.size,
      'no route was read off the router, so this case is asserting nothing',
    ).toBeGreaterThan(20)

    /** Express spells a parameter `:caseId`; OpenAPI spells it `{caseId}`. */
    const documented = new Set<string>()
    for (const [path, operations] of Object.entries(document.paths ?? {})) {
      const asExpress = path.replace(/\{([^}]+)\}/g, ':$1')
      for (const method of Object.keys(operations ?? {})) {
        documented.add(`${method.toUpperCase()} ${asExpress}`)
      }
    }

    const undocumented = [...served].filter((one) => !documented.has(one)).sort()

    expect(
      undocumented,
      'these routes are served and are not in the published document, so a client ' +
        'generated from it cannot call them',
    ).toEqual([])
  })

  /**
   * **Asking for a whole case and asking for a summary of one are different
   * addresses with different shapes**, which is what makes the two requests
   * distinguishable to anyone reading the document.
   *
   * Enumerated from `CASE_COLLECTIONS` rather than sampled, because the
   * property is about every collection: one that appeared in the summary would
   * be a fragment request answering with rows, and one missing from the
   * document would be a whole-case request that is not whole.
   */
  it('offers a whole case and a summary of one as separate shapes', () => {
    const schemas = (document.components?.schemas ?? {}) as Record<
      string,
      { properties?: Record<string, unknown> }
    >

    const whole = schemas['CaseDocumentDto_Output']
    const summary = schemas['CaseSummaryDto_Output']

    expect(whole, 'the whole-case shape is no longer published under that name').toBeDefined()
    expect(summary, 'the summary shape is no longer published under that name').toBeDefined()

    const missing = CASE_COLLECTIONS.filter((name) => !(name in (whole?.properties ?? {})))
    expect(
      missing,
      'the whole-case answer omits these collections, so it is not the whole case',
    ).toEqual([])

    /**
     * **`reports` is on the summary on purpose and every other collection is
     * not.** The rail draws the reports list itself, so the summary carries it
     * in the narrowed form asserted below; anything else appearing here would
     * be a fragment request answering with rows.
     */
    const leaked = CASE_COLLECTIONS.filter(
      (name) => name !== 'reports' && name in (summary?.properties ?? {}),
    )
    expect(
      leaked,
      'the summary carries these collections, so a caller wanting a fragment is ' +
        'served the rows it was trying not to ask for',
    ).toEqual([])

    const counts = (summary?.properties?.['counts'] ?? {}) as {
      properties?: Record<string, unknown>
    }
    const uncounted = CASE_COLLECTIONS.filter((name) => !(name in (counts.properties ?? {})))
    expect(
      uncounted,
      'these collections have no count in the summary, so the rail draws a chip with ' +
        'no number and an empty section is indistinguishable from a missing key',
    ).toEqual([])
  })

  /**
   * **The one place a screen asks for a handful of fields and receives no
   * more.** The summary's report entries are `id`, `label` and `sentAt`; the
   * stored row also carries the rendered document and whether it is frozen,
   * and a screen listing report names has no use for either.
   *
   * Asserted on what the whole-case answer carries and the summary does not,
   * so it cannot pass by both shapes drifting together.
   */
  it('gives the summary a report entry narrower than the stored row', () => {
    const schemas = (document.components?.schemas ?? {}) as Record<string, unknown>
    const summary = schemas['CaseSummaryDto_Output'] as {
      properties?: { reports?: { items?: { properties?: Record<string, unknown> } } }
    }

    const entry = summary.properties?.reports?.items?.properties ?? {}

    expect(Object.keys(entry).sort(), 'the summary report entry changed shape').toEqual([
      'id',
      'label',
      'sentAt',
    ])

    expect(
      'document' in entry,
      'the summary now carries each report document, so drawing a list of report ' +
        'names ships every rendered report with it',
    ).toBe(false)
  })
})
