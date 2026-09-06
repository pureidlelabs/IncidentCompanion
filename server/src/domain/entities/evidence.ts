/**
 * An evidence record: what was collected, and what it covers.
 *
 * **Lifted from `Evidence` and `EVIDENCE_FIELDS`.** This is the *metadata*
 * half. `hash` and the file path are deliberately absent: both describe an
 * actually-attached file and are computed by the upload, never typed. A record
 * created from this form is metadata-only, with the file attachable afterwards
 * - offering the analyst a hash field invites one that matches nothing on disk.
 *
 * **`hashAlgorithm` is absent for the same reason, and used not to be.** A
 * field here is a field the collection PATCH can set, and the algorithm names
 * the function that produced the digest - so a reachable half let an analyst
 * leave the row saying `md5` over the SHA-256 `attach` computed. The next
 * person verifies with the wrong function and reports a mismatch on evidence
 * that was never altered, on the one collection whose purpose is proving it
 * was not. Both halves are written by the upload and both are on the row
 * rather than in the schema.
 * -> `collections/evidence-file.controller.ts`, `domain/wire.ts`
 *
 * **No `subordinate` on the first four.** An evidence record with a name and
 * nothing else is not usable evidence, so the type, location and classification
 * stay above the fold where the other forms put only their required field.
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
   *
   * **Most evidence is not in this app and should not be.** A 500GB disk image
   * belongs in an evidence locker; what this records is that it exists, its
   * digest, and where to find it. Small artefacts - a screenshot, an `.eml`, a
   * log export - can be attached, and then `storedAt` says so.
   */
  location: field(z.string().trim().max(1000).default(''), {
    label: 'Location',
    kind: 'text',
  }),

  /**
   * Who acquired it, when, and with what.
   *
   * **Not the same as who typed this row.** `createdBy` and `createdAt` are the
   * record's; these are the artefact's, and they are routinely a different
   * person at a different time - a customer's admin exports a mailbox on
   * Tuesday and an analyst records it on Thursday. Collapsing them puts the
   * wrong name on a chain of custody.
   *
   * **Free text on purpose.** The collector is often not an analyst with an
   * account here at all.
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
   * The act that collected it. **`acquisitionTool` says *what*, this says
   * exactly what was asked** - *Acquisition tool: KAPE* is not reproducible on
   * its own, which is what makes the custody fields worth filling.
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

