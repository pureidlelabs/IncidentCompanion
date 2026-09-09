/**
 * The destination, attacked: does a line reach it, and does a destination that
 * is down cost the line or the act?
 *
 * Against a real Postgres, because the cursor is a row, and against a real
 * HTTP listener, because the exporter's answer is what moves it.
 */
import { createServer } from 'node:http'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { InstallActivityDelivery } from './deliver.service.js'
import { recordInstallActivity } from '../install-activity/record.js'
import { installActivity, installActivityDelivery } from '../db/schema/install-activity.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

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

/** An OTLP/HTTP listener that keeps the seqs it accepted, and can be told to refuse. */
function collector() {
  const seqs: string[] = []
  // 500, not 503: the exporter retries 503 with backoff, and this test is
  // about a destination that is down rather than one that is slow.
  let status = 200
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    request.on('end', () => {
      if (status === 200) seqs.push(...seqsIn(JSON.parse(body) as OtlpLogs))
      response.writeHead(status, { 'content-type': 'application/json' }).end('{}')
    })
  })
  return {
    seqs,
    server,
    refuse: () => {
      status = 500
    },
    accept: () => {
      status = 200
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
    delivery = new InstallActivityDelivery(
      db!,
      new OTLPLogExporter({ url: `http://127.0.0.1:${String(port)}/v1/logs`, timeoutMillis: 2000 }),
    )
  })

  afterAll(async () => {
    await delivery.onApplicationShutdown()
    await new Promise((resolve) => far.server.close(resolve))
    await pool!.end()
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

  async function cursor() {
    const [row] = await db!.select().from(installActivityDelivery)
    return row!
  }

  it('a recorded line reaches the destination, and the cursor says so', async () => {
    const target = label('deliver')
    await recordInstallActivity(db!, { event: 'signed_in', target })
    const seq = await newest(target)

    await delivery.deliver()

    expect(far.seqs, 'the line never arrived').toContain(String(seq))
    expect(
      (await cursor()).deliveredSeq >= seq,
      'the destination has the line and the install does not know it',
    ).toBe(true)
    expect(await delivery.deliveredThrough()).toBe((await cursor()).deliveredSeq)
  })

  it('a destination that is down costs neither the act nor the line', async () => {
    far.refuse()
    const target = label('held')
    expect(
      await recordInstallActivity(db!, { event: 'signed_in', target }),
      'the act failed because the destination was down',
    ).toBe(true)
    const seq = await newest(target)

    await expect(delivery.deliver()).resolves.toBeUndefined()

    const during = await cursor()
    expect(during.deliveredSeq < seq, 'the cursor passed a line the destination refused').toBe(true)
    expect(during.stalledSince, 'nothing records that delivery is failing').not.toBeNull()
    expect(far.seqs).not.toContain(String(seq))

    far.accept()
    await delivery.deliver()

    expect(far.seqs, 'the held line was not delivered once the destination came back').toContain(
      String(seq),
    )
    const after = await cursor()
    expect(after.deliveredSeq >= seq).toBe(true)
    expect(after.stalledSince).toBeNull()
  })

  it('an install with no destination reports none, and delivers nothing', async () => {
    const none = new InstallActivityDelivery(db!, null)

    expect(await none.deliveredThrough()).toBeNull()
    await expect(none.deliver()).resolves.toBeUndefined()
  })
})
