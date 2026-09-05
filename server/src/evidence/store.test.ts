/**
 * Storing an artefact, attacked at the two things that make it evidence:
 * that it is the file we were given, and that a caller cannot reach past it.
 */
import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'

import { EvidenceStore, MAX_ATTACHMENT_BYTES, isDigest } from './store.js'

let root = ''
let store: EvidenceStore

/** The store reads one key off a ConfigService and nothing else. */
const configFor = (dir: string) => ({ get: () => dir }) as never

const bytesOf = (text: string) => Readable.from([Buffer.from(text)]) as AsyncIterable<Buffer>

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'evidence-store-'))
  store = new EvidenceStore(configFor(root))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('keeping an artefact', () => {
  it('returns the digest of what it was given, and can read it back', async () => {
    const stored = await store.put(bytesOf('proxy log line\n'))

    expect(stored.hashAlgorithm).toBe('sha256')
    expect(stored.sizeBytes).toBe(15)
    expect(isDigest(stored.hash)).toBe(true)

    const back = await store.open(stored.hash)
    expect(back).not.toBeNull()
  })

  /**
   * **Content addressing, so the same artefact twice is one file.** An analyst
   * attaching the same export to two evidence rows is ordinary, and storing it
   * twice would make deletion a question about which copy.
   */
  it('stores identical content once', async () => {
    const first = await store.put(bytesOf('same bytes'))
    const second = await store.put(bytesOf('same bytes'))

    expect(second.hash).toBe(first.hash)
  })

  it('gives different content different names', async () => {
    const a = await store.put(bytesOf('one'))
    const b = await store.put(bytesOf('two'))

    expect(a.hash).not.toBe(b.hash)
  })

  /**
   * **The only honest integrity check reads the bytes.** Comparing a stored
   * digest against a stored digest proves the database agrees with itself.
   */
  it('verifies by re-reading, and notices tampering', async () => {
    const stored = await store.put(bytesOf('original evidence'))
    expect(await store.verify(stored.hash)).toBe(true)

    // Somebody edits the file on disk, which is precisely what a chain of
    // custody exists to detect.
    await writeFile(join(root, stored.hash), 'tampered')

    expect(await store.verify(stored.hash)).toBe(false)
  })

  it('reports an artefact this install does not hold', async () => {
    const absent = 'a'.repeat(64)

    expect(await store.open(absent)).toBeNull()
    expect(await store.verify(absent)).toBe(false)
  })

  /**
   * **A path is built from the name, so the name is checked.** Without it,
   * `../../etc/passwd` reads a file the app was never asked for - and the same
   * value reaching `forget` deletes one.
   */
  it('refuses a name that is not a digest', async () => {
    for (const attempt of ['../../etc/passwd', 'evidence/../../secret', '', 'nothex!']) {
      expect(isDigest(attempt), attempt).toBe(false)
      expect(await store.open(attempt), attempt).toBeNull()
    }
  })

  /**
   * **Capped while reading.** A limit applied after the body is in memory has
   * already allowed what it forbids - so the refusal has to come mid-stream.
   */
  it('refuses an attachment past the cap without buffering it whole', async () => {
    const chunk = Buffer.alloc(1024 * 1024)
    let handed = 0
    async function* endless(): AsyncIterable<Buffer> {
      // Far more than the cap. If the guard only fired at the end, this test
      // would allocate every byte of it before failing.
      for (let n = 0; n < 4096; n++) {
        handed += chunk.length
        yield chunk
      }
    }

    await expect(store.put(endless())).rejects.toThrow(/at most/)
    expect(handed).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES + chunk.length)
  })
})

/**
 * The seal itself, attacked. An artefact sits in this store for months beside
 * the analyst's own endpoint AV, so the store is sealed - and sealing is
 * neutering rather than confidentiality, since the password is published.
 *
 * What these hold is the half no route test can see: the route tests assert
 * what the download *sends*, and these assert what lies on the *disk*, which
 * is the surface a scanner walks and the surface a backup tars up.
 */
describe('the seal at rest', () => {
  /** A body no compressor will shrink away and no scanner would miss. */
  const marker = 'unmistakable-artefact-body-9f3a'

  /**
   * **The claim the whole decision rests on.** The absence of the marker is
   * not the assertion that names the clause, and a first version of this test
   * asserted only that: DEFLATE alone hides a string, so deleting `password`
   * from `wrap` left all ten tests green. What holds the seal awake is the
   * entry refusing to open without the password, which is the position an
   * endpoint scanner walking the volume is in.
   */
  it('seals the artefact, so the container will not open without the password', async () => {
    const stored = await store.put(bytesOf(marker.repeat(64)))

    const onDisk = await readFile(join(root, stored.hash))
    expect(onDisk.subarray(0, 2).toString()).toBe('PK')
    expect(onDisk.toString('latin1')).not.toContain(marker)

    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(onDisk)))
    const [entry] = await reader.getEntries()
    expect(entry?.encrypted).toBe(true)
    await expect(
      (entry as { getData: (w: Uint8ArrayWriter) => Promise<Uint8Array> }).getData(
        new Uint8ArrayWriter(),
      ),
    ).rejects.toThrow()
    await reader.close().catch(() => {})
  })

  /**
   * **A short read must not pass for the artefact.** The export path calls
   * `read` and hands the bytes straight into a `.iccase`, so a container that
   * lost its tail has to raise rather than return what survived - an archive
   * carrying a silently shortened artefact is worse than one missing it.
   */
  it('refuses a truncated container rather than reading it short', async () => {
    const stored = await store.put(bytesOf(marker.repeat(128)))
    const held = join(root, stored.hash)

    const whole = await readFile(held)
    await truncate(held, whole.length - 64)

    await expect(store.read(stored.hash)).rejects.toThrow()
    expect(await store.verify(stored.hash)).toBe(false)
  })

  /**
   * **A flipped byte in the ciphertext must raise, not decrypt to something
   * else.** AES-256 in a zip carries an authentication code; this says the
   * store checks it rather than handing back whatever came out. `verify`
   * catches it by hashing, but `read` is what the export calls and `read` has
   * no digest to compare against.
   */
  it('refuses a container whose ciphertext was altered', async () => {
    const stored = await store.put(bytesOf(marker.repeat(128)))
    const held = join(root, stored.hash)

    const whole = await readFile(held)
    // Mid-file, so it lands in the encrypted stream rather than in the local
    // header or the central directory - a header hit would fail at parsing and
    // prove nothing about the authentication code.
    const at = Math.floor(whole.length / 2)
    whole[at] = whole[at]! ^ 0xff
    await writeFile(held, whole)

    await expect(store.read(stored.hash)).rejects.toThrow()
    expect(await store.verify(stored.hash)).toBe(false)
  })
})
