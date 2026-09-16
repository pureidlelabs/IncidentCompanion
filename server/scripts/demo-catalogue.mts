/**
 * Write the captured catalogue where `ui`'s `build:demo` reads it.
 *
 *     npx tsx scripts/demo-catalogue.mts <output directory>
 */
import { writeApiCatalogue } from '../src/demo-catalogue/api-catalogue.js'

const out = process.argv[2]
if (!out) throw new Error('usage: demo-catalogue.mts <output directory>')

for (const file of writeApiCatalogue(out)) console.log(`  ${file}`)
