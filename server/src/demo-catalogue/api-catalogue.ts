/**
 * Capture the constant catalogue routes as JSON, for the evaluation build.
 *
 * Only routes whose controllers take no providers can be captured this way;
 * one that reads a case or the store is not a constant and is refused by the
 * demo instead.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEMO_REPORTS } from '../demos/reports.js'
import { REPORT_STAGES, TLP_LABELS } from '../domain/entities/report.js'
import { AboutController } from '../health/about.controller.js'
import { english, headingPack } from '../report/document/packs.js'
import { CollectionsController } from '../specs/collections.controller.js'
import { SpecsController } from '../specs/specs.controller.js'

function captured(): Record<string, unknown> {
  return {
    specs: new SpecsController().specs(),
    collections: new CollectionsController().listing(),
    about: new AboutController().read(),
    /**
     * `/api/report-layouts`, less the two members that are not constants.
     *
     * The controller reads the library for its layouts and the store for its
     * languages, so neither can be captured; the heading pack is what a client
     * resolves `heading.exec_summary` through, and it is English's own keys.
     */
    'report-layouts': {
      layouts: [],
      stages: ['', ...REPORT_STAGES],
      tlp: ['', ...TLP_LABELS],
      languages: [],
      headings: headingPack(english()),
    },
    /**
     * What each written section of each demo report holds, by the case's
     * reference, the report's label and the block's position -- which is all
     * the captured case carries to find a body by.
     */
    'report-prose': Object.fromEntries(
      Object.entries(DEMO_REPORTS).map(([reference, listed]) => [
        reference,
        Object.fromEntries(listed.map((report) => {
          // The label is the key the demo finds a body by, so a second report
          // wearing it drops the first's prose in silence.
          if (listed.filter((one) => one.label === report.label).length > 1)
            throw new Error(`${reference} has two reports labelled ${report.label}`)
          return [report.label, report.blocks.map((block) => block.body ?? '')]
        })),
      ]),
    ),
  }
}

/** Write the capture into `out`, creating it, and name each file written. */
export function writeApiCatalogue(out: string): readonly string[] {
  mkdirSync(out, { recursive: true })
  return Object.entries(captured()).map(([name, body]) => {
    const file = `${name}.json`
    writeFileSync(join(out, file), JSON.stringify(body, null, 2) + '\n')
    return file
  })
}
