/**
 * The demo cases' headers: their customers, references, incident classes and
 * card copy. The bodies are seeded from `content.ts`.
 *
 * Every value is invented, and the set is chosen by incident class rather than
 * by size - which is why `scenario` and `scale` are separate fields, and why
 * `scenario` must not restate what `scale` says.
 */
import { z } from 'zod'

import { caseComplianceSchema } from '../domain/entities/case-compliance.js'

/**
 * One demo case's header. `DEFINITIONS` is parsed against it at import, so a
 * malformed demo throws on load rather than going missing from the picker.
 */
export const demoCaseSchema = z.strictObject({
  /** Python's reserved `case_id`. Kept as the human reference. */
  reference: z.string().min(1),
  customer: z.string().min(1),
  title: z.string().min(1),
  /** The incident class, shown as the card's chip. Never restates `scale`. */
  scenario: z.string().min(1),
  scale: z.string().min(1),
  /** A key into the picker's own icon table - never a class name or a URL. */
  glyph: z.string().min(1),
  /** The card's copy. Long enough that an empty one is a mistake, not a choice. */
  summary: z.string().min(20),

  /** How long ago the case began. An offset, so a demo reads as already past. */
  startedDaysAgo: z.number().int().min(0).default(0),

  /**
   * The regulatory record, validated against the server's own schema. The
   * three GDPR stamps are omitted here and given as offsets in
   * `complianceMinutes`.
   */
  compliance: caseComplianceSchema
    .omit({ gdprAwareAt: true, gdprAuthorityNotifiedAt: true, gdprSubjectsNotifiedAt: true })
    .partial()
    .optional(),

  /**
   * The compliance stamps, as minute offsets from the case's start - the same
   * idiom every timeline entry uses, and for the same reason.
   */
  complianceMinutes: z
    .object({
      gdprAwareAt: z.number().int().optional(),
      gdprAuthorityNotifiedAt: z.number().int().optional(),
      gdprSubjectsNotifiedAt: z.number().int().optional(),
    })
    .optional(),
})

export type DemoCase = z.infer<typeof demoCaseSchema>

const DEFINITIONS = [
  {
    reference: 'DEMO-2026-001',
    customer: 'Acme Corp',
    title: 'Guided incident',
    scenario: 'Phishing',
    scale: 'Small',
    glyph: 'mail',
    summary:
      'One phishing email to a lateral hop to an attempted exfil, half contained. Every section filled, readable in one sitting.',
  },
  {
    reference: 'DEMO-2026-014',
    customer: 'Northwind Payments',
    title: 'Cloud account takeover',
    scenario: 'Cloud / BEC',
    scale: 'Medium',
    glyph: 'cloud',
    summary:
      'A consent phish grants a rogue OAuth app, then inbox rules and invoice fraud. No malware \u2014 all identity and cloud.',
  },
  {
    reference: 'DEMO-2026-031',
    customer: 'Meridian Logistics',
    title: 'Major campaign',
    scenario: 'Ransomware',
    scale: 'Large',
    glyph: 'lock',
    summary:
      'Domain-wide ransomware: mass beaconing, credential theft, staged double-extortion exfil. One story at a real week\u2019s volume.',
    startedDaysAgo: 6,
    compliance: {
      homeMemberState: 'NL',
      personalDataInvolved: 'yes',
      unlawfulOrMalicious: 'suspected',
      usersAffected: 'Staff accounts across the domain',
      usersAffectedCount: 1_800,
      usersTotalCount: 2_400,
      serviceDowntimeMinutes: 1_140,
      serviceDowntimeComplete: false,
      gdprDataContext: 'simple',
      gdprIdentifiability: 'significant',
      gdprCircumstances: ['availability', 'confidentiality'],
      gdprEncryptionApplied: 'no',
      dpoContact: 'privacy@meridian-logistics.example',
      competentAuthority: 'Autoriteit Persoonsgegevens',
      nis2EntityClass: 'important',
      nis2EntityType: 'other',
      financialImpact: 'Recovery, downtime and forensic engagement',
      financialLossEur: 890_000,
      annualTurnoverEur: 74_000_000,
      recurringIncident: 'no',
    },
    /** Aware early, filed inside the 72 - the compliant end of the same strip. */
    complianceMinutes: { gdprAwareAt: 180, gdprAuthorityNotifiedAt: 2_400 },
  },
  {
    reference: 'DEMO-2026-047',
    customer: 'Veldpoort Telecom B.V.',
    title: 'Mass data breach',
    scenario: 'Data breach',
    scale: 'Large',
    glyph: 'users',
    summary:
      'A phone call to the service desk, then 6.2M customer records out through the CRM\u2019s own export. No malware, no outage \u2014 all regulatory.',
    /**
     * **Six days back, so the Article 33 clock has actually run out.** The
     * whole point of this scenario is the regulatory reading, and 72 hours
     * cannot elapse on a case seeded at this instant.
     */
    startedDaysAgo: 6,
    compliance: {
      homeMemberState: 'NL',
      affectedMemberStates: ['NL', 'BE', 'DE'],
      personalDataInvolved: 'yes',
      unlawfulOrMalicious: 'suspected',
      usersAffected: 'Consumer subscribers, all segments',
      usersAffectedCount: 6_200_000,
      usersTotalCount: 8_100_000,
      gdprDataContext: 'simple',
      gdprIdentifiability: 'maximum',
      gdprCircumstances: ['confidentiality'],
      gdprEncryptionApplied: 'no',
      dpoContact: 'dpo@veldpoort.example',
      competentAuthority: 'Autoriteit Persoonsgegevens',
      nis2EntityClass: 'essential',
      nis2EntityType: 'other',
      financialImpact: 'Notification, credit monitoring and regulatory exposure',
      financialLossEur: 2_400_000,
      annualTurnoverEur: 310_000_000,
      recurringIncident: 'no',
    },
    /**
     * Aware four hours in; nobody has notified anyone. That is the state the
     * clock strip exists to make loud, and it is the one no demo could reach.
     */
    complianceMinutes: { gdprAwareAt: 240 },
  },
  {
    reference: 'DEMO-2026-052',
    customer: 'Halberd Precision Manufacturing',
    title: 'Edge appliance intrusion',
    scenario: 'Exploitation',
    scale: 'Medium',
    glyph: 'router',
    summary:
      'An unpatched VPN appliance, sold on, then quiet for 23 days. Six weeks long, and the first three are past the log retention.',
  },
  {
    reference: 'DEMO-2026-058',
    customer: 'Wrenfield & Partners',
    title: 'Insider data leak',
    scenario: 'Insider',
    scale: 'Minimal',
    glyph: 'badge',
    summary:
      'A leaver emailing client files to themselves. No malware, no attacker, and no ATT&CK technique on any entry.',
  },
] as const

/**
 * **Parsed here, so the failure is at import rather than at seed time.** A
 * demo that fails this stops the server starting with the field named, which
 * is a better outcome than a picker quietly missing a card.
 */
export const DEMO_CASES: readonly DemoCase[] = z.array(demoCaseSchema).parse(DEFINITIONS)
