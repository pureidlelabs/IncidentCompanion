/**
 * The destination, attacked: does a line reach it, does a destination that is
 * down or half-accepting cost the line or the act, and does the prune take
 * only what the destination has?
 *
 * Against a real Postgres, because the cursor is a row, and against a real
 * HTTP listener, because the destination's answer is what moves it.
 */
import { createServer } from 'node:http'
import { desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { InstallActivityDelivery } from './deliver.service.js'
import {
  InstallActivityPruneService,
  RETENTION_DEFAULT_DAYS,
} from '../install-activity/prune.service.js'
import { recordInstallActivity } from '../install-activity/record.js'
import {
  OPERATIONAL_FLOOR_DAYS,
  installActivity,
  installActivityDelivery,
} from '../db/schema/install-activity.js'
import { asRole, openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null
/** The only role that may backdate a row, so a line can be aged past the window. */
const migratePool = URL_ ? openTestPool(asRole(URL_, 'ic_migrate')) : null
const migrate = migratePool ? drizzle({ client: migratePool }) : null

interface OtlpLogs {
  resourceLogs?: {
    scopeLogs?: {
      logRecords?: { attributes?: { key: string; value: { stringValue?: string } }[] }[]
    }[]
  }[]
}

function seqsIn(payload: OtlpLogs): string[] {
  return (payload.resourceLogs ?? []).flatMap((resource) =>
    (resource.scopeLogs ?? []).flatMap((scope) =>
      (scope.logRecords ?? []).flatMap((record) =>
        (record.attributes ?? [])
          .filter((one) => one.key === 'audit.seq')
          .map((one) => one.value.stringValue ?? ''),
      ),
    ),
  )
}

/** An OTLP/HTTP listener that keeps the seqs it accepted, and can be told how to answer. */
function collector() {
  const seqs: string[] = []
  let answer: { status: number; body: string } = { status: 200, body: '{}' }
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    request.on('end', () => {
      if (answer.status === 200 && answer.body === '{}') {
        seqs.push(...seqsIn(JSON.parse(body) as OtlpLogs))
      }
      response.writeHead(answer.status, { 'content-type': 'application/json' }).end(answer.body)
    })
  })
  return {
    seqs,
    server,
    refuse: () => {
      answer = { status: 500, body: '{"error":"down"}' }
    },
    rejectOne: () => {
      answer = { status: 200, body: '{"partialSuccess":{"rejectedLogRecords":1}}' }
    },
    accept: () => {
      answer = { status: 200, body: '{}' }
    },
  }
}

const label = (prefix: string) =>
  `${prefix}-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`

describe.skipIf(!db)('delivering the audit', () => {
  const far = collector()
  let delivery: InstallActivityDelivery

  beforeAll(async () => {
    await new Promise<void>((resolve) => far.server.listen(0, '127.0.0.1', resolve))
    const { port } = far.server.address() as { port: number }
    delivery = new InstallActivityDelivery(db!, {
      url: `http://127.0.0.1:${String(port)}/v1/logs`,
      timeoutMs: 2000,
    })
  })

  afterAll(async () => {
    await delivery.onApplicationShutdown()
    await new Promise((resolve) => far.server.close(resolve))
    await pool!.end()
    await migratePool?.end()
  })

  async function newest(target: string): Promise<bigint> {
    const [row] = await db!
      .select({ seq: installActivity.seq })
      .from(installActivity)
      .where(eq(installActivity.targetLabel, target))
      .orderBy(desc(installActivity.seq))
      .limit(1)
    return row!.seq
  }

  async function cursor(): Promise<bigint> {
    const [row] = await db!.select().from(installActivityDelivery)
    return row?.deliveredSeq ?? 0n
  }

  async function survivors(target: string) {
    return db!.select().from(installActivity).where(eq(installActivity.targetLabel, target))
  }

  it('a recorded line reaches the destination, and the cursor says so', async () => {
    const target = label('deliver')
    await recordInstallActivity(db!, { event: 'signed_in', target })
    const seq = await newest(target)

    await delivery.deliver()

    expect(far.seqs, 'the line never arrived').toContain(String(seq))
    expect(
      (await cursor()) >= seq,
      'the destination has the line and the install does not know it',
    ).toBe(true)
  })

  it('a destination that is down costs neither the act nor the line', async () => {
    far.refuse()
    const target = label('held')
    expect(await recordInstallActivity(db!, { event: 'signed_in', target })).toBe(true)
    const seq = await newest(target)

    await expect(delivery.deliver()).resolves.toBeUndefined()

    expect((await cursor()) < seq, 'the cursor passed a line the destination refused').toBe(true)
    expect(far.seqs).not.toContain(String(seq))

    far.accept()
    await delivery.deliver()

    expect(far.seqs, 'the held line was not delivered once the destination came back').toContain(
      String(seq),
    )
    expect((await cursor()) >= seq).toBe(true)
  })

  /**
   * **A 200 that rejected a record is a refusal.** The SDK's exporter calls it
   * a success, which is why the sender reads the response itself.
   */
  it('a destination that accepted the batch but rejected a record holds the cursor', async () => {
    far.rejectOne()
    const target = label('partial')
    await recordInstallActivity(db!, { event: 'signed_in', target })
    const seq = await newest(target)

    await delivery.deliver()

    expect((await cursor()) < seq, 'the cursor passed a line the destination rejected').toBe(true)
    far.accept()
    await delivery.deliver()
    expect((await cursor()) >= seq).toBe(true)
  })

  it('the prune lets go a line the destination has, and the destination still holds it', async () => {
    const target = label('aged-delivered')
    await recordInstallActivity(db!, { event: 'api_called', target })
    await migrate!.execute(
      sql`update install_activity set at = now() - interval '60 days' where target_label = ${target}`,
    )
    const seq = await newest(target)
    await delivery.deliver()
    expect(far.seqs).toContain(String(seq))

    const pruner = new InstallActivityPruneService(db!)
    await pruner.prune(
      RETENTION_DEFAULT_DAYS,
      OPERATIONAL_FLOOR_DAYS,
      await delivery.deliveredThrough(),
    )

    expect(
      await survivors(target),
      'the install kept a delivered line past its window',
    ).toHaveLength(0)
    expect(far.seqs, 'letting the copy go took the record with it').toContain(String(seq))
  })

  it('the prune keeps a line past its window that the destination has not got', async () => {
    far.refuse()
    const target = label('aged-held')
    await recordInstallActivity(db!, { event: 'api_called', target })
    await migrate!.execute(
      sql`update install_activity set at = now() - interval '60 days' where target_label = ${target}`,
    )
    await delivery.deliver()

    const pruner = new InstallActivityPruneService(db!)
    await pruner.prune(
      RETENTION_DEFAULT_DAYS,
      OPERATIONAL_FLOOR_DAYS,
      await delivery.deliveredThrough(),
    )

    expect(
      await survivors(target),
      'the only copy of an undelivered line was removed',
    ).toHaveLength(1)
    far.accept()
  })

  it('an install with no destination reports none, and delivers nothing', async () => {
    const none = new InstallActivityDelivery(db!, null)

    expect(await none.deliveredThrough()).toBeNull()
    await expect(none.deliver()).resolves.toBeUndefined()
  })
})
