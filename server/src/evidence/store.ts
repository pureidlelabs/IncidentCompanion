/**
 * Where an attached artefact's bytes live: on disk, content-addressed, with
 * the digest as the filename and the row keeping the metadata.
 */
import { ATTACHMENT_MEGABYTES } from '../policy/keys.js'
import { createHash } from 'node:crypto'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'

import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js'
import { Inject, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../config/env.js'

/**
 * The default attachment ceiling. The live one is `evidence.attachmentMegabytes`.
 */
export const MAX_ATTACHMENT_BYTES = ATTACHMENT_MEGABYTES * 1024 * 1024

/**
 * **The convention, not a secret.**
 */
export const ARTEFACT_PASSWORD = 'infected'

export interface StoredArtefact {
  readonly hash: string
  readonly hashAlgorithm: 'sha256'
  readonly sizeBytes: number
}

@Injectable()
export class EvidenceStore {
  private readonly log = new Logger(EvidenceStore.name)
  private readonly root: string

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.root = config.get('EVIDENCE_DIR', { infer: true }) ?? '.evidence'
  }

  /**
   * Take a stream, hash it as it lands, and keep it under its digest. Caps
   * while reading, so an oversized upload throws before it is all in memory.
   */
  async put(source: AsyncIterable<Buffer>, name?: string): Promise<StoredArtefact> {
    await mkdir(this.root, { recursive: true })

    const digest = createHash('sha256')
    const chunks: Buffer[] = []
    let size = 0

    for await (const chunk of source) {
      size += chunk.length
      if (size > MAX_ATTACHMENT_BYTES) {
        throw new PayloadTooLargeException({
          message:
            `An attachment is at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB. ` +
            'Record where a larger artefact is held instead of attaching it.',
        })
      }
      digest.update(chunk)
      chunks.push(chunk)
    }

    const hash = digest.digest('hex')
    const held = join(this.root, hash)

    // Already here means identical content, since the name is the plaintext
    // digest. The stored *zip* is not byte-stable - AES uses a fresh salt per
    // entry - so this check has to be on the name and never on the file.
    if (!(await this.exists(hash))) {
      const partial = `${held}.${process.pid}.partial`
      await writeFile(partial, await this.wrap(Buffer.concat(chunks), name ?? hash))
      await rename(partial, held)
    }

    return { hash, hashAlgorithm: 'sha256', sizeBytes: size }
  }

  /**
   * One AES-256 zip per artefact, under `ARTEFACT_PASSWORD`, so endpoint AV
   * cannot quarantine the file out from under its row.
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
   */
  async open(hash: string): Promise<NodeJS.ReadableStream | null> {
    if (!isDigest(hash) || !(await this.exists(hash))) return null
    return createReadStream(join(this.root, hash))
  }

  /**
   * The whole artefact as bytes, or null when this install does not hold it.
   */
  async read(hash: string): Promise<Uint8Array | null> {
    const sealed = await this.sealedBytes(hash)
    return sealed === null ? null : await this.unwrap(sealed)
  }

  /** The one entry out of a stored zip. */
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

  private async sealedBytes(hash: string): Promise<Uint8Array | null> {
    const stream = await this.open(hash)
    if (!stream) return null
    const chunks: Buffer[] = []
    for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
    return new Uint8Array(Buffer.concat(chunks))
  }

  /**
   * Re-read an artefact and check it still hashes to its name.
   */
  async verify(hash: string): Promise<boolean> {
    // **Hashes the artefact, never the container.** The stored zip carries a
    // fresh AES salt per write, so its own bytes hash differently every time
    // and comparing them would fail on a file that is perfectly intact.
    let plain: Uint8Array | null
    try {
      plain = await this.read(hash)
    } catch {
      // An unreadable container is a failed integrity check, not an error to
      // propagate: the caller asked whether this artefact is still sound.
      return false
    }
    if (plain === null) return false
    return createHash('sha256').update(plain).digest('hex') === hash
  }

  /**
   * Forget an artefact.
   */
  async forget(hash: string): Promise<void> {
    if (!isDigest(hash)) return
    await rm(join(this.root, hash), { force: true })
  }

  private async exists(hash: string): Promise<boolean> {
    try {
      await stat(join(this.root, hash))
      return true
    } catch {
      return false
    }
  }
}

/**
 * **A path is built from this, so it is checked.** A caller-supplied name
 * reaching `join()` is a traversal; sixty-four hex characters cannot be one.
 */
export function isDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}
