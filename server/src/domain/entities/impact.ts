/**
 * What data the incident touched, and what happened to it.
 *
 * **Not an entity in the sense the others are, which is why it left them.** A
 * file that was taken is not an artefact the SOC holds - it cannot be hashed,
 * verified or produced - so recording it beside hosts and accounts claims
 * custody of something that is gone. What is real is: an *event* (data moved,
 * at a time, by this route), *evidence* of it (the proxy log, the DLP alert),
 * and this - the durable fact a regulator asks about.
 *
 * **Impact rather than exfiltration, because exfiltration is one of six things
 * that can happen** - `disposition` carries which.
 * -> `vocabularies.DATA_DISPOSITION`
 *
 * **The route is not here.** Which host it was collected from, which it was
 * staged on and where it went are a *hop*, and a hop is a story - the timeline
 * already carries `sourceSystemId`, `systemId` and `networkIndicatorIds` on an
 * event, which is the same three references with a time attached.
 *
 * **Counts are approximate on purpose.** GDPR Art 33(3)(a) asks for the
 * *approximate* number of data subjects and records, because a precise one is
 * rarely knowable inside 72 hours and a false precision is worse than a range.
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
   * **How this is known.** The claim that data left is only as good as what
   * demonstrates it, and this is the difference between a finding and an
   * assertion.
   */
  evidenceIds: field(z.array(z.uuid()).default([]), {
    label: 'Evidence',
    kind: 'multi_device_select',
    refTarget: 'evidence',
    subordinate: true,
  }),

  /**
   * **The acts that established it**, where `evidenceIds` names the artefacts.
   * An impact claim reached by a query and one reached by reading a disk are
   * different claims, and only this field says which.
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
