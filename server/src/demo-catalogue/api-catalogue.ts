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
import { BUILTIN_CASE_TEMPLATES } from '../library/builtins/case-templates.js'
import { BUILTIN_REPORT_LAYOUTS } from '../library/builtins/report-layouts.js'
import { BUILTIN_REPORT_SNIPPETS } from '../library/builtins/report-snippets.js'
import { LIBRARY_KINDS, REPORT_LAYOUTS } from '../library/kinds.js'
import { english, headingPack } from '../report/document/packs.js'
import { CollectionsController } from '../specs/collections.controller.js'
import { SpecsController } from '../specs/specs.controller.js'

/** A built-in as the library stores it, before the pane's own verdicts. */
interface CapturedEntry {
  name: string
  label: string
  description: string
  position: number
}

/**
 * The built-ins of one kind, taking each field from the column the seeder
 * writes it to.
 *
 * **A layout's description is its `summary` and a snippet's is its payload
 * `hint`**, neither of which is called `description` on the built-in - so a
 * capture reading one field name for all three publishes two empty columns
 * that look like content nobody wrote.
 *
 * It throws on a kind it does not know, which is what makes a library added to
 * `LIBRARY_KINDS` fail the build rather than reach the demo as an empty pane.
 */
function builtinsOf(slug: string): CapturedEntry[] {
  if (slug === 'templates') {
    return BUILTIN_CASE_TEMPLATES.map((one) => ({
      name: one.name,
      label: one.label,
      description: one.description,
      position: one.position,
    }))
  }
  if (slug === REPORT_LAYOUTS) {
    return BUILTIN_REPORT_LAYOUTS.map((one) => ({
      name: one.name,
      label: one.label,
      description: one.summary,
      position: one.position,
    }))
  }
  if (slug === 'report-snippets') {
    return BUILTIN_REPORT_SNIPPETS.map((one) => ({
      name: one.name,
      label: one.label,
      description: one.payload.hint,
      position: one.position,
    }))
  }
  throw new Error(`no built-ins captured for the library kind ${slug}`)
}

/**
 * Every library listing as a fresh install holds it, by slug.
 *
 * **A demo install has authored nothing, so its library is the built-ins and
 * nothing else** - which is the whole reason this is a constant the build can
 * capture. `canEdit` and `canDelete` are false for every row here by the same
 * rule the service applies: a built-in is duplicated, never edited.
 *
 * The order is the service's, so the pane an analyst reads in the demo is the
 * pane they read on an install.
 */
function libraryListings(): Record<string, unknown> {
  return Object.fromEntries(
    LIBRARY_KINDS.map((kind) => {
      const rows = [...builtinsOf(kind.slug)].sort(
        (left, right) => left.position - right.position || left.label.localeCompare(right.label),
      )
      return [
        kind.slug,
        {
          slug: kind.slug,
          noun: kind.noun,
          newLabel: kind.newLabel,
          allowBlank: kind.allowBlank,
          entries: rows.map((row) => ({
            name: row.name,
            label: row.label,
            description: row.description,
            origin: 'built-in',
            canEdit: false,
            canDelete: false,
            canDuplicate: kind.payload !== null,
            disabled: false,
          })),
          problems: [],
          // Nothing is disabled on an install nobody has administered, so what
          // a New offers is every row above.
          startOptions: [
            ...(kind.allowBlank ? [{ value: '', label: 'Blank' }] : []),
            ...rows.map((row) => ({ value: row.name, label: row.label })),
          ],
        },
      ]
    }),
  )
}

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
     * `/api/library/<slug>`, one listing per kind.
     *
     * The library reads a table, which is why this route was refused rather
     * than served - but the table a demo would hold is the built-ins, and
     * those are constants in this tree. Writing stays refused: a shipped entry
     * cannot be edited on an install either.
     */
    library: libraryListings(),
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
