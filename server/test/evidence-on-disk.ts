/**
 * The evidence directory read from outside the application, by content rather
 * than by layout, so a test asking "is this artefact still held anywhere"
 * cannot pass because the store moved where it keeps things.
 */
import { readdir, readFile, utimes } from 'node:fs/promises'
import { join } from 'node:path'

import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js'

import { ARTEFACT_PASSWORD, EvidenceStore } from '../src/evidence/store.js'
import { defaultPolicy } from '../src/policy/read.js'

async function files(root: string): Promise<string[]> {
  const found = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => [])
  return found.filter((one) => one.isFile()).map((one) => join(one.parentPath, one.name))
}

async function unwrapped(path: string): Promise<Buffer | null> {
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(await readFile(path))), {
    password: ARTEFACT_PASSWORD,
  })
  try {
    const [entry] = await reader.getEntries()
    return entry && !entry.directory ? Buffer.from(await entry.getData(new Uint8ArrayWriter())) : null
  } catch {
    return null
  } finally {
    await reader.close()
  }
}

/** Every file under `root` whose sealed artefact is exactly `bytes`. */
export async function holders(root: string, bytes: Uint8Array): Promise<string[]> {
  const out: string[] = []
  for (const path of await files(root)) {
    if ((await unwrapped(path))?.equals(bytes)) out.push(path)
  }
  return out
}

/** Backdates every file under `root` by `hours`, except those in `spared`. */
export async function age(root: string, hours: number, spared: readonly string[] = []): Promise<void> {
  const then = new Date(Date.now() - hours * 3_600_000)
  for (const path of await files(root)) {
    if (!spared.includes(path)) await utimes(path, then, then)
  }
}

/** The store over the suite's evidence directory, for a service a test builds by hand. */
export function suiteStore(): EvidenceStore {
  return new EvidenceStore(
    { get: () => process.env['EVIDENCE_DIR'] } as never,
    { read: () => Promise.resolve(defaultPolicy()) } as never,
  )
}
