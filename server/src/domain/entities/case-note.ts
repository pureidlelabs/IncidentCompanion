/**
 * The analyst's scratchpad, deliberately outside the report.
 */
import { z } from 'zod'

import { field } from '../field-spec.js'

export const caseNoteSchema = z.object({
  note: field(z.string().trim().min(1).max(20_000), {
    label: 'Note',
    kind: 'textarea',
  }),

  author: field(z.string().trim().max(120).default(''), {
    label: 'Author',
    kind: 'autocomplete',
  }),

  tags: field(z.string().trim().max(500).default(''), {
    label: 'Tags',
    kind: 'tag_select',
    fullWidth: true,
  }),
})

export type CaseNoteEntry = z.infer<typeof caseNoteSchema>
