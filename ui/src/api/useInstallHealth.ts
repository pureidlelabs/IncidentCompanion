/**
 * The two reads behind the Health pane: how hard the machine is working, and
 * what the install is holding.
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
   * **Null whenever the evidence directory does not exist yet**, which is every
   * fresh install: the route answers null when `statfs` throws rather than
   * reporting a size it could not read.
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
 */
const RESOURCES_MS = 10_000

/**
 * **A minute, because none of this moves quickly.**
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
