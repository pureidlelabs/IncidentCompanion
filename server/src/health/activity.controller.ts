/**
 * `GET /api/health/activity` - what this install is holding: how much is
 * stored, how many cases, how many people can sign in. Reports numbers and
 * judges none of them; `/api/health/resources` describes the machine instead.
 *
 * Collection counts come from `pg_stat_user_tables` and are **estimates**,
 * which is why the field is `approximateRows`. `cases` and `user` are exact.
 */
import { Controller, Get, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { ZodResponse, createZodDto } from 'nestjs-zod'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import type { Env } from '../config/env.js'
import { whereIs } from './where.js'

export const activitySchema = z.object({
  database: z.object({
    sizeBytes: z.number().int(),
    connections: z.number().int(),
    /** What `connections` is measured against; alone it says nothing. */
    maxConnections: z.number().int(),
    /**
     * **Whether this is the machine serving the app.** The server is
     * topology-blind, so a screen that draws the host's memory and disk beside
     * a database figure is claiming they describe one machine - true on a
     * laptop, false the moment Postgres moves. A word, not an address.
     * -> `where.ts`
     */
    where: z.enum(['this machine', 'elsewhere', 'unknown']),
  }),
  /** The same question for the cache, which can be somewhere else again. */
  redis: z.object({
    where: z.enum(['this machine', 'elsewhere', 'unknown']),
  }),
  /** Largest first, and only tables holding something. */
  tables: z.array(
    z.object({
      name: z.string(),
      /** An estimate from the statistics collector. See the module docstring. */
      approximateRows: z.number().int(),
      bytes: z.number().int(),
    }),
  ),
  cases: z.object({
    total: z.number().int(),
    open: z.number().int(),
    closed: z.number().int(),
    /** Counted apart: six of seven on a fresh install are demos. */
    demo: z.number().int(),
  }),
  accounts: z.object({
    total: z.number().int(),
    admins: z.number().int(),
    analysts: z.number().int(),
  }),
})

export type Activity = z.infer<typeof activitySchema>

export class ActivityDto extends createZodDto(activitySchema) {}

/** `count(*)` comes back as a string from `pg`; every number here is parsed. */
function count(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

@Controller('api/health')
export class ActivityController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('activity')
  @ZodResponse({
    status: 200,
    type: ActivityDto,
    description: 'What this install holds. Reported, never judged.',
  })
  async read(): Promise<Activity> {
    /**
     * **Four statements rather than one join.** They answer about different
     * things - the statistics collector, the connection table, two ordinary
     * tables - and joining them would make one slow source hold up the rest
     * for a screen whose whole job is to still draw when something is unwell.
     */
    const tables = await this.db.execute<{ name: string; rows: string; bytes: string }>(sql`
      select relname as name,
             n_live_tup as rows,
             pg_total_relation_size(relid) as bytes
        from pg_stat_user_tables
       where n_live_tup > 0
       order by n_live_tup desc
    `)

    const database = await this.db.execute<{
      size: string
      connections: string
      max: string
    }>(sql`
      select pg_database_size(current_database()) as size,
             (select count(*) from pg_stat_activity
               where datname = current_database()) as connections,
             current_setting('max_connections') as max
    `)

    const cases = await this.db.execute<{ status: string; is_demo: boolean; count: string }>(sql`
      select status, is_demo, count(*) as count from cases group by 1, 2
    `)

    const accounts = await this.db.execute<{ role: string; count: string }>(sql`
      select role, count(*) as count from "user" group by 1
    `)

    const byRole = new Map(accounts.rows.map((row) => [row.role, count(row.count)]))
    const caseRows = cases.rows
    const totals = database.rows[0]

    return {
      database: {
        sizeBytes: count(totals?.size),
        connections: count(totals?.connections),
        maxConnections: count(totals?.max),
        where: whereIs(this.config.get('DATABASE_URL', { infer: true })),
      },
      redis: { where: whereIs(this.config.get('REDIS_URL', { infer: true })) },
      tables: tables.rows.map((row) => ({
        name: row.name,
        approximateRows: count(row.rows),
        bytes: count(row.bytes),
      })),
      cases: {
        total: caseRows.reduce((sum, row) => sum + count(row.count), 0),
        open: caseRows
          .filter((row) => row.status === 'open')
          .reduce((sum, row) => sum + count(row.count), 0),
        closed: caseRows
          .filter((row) => row.status === 'closed')
          .reduce((sum, row) => sum + count(row.count), 0),
        demo: caseRows.filter((row) => row.is_demo).reduce((sum, row) => sum + count(row.count), 0),
      },
      accounts: {
        // **Summed from the roles, not counted separately.** A second query
        // could disagree with this one, and a total that is not the sum of its
        // parts is the kind of thing nobody notices on a dashboard.
        total: [...byRole.values()].reduce((sum, n) => sum + n, 0),
        admins: byRole.get('admin') ?? 0,
        analysts: byRole.get('analyst') ?? 0,
      },
    }
  }
}
