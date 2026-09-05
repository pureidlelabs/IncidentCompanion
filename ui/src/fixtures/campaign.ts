/**
 * The campaign demo, captured from the running Node server.
 *
 *     npx tsx scripts/dump-campaign.ts ../ui/src/fixtures/campaign.json
 *
 * 88 timeline entries, 30 systems, 18 accounts, 4 reports, 12 tables in all.
 *
 * **Nothing checks that this still matches the seeder**, and it is consumed by
 * 20+ test and story files, so a stale copy is 20+ suites asserting against a
 * demo the app no longer has. Recapture whenever `server/src/demos/` changes.
 *
 * **It used to come from Python and described a case this backend cannot
 * serve.** Every timeline row carried every key of both kinds - an action held
 * `severity`, `tactic` and `sourceTool` as `''` where the server omits them
 * outright - `confidence` read `confirmed` on 83 of 88 rows against a
 * vocabulary of low/medium/high, and an unrated severity was `''` where the
 * server sends `null`. The whole client suite ran green over it.
 *
 * **Stored exactly as the wire sends it, which is now camelCase**, so it needs
 * no conversion at all: `fromWire` reads snake_case and this server writes
 * none. A *request* body is still converted, by `CamelCaseBodyMiddleware` on
 * the server side, so `toWire` stays load-bearing on the way out.
 *
 * **The cast is the claim, and `campaign.test.ts` is what checks it.** A JSON
 * import is typed from its own literal, so `satisfies Case` fails on nothing
 * useful and passes on nothing either - the assertion that matters is that the
 * captured document still has the shape the contract describes.
 */

import type { Case } from '@/api/model'

import raw from './campaign.json'

export const campaignCase = raw as unknown as Case
