import { DEPENDENCY, type HealthReport } from '@/api/backendHealth'
import type { Activity, Resources } from '@/api/useInstallHealth'
import { bytes } from '@/components/blocks/picker-rows'
import type {
  FigureRow,
  GaugeRow,
  ServingRow,
  TableRow,
} from '@/components/blocks/picker-rows'

/** The served health reads, projected into the rows `HealthPane` draws. */

/** How long the server has been up, worded rather than counted. */
export function uptimeLine(seconds: number | undefined): string | undefined {
  if (seconds === undefined) return undefined
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 0) return `up ${String(days)}d ${String(hours)}h`
  if (hours > 0) return `up ${String(hours)}h ${String(minutes)}m`
  return `up ${String(minutes)}m`
}

/**
 * Each dependency and whether it answered.
 *
 * Takes the readiness probe for the state and the activity read for the
 * machine each one is on; `detail` carries the machine, not a restatement of
 * `up`.
 */
export function servingRows(
  probe: HealthReport | undefined,
  activity: Activity | undefined,
): readonly ServingRow[] {
  // The probe cannot report on the server: that it answered is the evidence.
  const rows: ServingRow[] = [
    { label: 'Server', up: probe !== undefined, detail: probe === undefined ? 'unreachable' : 'answering' },
  ]
  // Mapped from what the probe reported, never a list written here.
  // The pane has no slot of its own for the machine, so it rides the tile.
  const where: Record<string, string | undefined> = {
    postgres: activity?.database.where,
    redis: activity?.redis.where,
  }
  for (const [name, state] of Object.entries(probe?.details ?? {})) {
    const up = state.status === 'up'
    rows.push({
      label: DEPENDENCY[name] ?? name,
      up,
      detail: where[name] ?? (up ? 'reachable' : (state.message ?? 'unreachable')),
    })
  }
  return rows
}

/**
 * This container's quantities against their ceilings.
 *
 * Measures against the container's limit where there is one: under a limit the
 * machine's total is not the number the process dies at.
 */
export function gaugeRows(resources: Resources | undefined): readonly GaugeRow[] {
  if (resources === undefined) return []
  const { memory, cpu, disk } = resources
  const rows: GaugeRow[] = [
    // The process dies on its heap long before the box runs out.
    { label: 'Heap', used: memory.heapUsedBytes, total: memory.heapTotalBytes, unit: 'bytes' },
    memory.containerLimitBytes !== null && memory.containerUsedBytes !== null
      ? {
          label: 'Memory, this container',
          used: memory.containerUsedBytes,
          total: memory.containerLimitBytes,
          unit: 'bytes',
        }
      : {
          label: 'Memory on this machine',
          used: memory.systemTotalBytes - memory.systemFreeBytes,
          total: memory.systemTotalBytes,
          unit: 'bytes',
        },
    {
      label: `Load, 1 min (${String(cpu.cores)} cores)`,
      used: cpu.loadAverage[0] ?? 0,
      total: cpu.cores,
      unit: 'load',
    },
  ]
  // Null on a fresh install, where the evidence directory does not exist yet:
  // the route answers null rather than reporting a size it could not read.
  if (disk !== null) {
    rows.push({
      label: `Disk holding ${disk.where}`,
      used: disk.totalBytes - disk.freeBytes,
      total: disk.totalBytes,
      unit: 'bytes',
    })
  }
  return rows
}

/** Database connections held, against the pool. */
export function connectionGauge(activity: Activity | undefined): GaugeRow | undefined {
  if (activity === undefined) return undefined
  return {
    label: 'Connections, all clients',
    used: activity.database.connections,
    total: activity.database.maxConnections,
    unit: 'count',
  }
}

/** The counts worth reading at a glance. */
export function figureRows(activity: Activity | undefined): readonly FigureRow[] {
  if (activity === undefined) return []
  const { cases, accounts } = activity
  return [
    {
      label: 'Cases',
      value: String(cases.total),
      note: `${String(cases.demo)} demo`,
    },
    { label: 'Open', value: String(cases.open) },
    {
      label: 'Accounts',
      value: String(accounts.total),
      note: `${String(accounts.admins)} admin, ${String(accounts.analysts)} analyst`,
    },
    { label: 'Database', value: bytes(activity.database.sizeBytes) },
  ]
}

/** Which table is the one growing. */
export function tableRows(activity: Activity | undefined): readonly TableRow[] {
  return activity?.tables ?? []
}
