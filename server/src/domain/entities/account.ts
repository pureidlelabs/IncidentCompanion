/**
 * An account, and whether anyone has disabled it yet.
 */
import { z } from 'zod'

import { field } from '../field-spec.js'
import { pasted } from '../pasted.js'

export const accountSchema = z.object({
  accountName: field(pasted(z.string().trim().min(1).max(255)), {
    tier: 'identity',
    label: 'Account name',
    kind: 'text',
  }),

  domain: field(pasted(z.string().trim().max(255).default('')), {
    label: 'Domain',
    kind: 'text',
  }),

  privileges: field(z.string().trim().max(500).default(''), {
    tier: 'assessment',
    label: 'Privileges',
    kind: 'text',
    subordinate: true,
  }),

  lastActivity: field(z.string().trim().max(255).default(''), {
    label: 'Last activity',
    kind: 'text',
    subordinate: true,
  }),

  disabled: field(z.boolean().default(false), {
    tier: 'detail',
    label: 'Disabled',
    kind: 'checkbox',
    subordinate: true,
    section: {
      title: 'Mitigation',
      copy: 'Optional: containment status, if actioned.',
    },
  }),

  disabledAt: field(z.iso.datetime().nullable().default(null), {
    label: 'Disabled at',
    kind: 'event_datetime',
    fullWidth: true,
    subordinate: true,
    enabledBy: 'disabled',
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

export type AccountEntry = z.infer<typeof accountSchema>
