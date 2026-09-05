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
export const EVIDENCE_PREFIX = 'evidence/'

/** The format the reader accepts. Bumped when a member's meaning changes. */
export const ARCHIVE_VERSION = 1

/**
 * A ceiling on what one member may expand to, and on the whole. `unpack`
 * inflates into memory, so both are read off the central directory and refused
 * before a byte is inflated.
 */
export const MAX_MEMBER_BYTES = 256 * 1024 * 1024
export const MAX_TOTAL_BYTES = 512 * 1024 * 1024
export const MAX_MEMBERS = 10_000

export class BadArchive extends Error {}

export const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

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

/** Build the zip, with a manifest naming the digest of everything in it. */
export async function pack(
  members: Record<string, Uint8Array>,
  attachments: Attachments,
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
    files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
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
export async function unpack(archive: Buffer): Promise<Record<string, Uint8Array>> {
  const members: Record<string, Uint8Array> = {}
  const reader = new ZipReader(new Uint8ArrayReader(archive))

  try {
    // **Every bound is checked against the central directory, before a byte is
    // inflated.** `getEntries` reads the directory alone, so an archive
    // *claiming* a 40GB member is refused on its claim - where the previous
    // reader could only bound each member as it arrived at the filter.
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
      if (size > MAX_MEMBER_BYTES) {
        throw new BadArchive(`${entry.filename} is larger than an archive member may be`)
      }
      total += size
      if (total > MAX_TOTAL_BYTES) {
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
    if (name !== MANIFEST_NAME && !(name in manifest.files)) {
      throw new BadArchive(`${name} is in this archive and not in its manifest`)
    }
  }

  return members
}

/** What `unpack` found, with the manifest's own statement beside it. */
export async function readArchive(archive: Buffer): Promise<{
  members: Record<string, Uint8Array>
  attachments: Attachments
}> {
  const members = await unpack(archive)
  const manifest = JSON.parse(
    Buffer.from(members[MANIFEST_NAME]!).toString('utf8'),
  ) as Manifest
  return { members, attachments: manifest.attachments }
}
