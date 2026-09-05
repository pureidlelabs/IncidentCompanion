/**
 * Memory this machine can still hand out - reclaimable, not `os.freemem()`'s
 * unused. Linux states the same figure as `MemAvailable`.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

/**
 * **Pages the kernel counts as reclaimable, and why each one is.**
 */
const RECLAIMABLE = ['free', 'inactive', 'speculative', 'purgeable'] as const

/**
 * What a container is allowed, and how much of it is in use - the number the
 * process actually dies at, which no host figure is.
 */
export function cgroupFrom(max: string, current: string): { limit: number; used: number } | null {
  const ceiling = max.trim()
  if (ceiling === '' || ceiling === 'max') return null

  const limit = Number(ceiling)
  const used = Number(current.trim())
  if (!Number.isFinite(limit) || !Number.isFinite(used) || limit <= 0) return null
  return { limit, used }
}

/**
 * Bytes available, from a platform's own report - or `null` when it cannot be
 * read, so a caller falls back rather than believing a fabricated number.
 */
export function availableFrom(platform: string, output: string): number | null {
  if (platform === 'darwin') {
    /**
     * **The page size comes out of the header.**
     */
    const page = /page size of (\d+) bytes/.exec(output)
    if (!page?.[1]) return null

    let pages = 0
    let found = 0
    for (const name of RECLAIMABLE) {
      const line = new RegExp(`Pages ${name}[^:]*:\\s+(\\d+)`).exec(output)
      if (line?.[1]) {
        pages += Number(line[1])
        found += 1
      }
    }
    // `free` alone is what this function exists to stop reporting, so one
    // match is not enough to call the parse a success.
    return found >= 2 ? pages * Number(page[1]) : null
  }

  if (platform === 'linux') {
    const line = /MemAvailable:\s+(\d+) kB/.exec(output)
    return line?.[1] ? Number(line[1]) * 1024 : null
  }

  return null
}

/**
 * Reads it from the running machine, or `null`.
 */
export function availableMemory(): number | null {
  try {
    if (process.platform === 'darwin') {
      return availableFrom('darwin', execFileSync('vm_stat', { encoding: 'utf8', timeout: 1000 }))
    }
    if (process.platform === 'linux') {
      return availableFrom('linux', readFileSync('/proc/meminfo', 'utf8'))
    }
  } catch {
    return null
  }
  return null
}

/**
 * The container's own ceiling, when there is one.
 */
export function cgroupMemory(): { limit: number; used: number } | null {
  try {
    return cgroupFrom(
      readFileSync('/sys/fs/cgroup/memory.max', 'utf8'),
      readFileSync('/sys/fs/cgroup/memory.current', 'utf8'),
    )
  } catch {
    return null
  }
}
