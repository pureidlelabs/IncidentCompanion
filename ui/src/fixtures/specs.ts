/**
 * `GET /api/specs`, serialised from the domain schemas.
 */

import { parseSpecs, type Specs } from '@/api/specs'

import raw from './specs.json'

export const specsFixture: Specs = parseSpecs(raw)

/** The body a fetch stub answers `/api/specs` with. Wire shape, not parsed. */
export const specsWire: unknown = raw
