/**
 * The analyst's scratchpad, deliberately outside the report.
 *
 * **No subordinate group**, where every other form folds its optional half
 * away: with a note, an author and its tags there would be one field inside
 * it, which reads as empty padding rather than as a group.
 *
 * Nothing here reaches a deliverable. That is the point - the moment a note
 * appears in a document, analysts stop writing the half-formed ones, which are
 * the useful ones.
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

