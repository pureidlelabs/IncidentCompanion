/**
 * The two routes whose *contract* can be wrong while the service is right.
 *
 * **A partial body and a nullable field look identical in a schema and mean
 * opposite things.** `{}` validating against a `.partial()` shape is how a
 * client updating one half silently clears the other, and no service test can
 * see it - the service was handed two values and wrote them faithfully.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { HEADERS_METADATA } from '@nestjs/common/constants'

import { MAX_AVATAR_BYTES, PreferencesController } from './preferences.controller.js'
import { PreferencesService } from './preferences.service.js'
import { cases, preferences, user } from '../db/schema/index.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * The handle fixtures arrange rows through.
 *
 * **`ic_seed`, because a fixture writes across cases and the app role may
 * not.** Row-level security refuses an unscoped write, so a fixture on the
 * app handle fails before the test it was arranging ever runs. The subject
 * under test keeps `db` - if it forgets to scope itself, it fails here.
 */
const seedPool = process.env.SEED_DATABASE_URL
  ? openTestPool(process.env.SEED_DATABASE_URL, 'ic_seed')
  : pool
const seed = seedPool ? drizzle({ client: seedPool }) : null

const SAM = 'prefs-ctl-sam'
const session = { user: { id: SAM } } as never

describe.skipIf(!db)('the preferences routes', () => {
  let prefs: PreferencesController
  let service: PreferencesService

  beforeEach(async () => {
    const now = new Date()
    await seed!
      .insert(user)
      .values({
        id: SAM,
        name: SAM,
        email: `${SAM}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
    await seed!.delete(preferences)
    await seed!.delete(cases)

    service = new PreferencesService(db!)
    prefs = new PreferencesController(service)
  })

  afterAll(async () => {
    await seed!.delete(preferences)
    await pool!.end()
  })

  /**
   * **Retired with the routes, not re-pointed.** `recording where the analyst
   * is` covered the one-slot resume; both properties it held that no service
   * test can see - a missing field refused rather than read as null, and an
   * unknown key refused rather than dropped - are asserted in
   * `../recent/recent.controller.test.ts` against the routes that replaced it.
   */

  describe('uploading a picture', () => {
    /** A request body as an async iterable, which is all the handler reads. */
    function upload(type: string | undefined, chunks: Buffer[]) {
      return {
        headers: { 'content-type': type },
        async *[Symbol.asyncIterator]() {
          for (const chunk of chunks) yield chunk
        },
      } as never
    }

    /**
     * **A real 1x1 PNG, not four magic bytes.** Since 2026-08-14 the upload is
     * decoded and re-encoded, so a stub that only looks like a header is
     * refused - correctly, and it used to pass because nothing read the bytes.
     */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )

    it('accepts a declared image and reports the new version', async () => {
      const written = await prefs.setAvatar(upload('image/png', [png]), session)
      expect(written.avatarVersion).toBeGreaterThan(0)
    })

    it('reads a content type that carries parameters', async () => {
      const written = await prefs.setAvatar(upload('image/png; charset=binary', [png]), session)
      expect(written.avatarVersion).toBeGreaterThan(0)
    })

    /**
     * **The allowlist refuses ahead of the decode, which is the real gate.**
     * A type outside the list is turned away before any bytes are read, so an
     * obvious mistake costs nothing - and `text/html` is the one that would
     * have mattered when the bytes were served back verbatim.
     */
    it.each([['text/html'], ['image/svg+xml'], ['application/octet-stream'], [undefined]])(
      'refuses %s',
      async (type) => {
        await expect(prefs.setAvatar(upload(type, [png]), session)).rejects.toMatchObject({
          response: { message: expect.stringContaining('avatar is') },
        })
      },
    )

    /**
     * **The assertion that would have caught the original behaviour**, and the
     * one a round trip cannot make: what comes back out must not be what went
     * in. Until 2026-08-14 the upload was stored and streamed verbatim, and
     * every test here passed.
     */
    it('does not store the bytes it was given', async () => {
      await prefs.setAvatar(upload('image/png', [png]), session)
      // Read through the service rather than the controller: the route wraps
      // it in a StreamableFile, and what this asserts is the stored bytes.
      const served = await service.avatar(SAM)
      expect(served).not.toBeNull()
      expect(Buffer.from(served!.bytes).equals(png)).toBe(false)
      // A PNG this process wrote, whatever arrived.
      expect(served!.type).toBe('image/png')
      expect(Buffer.from(served!.bytes).subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    })

    /**
     * **The bound a byte cap cannot express.** Measured 2026-08-14: a 446KB
     * PNG that decodes to 144 million pixels, refused in 2ms. Every size limit
     * on this route passes it - it is small on disk, and that is the attack.
     */
    it('refuses a small file that decodes to an enormous one', async () => {
      const { default: sharp } = await import('sharp')
      const bomb = await sharp({
        create: { width: 12000, height: 12000, channels: 3, background: '#ffffff' },
      })
        .png({ compressionLevel: 9 })
        .toBuffer()
      expect(bomb.length).toBeLessThan(MAX_AVATAR_BYTES)

      await expect(prefs.setAvatar(upload('image/png', [bomb]), session)).rejects.toMatchObject({
        response: { message: expect.stringContaining('could not be read') },
      })
    })

    /**
     * **Caught by the sniff gate, not the decode.** Since the mismatch check
     * landed, bytes that are not any accepted format are refused before
     * `toPng` ever runs - cheaper, and it is the same gate that refuses a
     * mismatched-but-real image below.
     */
    it('refuses bytes that claim to be an image and are not', async () => {
      // The claimed type is in the allowlist, so the sniff is what refuses it.
      const lie = Buffer.from('MZ this is a PE header, not a picture')
      await expect(prefs.setAvatar(upload('image/png', [lie]), session)).rejects.toMatchObject({
        response: { message: expect.stringContaining('avatar is') },
      })
    })

    /**
     * **The attack this route exists to stop.** The declared type is in the
     * allowlist and would pass the cheap gate above; only a decoder change
     * would show a mismatch, and `sharp` selects its decoder by sniffing the
     * real bytes rather than trusting the header - so SVG sent as
     * `image/png` used to reach the SVG decoder unchallenged. This asserts
     * the sniff-and-compare gate in `preferences.controller.ts` refuses it
     * before any decoder runs, and the message names no cause the analyst
     * did not already control.
     */
    it('refuses SVG bytes declared as image/png', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
      )
      await expect(prefs.setAvatar(upload('image/png', [svg]), session)).rejects.toMatchObject({
        response: { message: expect.stringContaining('avatar is') },
      })
    })

    it('refuses an empty body rather than storing nothing', async () => {
      await expect(prefs.setAvatar(upload('image/png', []), session)).rejects.toMatchObject({
        response: { message: expect.stringContaining('No image') },
      })
    })

    /**
     * **The cap is applied while reading**, so the bytes past it are never
     * held - a limit checked after the body is in memory has already allowed
     * the thing it forbids.
     */
    it('refuses a body past the cap', async () => {
      const big = Buffer.alloc(1024 * 1024)
      await expect(
        prefs.setAvatar(upload('image/png', [big, big, big]), session),
      ).rejects.toMatchObject({ response: { message: expect.stringContaining('at most') } })
    })
  })

  /**
   * `nosniff` is defence behind the re-encode, on a URL every analyst's roster
   * loads, and nothing else asserts it: there is no global header middleware
   * to catch this one decorator going.
   *
   * Asserted on the route's metadata rather than through a request.
   */
  it('serves an avatar with nosniff, which is what makes the type safe', () => {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      // Read for the decorator metadata hanging off it; never called, so
      // there is no receiver to lose.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      PreferencesController.prototype.avatar,
    ) as { name: string; value: string }[]

    expect(headers.map((one) => one.name.toLowerCase())).toContain('x-content-type-options')
    expect(headers.find((one) => one.name.toLowerCase() === 'x-content-type-options')?.value).toBe(
      'nosniff',
    )
  })

  describe('asking for a picture nobody has', () => {
    /**
     * **404, not 400.** The request was well formed and the analyst is real;
     * what is absent is the image. A 400 tells a client its request was wrong
     * and sends whoever debugs it looking at the URL.
     */
    it('answers 404 rather than calling the request bad', async () => {
      await expect(prefs.avatar(SAM, { type: () => undefined })).rejects.toMatchObject({
        status: 404,
      })
    })

    /**
     * **Keyed by the id, not the display name.** `user.name` is not unique -
     * only `email` is - so a name-keyed route serves two analysts called Sam
     * each other's face. The roster carries `user_id` for exactly this.
     */
    it('finds a picture by the id the roster sends', async () => {
      /**
     * **A real 1x1 PNG, not four magic bytes.** Since 2026-08-14 the upload is
     * decoded and re-encoded, so a stub that only looks like a header is
     * refused - correctly, and it used to pass because nothing read the bytes.
     */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
      await new PreferencesService(db!).setAvatar(SAM, png, 'image/png')

      const sent = await prefs.avatar(SAM, { type: () => undefined })
      expect(sent).toBeDefined()
    })
  })
})
