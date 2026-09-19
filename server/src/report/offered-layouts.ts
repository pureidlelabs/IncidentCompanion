import type { z } from 'zod'

import { SETTINGS } from '../preferences/install.service.js'

import { reportLayoutsSchema } from './views.js'

import { BLANK_LAYOUT } from './block-kinds.js'

/**
 * What a layout's chip says for one block.
 *
 * **A literal wins, then the pack, then the kind.** A key the pack has no entry
 * for resolves to itself -- `heading.exec_summary` on a chip is the key leaking
 * onto a screen, so the kind is what shows instead. The document makes the same
 * choice; this is the screen's copy of it, and the only one the client sees.
 */
function labelFor(
  block: { kind: string; heading?: string; headingKey?: string },
  t: (key: string) => string,
): string {
  if (block.heading) return block.heading
  if (block.headingKey) {
    const resolved = t(block.headingKey)
    if (resolved !== block.headingKey) return resolved
  }
  /**
   * **The kind, through the pack, exactly as the document titles it.**
   * Prettifying the slug instead is always English, so a layout chip in the New
   * report dialog reads "Exec card" where the document it describes prints
   * "Samenvatting". -> `document/resolve.ts`
   */
  const derived = t(`heading.${block.kind}`)
  if (derived !== `heading.${block.kind}`) return derived
  return block.kind.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase())
}

/** A layout as the library holds it, before an install decides whether to offer it. */
export interface LayoutSource {
  name: string
  label: string
  /** The line under the title on the card an analyst picks it from. */
  summary: string
  builtin: boolean
  /** The feature an install must assess before this layout is offered at all. */
  requiresFeature?: string | undefined
  /** The step of that regime's obligation this layout files, where it is one. */
  stage?: string | undefined
  blocks: readonly { kind: string; heading?: string; headingKey?: string }[]
}

/**
 * One layout as `/api/report-layouts` serves it.
 *
 * **Inferred from the schema rather than declared beside it.** The answer is
 * parsed through `reportLayoutsSchema` before it leaves, and a Zod object drops
 * a key it does not declare -- so a second description of this shape can gain a
 * field the schema never hears about, and the field is deleted on the way out
 * with nothing reporting it. Nothing above the wire can see that happen: the
 * handler's return type is the schema's own inference, and an array is not
 * excess-property checked. -> #961
 */
export type OfferedLayout = z.infer<typeof reportLayoutsSchema>['layouts'][number]

/**
 * The layouts an install offers, and the blank one it always offers.
 *
 * **Shared so the demo cannot drift from the install.** The capture used to
 * publish an empty list because it could not reach a store; it reaches this
 * instead, with an `assesses` built from the shipped fallbacks, so a fifth
 * regulatory layout or a changed default arrives in the demo the day it
 * arrives in the product. -> #884
 *
 * `assesses` answers whether the install assesses a named feature. A layout
 * that names none is offered to everyone.
 */
export function offeredLayouts(
  sources: readonly LayoutSource[],
  t: (key: string) => string,
  assesses: (feature: string) => boolean,
): OfferedLayout[] {
  return [
    ...sources
      .filter((one) => one.requiresFeature === undefined || assesses(one.requiresFeature))
      .map((one) => ({
        name: one.name,
        label: one.label,
        summary: one.summary,
        builtin: one.builtin,
        // Whether the layout is a regulatory one, which is what decides
        // whether a stage applies to it. Declared by the layout itself.
        nis2: one.requiresFeature === 'nis2',
        // Declared by the layout too, because no label implies it: `NIS2
        // final report` is not a value the stage vocabulary holds. -> #954
        stage: one.stage ?? '',
        blocks: one.blocks.map((block, position) => ({
          kind: block.kind,
          position,
          heading: block.heading ?? '',
          headingKey: block.headingKey ?? '',
          label: labelFor(block, t),
        })),
      })),
    // Last, so a real layout is what the form lands on when there is one.
    {
      name: BLANK_LAYOUT,
      label: 'Blank',
      summary: 'No sections. Start from nothing and add what the case needs.',
      builtin: true,
      nis2: false,
      stage: '',
      blocks: [],
    },
  ]
}

/**
 * What an install assesses out of the box, read from the fallbacks rather than
 * from a list written here.
 *
 * **Here rather than in the capture that wants it.** `demo-catalogue` may not
 * reach `preferences` -- `architecture.test.ts` says so -- and `report` may,
 * so the predicate belongs beside the function it is passed to.
 *
 * A feature `SETTINGS` has no entry for is not assessed, which is the same
 * answer the route gives: `settings.all()` only ever fills the keys
 * `SETTINGS` declares. -> #884
 */
export const shippedAssesses = (feature: string): boolean =>
  SETTINGS['compliance.enabled'].fallback === true &&
  SETTINGS[`compliance.regime.${feature}` as keyof typeof SETTINGS]?.fallback === true
