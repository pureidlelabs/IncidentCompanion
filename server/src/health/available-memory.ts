/**
 * Memory this machine can still hand out - reclaimable, not `os.freemem()`'s
 * unused. Linux states the same figure as `MemAvailable`.
 *
 * Parsing is kept separate from reading the file, so the arithmetic can be
 * asserted against captured output rather than against the running machine.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

/**
 * **Pages the kernel counts as reclaimable, and why each one is.**
 *
 * - `free` - never used.
 * - `inactive` - cache not touched recently; the first thing evicted.
 * - `speculative` - read ahead on a guess; dropped without a second thought.
 * - `purgeable` - the application said outright it can be thrown away.
 *
 * `wired down` and `active` are deliberately absent: wired cannot be paged at
 * all, and active is in use by something now.
 */
const RECLAIMABLE = ['free', 'inactive', 'speculative', 'purgeable'] as const

/**
 * What a container is allowed, and how much of it is in use - the number the
 * process actually dies at, which no host figure is.
 *
 * Reads cgroup v2 only. Returns `null` for an unconstrained container, which
 * spells its `memory.max` as the literal string `max`.
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
     * **The page size comes out of the header.** Apple Silicon uses 16 KiB and
     * Intel 4 KiB; assuming either is a four-fold error on the other, in a
     * figure somebody would act on.
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
 *
 * **Every failure answers null rather than throwing.** This is one figure on a
 * health screen; a `vm_stat` that is missing, slow or unreadable must not take
 * the route down with it - the caller falls back to `os.freemem()`, which is
 * pessimistic and never wrong in the dangerous direction.
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
 *
 * **Read before the host's figures, not after.** Inside a container the host
 * numbers describe a machine this process cannot use all of, and reporting
 * them is how a service that is about to be killed for exceeding 512 MiB shows
 * 7 GiB free.
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
