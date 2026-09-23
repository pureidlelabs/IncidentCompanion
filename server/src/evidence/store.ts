/**
 * Where an attached artefact's bytes live: on disk, one directory per case,
 * content-addressed within it, with the row keeping the metadata.
 *
 * **Every method reaching an artefact takes the case**, and nothing else opens
 * the directory: `only-the-store-opens-the-evidence-directory.test.ts`.
 * -> `openspec/specs/state/design.md`
 *
 * Nothing is ever overwritten - a write to a digest the case holds leaves the
 * file as it is. The cap says what this is for: a screenshot, an `.eml`, a log
 * export.
 */
import { ATTACHMENT_MEGABYTES } from '../policy/keys.js'
import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { basename, join } from 'node:path'

import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js'
import { Inject, Injectable, PayloadTooLargeException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../config/env.js'
import { PolicyService } from '../policy/policy.service.js'

/**
 * The attachment ceiling a fresh install starts with.
 *
 * **A default, and no longer what `put` caps against**: that is
 * `evidence.attachmentMegabytes`, read per act. Kept because the streaming
 * case measures against a known number, and named so nobody reads it as the
 * limit. -> #588
 *
 * **A ceiling, not a target.** Anything larger belongs in an evidence locker
 * with its path in `location` - the app is not a repository for disk images,
 * and a 20GB upload through Node would hold a request open long enough to look
 * like a hang.
 */
export const MAX_ATTACHMENT_BYTES = ATTACHMENT_MEGABYTES * 1024 * 1024

/**
 * **The convention, not a secret.** Every sample repository ships malware under
 * this password - VirusTotal, MalwareBazaar - so an analyst who meets it knows
 * what it means without being told, and their own tooling already opens it.
 */
export const ARTEFACT_PASSWORD = 'infected'

export interface StoredArtefact {
  readonly hash: string
  readonly hashAlgorithm: 'sha256'
  readonly sizeBytes: number
}

/** An artefact hashed and sealed, not yet kept in any case. */
export interface SealedArtefact extends StoredArtefact {
  readonly sealed: Buffer
}

/**
 * The last act queued on each case's artefacts, keyed by its directory.
 *
 * **Module-wide rather than per store**: every module providing the store
 * builds its own, and a delete and an attach arrive through different ones.
 */
// ponytail: one process writes the evidence; a second writer needs an advisory lock per case.
const queued = new Map<string, Promise<unknown>>()

@Injectable()
export class EvidenceStore {
  private readonly root: string

  constructor(
    @Inject(ConfigService) config: ConfigService<Env, true>,
    private readonly policy: PolicyService,
  ) {
    this.root = config.get('EVIDENCE_DIR', { infer: true })
  }

  /** Seal what arrives and keep it in the case: `seal`, then `keep`. */
  async put(
    caseId: string,
    source: AsyncIterable<Buffer>,
    name?: string,
    /**
     * The ceiling to cap against, where the caller has already read it.
     *
     * **Passed in by a caller writing more than one artefact.** An archive may
     * hold 10,000 members and `put` is called for each, so reading the policy
     * here made an import `1 + N` round trips for a bound that cannot change
     * mid-import.
     */
    ceilingBytes?: number,
  ): Promise<StoredArtefact> {
    const sealed = await this.seal(source, name, ceilingBytes)
    await this.keep(caseId, sealed)
    return { hash: sealed.hash, hashAlgorithm: sealed.hashAlgorithm, sizeBytes: sealed.sizeBytes }
  }

  /**
   * Take a stream, hash it as it lands, and seal it in memory. Writes nothing.
   * Caps while reading, so an oversized upload throws before it is all in
   * memory.
   */
  async seal(
    source: AsyncIterable<Buffer>,
    name?: string,
    ceilingBytes?: number,
  ): Promise<SealedArtefact> {
    /**
     * **Read before the stream, because the cap fires while reading it**, and
     * read per upload rather than at boot: the ceiling is a setting an
     * operator can raise, and a constant here is what let them raise it and
     * still meet a refusal quoting the old number. -> #588, `policy/read.ts`
     */
    const ceiling =
      ceilingBytes ?? (await this.policy.read())['evidence.attachmentMegabytes'] * 1024 * 1024

    const digest = createHash('sha256')
    const chunks: Buffer[] = []
    let size = 0

    for await (const chunk of source) {
      size += chunk.length
      if (size > ceiling) {
        throw new PayloadTooLargeException({
          message:
            `An attachment is at most ${String(ceiling / 1024 / 1024)}MB. ` +
            'Record where a larger artefact is held instead of attaching it.',
        })
      }
      digest.update(chunk)
      chunks.push(chunk)
    }

    const hash = digest.digest('hex')
    const sealed = await this.wrap(Buffer.concat(chunks), memberName(name, hash))
    return { hash, hashAlgorithm: 'sha256', sizeBytes: size, sealed }
  }

  /**
   * Keep a sealed artefact under its digest in this case, unless the case
   * already holds that digest.
   *
   * Written to a temporary name and renamed, so a failed write never leaves a
   * partial file at the digest.
   */
  async keep(caseId: string, artefact: SealedArtefact): Promise<void> {
    const dir = this.caseDir(caseId)
    await mkdir(dir, { recursive: true })
    const held = join(dir, artefact.hash)
    // Already here means identical content, since the name is the plaintext
    // digest. The stored *zip* is not byte-stable - AES uses a fresh salt per
    // entry - so this check has to be on the name and never on the file.
    if (await exists(held)) return
    const partial = `${held}.${process.pid}.partial`
    await writeFile(partial, artefact.sealed)
    await rename(partial, held)
  }

  /**
   * Run `act` with no other act on this case's artefacts running beside it,
   * in the order they were asked for. A failed act does not hold up the next.
   */
  async exclusive<T>(caseId: string, act: () => Promise<T>): Promise<T> {
    const key = this.caseDir(caseId)
    const run = (queued.get(key) ?? Promise.resolve()).then(act)
    const settled = run.then(
      () => undefined,
      () => undefined,
    )
    queued.set(key, settled)
    try {
      return await run
    } finally {
      if (queued.get(key) === settled) queued.delete(key)
    }
  }

  /** The digests this case holds. */
  async held(caseId: string): Promise<Set<string>> {
    const names = await readdir(this.caseDir(caseId)).catch(() => [])
    return new Set(names.filter(isDigest))
  }

  /** Remove everything this case holds. */
  async discardCase(caseId: string): Promise<void> {
    await rm(this.caseDir(caseId), { recursive: true, force: true })
  }

  /** Remove these digests from this case, and the case's directory once it is empty. */
  async forget(caseId: string, hashes: Iterable<string>): Promise<void> {
    const dir = this.caseDir(caseId)
    for (const hash of hashes) {
      if (!isDigest(hash)) throw new Error(`${JSON.stringify(hash)} is not a digest`)
      await rm(join(dir, hash), { force: true })
    }
    await rmdir(dir).catch(() => undefined)
  }

  /**
   * How many digest-named files the directory holds that `named` does not
   * name: in a case of `named` whose set leaves them out, in a case absent
   * from `named`, or outside any case. Reads names and removes nothing.
   */
  async unnamed(named: ReadonlyMap<string, ReadonlySet<string>>): Promise<number> {
    let count = 0
    for (const entry of await readdir(this.root, { withFileTypes: true }).catch(() => [])) {
      if (entry.isFile() && isDigest(entry.name)) count += 1
      if (!entry.isDirectory() || !isCaseId(entry.name)) continue
      const keep = named.get(entry.name)
      for (const file of await readdir(join(this.root, entry.name))) {
        if (isDigest(file) && !keep?.has(file)) count += 1
      }
    }
    return count
  }

  /**
   * One AES-256 zip per artefact, under `ARTEFACT_PASSWORD`, so endpoint AV
   * cannot quarantine the file out from under its row. Neutering, not
   * confidentiality - the password is public.
   */
  private async wrap(plain: Buffer, entryName: string): Promise<Buffer> {
    const writer = new ZipWriter(new Uint8ArrayWriter(), {
      password: ARTEFACT_PASSWORD,
      encryptionStrength: 3,
    })
    await writer.add(entryName, new Uint8ArrayReader(plain))
    return Buffer.from(await writer.close())
  }

  /**
   * **The stored zip, streamed as it sits - not the artefact inside it.**
   * That is what a download serves: the analyst gets the file in a zip under
   * `infected`, which is the form their own tooling expects and the form that
   * survives the trip past their AV. Callers wanting the bytes want `read`.
   */
  async open(caseId: string, hash: string): Promise<NodeJS.ReadableStream | null> {
    const held = join(this.caseDir(caseId), hash)
    if (!isDigest(hash) || !(await exists(held))) return null
    return createReadStream(held)
  }

  /**
   * The whole artefact as bytes, or null when this install does not hold it.
   *
   * **For the archive, which is assembled in memory anyway.** Streaming is the
   * right shape for a download, where the bytes go straight out; an export has
   * to hold the zip to seal it, so a stream here would only be drained
   * immediately by every caller that has one.
   */
  async read(caseId: string, hash: string): Promise<Uint8Array | null> {
    const sealed = await this.sealedBytes(caseId, hash)
    return sealed === null ? null : await this.unwrap(sealed)
  }

  private async unwrap(sealed: Uint8Array): Promise<Uint8Array> {
    const reader = new ZipReader(new Uint8ArrayReader(sealed), {
      password: ARTEFACT_PASSWORD,
    })
    try {
      const [entry] = await reader.getEntries()
      // A directory entry has no `getData`, and nothing here writes one - but
      // the type is a union, so the narrowing is the check that says so.
      if (!entry || entry.directory) throw new Error('a stored artefact holds no entry')
      return await entry.getData(new Uint8ArrayWriter())
    } finally {
      await reader.close()
    }
  }

  private async sealedBytes(caseId: string, hash: string): Promise<Uint8Array | null> {
    const stream = await this.open(caseId, hash)
    if (!stream) return null
    const chunks: Buffer[] = []
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
    return new Uint8Array(Buffer.concat(chunks))
  }

  /**
   * Re-read an artefact and check it still hashes to its name.
   *
   * **The only honest integrity check.** Comparing a stored digest against a
   * stored digest proves nothing; this reads the bytes.
   */
  async verify(caseId: string, hash: string): Promise<boolean> {
    // **Hashes the artefact, never the container.** The stored zip carries a
    // fresh AES salt per write, so its own bytes hash differently every time
    // and comparing them would fail on a file that is perfectly intact.
    let plain: Uint8Array | null
    try {
      plain = await this.read(caseId, hash)
    } catch {
      // An unreadable container is a failed integrity check, not an error to
      // propagate: the caller asked whether this artefact is still sound.
      return false
    }
    if (plain === null) return false
    return createHash('sha256').update(plain).digest('hex') === hash
  }

  /** Where one case's artefacts live. Throws for anything that is not a case id. */
  private caseDir(caseId: string): string {
    if (!isCaseId(caseId)) throw new Error(`${JSON.stringify(caseId)} is not a case id`)
    return join(this.root, caseId.toLowerCase())
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** A caller's filename cut to its last segment (either slash), or the digest when none is left. */
function memberName(name: string | undefined, digest: string): string {
  const last = basename((name ?? '').replaceAll('\\', '/')).replaceAll('\0', '')
  return last === '' || last === '.' || last === '..' ? digest : last
}

/**
 * **A path is built from this, so it is checked.** A caller-supplied name
 * reaching `join()` is a traversal; sixty-four hex characters cannot be one.
 */
export function isDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}

/** The same guard for the directory a case's artefacts live in. */
function isCaseId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
