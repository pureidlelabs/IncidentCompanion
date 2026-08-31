/**
 * Write `GET /api/specs` to a file, without a server or a database.
 *
 * **The document is a pure serialisation of the domain schemas**, so it needs
 * no running app and no seeded case - which is what makes the client's fixture
 * regenerable in one command rather than captured from whatever was running.
 * The fixture it feeds used to come from the Python app, which is not the
 * backend the client talks to.
 *
 *     npx tsx scripts/dump-specs.ts ../ui/src/fixtures/specs.json
 */
import { writeFileSync } from 'node:fs'

import { SpecsController } from '../src/specs/specs.controller.js'

const out = process.argv[2]
if (!out) throw new Error('Give the file to write.')

writeFileSync(out, JSON.stringify(new SpecsController().specs(), null, 2) + '\n')
