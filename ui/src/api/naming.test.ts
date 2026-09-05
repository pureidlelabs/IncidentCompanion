import { describe, expect, it } from 'vitest'

import { fromWire, toCamel, toSnake, toWire } from './naming'

/**
 * **Every field name the wire carries, as a fixture rather than a generated
 * import.** It was emitted from the Python model by a generator that no longer
 * exists; the client reads the server's own types through `@contract/*` now.
 *
 * **Frozen, and that is the cost.** A field added on the server does not appear
 * here, so this asserts the converter is safe for 167 names rather than for all
 * of them. It is still the right test: a generic converter is only safe if it
 * is safe for every name, and the digit in `nis2_entity_class` is the shape a
 * naive implementation breaks on. The self-maintaining version derives the list
 * from the server's own schemas, which needs them as runtime values on this side
 * - `@contract` is `import type` and erased.
 */
const WIRE_FIELD_NAMES = [
  'account_id', 'account_ids', 'account_name', 'accounts', 'action_type', 'actions',
  'affected_member_states', 'analysis_status', 'analyst', 'annual_turnover_eur', 'app_name',
  'assignee', 'author', 'blocked', 'blocked_at', 'body', 'case_id', 'casenotes', 'closed_at',
  'cloud_app_ids', 'cloud_apps', 'colour', 'competent_authority', 'confidence',
  'consent_type', 'contained_at', 'context', 'created_at', 'customer', 'data_classification',
  'date_added', 'date_due', 'description', 'detected_at', 'detection_gap', 'detection_source',
  'disabled', 'disabled_at', 'disposition', 'domain', 'dora_costs_eur',
  'dora_critical_functions', 'dora_data_adverse_impact', 'dora_duration_minutes',
  'dora_malicious_access', 'dora_relevant_clients', 'dora_reputational_impact',
  'dora_root_cause_additional', 'dora_root_cause_detailed', 'dora_root_cause_high',
  'dora_supervised_services', 'dora_threat_techniques', 'dpo_contact', 'eradicated_at',
  'event_source', 'evidence', 'evidence_ids', 'exfiltration', 'family', 'file_path',
  'filename', 'financial_impact', 'financial_loss_eur', 'first_seen', 'followup', 'frozen',
  'gdpr_authority_notified_at', 'gdpr_aware_at', 'gdpr_circumstances', 'gdpr_data_context',
  'gdpr_encryption_applied', 'gdpr_identifiability', 'gdpr_public_communication',
  'gdpr_severity_override', 'gdpr_subjects_notified_at', 'gdpr_subsequent_measures', 'hash',
  'heading', 'heading_key', 'hide_from_graph', 'home_member_state', 'hostname', 'id',
  'incident_class', 'incident_reference', 'initial_access_vector', 'ip', 'isolated',
  'isolated_at', 'kind', 'label', 'language', 'last_activity', 'location', 'malware',
  'malware_id', 'malware_ids', 'name', 'network_indicator_ids', 'network_indicators',
  'nis2_considerable_damage', 'nis2_death', 'nis2_entity_class', 'nis2_entity_type',
  'nis2_health_damage', 'nis2_malicious_access', 'nis2_severe_disruption',
  'nis2_significance', 'nis2_trade_secret_loss', 'note', 'notes', 'opened_at',
  'original_system_id', 'outside_eu_countries', 'outside_eu_reach', 'personal_data_involved',
  'port', 'position', 'privileges', 'provenance', 'publisher', 'recovered_at',
  'recurring_earlier_cases', 'recurring_incident', 'report_blocks', 'report_id', 'reports',
  'requested_scopes', 'rsit_class', 'rsit_type', 'schema_version', 'sent_at',
  'service_downtime_complete', 'service_downtime_minutes', 'severity', 'signature', 'source',
  'source_system_id', 'source_tool', 'stage', 'staging_system_id', 'status', 'style',
  'system_id', 'system_type', 'systems', 'tactic', 'tags', 'target_indicator_id', 'task',
  'task_type', 'technique', 'template', 'time', 'time_assumed', 'timeline', 'tlp', 'type',
  'ukc_override', 'unlawful_or_malicious', 'unreviewed', 'users_affected',
  'users_affected_count', 'users_total_count', 'verdict', 'verified_publisher', 'zone',
] as const

describe('the wire naming boundary', () => {
  it('round-trips every field name the API actually uses', () => {
    // Over the generated list rather than examples: a generic converter is
    // only safe if it is safe for all 167 of them, and the digit in
    // `nis2_entity_class` is the shape that breaks a naive implementation.
    const broken = WIRE_FIELD_NAMES.filter((name) => toSnake(toCamel(name)) !== name)
    expect(broken).toEqual([])
  })

  it('converts nested objects and arrays', () => {
    const wire = {
      case_id: 'DEMO',
      report_blocks: [{ block_type: 'text', hide_from_graph: true }],
    }
    expect(fromWire(wire)).toEqual({
      caseId: 'DEMO',
      reportBlocks: [{ blockType: 'text', hideFromGraph: true }],
    })
  })

  it('sends camelCase back as snake_case', () => {
    expect(toWire({ eventSource: 'edr', accountIds: ['a'] })).toEqual({
      event_source: 'edr',
      account_ids: ['a'],
    })
  })

  it('leaves a value alone that is not a plain object', () => {
    // A Date's keys are not data. Rewriting them would produce `{}` and the
    // field would silently arrive empty.
    const when = new Date('2026-07-24T17:35:41Z')
    expect(fromWire<{ at: Date }>({ at: when }).at).toBe(when)
  })
})
