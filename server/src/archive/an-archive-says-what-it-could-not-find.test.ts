/**
 * **An archive says how much was recorded and could not be found.**
 *
 * *GIVEN a case whose stored evidence cannot all be found, WHEN it is
 * archived, THEN the archive says how much was not found.* The export named
 * every unfound artefact and the count left as a response header -- so the
 * archive itself said nothing, and an analyst who saved the file, or was
 * handed it by somebody else, opened one that looked complete. -> #243
 *
 * **The manifest is where it has to be said.** The requirement beside this one
 * asks that an archive carry a statement of what it holds and that reading one
 * check the contents against it. An unfound artefact was dropped from the
 * members *and* from that statement, so the two agreed and the check passed:
 * internally consistent and incomplete, which is the one combination a
 * manifest exists to make impossible.
 *
 * **Not the same question as `attachments`.** That field says whether the
 * analyst chose to leave the artefacts out, which is a handover rather than a
 * loss. *Chose not to carry them* and *could not find two of them* are
 * different documents.
 *
 * **What this does not cover:** what the export decides is unfound, which is
 * `case-archive/export.service.ts`'s, and the screen that reads it back.
 */
import { describe, expect, it } from 'vitest'

import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'

import { BadArchive, MANIFEST_NAME, pack, readArchive, type Manifest } from './format.js'

const LIMITS = { memberBytes: 8 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 }

const bytes = (what: string) => new TextEncoder().encode(what)

/** The manifest as it was written, read back out of the archive itself. */
async function manifestOf(archive: Buffer): Promise<Manifest> {
  const { members } = await readArchive(archive, LIMITS)
  return JSON.parse(Buffer.from(members[MANIFEST_NAME]!).toString('utf8')) as Manifest
}

/**
 * The same archive with its manifest replaced by whatever `edit` returns.
 *
 * **The archive an analyst was handed, not one this build wrote.** `pack`
 * cannot produce a manifest missing a field it always writes, nor one holding
 * a value its own types refuse -- and both are states the reader has to
 * survive, since a `.iccase` is a file somebody can edit.
 *
 * The other members travel untouched, so what the reader refuses is the
 * manifest rather than a digest that no longer matches.
 */
async function rewritingManifest(
  archive: Buffer,
  edit: (manifest: Manifest) => unknown,
): Promise<Buffer> {
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(archive)))
  const held: Record<string, Uint8Array> = {}
  for (const entry of await reader.getEntries()) {
    if (entry.directory || !entry.getData) continue
    held[entry.filename] = await entry.getData(new Uint8ArrayWriter())
  }
  await reader.close()

  const manifest = JSON.parse(Buffer.from(held[MANIFEST_NAME]!).toString('utf8')) as Manifest
  held[MANIFEST_NAME] = new TextEncoder().encode(JSON.stringify(edit(manifest), null, 2))

  const writer = new ZipWriter(new Uint8ArrayWriter(), { level: 6 })
  for (const [name, member] of Object.entries(held)) {
    await writer.add(name, new Uint8ArrayReader(member))
  }
  return Buffer.from(await writer.close())
}

