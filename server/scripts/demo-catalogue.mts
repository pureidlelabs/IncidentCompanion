/**
 * Capture the constant catalogue routes as JSON, for the evaluation build.
 *
 * Run from `ui`'s `build:demo`, so what the demo answers is what this tree's
 * controllers answer rather than a copy somebody kept in step. Only routes
 * whose controllers take no providers can be captured this way; one that reads
 * a case or the store is not a constant and is refused by the demo instead.
 *
 *     npx tsx scripts/demo-catalogue.mts <output directory>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CollectionsController } from '../src/specs/collections.controller.js'
import { SpecsController } from '../src/specs/specs.controller.js'

const out = process.argv[2]
if (!out) throw new Error('usage: demo-catalogue.mts <output directory>')

const captured: Record<string, unknown> = {
  specs: new SpecsController().specs(),
  collections: new CollectionsController().listing(),
}

mkdirSync(out, { recursive: true })
for (const [name, body] of Object.entries(captured)) {
  const text = JSON.stringify(body, null, 2)
  writeFileSync(join(out, `${name}.json`), text + '\n')
  console.log(`  ${name}.json  ${String(text.length)} bytes`)
}
