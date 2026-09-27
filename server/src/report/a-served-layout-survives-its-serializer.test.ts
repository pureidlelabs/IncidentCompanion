import { describe, expect, it } from 'vitest'

import { offeredLayouts, type LayoutSource } from './offered-layouts.js'
import { reportLayoutsSchema } from './views.js'

/**
 * What the route builds is what leaves it.
 *
 * `@ZodResponse` parses the return value through `reportLayoutsSchema` before
 * it reaches the wire, and a Zod object drops a key it does not declare. So a
 * field added to the answer and not to the schema is deleted on the way out,
 * silently: the typecheck passes, because the controller's return type is the
 * schema's own inference and an array is not excess-property checked, and
 * every test calling the function rather than the route passes too. -> #954
 *
 * Asserted as equality over the whole layout rather than field by field, so a
 * field added later is covered by this without anybody remembering to add it.
 */
const regulatory: LayoutSource = {
  name: 'nis2-final',
  label: 'NIS2 final report',
  summary: 'The closing filing.',
  builtin: true,
  requiresFeature: 'nis2',
  stage: 'NIS2 final',
  blocks: [{ kind: 'case_header' }],
}

describe('a served layout survives its serializer', () => {
  it('leaves the wire holding every field the route built', () => {
    const built = offeredLayouts([regulatory], (key) => key, () => true)

    const served = reportLayoutsSchema.parse({
      layouts: built,
      stages: [''],
      tlp: [''],
      languages: [],
      headings: [],
    })

    expect(served.layouts, 'the serializer dropped a field the route answers with').toEqual(built)
  })
})
