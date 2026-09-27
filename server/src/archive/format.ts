/**
 * What a `.iccase` holds - a zip of JSON with the Yjs documents beside it as
 * opaque members - and the bounds an untrusted one is read under.
 *
 * **Everything here treats the archive as hostile.** It arrives from wherever
 * an analyst got it, so the reading side enforces every bound *before*
 * decompressing anything: no absolute or traversing member names, a cap per
 * member, a cap on the total, and a manifest whose digests are checked rather
 * than trusted.
 */
import { createHash } from 'node:crypto'
import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
  configure,
} from '@zip.js/zip.js'

/**
 * **No web workers.** zip.js spawns them when the runtime offers `Worker`, and
 * a pool inside a Nest request handler buys nothing here: the archives are
 * bounded below, and a worker per import is a lifetime this process would then
 * own. Set once at module scope so no caller can forget.
 */
configure({ useWebWorkers: false })

export const MANIFEST_NAME = 'manifest.json'
export const CASE_NAME = 'case.json'
export const PROSE_PREFIX = 'prose/'
/** A note's document, under its note's id; every other `PROSE_PREFIX` member is a report's. */
export const NOTE_PROSE_PREFIX = `${PROSE_PREFIX}casenotes/`
export const EVIDENCE_PREFIX = 'evidence/'

/** The format the reader accepts. Bumped when a member's meaning changes. */
export const ARCHIVE_VERSION = 1

/**
 * What an archive may hold, as the door that read the install states it.
 *
 * A ceiling on what one member may expand to, and on the whole: `unpack`
 * inflates into memory, so both are read off the central directory and refused
 * before a byte is inflated.
 *
 * **No ceiling of its own.** `archive/` is a pure transformation of bytes and
 * reaches nothing, so a number here is a second answer to a question the
 * install already answers -- which is how a 256MB member cap and an attachment
 * setting of the same name came to disagree the moment an operator moved one.
 * -> #588, `policy/keys.ts`
 */
export interface ArchiveLimits {
  memberBytes: number
  totalBytes: number
}

export const MAX_MEMBERS = 10_000

export class BadArchive extends Error {}

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

/**
 * A total order over names, which `localeCompare` alone is not.
 *
 * It answers 0 for distinct strings that differ only by Unicode normalisation,
 * and `Array.prototype.sort` is stable -- so two exports of one case ordered
 * by it alone follow their input order and produce different manifests. The
 * code-unit comparison breaks that tie and never reports two distinct strings
 * as equal.
 */
const byName = (a: string, b: string): number =>
  a.localeCompare(b) || (a < b ? -1 : a > b ? 1 : 0)

/** Whether an untrusted value is the list of names it is declared to be. */
const namesList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((one) => typeof one === 'string')

/**
 * **Whether the attachments travelled, stated rather than inferred.**
 * An archive is two different things - a backup, which loses nothing on
 * re-import, and a handover to a customer or a regulator, which should not
 * carry the incident's own artefacts out of the building. The analyst chooses
 * per export; without this field an import cannot tell a handover from a
 * backup somebody damaged, and would report missing files either way.
 */
export type Attachments = 'included' | 'omitted'

export interface Manifest {
  version: number
  attachments: Attachments
  /**
   * What the case recorded and the install could not find, by name.
   *
   * Absent on an archive written before the field existed, which reads as none.
   * -> `openspec/specs/case-archive/design.md`
   */
  missing?: string[]
  files: Record<string, string>
}

/**
 * A member name that cannot escape wherever it is written.
 *
 * **Checked although nothing here writes a member to disk by its own name** -
 * that is a property of today's callers, and Zip Slip arrives with the first
 * one that does.
 */
function safeMemberName(name: string): void {
  if (!name || name.length > 512) throw new BadArchive('an archive member has an unusable name')
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) {
    throw new BadArchive(`an archive member names an absolute path: ${name}`)
  }
  if (name.split('/').includes('..')) {
    throw new BadArchive(`an archive member climbs out of the archive: ${name}`)
  }
  // A backslash is a separator on the platform an archive may have come from.
  if (name.includes('\\') || name.includes('\0')) {
    throw new BadArchive(`an archive member has an unusable name: ${name}`)
  }
}

export async function pack(
  members: Record<string, Uint8Array>,
  attachments: Attachments,
  /** What was recorded and could not be found, by name. -> `Manifest.missing` */
  missing: readonly string[] = [],
): Promise<Buffer> {
  const files: Record<string, string> = {}
  for (const [name, bytes] of Object.entries(members)) {
    safeMemberName(name)
    files[name] = sha256(bytes)
  }

  // **Sorted here, not by a `JSON.stringify` replacer.** An array replacer is a
  // recursive property *allowlist*, so `["attachments","files","version"]`
  // filtered every entry out of `files` and produced an empty manifest that
  // still parsed - the archive then refused every member it carried.
  const manifest: Manifest = {
    version: ARCHIVE_VERSION,
    attachments,
    // Sorted for the same reason `files` is: two exports of one case produce
    // the same bytes, so a difference between them is a difference in the case.
    missing: [...missing].sort(byName),
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => byName(a, b))),
  }
  const all: Record<string, Uint8Array> = {
    ...members,
    [MANIFEST_NAME]: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  }

  const writer = new ZipWriter(new Uint8ArrayWriter(), { level: 6 })
  for (const [name, bytes] of Object.entries(all)) {
    await writer.add(name, new Uint8ArrayReader(bytes))
  }
  return Buffer.from(await writer.close())
}

