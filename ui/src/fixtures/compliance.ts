/**
 * The campaign demo's compliance record, captured from the running Node server.
 *
 *     npx tsx scripts/dump-campaign.ts ../ui/src/fixtures/campaign.json
 *
 * **A row of its own, with a version of its own** - which is the whole reason
 * this file exists rather than the 49 fields being read off `campaignCase`.
 * They were, until this branch, because Python carried them flat on the case;
 * every story that rendered the compliance form built its record by spreading
 * the case, and typechecked only because of that.
 *
 * **Every regulatory field is empty, and that is what the server seeds.**
 * `compliance.service` inserts a bare row per case and no demo fills one, so
 * the Article 33 clock reads "starts when awareness is recorded" on every demo
 * this app ships - the compliance surface has nothing to show. The fixture
 * records that faithfully rather than inventing answers the app would not
 * serve. -> `server/src/demos/catalogue.ts`
 */

import type { ComplianceRecord } from '@/api/compliance'

import raw from './compliance.json'

export const campaignCompliance = raw as unknown as ComplianceRecord
