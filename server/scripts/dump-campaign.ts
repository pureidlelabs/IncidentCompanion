/**
 * Write the campaign demo to the client's fixture, from a running Node server.
 *
 *     node server/scripts/stack.mjs                 # for the port
 *     npx tsx scripts/dump-campaign.ts ../ui/src/fixtures/campaign.json
 *
 * **Over HTTP rather than out of the database.** A read goes through the
 * controllers, so `timelineToWire` projects each row onto its own arm and a
 * report block carries the `hasProse` no column holds; querying the tables
 * captures storage and calls it the wire.
 *
 * Stored as the server sends it, camelCase, so the fixture is the response
 * body unchanged and no client-side conversion is applied to it.
 */
import { writeFileSync } from 'node:fs'

const out: string = process.argv[2] ?? ''
if (!out) throw new Error('Give the file to write.')

const BASE = process.env.CAMPAIGN_API ?? 'https://127.0.0.1:8224'
const EMAIL = process.env.INCIDENTCOMPANION_E2E_USER ?? 'analyst@example.test'
const PASSWORD = process.env.INCIDENTCOMPANION_E2E_PASSWORD ?? 'incidentcompanion-dev'

/**
 * The certificate is generated on first start and signed by nobody, which is
 * the app's whole TLS posture - so a capture script has to skip verification on
 * *its own side*. Nothing on the server may.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

/** The demo the fixture stands for, by its seeded reference. */
const REFERENCE = process.env.CAMPAIGN_REFERENCE ?? 'DEMO-2026-031'

async function main(): Promise<void> {
  const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    /**
     * **`origin`, or Better Auth refuses with 403 `MISSING_OR_NULL_ORIGIN`.**
     * Its CSRF check wants the header every browser sends and `fetch` does not,
     * and the refusal reads as a credentials failure rather than a guard.
     */
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!signIn.ok) {
    // The body, not just the status: a 403 here is a guard refusing the
    // request rather than the credentials being wrong, and the two are
    // indistinguishable from the number.
    throw new Error(`sign-in refused: ${String(signIn.status)} ${await signIn.text()}`)
  }
  const cookie = signIn.headers.getSetCookie().map((one) => one.split(';')[0]).join('; ')
  if (!cookie) throw new Error('sign-in set no cookie')

  const cases = (await get<{ id: string; reference: string | null }[]>('/api/cases', cookie))
  const found = cases.find((one) => one.reference === REFERENCE)
  if (!found) {
    throw new Error(
      `no case with reference ${REFERENCE}; the server holds ` +
        cases.map((one) => one.reference ?? '(none)').join(', '),
    )
  }

  const body = await get<Record<string, unknown>>(`/api/cases/${found.id}`, cookie)
  writeFileSync(out, JSON.stringify(body, null, 1) + '\n')

  /**
   * **The compliance record, beside the case and not inside it.** Its 49 fields
   * are a row with a version of its own; the stories that render the compliance
   * form used to build one by spreading the *case*, which only ever typechecked
   * because Python carried those columns flat on it.
   */
  const record = await get<Record<string, unknown>>(
    `/api/cases/${found.id}/compliance`,
    cookie,
  )
  const recordOut = out.replace(/campaign\.json$/, 'compliance.json')
  if (recordOut === out) throw new Error('give the case fixture as campaign.json')
  writeFileSync(recordOut, JSON.stringify(record, null, 1) + '\n')
  console.log(`${recordOut}: ${String(Object.keys(record).length)} fields`)

  const counts = Object.entries(body)
    .filter(([, value]) => Array.isArray(value))
    .map(([name, value]) => `${name} ${String((value as unknown[]).length)}`)
  console.log(`${out}: ${counts.join(', ')}`)
}

async function get<T>(path: string, cookie: string): Promise<T> {
  const answer = await fetch(`${BASE}${path}`, { headers: { cookie, accept: 'application/json' } })
  if (!answer.ok) throw new Error(`${path} answered ${String(answer.status)}`)
  return (await answer.json()) as T
}

/**
 * `void main()`, not top-level `await`: `tsx` transforms these to CommonJS,
 * where esbuild refuses one outright - *"Top-level await is currently not
 * supported with the cjs output format"*. The rejection names the loader, not
 * the file, which reads as the script being unrunnable.
 */
void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
