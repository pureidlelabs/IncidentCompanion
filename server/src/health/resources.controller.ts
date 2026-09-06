/**
 * `GET /api/health/resources` - how hard this install is working.
 *
 * Authenticated, unlike `/api/health`, because these numbers describe the host
 * rather than the app. Reports them and judges none, so nothing here can
 * answer 503.
 *
 * **No path appears in the payload.** The free space is measured on the
 * evidence directory, an absolute path on the analyst's machine.
 */
import { Controller, Get, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { z } from 'zod'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { statfs } from 'node:fs/promises'
import { cpus, freemem, loadavg, totalmem } from 'node:os'

import type { Env } from '../config/env.js'
import { availableMemory, cgroupMemory } from './available-memory.js'

/**
 * **The schema is the source; the type is inferred from it.** The reference
 * publishes this by name, and a hand-kept interface beside it is the copy that
 * ends up describing a field the route stopped sending.
 */
export const resourcesSchema = z.object({
  uptimeSeconds: z.number().int(),
  memory: z.object({
    rssBytes: z.number().int(),
    heapUsedBytes: z.number().int(),
    heapTotalBytes: z.number().int(),
    systemTotalBytes: z.number().int(),
    /**
     * **What is still usable, which is not what is unused.** `os.freemem()`
     * counts only untouched pages; a healthy machine keeps almost everything as
     * reclaimable cache, so it reads near zero and the bar pins at 100%.
     * -> `available-memory.ts`
     */
    systemFreeBytes: z.number().int(),
    /**
     * **Set only in a container, and then it is the number that matters.**
     * Inside one, `systemTotalBytes` is the host's - or on macOS the Docker
     * VM's - and neither is what the process is killed for exceeding. Null
     * outside a container, so the screen can tell "no ceiling" from "a very
     * large one".
     */
    containerLimitBytes: z.number().int().nullable(),
    containerUsedBytes: z.number().int().nullable(),
  }),
  cpu: z.object({
    cores: z.number().int(),
    /** One, five and fifteen minute averages. Zeroes on Windows, which has none. */
    loadAverage: z.tuple([z.number(), z.number(), z.number()]),
    /**
     * This process's share of the whole machine since the previous read, or
     * null when there has not been one. **Null rather than zero** - zero is a
     * number a reader believes, and it says the process is idle rather than
     * that nothing has been measured.
     */
    processPercent: z.number().nullable(),
  }),
  /** Free space where evidence is written, or null when that path is absent. */
  disk: z
    .object({
      totalBytes: z.number().int(),
      freeBytes: z.number().int(),
      where: z.literal('evidence'),
    })
    .nullable(),
})

export type Resources = z.infer<typeof resourcesSchema>

export class ResourcesDto extends createZodDto(resourcesSchema) {}

interface Sample {
  usage: { user: number; system: number }
  at: number
}

/**
 * This process's share of the machine between two samples, as a percentage.
 *
 * **Microseconds against milliseconds**, which is a thousand-fold error in
 * either direction if the units are crossed. Divided by the core count, so
 * "100" means the whole machine rather than one core of it.
 */
export function cpuPercent(
  previous: Sample | undefined,
  usage: { user: number; system: number },
  at: number,
  cores: number,
): number | null {
  if (!previous) return null
  const elapsedMs = at - previous.at
  if (elapsedMs <= 0 || cores <= 0) return null
  const usedMs = (usage.user + usage.system - previous.usage.user - previous.usage.system) / 1000
  // A counter that appears to run backwards - a resumed process, two callers
  // racing - must not surface as a negative share.
  const share = (usedMs / (elapsedMs * cores)) * 100
  return Math.max(0, Math.round(share * 10) / 10)
}

/**
 * Free and total bytes on the filesystem holding `path`.
 *
 * **Null rather than a throw when the path is absent**, which is ordinary on a
 * fresh install: the memory and CPU numbers beside it are still true, and
 * losing the whole route over a directory nobody has written to yet would be
 * the reporting failing harder than the thing it reports on.
 */
export async function diskSnapshot(
  path: string,
): Promise<{ totalBytes: number; freeBytes: number } | null> {
  try {
    const stats = await statfs(path)
    return {
      totalBytes: stats.blocks * stats.bsize,
      // `bavail`, not `bfree`: the difference is the reserve only root may use,
      // and reporting space this process cannot have is reporting a lie.
      freeBytes: stats.bavail * stats.bsize,
    }
  } catch {
    return null
  }
}

@Controller('api/health')
export class ResourcesController {
  /** The previous read, which is what makes a CPU percentage possible at all. */
  private previous: Sample | undefined

  constructor(@Inject(ConfigService) private readonly config: ConfigService<Env, true>) {}

  @Get('resources')
  @ZodResponse({
    status: 200,
    type: ResourcesDto,
    description: 'Memory, CPU and free disk. Reported, never judged.',
  })
  async read(): Promise<Resources> {
    const memory = process.memoryUsage()
    const limit = cgroupMemory()
    const usage = process.cpuUsage()
    const at = performance.now()
    const cores = cpus().length
    const [one = 0, five = 0, fifteen = 0] = loadavg()

    const disk = await diskSnapshot(this.config.get('EVIDENCE_DIR', { infer: true }) ?? '.evidence')
    const processPercent = cpuPercent(this.previous, usage, at, cores)
    this.previous = { usage, at }

    return {
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        systemTotalBytes: totalmem(),
        /**
         * **Reclaimable, falling back to free.** The fallback is pessimistic
         * and never wrong in the dangerous direction: it under-reports what is
         * available rather than promising room that is not there.
         */
        systemFreeBytes: availableMemory() ?? freemem(),
        containerLimitBytes: limit?.limit ?? null,
        containerUsedBytes: limit?.used ?? null,
      },
      cpu: { cores, loadAverage: [one, five, fifteen], processPercent },
      disk: disk ? { ...disk, where: 'evidence' } : null,
    }
  }
}
