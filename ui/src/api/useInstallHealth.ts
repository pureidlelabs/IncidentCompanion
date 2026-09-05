/**
 * The two reads behind the Health pane: how hard the machine is working, and
 * what the install is holding.
 *
 * **Both are polled, and both are separate from `useBackendHealth`.** The
 * readiness probe answers whether the server is serving and is polled
 * everywhere; these two are only wanted while somebody is looking at the pane,
 * so they poll on their own schedule and stop when the pane unmounts.
 *
 * **Neither is refetched on a write.** Nothing an analyst does moves free disk
 * or the load average, and a row added to a case moves the table estimate by
 * one - invalidating these on every write would make the whole app pay for a
 * screen almost nobody has open.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { request } from './client'
import { keys } from './queryKeys'

export interface Resources {
  uptimeSeconds: number
  memory: {
    rssBytes: number
    heapUsedBytes: number
    heapTotalBytes: number
    systemTotalBytes: number
    /** Reclaimable, not merely unused - see the server's `available-memory.ts`. */
    systemFreeBytes: number
    /** Set only in a container, where it is the number the process dies at. */
    containerLimitBytes: number | null
    containerUsedBytes: number | null
  }
  cpu: {
    cores: number
    loadAverage: number[]
    /** Null until two samples exist - a rate needs a previous reading. */
    processPercent: number | null
  }
  /**
   * **Null whenever the evidence directory does not exist yet**, which is
   * every fresh install: the route answers null when `statfs` throws rather
   * than reporting a size it could not read. Declared non-null here once, and
   * the pane's gauge then crashed the whole screen on a first run.
   */
  disk: {
    totalBytes: number
    freeBytes: number
    /** Which directory the free space is on. No path, deliberately. */
    where: string
  } | null
}

export type Where = 'this machine' | 'elsewhere' | 'unknown'

export interface Activity {
  database: {
    sizeBytes: number
    connections: number
    maxConnections: number
    /** Whether Postgres is the machine serving the app. See `where.ts`. */
    where: Where
  }
  redis: { where: Where }
  tables: { name: string; approximateRows: number; bytes: number }[]
  cases: { total: number; open: number; closed: number; demo: number }
  accounts: { total: number; admins: number; analysts: number }
}

/**
 * **Ten seconds, because a load average is only interesting while it moves.**
 * The readiness probe's thirty is right for a banner that says up or down;
 * this pane is being watched by somebody who wants to see a number change.
 */
const RESOURCES_MS = 10_000

/**
 * **A minute, because none of this moves quickly.** Table estimates are
 * maintained by autovacuum and the case count changes when somebody makes a
 * case; polling it as fast as the load average would be a query a second for
 * numbers that are the same all morning.
 */
const ACTIVITY_MS = 60_000

export function useResources(): UseQueryResult<Resources> {
  return useQuery({
    queryKey: keys.healthResources(),
    queryFn: () => request<Resources>('/health/resources'),
    refetchInterval: RESOURCES_MS,
  })
}

export function useActivity(): UseQueryResult<Activity> {
  return useQuery({
    queryKey: keys.healthActivity(),
    queryFn: () => request<Activity>('/health/activity'),
    refetchInterval: ACTIVITY_MS,
  })
}
