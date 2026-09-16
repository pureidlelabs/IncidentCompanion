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
     * **A real 1x1 PNG, not four magic bytes.** The upload is decoded and
     * re-encoded, so a stub that only looks like a header is refused - and
     * nothing but a decodable file exercises the path.
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
     * **The assertion a round trip cannot make**: what comes back out must
     * not be what went in. An upload stored and streamed verbatim satisfies
     * every other test in this file.
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
     * **The bound a byte cap cannot express.** A PNG of a plain 12000-square
     * compresses to a fraction of the cap and decodes to 144 million pixels.
     * Every size limit on this route passes it - it is small on disk, and that
     * is the attack.
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
     * **Caught by the sniff gate, not the decode.** Bytes that are not any
     * accepted format are refused before `toPng` ever runs - cheaper, and it
     * is the same gate that refuses a mismatched-but-real image below.
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
     * real bytes rather than trusting the header -- so without the
     * sniff-and-compare gate in `preferences.controller.ts`, SVG sent as
     * `image/png` reaches the SVG decoder unchallenged. The message names no
     * cause the analyst did not already control.
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

  /**
   * **A refusal is not the picture, so it does not carry the picture's cache.**
   *
   * `@Header` is applied to the response before the handler body runs, so the
   * one-year immutable directive meant for an image survived the 404 raised
   * for an analyst who has none: a client was told it could keep that refusal
   * for a year without asking again, and an analyst who then uploaded a
   * picture stayed faceless to anybody holding it. -> #836
   *
   * **The `?v=` the client appends is not the guard.** It changes on every
   * write, so the picture appears at a different URL and a different cache key.
   *
   * Asserted on what the handler does with the response, because that is what
   * it decides: a 404 that never reached the typing is answered by Nest with
   * no cache header of the route's at all.
   */
  describe('the cache a picture carries', () => {
    /** Records the headers a handler sets, and the type it answers with. */
    function recorder() {
      const seen: { header: string; value: string }[] = []
      return {
        seen,
        type: (value: string) => seen.push({ header: 'content-type', value }),
        setHeader: (header: string, value: string) => seen.push({ header, value }),
      }
    }

    it('sets none of it on the refusal for an analyst with no picture', async () => {
      const response = recorder()

      await expect(prefs.avatar(SAM, response)).rejects.toMatchObject({ status: 404 })

      expect(
        response.seen,
        'the refusal was cached as though it were the picture',
      ).toEqual([])
    })

    it('sets it on the picture it does serve', async () => {
      // A real 1x1 PNG: the upload is decoded and re-encoded, so a stub that
      // only looks like a header is refused.
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      )
      await new PreferencesService(db!).setAvatar(SAM, png, 'image/png')
      const response = recorder()

      await prefs.avatar(SAM, response)

      const cache = response.seen.find((one) => one.header === 'cache-control')?.value ?? ''
      expect(cache, 'a picture served without the cache the URL is versioned for').toContain(
        'immutable',
      )
    })
  })

  describe('asking for a picture nobody has', () => {
    /**
     * **404, not 400.** The request was well formed and the analyst is real;
     * what is absent is the image. A 400 tells a client its request was wrong
     * and sends whoever debugs it looking at the URL.
     */
    it('answers 404 rather than calling the request bad', async () => {
      const nothing = { type: () => undefined, setHeader: () => undefined }

      await expect(prefs.avatar(SAM, nothing)).rejects.toMatchObject({ status: 404 })
    })

    /**
     * **Keyed by the id, not the display name.** `user.name` is not unique -
     * only `email` is - so a name-keyed route serves two analysts called Sam
     * each other's face. The roster carries `user_id` for exactly this.
     */
    it('finds a picture by the id the roster sends', async () => {
      /**
     * **A real 1x1 PNG, not four magic bytes.** The upload is decoded and
     * re-encoded, so a stub that only looks like a header is refused - and
     * nothing but a decodable file exercises the path.
     */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
      await new PreferencesService(db!).setAvatar(SAM, png, 'image/png')

      const sent = await prefs.avatar(SAM, { type: () => undefined, setHeader: () => undefined })
      expect(sent).toBeDefined()
    })
  })
})
