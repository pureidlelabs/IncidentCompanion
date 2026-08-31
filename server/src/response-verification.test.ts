import { APP_INTERCEPTOR, Reflector } from '@nestjs/core'
import { StreamableFile } from '@nestjs/common'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { firstValueFrom, of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { AboutController } from './health/about.controller.js'
import { SystemsController } from './collections/entities.controller.js'
import { blockKindGroups } from './report/block-kinds.js'
import { blockKindsSchema } from './report/views.js'
import {
  CollectionsController,
  collectionsListingSchema,
} from './specs/collections.controller.js'

/**
 * That the response interceptor is wired to this app's own decorators.
 *
 * `@ZodResponse` catches a handler whose *signature* drifts and cannot catch
 * one whose signature is honest and whose runtime value is not - a raw
 * database row, a field `undefined` on one branch, a spread wider than the
 * type. The interceptor is what covers that.
 *
 * **Driven with the app's own controller, never a fixture.** Swapping
 * `AboutController` for a synthetic stand-in leaves every assertion below
 * green while the wiring is broken.
 */
describe('the response interceptor verifies what the document promises', () => {
  const interceptor = new ZodSerializerInterceptor(new Reflector())

  /**
   * **The assertion the others cannot make.** Every test below drives the
   * interceptor by hand, so all five stay green on a server that never
   * registers it - the guarantee would be a library that works and an app
   * that does not use it. This is the one that fails in that case.
   */
  it('is registered for every route, not merely available', async () => {
    /**
     * **Imported here rather than at the top, and that is not style.**
     * `AppModule` runs `ConfigModule.forRoot` while it loads, which refuses an
     * incomplete environment - a static import throws during collection, which
     * vitest reports as an unhandled rejection *beside* a green run rather than
     * as a failure. Stub first, then import.
     */
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379')
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32))
    vi.stubEnv('AUTH_BASE_URL', 'https://127.0.0.1:8443')
    const { AppModule } = await import('./app.module.js')

    const providers = Reflect.getMetadata('providers', AppModule) as Array<{
      provide?: unknown
      useClass?: unknown
    }>
    expect(providers).toContainEqual(
      expect.objectContaining({
        provide: APP_INTERCEPTOR,
        useClass: ZodSerializerInterceptor,
      }),
    )
    // Importing `AppModule` pulls the whole graph, which is past the 5s default
    // on a cold transform - a timeout here reads as a wiring failure and is not.
  }, 60_000)

  /** The shape `AboutController.read` is decorated with, filled honestly. */
  const honest = {
    version: '2.0.0',
    license: 'AGPL-3.0-only',
    copyright: '2026',
    siteUrl: 'https://example.invalid',
    repoUrl: 'https://example.invalid/repo',
    issuesUrl: 'https://example.invalid/repo/issues',
  }

  /** Stands in for the request: only the handler and its class are read. */
  const context = {
    // The handler is identified, not invoked, so it needs no receiver.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    getHandler: () => AboutController.prototype.read,
    getClass: () => AboutController,
  } as never

  const send = (payload: unknown) =>
    firstValueFrom(interceptor.intercept(context, { handle: () => of(payload) }))

  it('passes a payload that matches the published shape', async () => {
    await expect(send(honest)).resolves.toEqual(honest)
  })

  it('refuses a payload missing a field the document promises', async () => {
    const { siteUrl: _dropped, ...short } = honest
    await expect(send(short)).rejects.toThrow()
  })

  it('refuses a field whose type the document contradicts', async () => {
    await expect(send({ ...honest, version: 42 })).rejects.toThrow()
  })

  /**
   * **Stripping is the half nobody asks for and everybody wants.** A handler
   * spreading a database row leaks every column the schema does not name -
   * silently, and only into responses nobody diffed against the document.
   */
  it('strips a field the document does not name', async () => {
    await expect(send({ ...honest, internalDbId: 'row-7' })).resolves.toEqual(honest)
  })

  /**
   * The downloads answer with `StreamableFile`, which has no schema and must
   * not be parsed as one - the interceptor returns it untouched, and a
   * regression here would turn every export into a 500.
   */
  it('lets a streamed file through untouched', async () => {
    const file = new StreamableFile(Buffer.from('bytes'))
    await expect(send(file)).resolves.toBe(file)
  })
})

/**
 * That the shape published for a route is the shape that route really builds.
 *
 * **Only the two handlers with no injected dependency are covered here.** The
 * rest need an authenticated request with a database behind it and belong to
 * the browser tier.
 */
describe('the published shape is the shape the code builds', () => {
  it('publishes what the collections listing really returns', () => {
    const built = new CollectionsController().listing()
    expect(() => collectionsListingSchema.parse(built)).not.toThrow()
    // Guards the assertion above: a schema that accepted `{}` would pass it.
    expect(Object.keys(built).length).toBeGreaterThan(0)
  })

  it('publishes what the block-kind menu really returns', () => {
    const built = { groups: blockKindGroups() }
    expect(() => blockKindsSchema.parse(built)).not.toThrow()
    expect(built.groups.length).toBeGreaterThan(0)
    expect(built.groups.some((group) => group.kinds.length > 0)).toBe(true)
  })
})

describe('an entity route keeps the fields its collection declares', () => {
  const interceptor = new ZodSerializerInterceptor(new Reflector())
  const context = {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    getHandler: () => SystemsController.prototype.get,
    getClass: () => SystemsController,
  } as never
  const send = (payload: unknown) =>
    firstValueFrom(interceptor.intercept(context, { handle: () => of(payload) }))

  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    caseId: '22222222-2222-4222-8222-222222222222',
    version: 3,
    createdAt: new Date('2026-08-13T10:00:00Z'),
    updatedAt: new Date('2026-08-13T10:00:00Z'),
    createdBy: null,
    updatedBy: null,
    hostname: 'WKS-FIN01',
    verdict: 'compromised',
  }

  /**
   * **The assertion that had to be made before these routes could be
   * decorated at all.** One implementation serves seven collections, so the
   * declared schema names the envelope and nothing else - and a plain
   * `z.object` *strips* what it does not name. Declared the obvious way, every
   * entity response would have lost `hostname`, `ip`, `verdict` and the rest,
   * answering 200 with a row the screen renders blank.
   */
  it('passes the collection fields through rather than stripping them', async () => {
    await expect(send(row)).resolves.toMatchObject({
      hostname: 'WKS-FIN01',
      verdict: 'compromised',
    })
  })

  it('still converts the Dates a timestamp column hands back', async () => {
    await expect(send(row)).resolves.toMatchObject({
      createdAt: '2026-08-13T10:00:00.000Z',
    })
  })

  it('refuses a row with no version, which is what a write has to present', async () => {
    const { version: _gone, ...short } = row
    await expect(send(short)).rejects.toThrow()
  })
})
