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

import { MANIFEST_NAME, pack, readArchive, type Manifest } from './format.js'

const LIMITS = { memberBytes: 8 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 }

const bytes = (what: string) => new TextEncoder().encode(what)

/** The manifest as it was written, read back out of the archive itself. */
async function manifestOf(archive: Buffer): Promise<Manifest> {
  const { members } = await readArchive(archive, LIMITS)
  return JSON.parse(Buffer.from(members[MANIFEST_NAME]!).toString('utf8')) as Manifest
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

  /**
   * **An archive that found everything says so by carrying an empty list.**
   *
   * **An archive written before the field existed carries nothing, and reads
   * as the same answer** -- which is what it meant, since those exports named
   * unfound artefacts in a response header and nowhere else. That is why the
   * field is optional and `ARCHIVE_VERSION` does not move: bumping it would
   * refuse every archive an install already holds, to add a statement those
   * archives were never able to make.
   */
  it('says nothing was missing when nothing was', async () => {
    const archive = await pack({ 'case.json': bytes('{}') }, 'included')

    expect((await manifestOf(archive)).missing).toEqual([])
    expect((await readArchive(archive, LIMITS)).missing).toEqual([])
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
