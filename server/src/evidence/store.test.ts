import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, truncate, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'

import { ARTEFACT_PASSWORD, EvidenceStore, MAX_ATTACHMENT_BYTES, isDigest } from './store.js'
import { defaultPolicy } from '../policy/read.js'

/**
 * The install's bounds, as the doors read them.
 *
 * **A stub, because these cases are not about the bounds.** Every door reads
 * them per act now, so a fixture that cannot answer fails to compile rather
 * than falling back to a constant -- which is the state #588 was about.
 */
const POLICY_DEFAULTS = defaultPolicy()
const policy = { read: () => Promise.resolve(POLICY_DEFAULTS) } as never

let root = ''
let store: EvidenceStore
const CASE = randomUUID()

/** The store reads one key off a ConfigService and nothing else. */
const configFor = (dir: string) => ({ get: () => dir }) as never

const bytesOf = (text: string) => Readable.from([Buffer.from(text)]) as AsyncIterable<Buffer>

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'evidence-store-'))
  store = new EvidenceStore(configFor(root), policy)
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('keeping an artefact', () => {
  it('returns the digest of what it was given, and can read it back', async () => {
    const stored = await store.put(CASE, bytesOf('proxy log line\n'))

    expect(stored.hashAlgorithm).toBe('sha256')
    expect(stored.sizeBytes).toBe(15)
    expect(isDigest(stored.hash)).toBe(true)

    const back = await store.open(CASE, stored.hash)
    expect(back).not.toBeNull()
  })

  it('stores identical content once', async () => {
    const first = await store.put(CASE, bytesOf('same bytes'))
    const second = await store.put(CASE, bytesOf('same bytes'))

    expect(second.hash).toBe(first.hash)
  })

  it('gives different content different names', async () => {
    const a = await store.put(CASE, bytesOf('one'))
    const b = await store.put(CASE, bytesOf('two'))

    expect(a.hash).not.toBe(b.hash)
  })

  it('verifies by re-reading, and notices tampering', async () => {
    const stored = await store.put(CASE, bytesOf('original evidence'))
    expect(await store.verify(CASE, stored.hash)).toBe(true)

    await writeFile(join(root, CASE, stored.hash), 'tampered')

    expect(await store.verify(CASE, stored.hash)).toBe(false)
  })

  it('reports an artefact this install does not hold', async () => {
    const absent = 'a'.repeat(64)

    expect(await store.open(CASE, absent)).toBeNull()
    expect(await store.verify(CASE, absent)).toBe(false)
  })

  it('refuses a name that is not a digest', async () => {
    for (const attempt of ['../../etc/passwd', 'evidence/../../secret', '', 'nothex!']) {
      expect(isDigest(attempt), attempt).toBe(false)
      expect(await store.open(CASE, attempt), attempt).toBeNull()
    }
  })

  it('keeps a member name that climbs from reaching the container', async () => {
    const stored = await store.put(CASE, bytesOf('a traversing name'), '../../etc/passwd')

    const reader = new ZipReader(
      new Uint8ArrayReader(new Uint8Array(await readFile(join(root, CASE, stored.hash)))),
      {
        password: ARTEFACT_PASSWORD,
      },
    )
    const names = (await reader.getEntries()).map((entry) => entry.filename)
    await reader.close().catch(() => {})

    expect(names).toEqual(['passwd'])
  })

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

    await expect(store.put(CASE, endless())).rejects.toThrow(/at most/)
    expect(handed).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES + chunk.length)
  })
})

/**
 * A digest names content and never a case, so the store is asked for bytes
 * only through the case that put them there.
 */
describe('an artefact held per case', () => {
  it('answers another case as holding nothing, whoever holds the digest', async () => {
    const [mine, theirs] = [randomUUID(), randomUUID()]
    const stored = await store.put(mine, bytesOf('held by one case'))

    expect(await store.read(theirs, stored.hash)).toBeNull()
    expect(await store.open(theirs, stored.hash)).toBeNull()
    expect(await store.verify(theirs, stored.hash)).toBe(false)
    expect(await store.held(theirs)).toEqual(new Set())
    expect(await store.held(mine)).toEqual(new Set([stored.hash]))
  })

  it('names the entry for each case as that case named it', async () => {
    const [first, later] = [randomUUID(), randomUUID()]
    await store.put(first, bytesOf('one artefact, two cases'), 'acme-ceo-mailbox.eml')
    const again = await store.put(later, bytesOf('one artefact, two cases'), 'mine.eml')

    const reader = new ZipReader(
      new Uint8ArrayReader(new Uint8Array(await readFile(join(root, later, again.hash)))),
      { password: ARTEFACT_PASSWORD },
    )
    const names = (await reader.getEntries()).map((entry) => entry.filename)
    await reader.close().catch(() => {})
    expect(names).toEqual(['mine.eml'])
  })

  it('discards one case whole and leaves another\u2019s copy of the same bytes', async () => {
    const [gone, kept] = [randomUUID(), randomUUID()]
    const stored = await store.put(gone, bytesOf('shared by two cases'))
    await store.put(kept, bytesOf('shared by two cases'))

    await store.discardCase(gone)

    expect(await store.held(gone)).toEqual(new Set())
    expect(await store.verify(kept, stored.hash)).toBe(true)
  })

  it('refuses a case that is not a case id, so no path climbs out of the store', async () => {
    const stored = await store.put(CASE, bytesOf('beside a traversal'))
    for (const attempt of ['..', '../..', `${CASE}/..`, '', 'not-a-case']) {
      await expect(store.put(attempt, bytesOf('x')), attempt).rejects.toThrow()
      await expect(store.read(attempt, stored.hash), attempt).rejects.toThrow()
      await expect(store.discardCase(attempt), attempt).rejects.toThrow()
    }
    expect(await store.verify(CASE, stored.hash)).toBe(true)
  })
})

