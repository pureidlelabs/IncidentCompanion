/**
 * The archive container, read as though somebody built it to get in.
 *
 * **A round trip proves almost nothing here.** Packing and unpacking agree by
 * construction; what matters is every archive this code did *not* write - a
 * member that climbs out of the tree, one swapped after sealing, one the
 * manifest never mentioned, and one whose declared size would exhaust the
 * process before a byte was inflated.
 */
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'

import {
  ARCHIVE_VERSION,
  BadArchive,
  MANIFEST_NAME,
  MAX_MEMBERS,
  pack,
  readArchive,
  sha256,
  unpack,
} from './format.js'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

/** A zip with exactly these members and nothing added. */
async function zipOf(members: Record<string, Uint8Array>): Promise<Buffer> {
  const writer = new ZipWriter(new Uint8ArrayWriter())
  for (const [name, value] of Object.entries(members)) {
    await writer.add(name, new Uint8ArrayReader(value))
  }
  return Buffer.from(await writer.close())
}

/** A zip assembled by hand, so a manifest can disagree with what is in it. */
async function forge(
  members: Record<string, Uint8Array>,
  manifest: unknown = undefined,
): Promise<Buffer> {
  const files: Record<string, string> = {}
  for (const [name, value] of Object.entries(members)) files[name] = sha256(value)
  const stated = manifest ?? { version: ARCHIVE_VERSION, attachments: 'included', files }
  return zipOf({ ...members, [MANIFEST_NAME]: bytes(JSON.stringify(stated)) })
}

describe('an archive this code wrote', () => {
  it('comes back byte for byte', async () => {
    const made = await pack({ 'case.json': bytes('{"a":1}'), 'prose/x.ydoc': bytes('yjs') }, 'included')
    const { members, attachments } = await readArchive(made)
    expect(Buffer.from(members['case.json']!).toString()).toBe('{"a":1}')
    expect(Buffer.from(members['prose/x.ydoc']!).toString()).toBe('yjs')
    expect(attachments).toBe('included')
  })

  it('says whether the attachments travelled', async () => {
    // Without this an import cannot tell a deliberate handover from a backup
    // somebody damaged, and reports missing files for both.
    expect((await readArchive(await pack({ 'case.json': bytes('{}') }, 'omitted'))).attachments).toBe(
      'omitted',
    )
  })
})

