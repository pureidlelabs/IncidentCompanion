/**
 * The campaign demo, captured from the running Node server.
 *
 *     npx tsx scripts/dump-campaign.ts ../ui/src/fixtures/campaign.json
 *
 * **Nothing checks that this still matches the seeder**, and every test and
 * story that renders a case reads it, so a stale copy is that many suites
 * asserting against a demo the app no longer has. Recapture whenever
 * `server/src/demos/` changes.
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