describe('removing what nothing names', () => {
  const HOUR = 3_600_000
  const aged = (path: string) => utimes(path, new Date(Date.now() - 2 * HOUR), new Date(Date.now() - 2 * HOUR))

  it('keeps a case the database does not hold until the install records deleting it', async () => {
    const unheld = randomUUID()
    const stored = await store.put(unheld, bytesOf('beside a database that never held its case'))
    await aged(join(root, unheld, stored.hash))

    await store.prune(new Map(), new Set(), HOUR)
    expect(await store.held(unheld), 'a database that does not hold a case was read as its deletion').toEqual(new Set([stored.hash]))

    await store.prune(new Map(), new Set([unheld]), HOUR)
    expect(await store.held(unheld)).toEqual(new Set())
  })

  it('removes what the flat layout left at the top of the directory', async () => {
    const flat = join(root, 'a'.repeat(64))
    await writeFile(flat, 'left by a store that kept no case')
    await aged(flat)

    await store.prune(new Map(), new Set(), HOUR)

    await expect(stat(flat), 'nothing reads the flat layout, and its file is still there').rejects.toThrow()
  })

  it('counts bytes stored again as new, however old the copy they found', async () => {
    const mine = randomUUID()
    const first = await store.put(mine, bytesOf('attached, removed, attached again'))
    await aged(join(root, mine, first.hash))
    await store.put(mine, bytesOf('attached, removed, attached again'))

    await store.prune(new Map([[mine, new Set()]]), new Set(), HOUR)

    expect(await store.held(mine), 'bytes stored a moment ago went before their row could name them').toEqual(new Set([first.hash]))
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
  const marker = 'unmistakable-artefact-body-9f3a'

  /**
   * **The claim the whole decision rests on.** The absence of the marker is
   * not the assertion that names the clause: DEFLATE alone hides a string, so
   * a `wrap` with its `password` deleted still passes that one. What holds the
   * seal awake is the entry refusing to open without the password, which is
   * the position an endpoint scanner walking the volume is in.
   */
  it('seals the artefact, so the container will not open without the password', async () => {
    const stored = await store.put(CASE, bytesOf(marker.repeat(64)))

    const onDisk = await readFile(join(root, CASE, stored.hash))
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
    const stored = await store.put(CASE, bytesOf(marker.repeat(128)))
    const held = join(root, CASE, stored.hash)

    const whole = await readFile(held)
    await truncate(held, whole.length - 64)

    await expect(store.read(CASE, stored.hash)).rejects.toThrow()
    expect(await store.verify(CASE, stored.hash)).toBe(false)
  })

  /**
   * **A flipped byte in the ciphertext must raise, not decrypt to something
   * else.** AES-256 in a zip carries an authentication code; this says the
   * store checks it rather than handing back whatever came out. `verify`
   * catches it by hashing, but `read` is what the export calls and `read` has
   * no digest to compare against.
   */
  it('refuses a container whose ciphertext was altered', async () => {
    const stored = await store.put(CASE, bytesOf(marker.repeat(128)))
    const held = join(root, CASE, stored.hash)

    const whole = await readFile(held)
    // Mid-file, so it lands in the encrypted stream rather than in the local
    // header or the central directory - a header hit would fail at parsing and
    // prove nothing about the authentication code.
    const at = Math.floor(whole.length / 2)
    whole[at] = whole[at]! ^ 0xff
    await writeFile(held, whole)

    await expect(store.read(CASE, stored.hash)).rejects.toThrow()
    expect(await store.verify(CASE, stored.hash)).toBe(false)
  })
})

/**
 * That the ceiling the store caps against is the install's, not a constant.
 *
 * **The defect this is written against left the whole suite green.** Reverting
 * `put` to `MAX_ATTACHMENT_BYTES` -- the state before #588 -- changed nothing
 * any test could see, because the only case that mentioned a ceiling asserted
 * against that same constant and the policy stub answers with the same
 * default. A ceiling the operator moved is the only thing that tells them
 * apart. -> #588
 *
 * **Here rather than over HTTP.** The cap fires while the body is still being
 * read, so the route aborts the connection instead of answering -- there is no
 * status to assert on, and the reset surfaces later as an unhandled socket
 * error against whichever case happens to be running.
 */
describe('the ceiling an artefact is capped against', () => {
  /** A store whose install allows `megabytes`, and nothing else different. */
  const cappedAt = (megabytes: number) =>
    new EvidenceStore(configFor(root), {
      read: () =>
        Promise.resolve({ ...POLICY_DEFAULTS, 'evidence.attachmentMegabytes': megabytes }),
    } as never)

  const megabyte = () => Readable.from([Buffer.alloc(1024 * 1024, 7)]) as AsyncIterable<Buffer>

  it('refuses what the install refuses, at the number the install states', async () => {
    await expect(
      cappedAt(1).put(CASE, Readable.from([Buffer.alloc(2 * 1024 * 1024, 7)]) as AsyncIterable<Buffer>),
      'a 2MB artefact was stored under a 1MB ceiling',
    ).rejects.toThrow(/at most 1MB/)
  })

  it('takes what the install allows, at a ceiling the constant would refuse', async () => {
    // **Under the compile-time default and over a lowered one**, so the two
    // cannot both be right: this is the direction the constant cannot express.
    const stored = await cappedAt(2).put(CASE, megabyte())

    expect(stored.sizeBytes).toBe(1024 * 1024)
  })
})
