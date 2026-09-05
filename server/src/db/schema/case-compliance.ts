/**
 * The regulatory record, one row per case, raised on first read by
 * `ComplianceService.read` rather than at case creation.
 */
import { bigint, boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { cases } from './case.js'
import { rowVersioning } from './columns.js'
import { caseScoped } from './scoped.js'

export const caseCompliance = pgTable(
  'case_compliance',
  {
    /**
     * **The case is the key.** One row per case, so there is nothing to
     * disambiguate and no way to end up with two answers to one question.
     */
    caseId: uuid('case_id')
      .primaryKey()
      .references(() => cases.id, { onDelete: 'cascade' }),

    /**
     * NIS2: what the entity is, and whether the incident is significant.
     */
    nis2EntityClass: text('nis2_entity_class'),
    nis2EntityType: text('nis2_entity_type'),
    nis2Significance: text('nis2_significance'),
    nis2SevereDisruption: text('nis2_severe_disruption'),
    nis2ConsiderableDamage: text('nis2_considerable_damage'),
    nis2TradeSecretLoss: text('nis2_trade_secret_loss'),
    nis2Death: text('nis2_death'),
    nis2HealthDamage: text('nis2_health_damage'),
    nis2MaliciousAccess: text('nis2_malicious_access'),

    // --- reach ---------------------------------------------------------------
    homeMemberState: text('home_member_state'),
    affectedMemberStates: jsonb('affected_member_states').$type<string[]>().notNull().default([]),
    outsideEuReach: boolean('outside_eu_reach').notNull().default(false),
    outsideEuCountries: text('outside_eu_countries').notNull().default(''),
    competentAuthority: text('competent_authority').notNull().default(''),

    // --- impact --------------------------------------------------------------
    unlawfulOrMalicious: text('unlawful_or_malicious'),
    personalDataInvolved: text('personal_data_involved'),
    usersAffected: text('users_affected').notNull().default(''),
    usersAffectedCount: integer('users_affected_count'),
    usersTotalCount: integer('users_total_count'),
    serviceDowntimeMinutes: integer('service_downtime_minutes'),
    serviceDowntimeComplete: boolean('service_downtime_complete').notNull().default(false),
    financialImpact: text('financial_impact').notNull().default(''),
    financialLossEur: integer('financial_loss_eur'),
    /** `bigint` for the reason `customer.ts` gives: `int4` stops at EUR 2.1bn. */
    annualTurnoverEur: bigint('annual_turnover_eur', { mode: 'number' }),
    recurringIncident: text('recurring_incident'),
    recurringEarlierCases: text('recurring_earlier_cases').notNull().default(''),

    // --- GDPR ----------------------------------------------------------------
    gdprDataContext: text('gdpr_data_context'),
    gdprIdentifiability: text('gdpr_identifiability'),
    gdprCircumstances: jsonb('gdpr_circumstances').$type<string[]>().notNull().default([]),
    /** A recorded disagreement with the computed band, not the band itself. */
    gdprSeverityOverride: text('gdpr_severity_override'),
    gdprAwareAt: timestamp('gdpr_aware_at', { withTimezone: true }),
    gdprAuthorityNotifiedAt: timestamp('gdpr_authority_notified_at', { withTimezone: true }),
    gdprSubjectsNotifiedAt: timestamp('gdpr_subjects_notified_at', { withTimezone: true }),
    gdprEncryptionApplied: text('gdpr_encryption_applied'),
    gdprSubsequentMeasures: text('gdpr_subsequent_measures'),
    gdprPublicCommunication: text('gdpr_public_communication'),
    dpoContact: text('dpo_contact').notNull().default(''),

    // --- DORA ----------------------------------------------------------------
    doraThreatTechniques: jsonb('dora_threat_techniques').$type<string[]>().notNull().default([]),
    /**
     * **A set, like 4.2 and 4.3 beside it.**
     */
    doraRootCauseHigh: jsonb('dora_root_cause_high').$type<string[]>().notNull().default([]),
    doraRootCauseDetailed: jsonb('dora_root_cause_detailed').$type<string[]>().notNull().default([]),
    doraRootCauseAdditional: jsonb('dora_root_cause_additional')
      .$type<string[]>()
      .notNull()
      .default([]),
    doraCriticalFunctions: text('dora_critical_functions'),
    doraSupervisedServices: text('dora_supervised_services'),
    doraMaliciousAccess: text('dora_malicious_access'),
    doraRelevantClients: text('dora_relevant_clients'),
    doraReputationalImpact: text('dora_reputational_impact'),
    doraDataAdverseImpact: text('dora_data_adverse_impact'),
    doraDurationMinutes: integer('dora_duration_minutes'),
    doraCostsEur: integer('dora_costs_eur'),

    /**
     * The organisation facts this case answered itself rather than copied.
     */
    ownFacts: text('own_facts').array().notNull().default([]),

    ...rowVersioning,
  },
  (t) => [...caseScoped(t.caseId)],
)
