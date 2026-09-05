/**
 * What data the incident touched, and what happened to it.
 */
import { z } from 'zod'

import { field } from '../field-spec.js'
import {
  dataCategorySchema,
  dataDispositionSchema,
  optionalCount,
  unsettable,
} from '../vocabularies.js'

export const impactSchema = z.object({
  /** What it is, in the analyst's words - "customer CRM export", "HR share". */
  label: field(z.string().trim().min(1, 'Say what the data was.').max(255), {
    tier: 'identity',
    label: 'What data',
    kind: 'text',
    fullWidth: true,
  }),

  category: field(unsettable(dataCategorySchema), {
    label: 'Category',
    kind: 'select',
    vocabulary: 'dataCategory',
  }),

  disposition: field(dataDispositionSchema.default('unknown'), {
    tier: 'assessment',
    label: 'What happened to it',
    kind: 'select',
    vocabulary: 'dataDisposition',
  }),

  /** Art 33(3)(a): the approximate number of data subjects concerned. */
  subjectCount: field(optionalCount(), {
    label: 'Data subjects (approximate)',
    kind: 'number',
    subordinate: true,
    section: {
      title: 'Scale',
      copy: 'Approximate is what the regulations ask for \u2014 a false precision is worse than a range.',
    },
  }),

  /** And of records. A subject can appear in many. */
  recordCount: field(optionalCount(), {
    label: 'Records (approximate)',
    kind: 'number',
    subordinate: true,
  }),

  volumeBytes: field(optionalCount(), {
    label: 'Volume (bytes)',
    kind: 'number',
    subordinate: true,
  }),

  /** Where it lived. Where it *went* is the timeline event's business. */
  notes: field(z.string().trim().max(4000).default(''), {
    label: 'Notes',
    kind: 'textarea',
  }),
  systemId: field(z.uuid().nullable().default(null), {
    tier: 'detail',
    label: 'Held on',
    kind: 'device_select',
    refTarget: 'systems',
    subordinate: true,
    section: {
      title: 'Where it was',
      copy: 'The host or service holding it. The route it took is a timeline entry.',
    },
  }),

  accountId: field(z.uuid().nullable().default(null), {
    label: 'Account involved',
    kind: 'device_select',
    refTarget: 'accounts',
    subordinate: true,
  }),

  /**
   * **How this is known.**
   */
  evidenceIds: field(z.array(z.uuid()).default([]), {
    label: 'Evidence',
    kind: 'multi_device_select',
    refTarget: 'evidence',
    subordinate: true,
  }),

  /**
   * **The acts that established it**, where `evidenceIds` names the artefacts.
   */
  methodIds: field(z.array(z.uuid()).default([]), {
    label: 'Found by',
    kind: 'multi_device_select',
    refTarget: 'methods',
    subordinate: true,
  }),


  tags: field(z.string().trim().max(500).default(''), {
    label: 'Tags',
    kind: 'tag_select',
    subordinate: true,
    fullWidth: true,
  }),
})

export type Impact = z.infer<typeof impactSchema>
