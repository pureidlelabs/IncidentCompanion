/**
 * An evidence record: what was collected, and what it covers.
 */
import { z } from 'zod'

import { field } from '../field-spec.js'
import { evidenceTypeSchema, unsettable } from '../vocabularies.js'

export const evidenceSchema = z.object({
  name: field(z.string().trim().min(1).max(255), {
    tier: 'identity',
    label: 'Name',
    kind: 'text',
  }),

  type: field(unsettable(evidenceTypeSchema), {
    label: 'Type',
    kind: 'select',
    vocabulary: 'evidenceType',
  }),

  /**
   * Where the artefact actually lives, when it is not held here.
   */
  location: field(z.string().trim().max(1000).default(''), {
    label: 'Location',
    kind: 'text',
  }),

  /**
   * Who acquired it, when, and with what.
   */
  collectedBy: field(z.string().trim().max(200).default(''), {
    tier: 'assessment',
    label: 'Collected by',
    kind: 'autocomplete',
    subordinate: true,
    section: {
      title: 'Chain of custody',
      copy: 'Who took it, when, and how it is known to be unchanged.',
    },
  }),

  collectedAt: field(z.iso.datetime().nullable().default(null), {
    label: 'Collected at',
    kind: 'event_datetime',
    subordinate: true,
  }),

  /** `KAPE`, `velociraptor`, `Get-MailboxExport` - how it was taken. */
  acquisitionTool: field(z.string().trim().max(200).default(''), {
    label: 'Acquisition tool',
    kind: 'autocomplete',
    subordinate: true,
  }),

  /**
   * The act that collected it.
   */
  methodId: field(z.uuid().nullable().default(null), {
    label: 'Collected by method',
    kind: 'device_select',
    refTarget: 'methods',
    subordinate: true,
  }),

  dataClassification: field(z.string().trim().max(255).default(''), {
    label: 'Data classification',
    kind: 'text',
  }),

  systemId: field(z.uuid().nullable().default(null), {
    tier: 'detail',
    label: 'Host',
    kind: 'device_select',
    refTarget: 'systems',
    subordinate: true,
    section: {
      title: 'What this is evidence of',
      copy: 'Optional: the asset or account this record covers.',
    },
  }),

  accountId: field(z.uuid().nullable().default(null), {
    label: 'Account',
    kind: 'device_select',
    refTarget: 'accounts',
    subordinate: true,
  }),

  tags: field(z.string().trim().max(500).default(''), {
    label: 'Tags',
    kind: 'tag_select',
    subordinate: true,
    fullWidth: true,
  }),
})

export type EvidenceEntry = z.infer<typeof evidenceSchema>
