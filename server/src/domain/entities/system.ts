/**
 * An asset: a host, a mailbox, a tenant - anything the case is *about*.
 */
import { z } from 'zod'

import { field } from '../field-spec.js'
import { pasted } from '../pasted.js'
import {
  assetVerdictSchema,
  unsettable,
  systemTypeSchema,
  taskStatusSchema,
  zoneSchema,
} from '../vocabularies.js'

export const systemSchema = z.object({
  hostname: field(pasted(z.string().trim().min(1).max(255)), {
    tier: 'identity',
    label: 'Name (hostname, mailbox, or app name)',
    kind: 'text',
  }),

  systemType: field(unsettable(systemTypeSchema), {
    tier: 'assessment',
    label: 'Asset type',
    kind: 'select',
    vocabulary: 'systemType',
    subordinate: true,
    section: {
      title: 'Classification',
      copy: 'Optional: how this asset is categorised.',
    },
  }),

  verdict: field(assetVerdictSchema.default('unknown'), {
    label: 'Verdict',
    kind: 'select',
    vocabulary: 'assetVerdict',
    subordinate: true,
  }),

  analysisStatus: field(taskStatusSchema.default('open'), {
    label: 'Analysis status',
    kind: 'select',
    vocabulary: 'taskStatus',
    subordinate: true,
  }),

  zone: field(zoneSchema.default('external'), {
    label: 'Zone',
    kind: 'select',
    vocabulary: 'zone',
    subordinate: true,
  }),

  analyst: field(z.string().trim().max(120).default(''), {
    label: 'Analyst',
    kind: 'autocomplete',
    subordinate: true,
  }),

  isolated: field(z.boolean().default(false), {
    tier: 'detail',
    label: 'Isolated',
    kind: 'checkbox',
    subordinate: true,
    section: {
      title: 'Mitigation',
      copy: 'Optional: containment status, if actioned.',
    },
  }),

  isolatedAt: field(z.iso.datetime().nullable().default(null), {
    label: 'Isolated at',
    kind: 'event_datetime',
    fullWidth: true,
    subordinate: true,
    enabledBy: 'isolated',
  }),

  /**
   * The act that established this.
   */
  methodId: field(z.uuid().nullable().default(null), {
    label: 'Found by',
    kind: 'device_select',
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

export type SystemEntry = z.infer<typeof systemSchema>
