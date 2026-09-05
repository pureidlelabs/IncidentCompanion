/**
 * A network indicator: what kind of thing it is, its value, and what the case
 * makes of it.
 *
 * **Lifted from `NetworkIndicator` and `NETWORK_FIELDS`**, with the one
 * modelling change agreed on 2026-08-09: `disposition` said both what the
 * indicator is and how far anyone got looking at it, because `unknown` meant
 * *we cannot tell* and *nobody has checked* at once. Those are split.
 *
 * **One `type` and one `value`, where there were an `ip` box and a `domain`
 * box.** Two fields asked one question twice, let a row be both at once, and
 * said nothing about which it was -- so the kind was re-derived from the
 * value's shape wherever anything needed it, and an address and a domain that
 * read alike were one indicator. A URL had no field of its own and arrived as
 * a domain carrying a path.
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
     * **The network a private address belongs to.** Every RFC1918 range
     * repeats across sites, which here is the common case rather than the
     * edge, so `10.0.0.5` at two branches was one indicator. Microsoft
     * documents `Address+AddressScope` as the strong form.
     */
    scope: field(pasted(z.string().trim().max(255).default('')), {
      label: 'Scope',
      kind: 'text',
      hint: 'A private address repeats across sites. Name the network.',
      /**
       * **Only an address has a scope.** A domain resolves the same from every
       * network and a URL is fetched the same way, so a scope on either is a
       * claim nothing can act on - and it would key two identical domains
       * apart.
       *
       * `withGates` generates the refusal from this, so the rule the dialog
       * greys the control off and the rule that refuses the write are one
       * declaration rather than two that have to be kept level.
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
     * What it is. **No confidence field beside it**: `suspicious` is already
     * the low-confidence-malicious bucket, and a separate grade would make
     * "suspicious, high confidence" expressible without meaning anything.
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
     * The act that established this. **A reference rather than a copy**: one
     * query establishes several rows, and six copies of its text can silently
     * disagree about what was run.
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
     * **An ISO string on the wire, not a `Date`.** `z.date()` cannot be
     * published as JSON Schema at all - `toJSONSchema` throws, because JSON
     * has no date type - so a schema that is also the API document has to
     * speak the wire's vocabulary. The conversion to a `Date` belongs at the
     * database boundary, where Drizzle already does it.
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
