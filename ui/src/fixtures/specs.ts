/**
 * `GET /api/specs`, serialised from the domain schemas.
 *
 * 12 forms, 16 vocabularies - and `compliance`: 8 forms, 5 cards, 12
 * vocabularies of its own. Regenerated with
 * `npx tsx ../server/scripts/dump-specs.ts src/fixtures/specs.json` - no
 * running app and no seeded case, because the document is a pure serialisation.
 * It was captured from the live Python API before that, which is not the
 * backend the client talks to.
 *
 * **`IMPACT_FIELDS` is hand-written here, and it is the only form that is.**
 * The collection exists on the Nest server and not in Python, so the capture
 * cannot produce it.
 *
 * **Replacing this wholesale with the Nest server's own document does not
 * work yet, and the reason is worth knowing before trying it**: the two
 * spell every vocabulary differently - `SEVERITY_OFFERED` against `severity`,
 * `ZONE_OPTIONS` against `zone` - and Nest serves `case` and `compliance`
 * present-and-empty. Measured 2026-08-10: swapping the file for
 * `server/scripts/dump-specs.ts`'s output takes **91 client tests** with it.
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
