/**
 * An OAuth application and the consent behind it.
 */
import { z } from 'zod'

import { field } from '../field-spec.js'
import { pasted } from '../pasted.js'
import { consentTypeSchema, unsettable, verifiedPublisherSchema } from '../vocabularies.js'

export const cloudAppSchema = z.object({
  appName: field(pasted(z.string().trim().min(1).max(255)), {
    tier: 'identity',
    label: 'App name',
    kind: 'text',
  }),

  /**
   * **What tells two tenants of one application apart**, and the reason this
   * field exists rather than the instance living in `publisher`.
   */
  instance: field(pasted(z.string().trim().max(255).default('')), {
    label: 'Instance',
    kind: 'text',
    hint: 'Two tenants of one application are two rows.',
  }),

  publisher: field(z.string().trim().max(255).default(''), {
    tier: 'assessment',
    label: 'Publisher',
    kind: 'text',
    subordinate: true,
    section: {
      title: 'Additional details',
      copy: 'Optional: consent and publisher context.',
    },
  }),

  requestedScopes: field(z.string().trim().max(4000).default(''), {
    label: 'Requested scopes',
    kind: 'textarea',
    subordinate: true,
  }),

  consentType: field(unsettable(consentTypeSchema), {
    label: 'Consent type',
    kind: 'select',
    vocabulary: 'consentType',
    subordinate: true,
  }),

  verifiedPublisher: field(verifiedPublisherSchema.default('unknown'), {
    label: 'Verified publisher',
    kind: 'select',
    vocabulary: 'verifiedPublisher',
    subordinate: true,
  }),

  accountId: field(z.uuid().nullable().default(null), {
    tier: 'detail',
    label: 'Consenting account',
    kind: 'device_select',
    refTarget: 'accounts',
    subordinate: true,
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

export type CloudAppEntry = z.infer<typeof cloudAppSchema>
