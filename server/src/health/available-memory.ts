/**
 * Memory this machine can still hand out - reclaimable, not `os.freemem()`'s
 * unused. Linux states the same figure as `MemAvailable`.
 *
 * Parsing is kept separate from reading the file, so the arithmetic can be
 * asserted against captured output rather than against the running machine.
 */
import { readFileSync } from 'node:fs'

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
 * Bytes available, from `/proc/meminfo` - or `null` when it does not say, so
 * a caller falls back rather than believing a fabricated number.
 */
export function availableFrom(meminfo: string): number | null {
  const line = /MemAvailable:\s+(\d+) kB/.exec(meminfo)
  return line?.[1] ? Number(line[1]) * 1024 : null
}

/**
 * Reads it from the running machine, or `null` where there is no
 * `/proc/meminfo`, which is every host the container does not run on.
 */
export function availableMemory(): number | null {
  try {
    return availableFrom(readFileSync('/proc/meminfo', 'utf8'))
  } catch {
    return null
  }
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
