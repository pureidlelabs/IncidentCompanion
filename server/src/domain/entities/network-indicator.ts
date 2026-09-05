/**
 * A network indicator: what kind of thing it is, its value, and what the case
 * makes of it.
 */
import { z } from 'zod'

import { field, withGates } from '../field-spec.js'
import { pasted } from '../pasted.js'
import { dispositionSchema, indicatorTypeSchema, triageSchema } from '../vocabularies.js'

export const networkIndicatorSchema = withGates(
  z.object({    /**
     * **Asked before the value, because it decides what the value means.**
     * Two boxes -- an IP and a domain -- asked one question twice and let a row
     * be both, and the kind was then re-derived from the value's shape wherever
     * anything needed it.
     */
    type: field(indicatorTypeSchema.default('domain'), {
      tier: 'identity',
      label: 'Kind',
      kind: 'select',
      vocabulary: 'indicatorType',
    }),
    value: field(pasted(z.string().trim().min(1).max(2048)), {
      label: 'Value',
      kind: 'text',
      hint: 'Stored as written, so a URL keeps its path.',
    }),
    /**
     * **The network a private address belongs to.**
     */
    scope: field(pasted(z.string().trim().max(255).default('')), {
      label: 'Scope',
      kind: 'text',
      hint: 'A private address repeats across sites. Name the network.',
      /**
       * **Only an address has a scope.**
       */
      applicableWhen: { field: 'type', oneOf: ['ipv4', 'ipv6'] },
      inapplicable: 'Only an address has a scope.',
    }),
    /** Part of what the indicator *is*, so it stays on the identity plate. */
    port: field(z.string().trim().max(16).default(''), {
      label: 'Port',
      kind: 'text',
    }),
    /**
     * What it is.
     */
    context: field(z.string().trim().max(4000).default(''), {
      tier: 'assessment',
      label: 'Context',
      kind: 'textarea',
      subordinate: true,
    }),
    disposition: field(dispositionSchema.default('unknown'), {
      label: 'Disposition',
      kind: 'select',
      vocabulary: 'disposition',
      subordinate: true,
    }),
    /** How far anyone got. Split from `disposition`; see the module docstring. */
    triage: field(triageSchema.default('untriaged'), {
      label: 'Triage',
      kind: 'select',
      vocabulary: 'triage',
      subordinate: true,
    }),
    systemId: field(z.uuid().nullable().default(null), {
      tier: 'detail',
      label: 'Host it touched',
      kind: 'device_select',
      refTarget: 'systems',
      subordinate: true,
    }),
    malwareId: field(z.uuid().nullable().default(null), {
      label: 'Command-and-control for',
      kind: 'device_select',
      refTarget: 'malware',
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

    blocked: field(z.boolean().default(false), {
      label: 'Blocked',
      kind: 'checkbox',
      subordinate: true,
      section: { title: 'Mitigation', copy: 'Optional: containment status, if actioned.' },
    }),
    /**
     * **An ISO string on the wire, not a `Date`.**
     */
    blockedAt: field(z.iso.datetime().nullable().default(null), {
      label: 'Blocked at',
      kind: 'event_datetime',
      fullWidth: true,
      subordinate: true,
      enabledBy: 'blocked',
    }),
    tags: field(z.string().trim().max(500).default(''), {
      label: 'Tags',
      kind: 'tag_select',
      subordinate: true,
      fullWidth: true,
    }),
  }),
)

export type NetworkIndicator = z.infer<typeof networkIndicatorSchema>
