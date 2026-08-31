/**
 * What `GET /api/health/resources` reports, and who may ask.
 *
 * **The first test is the one that matters: this route is not public.** Its
 * sibling `/api/health` is, because a probe has no session - and the reflex
 * that made that one public is exactly what would make this one public too.
 * Free disk, load average and heap size describe the machine rather than the
 * app, and there is no reason an unauthenticated caller should have them.
 */
import { describe, expect, it } from 'vitest'

import { HealthController } from './health.controller.js'
import { ResourcesController, cpuPercent, diskSnapshot } from './resources.controller.js'

const isPublic = (target: object, method: string): boolean =>
  Reflect.getMetadata('PUBLIC', (target as Record<string, () => unknown>)[method]!) === true

describe('who may read the machine', () => {
  it('does not mark the resources route public', () => {
    expect(isPublic(ResourcesController.prototype, 'read')).toBe(false)
  })

  /**
   * **The control for the test above.** Without it, a rename of the metadata
   * key would make `isPublic` answer false for everything and the assertion
   * would pass while guarding nothing.
   */
  it('does mark the readiness probe public, which is what makes that check real', () => {
    expect(isPublic(HealthController.prototype, 'check')).toBe(true)
  })
})

describe('turning two CPU samples into a percentage', () => {
  const sample = (user: number, system: number) => ({ user, system })

  /**
   * **Null rather than zero on the first call.** Zero is a number a reader
   * believes - it says the machine is idle - and the truth is that nothing has
   * been measured yet.
   */
  it('reports nothing when there is no previous sample', () => {
    expect(cpuPercent(undefined, sample(0, 0), 1000, 4)).toBeNull()
  })

  /** Two samples at the same instant divide by zero and yield Infinity. */
  it('reports nothing when no time has passed', () => {
    expect(cpuPercent({ usage: sample(0, 0), at: 1000 }, sample(50, 50), 1000, 4)).toBeNull()
  })

  /**
   * Two cores' worth of work over a second, on a four-core machine, is half
   * the machine. The arithmetic is in microseconds against milliseconds, which
   * is a thousand-fold error waiting to happen in either direction.
   */
  it('reads two busy cores of four as half the machine', () => {
    const previous = { usage: sample(0, 0), at: 0 }
    // 2 cores x 1s = 2,000,000 microseconds of CPU across 1000ms of wall clock.
    expect(cpuPercent(previous, sample(1_500_000, 500_000), 1000, 4)).toBe(50)
  })

  it('reads one busy core of one as the whole machine', () => {
    expect(cpuPercent({ usage: sample(0, 0), at: 0 }, sample(1_000_000, 0), 1000, 1)).toBe(100)
  })

  it('counts system time as well as user time', () => {
    const onlyUser = cpuPercent({ usage: sample(0, 0), at: 0 }, sample(400_000, 0), 1000, 1)
    const both = cpuPercent({ usage: sample(0, 0), at: 0 }, sample(400_000, 400_000), 1000, 1)
    expect(both).toBeGreaterThan(onlyUser!)
  })

  /**
   * A counter that appears to go backwards - a sample taken across a resumed
   * process, or two callers racing - must not produce a negative percentage.
   */
  it('never reports a negative share', () => {
    expect(cpuPercent({ usage: sample(900_000, 0), at: 0 }, sample(100_000, 0), 1000, 1)).toBe(0)
  })
})

describe('reading free space', () => {
  it('reports bytes for a directory that exists', async () => {
    const disk = await diskSnapshot(process.cwd())
    expect(disk).not.toBeNull()
    expect(disk!.freeBytes).toBeGreaterThan(0)
    expect(disk!.totalBytes).toBeGreaterThanOrEqual(disk!.freeBytes)
  })

  /**
   * **A missing evidence directory is ordinary on a fresh install**, and it
   * must not take the whole route down - the memory and CPU numbers beside it
   * are still true and still worth reading.
   */
  it('reports nothing rather than throwing when the path is absent', async () => {
    await expect(diskSnapshot('/nowhere/at/all/definitely-not-here')).resolves.toBeNull()
  })
})

describe('what the payload carries', () => {
  const configOf = (values: Record<string, unknown>) =>
    ({ get: (key: string) => values[key] }) as never

  it('reports memory as numbers rather than formatted strings', async () => {
    const out = await new ResourcesController(configOf({ EVIDENCE_DIR: process.cwd() })).read()
    /**
     * **Re-anchored: two of these are nullable now, and `typeof null` is
     * `'object'`.** The property is unchanged - no figure is a formatted
     * string, because a screen that has to parse "1.2 GB" cannot draw a bar -
     * but the container ceiling is absent outside a container, and absent has
     * to be expressible.
     */
    const NULLABLE = new Set(['containerLimitBytes', 'containerUsedBytes'])
    for (const [name, value] of Object.entries(out.memory)) {
      if (NULLABLE.has(name) && value === null) continue
      expect(typeof value, name).toBe('number')
    }
    expect(out.memory.rssBytes).toBeGreaterThan(0)
    expect(out.memory.systemTotalBytes).toBeGreaterThan(out.memory.rssBytes)
  })

  /**
   * **No path, on a route that reads one.** The evidence directory is an
   * absolute path on the analyst's machine; the free space on it is the
   * useful number and the location is not, so the label says which filesystem
   * without naming it.
   */
  it('names no filesystem path anywhere in the payload', async () => {
    const secret = process.cwd()
    const out = await new ResourcesController(configOf({ EVIDENCE_DIR: secret })).read()
    expect(JSON.stringify(out)).not.toContain(secret)
  })

  it('reports the process uptime and the core count', async () => {
    const out = await new ResourcesController(configOf({})).read()
    expect(out.uptimeSeconds).toBeGreaterThan(0)
    expect(out.cpu.cores).toBeGreaterThan(0)
  })

  /**
   * The percentage needs two samples, so the first read cannot have one - and
   * the second, taken against the first, can.
   */
  it('has no CPU share on the first read and one on the second', async () => {
    const controller = new ResourcesController(configOf({}))
    expect((await controller.read()).cpu.processPercent).toBeNull()
    await new Promise((done) => setTimeout(done, 25))
    expect((await controller.read()).cpu.processPercent).not.toBeNull()
  })
})
