/**
 * Comparing a sweep against a recorded baseline.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

/**
 * The fraction of pixels that differ, or `null` when they cannot be compared.
 */
export async function diffRatio(before: string, after: string): Promise<number | null> {
  try {
    const [a, b] = await Promise.all([
      sharp(before).raw().toBuffer({ resolveWithObject: true }),
      sharp(after).raw().toBuffer({ resolveWithObject: true }),
    ])
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) return 1
    let differing = 0
    const channels = a.info.channels
    for (let at = 0; at < a.data.length; at += channels) {
      if (
        a.data[at] !== b.data[at] ||
        a.data[at + 1] !== b.data[at + 1] ||
        a.data[at + 2] !== b.data[at + 2]
      ) {
        differing += 1
      }
    }
    return differing / (a.info.width * a.info.height)
  } catch {
    return null
  }
}

/**
 * Every capture in `after` compared against the same name in `before`.
 */
export async function compare(
  baselineDir: string,
  currentDir: string,
): Promise<{ name: string; ratio: number | null; missing: boolean }[]> {
  let recorded: Set<string>
  try {
    recorded = new Set(await readdir(baselineDir))
  } catch {
    return []
  }
  const out: { name: string; ratio: number | null; missing: boolean }[] = []
  for (const name of (await readdir(currentDir)).filter((one) => one.endsWith('.png')).sort()) {
    if (!recorded.has(name)) {
      out.push({ name, ratio: null, missing: true })
      continue
    }
    out.push({
      name,
      ratio: await diffRatio(join(baselineDir, name), join(currentDir, name)),
      missing: false,
    })
  }
  return out
}

/**
 * Names the baseline holds that this run did not capture.
 */
export async function vanished(baselineDir: string, currentDir: string): Promise<string[]> {
  try {
    const held = new Set(await readdir(currentDir))
    return (await readdir(baselineDir))
      .filter((name) => name.endsWith('.png') && !held.has(name))
      .sort()
  } catch {
    return []
  }
}