describe('an archive somebody else built', () => {
  it('refuses a member that climbs out of the archive', async () => {
    await expect(unpack(await forge({ '../../etc/passwd': bytes('x') }))).rejects.toThrow(BadArchive)
  })

  it('refuses an absolute member name', async () => {
    await expect(unpack(await forge({ '/etc/passwd': bytes('x') }))).rejects.toThrow(BadArchive)
    await expect(unpack(await forge({ 'C:\\windows\\x': bytes('x') }))).rejects.toThrow(BadArchive)
  })

  it('refuses a backslash, which is a separator where the archive came from', async () => {
    await expect(unpack(await forge({ 'a\\..\\..\\b': bytes('x') }))).rejects.toThrow(BadArchive)
  })

  it('refuses a member swapped after the manifest was written', async () => {
    // The whole point of the digests. Without the check the import reads
    // whatever the archive now carries under a name it trusts.
    const files = { 'case.json': sha256(bytes('the original')) }
    const forged = await forge({ 'case.json': bytes('something else entirely') }, {
      version: ARCHIVE_VERSION,
      attachments: 'included',
      files,
    })
    await expect(unpack(forged)).rejects.toThrow(/does not match the digest/)
  })

  it('refuses a member the manifest never named', async () => {
    // Taking the manifest as a lower bound rather than the whole truth is how
    // a file added after sealing gets imported.
    const forged = await forge({ 'case.json': bytes('{}') }, {
      version: ARCHIVE_VERSION,
      attachments: 'included',
      files: {},
    })
    await expect(unpack(forged)).rejects.toThrow(/not in its manifest/)
  })

  it('refuses a manifest naming a member that is not there', async () => {
    const forged = await forge({ 'case.json': bytes('{}') }, {
      version: ARCHIVE_VERSION,
      attachments: 'included',
      files: { 'case.json': sha256(bytes('{}')), 'evidence/gone': 'a'.repeat(64) },
    })
    await expect(unpack(forged)).rejects.toThrow(/named in the manifest and missing/)
  })

  it('refuses an archive with no manifest at all', async () => {
    const bare = await zipOf({ 'case.json': bytes('{}') })
    await expect(unpack(bare)).rejects.toThrow(/no manifest/)
  })

  it('refuses a manifest that does not say whether the files travelled', async () => {
    const forged = await forge({ 'case.json': bytes('{}') }, {
      version: ARCHIVE_VERSION,
      files: { 'case.json': sha256(bytes('{}')) },
    })
    await expect(unpack(forged)).rejects.toThrow(/whether its files travelled/)
  })

  it('refuses a format version it does not read', async () => {
    // Saying so beats reading a later format's members under this one's rules.
    const forged = await forge({ 'case.json': bytes('{}') }, {
      version: 99,
      attachments: 'included',
      files: { 'case.json': sha256(bytes('{}')) },
    })
    await expect(unpack(forged)).rejects.toThrow(/version 99/)
  })

  it('refuses more members than an archive may hold', async () => {
    // The bounds moved with the zip.js swap - from a per-member filter to a
    // pass over the central directory - and nothing named them either side, so
    // deleting the whole block left 44 of 47 tests green.
    const many: Record<string, Uint8Array> = {}
    for (let i = 0; i <= MAX_MEMBERS; i += 1) many[`m${String(i)}`] = bytes('x')
    await expect(unpack(await zipOf(many))).rejects.toThrow(/too many members/)
    // **The timeout is raised because building the archive is the cost, not
    // the assertion.** This one case is most of the file's runtime, and the
    // 5s default leaves no headroom: under a full-suite run on a loaded
    // machine it times out, which reads as a defect in whatever else changed.
  }, 30_000)

  /**
   * **The two *byte* ceilings are not cheaply reachable from here, and saying
   * so is better than a test that looks like it covers them.**
   *
   * `MAX_MEMBER_BYTES` is 256MB and `MAX_TOTAL_BYTES` is 512MB, so reaching
   * either honestly means allocating half a gigabyte in a unit test. The
   * dishonest route - a central directory that *claims* a huge member over a
   * small file - does not reach our bound at all: zip.js validates the
   * declared size against the entry itself and refuses first. Measured
   * 2026-08-14 on a 400MB bomb patched to claim 100 bytes: refused in 6ms with
   * flat RSS, `Invalid uncompressed size`.
   *
   * So the byte bounds are belt-and-braces behind the library, and the member
   * count above is the one this tier can hold. `format.ts` says the digest
   * check is the backstop against a lying directory; it is not, zip.js is.
   */
  it('refuses something that is not a zip', async () => {
    await expect(unpack(Buffer.from('this is a text file, not an archive'))).rejects.toThrow(BadArchive)
  })

  it('refuses an unreadable manifest rather than importing nothing', async () => {
    const forged = await zipOf({ 'case.json': bytes('{}'), [MANIFEST_NAME]: bytes('{not json') })
    await expect(unpack(forged)).rejects.toThrow(/manifest is unreadable/)
  })
})

describe('an archive written under an older shape', () => {
  /**
   * **The second clause of `refuses a format version it does not read`.**
   * That case asserts the refusal names what the archive *is* -- `version 99`
   * -- and `state` asks for both halves: *refused with what it is and what was
   * expected*.
   *
   * Without the expected number an operator has a rejected file and no way to
   * tell whether they need an older build or a newer archive, which is the
   * only question the message exists to answer.
   *
   * An older version rather than a newer one, because that is the direction
   * the requirement is about -- *data stored under an older shape* -- and the
   * case above already covers a shape from the future.
   */
  it('is refused naming what was expected, not only what it is', async () => {
    const members = { 'case.json': bytes('{"a":1}') }
    const files: Record<string, string> = { 'case.json': sha256(members['case.json']) }
    const older = await forge(members, { version: 0, attachments: 'included', files })

    const thrown = await readArchive(older).then(
      () => null,
      (error: unknown) => error as Error,
    )

    expect(thrown, 'an archive from another shape was read as though it were this one').toBeTruthy()
    expect(thrown!.message, 'the refusal does not say what the archive is').toContain('version 0')
    expect(thrown!.message, 'the refusal does not say what this build reads').toContain(
      `reads ${String(ARCHIVE_VERSION)}`,
    )
  })

})
