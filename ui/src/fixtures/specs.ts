/**
 * `GET /api/specs`, serialised from the domain schemas.
 *
 * Regenerated with
 * `npx tsx ../server/scripts/dump-specs.ts src/fixtures/specs.json` - no
 * running app and no seeded case, because the document is a pure serialisation.
 * `specs.controller.test.ts` compares the committed copy with the served one,
 * so a drifted fixture fails there rather than keeping client tests green
 * against fields the server does not have.
 *
 * The regime switches are **not** here: `regimes.ts` holds them, because they
 * are a separate query for a separate cache lifetime.
 *
 * **Stored exactly as the wire sends it - snake_case, untouched.** It goes
 * through `parseSpecs` here, the same function `useSpecs` uses, so a story or
 * a test exercises the naming boundary instead of stepping around it. A
 * fixture pre-converted to camelCase would keep rendering after that boundary
 * broke, which is the one thing this document's consumers cannot survive: a
 * field name is both a key and a value in it.
 */

import { parseSpecs, type Specs } from '@/api/specs'

import raw from './specs.json'

export const specsFixture: Specs = parseSpecs(raw)

/** The body a fetch stub answers `/api/specs` with. Wire shape, not parsed. */
export const specsWire: unknown = raw
