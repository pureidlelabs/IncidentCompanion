/**
 * An investigation task - work somebody still owes.
 */
import { z } from 'zod'

import { field } from '../field-spec.js'
import { taskStatusSchema, taskTypeSchema, unsettable } from '../vocabularies.js'

export const actionSchema = z.object({
  task: field(z.string().trim().min(1).max(500), {
    tier: 'identity',
    label: 'Task',
    kind: 'text',
  }),

  taskType: field(unsettable(taskTypeSchema), {
    tier: 'assessment',
    label: 'Task type',
    kind: 'select',
    vocabulary: 'taskType',
    subordinate: true,
    section: { title: 'Additional details', copy: 'Optional: extra tracking details.' },
  }),

  status: field(taskStatusSchema.default('open'), {
    label: 'Status',
    kind: 'select',
    vocabulary: 'taskStatus',
    subordinate: true,
  }),

  assignee: field(z.string().trim().max(120).default(''), {
    label: 'Assignee',
    kind: 'autocomplete',
    subordinate: true,
  }),

  dateDue: field(z.string().trim().max(120).default(''), {
    label: 'Date due',
    kind: 'text',
    subordinate: true,
  }),

  tags: field(z.string().trim().max(500).default(''), {
    tier: 'detail',
    label: 'Tags',
    kind: 'tag_select',
    subordinate: true,
    fullWidth: true,
  }),
})

export type ActionEntry = z.infer<typeof actionSchema>