describe('an archive whose evidence could not all be found', () => {
  it('states what could not be found, by name', async () => {
    const archive = await pack({ 'case.json': bytes('{}') }, 'included', [
      'ransom-note.txt',
      'memory.dmp',
    ])

    expect(
      (await manifestOf(archive)).missing,
      'the archive says nothing about what it could not find',
    ).toEqual(['memory.dmp', 'ransom-note.txt'])
  })

  /**
   * **Read back rather than only written.** A field the writer sets and the
   * reader drops is one no consumer of an archive can act on, which is the
   * state the response header was already in.
   */
  it('hands the count back to whoever reads it', async () => {
    const archive = await pack({ 'case.json': bytes('{}') }, 'included', ['memory.dmp'])

    expect((await readArchive(archive, LIMITS)).missing, 'the reader drops it').toEqual([
      'memory.dmp',
    ])
  })

  /** **An archive that found everything says so by carrying an empty list.** */
  it('says nothing was missing when nothing was', async () => {
    const archive = await pack({ 'case.json': bytes('{}') }, 'included')

    expect((await manifestOf(archive)).missing).toEqual([])
    expect((await readArchive(archive, LIMITS)).missing).toEqual([])
  })

  /**
   * **An archive written before the field existed carries nothing, and reads
   * as the same answer** -- which is what it meant, since those exports named
   * unfound artefacts in a response header and nowhere else. That is why the
   * field is optional and `ARCHIVE_VERSION` does not move: bumping it would
   * refuse every archive an install already holds, to add a statement those
   * archives were never able to make.
   *
   * **The key is genuinely absent here, which `pack` cannot produce.** It
   * always writes the field, so a case built through it asserts the
   * empty-list path twice and the compatibility path never -- the fallback
   * could be deleted and the suite would not notice.
   */
  it('reads an archive written before the field as having lost nothing', async () => {
    const archive = await rewritingManifest(
      await pack({ 'case.json': bytes('{}') }, 'included'),
      (manifest) => {
        const { missing: _dropped, ...before } = manifest
        return before
      },
    )

    expect(
      Object.keys(await manifestOf(archive)),
      'the fixture still carries the field, so this proves nothing',
    ).not.toContain('missing')
    expect(
      (await readArchive(archive, LIMITS)).missing,
      'an archive from before the field reads as something other than having lost nothing',
    ).toEqual([])
  })

  /**
   * **The manifest is hostile like every other part of it.** `files` and
   * `attachments` are both type-checked before use; this one is handed out
   * declared `string[]`, so a consumer calling `.join` or `.map` on whatever
   * an edited archive put there gets a `TypeError` from a file an analyst was
   * handed.
   */
  it.each([
    ['a sentence rather than a list', 'pwned'],
    ['a list holding something that is not a name', [{ nested: 'x' }, 42, null]],
    ['a number', 7],
  ])('refuses a manifest whose statement is %s', async (_what, forged) => {
    const archive = await rewritingManifest(
      await pack({ 'case.json': bytes('{}') }, 'included', ['memory.dmp']),
      (manifest) => ({ ...manifest, missing: forged }),
    )

    await expect(readArchive(archive, LIMITS)).rejects.toThrow(BadArchive)
  })

  /**
   * **Two exports of one case produce the same bytes**, which is the whole
   * reason the list is sorted -- a difference between two archives of one case
   * is then a difference in the case.
   *
   * `localeCompare` answers 0 for distinct strings that differ only by Unicode
   * normalisation, and `Array.prototype.sort` is stable, so with it alone the
   * output order followed the input order. This field is the first in the
   * manifest to hold analyst-typed filenames, which is exactly where a name
   * composed two ways arrives: macOS hands over the decomposed spelling and
   * Windows the composed one.
   */
  it('orders two spellings of one name the same way whichever arrives first', async () => {
    const composed = 'm\u00e9moire.dmp'
    const decomposed = 'me\u0301moire.dmp'
    expect(composed, 'the fixture is one string, so there is nothing to order').not.toBe(decomposed)

    const oneWay = await manifestOf(
      await pack({ 'case.json': bytes('{}') }, 'included', [composed, decomposed]),
    )
    const other = await manifestOf(
      await pack({ 'case.json': bytes('{}') }, 'included', [decomposed, composed]),
    )

    expect(
      oneWay.missing,
      'two exports of one case disagree, so a difference between archives is not a difference ' +
        'in the case',
    ).toEqual(other.missing)
  })

  /**
   * **It is not the attachments field.** One says the analyst chose to leave
   * the artefacts out; the other says the install could not find them. An
   * archive can be either, both, or neither.
   */
  it('is a different statement from whether the attachments travelled', async () => {
    const archive = await pack({ 'case.json': bytes('{}') }, 'omitted', ['memory.dmp'])
    const read = await readArchive(archive, LIMITS)

    expect(read.attachments).toBe('omitted')
    expect(read.missing).toEqual(['memory.dmp'])
  })
})