/**
 * Read the zip back, under every bound, with the manifest verified.
 *
 * **The digests are checked here rather than by the caller**, because a caller
 * that forgets is a caller that imports a member somebody swapped. A manifest
 * naming a member the archive does not carry is equally a refusal: the
 * difference between "not shipped" and "removed in transit" is exactly what the
 * manifest exists to state.
 */
export async function unpack(
  archive: Buffer,
  limits: ArchiveLimits,
): Promise<{ members: Record<string, Uint8Array>; manifest: Manifest }> {
  const members: Record<string, Uint8Array> = {}
  const reader = new ZipReader(new Uint8ArrayReader(archive))

  try {
    // **Every bound is checked against the central directory, before a byte is
    // inflated.** `getEntries` reads the directory alone, so an archive
    // *claiming* a 40GB member is refused on its claim, rather than bounded
    // member by member as each arrives.
    //
    // **A directory that lies the other way is caught by zip.js, not here.**
    // Measured 2026-08-14 on a 400MB bomb patched to claim 100 bytes: refused
    // in 6ms with flat RSS, `Invalid uncompressed size`, before this loop or
    // the digest check saw it. Worth naming because the digest check reads like
    // the backstop and is not the thing that fires.
    const entries = await reader.getEntries()
    if (entries.length > MAX_MEMBERS) {
      throw new BadArchive('this archive holds too many members')
    }
    let total = 0
    for (const entry of entries) {
      safeMemberName(entry.filename)
      const size = entry.uncompressedSize
      if (size > limits.memberBytes) {
        throw new BadArchive(`${entry.filename} is larger than an archive member may be`)
      }
      total += size
      if (total > limits.totalBytes) {
        throw new BadArchive('this archive expands to more than the import ceiling')
      }
    }

    for (const entry of entries) {
      if (entry.directory) continue
      members[entry.filename] = await entry.getData(new Uint8ArrayWriter())
    }
  } catch (error) {
    if (error instanceof BadArchive) throw error
    throw new BadArchive('this file is not a readable case archive')
  } finally {
    await reader.close()
  }

  const rawManifest = members[MANIFEST_NAME]
  if (!rawManifest) throw new BadArchive('this archive carries no manifest')

  let manifest: Manifest
  try {
    manifest = JSON.parse(Buffer.from(rawManifest).toString('utf8')) as Manifest
  } catch {
    throw new BadArchive("this archive's manifest is unreadable")
  }
  if (manifest.version !== ARCHIVE_VERSION) {
    throw new BadArchive(
      `this archive is version ${String(manifest.version)} and this build reads ${String(ARCHIVE_VERSION)}`,
    )
  }
  if (!manifest.files || typeof manifest.files !== 'object') {
    throw new BadArchive("this archive's manifest lists no files")
  }
  if (manifest.attachments !== 'included' && manifest.attachments !== 'omitted') {
    throw new BadArchive("this archive's manifest does not say whether its files travelled")
  }
  // Absent is a statement an older archive could not make; present and not a
  // list of names is one somebody edited, and `readArchive` hands it out
  // declared `string[]` to callers that will treat it as one.
  if (manifest.missing !== undefined && !namesList(manifest.missing)) {
    throw new BadArchive("this archive's manifest does not say what it could not find")
  }

  for (const [name, digest] of Object.entries(manifest.files)) {
    const bytes = members[name]
    if (!bytes) throw new BadArchive(`${name} is named in the manifest and missing`)
    if (sha256(bytes) !== digest) {
      throw new BadArchive(`${name} does not match the digest the manifest names for it`)
    }
  }

  // **A member the manifest does not name is a refusal too.** An archive that
  // gained a file after it was written is one somebody else has edited, and
  // taking the manifest as a lower bound rather than the whole truth is how an
  // unlisted member gets imported.
  for (const name of Object.keys(members)) {
    if (name !== MANIFEST_NAME && !Object.hasOwn(manifest.files, name)) {
      throw new BadArchive(`${name} is in this archive and not in its manifest`)
    }
  }

  return { members, manifest }
}

export async function readArchive(
  archive: Buffer,
  limits: ArchiveLimits,
): Promise<{
  members: Record<string, Uint8Array>
  attachments: Attachments
  /** What the archive says was recorded and could not be found. */
  missing: string[]
}> {
  const { members, manifest } = await unpack(archive, limits)
  // **Absent reads as none**, which is what an archive written before the
  // field existed meant. -> `Manifest.missing`
  return { members, attachments: manifest.attachments, missing: manifest.missing ?? [] }
}
