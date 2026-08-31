/**
 * The English pack, which is also the schema.
 *
 * **Every other pack falls through this one key by key, and coverage counts
 * against these keys** -- so English is not one language among several, it is
 * the floor. That is why it stays compiled in while every other pack is a row
 * an install can upload: a pack that could replace English would leave a
 * coverage figure with nothing to be a fraction of.
 *
 * **Keys, not sentences, at the call site.** A resolver that inlined "Not
 * recorded" would need finding again in nineteen places the day a pack lands,
 * and the one it missed would be the one nobody notices until a customer does.
 */
export const EN: Record<string, string> = {
  'value.not_recorded': 'Not recorded',
  'value.not_stated': 'Not stated',
  /**
   * **The count says whose number it is.** The app never ran the query, so a
   * bare figure would let a reader take a typed number for a measured one.
   */
  'value.rows_as_recorded': '{n} rows returned, as recorded by the analyst',
  'value.rows_not_stated': 'Rows returned not stated',
  'value.yes': 'Yes',
  'value.no': 'No',
  'value.none': 'None recorded',
  'value.of': 'of',
  'value.ongoing': 'ongoing',
  /** Which side a timeline row is, which is the reading the table is scanned for. */
  'value.adversary': 'Adversary',
  'value.response': 'Our response',

  'column.metric': 'Metric',
  'column.value': 'Value',
  'column.term': 'Term',
  'column.tactic': 'Tactic',
  'column.events': 'Events',
  'column.first_seen': 'First seen (UTC)',
  'column.last_seen': 'Last seen (UTC)',

  'metric.time_to_detect': 'Time to detect',
  'exec.assets_in_scope': 'assets in scope',
  'narrative.our_action': 'Our action',
  'narrative.adversary': 'Adversary activity',

  // **The written sections the shipped layouts title.** These were referenced
  // by every layout and carried by no pack, so each one printed its kind --
  // "Written" -- in every language.
  'heading.exec_summary': 'Executive summary',
  'heading.analysis': 'Analysis',
  'heading.analyst_notes': 'Analyst notes',
  'heading.recommendations': 'Recommendations',
  'heading.root_cause': 'Root cause',
  'heading.what_happened': 'What happened',
  'heading.what_we_did': 'What we did',
  'heading.what_we_recommend': 'What we recommend',
  'heading.what_is_still_open': 'What is still open',
  'heading.initial_assessment': 'Initial assessment',
  'heading.status_update': 'Status update',
  'heading.cross_border_impact': 'Cross-border impact',
  'heading.narrative': 'Incident narrative',
  'heading.figure': 'Figure',
  'exec.accounts_involved': 'accounts involved',
  'heading.killchain': 'Kill chain coverage',
  'heading.exec_card': 'Summary',

  // **The generated sections' own titles.** Every one of these printed with no
  // heading at all: a layout gives a generated entry neither a heading nor a
  // key, so `headingFor` answered '' and the delivered document ran a timeline
  // table straight on from the executive summary with nothing above it. The
  // English name on screen came from a client-side fallback that never
  // reached the document.
  'heading.case_header': 'Case',
  'heading.metrics': 'Response metrics',
  'heading.timeline': 'Timeline of events',
  'heading.entities': 'Assets, accounts and indicators',
  'heading.ribbon': 'Attack progression',
  'heading.glossary': 'Terms used in this report',
  'heading.evidence': 'Evidence',
  'heading.methods': 'Methods',
  'heading.actions': 'Response actions',
  'heading.impact': 'Impact',
  'heading.techniques': 'Techniques and sub-techniques',
  'heading.technique_table': 'Techniques observed',
  'heading.indicators': 'Indicators of compromise',
  'metric.dwell': 'Dwell time',
  'metric.hosts_affected': 'Hosts affected',
  'metric.case_age': 'Case age',
  'metric.containment_coverage': 'Containment coverage',

  'rootcause.threat_action': 'Threat action',

  'impact.severity': 'Severity',
  /** The cover's own vocabulary: the line above the headline, and the marking's row. */
  'report.title': 'Incident report',
  'cover.classification': 'Classification',
  'impact.assets': 'Assets in scope',
  'impact.assets_compromised': 'Assets compromised',
  'impact.accounts': 'Accounts in scope',
  'impact.indicators_malicious': 'Malicious indicators',
  'impact.data': 'Data affected',
  'impact.no_data': 'None recorded',

  'ribbon.phases_reached': 'Phases reached',

  'field.customer': 'Customer',
  'field.reference': 'Incident reference',
  'field.case_id': 'Case',
  'field.analyst': 'Analyst',
  'field.console': 'Console',
  'field.workspace': 'Workspace',
  'field.run_by': 'Run by',
  'field.run_at': 'Run at',
  'field.status': 'Status',
  'field.severity': 'Severity',
  'field.incident_class': 'Incident class',
  'field.detection_source': 'Detection source',
  'field.initial_access': 'Initial access',
  'field.opened': 'Opened',
  'field.detected': 'Detected',
  'field.contained': 'Contained',
  'field.eradicated': 'Eradicated',
  'field.recovered': 'Recovered',
  'field.closed': 'Closed',

  'column.time': 'Time (UTC)',
  'column.event': 'Event',
  'column.actor': 'Actor',
  'column.system': 'System',
  'column.technique': 'Technique',
  /** How well the beat is known: the confidence and the tool that saw it. */
  'column.assurance': 'Confidence \u00b7 source',

  'column.evidence': 'Evidence',
  'column.method_ref': 'Ref',
  'column.established': 'What it established',
  'column.where_and_window': 'Where it ran, and over what',
  'column.rows_returned': 'Rows',
  'column.type': 'Type',
  'column.location': 'Location',
  'column.hash': 'Hash',
  'column.classification': 'Class',
  'column.task': 'Task',
  'column.assignee': 'Assignee',
  'column.due': 'Due',
  'column.status': 'Status',

  'heading.applied': 'Applied measures',
  'heading.outstanding': 'Outstanding measures',

  'column.asset': 'Asset',
  'column.zone': 'Zone',
  'column.verdict': 'Verdict',
  'column.account': 'Account',
  'column.domain': 'Domain',
  'column.privileges': 'Privileges',
  'column.indicator': 'Indicator',
  'column.port': 'Port',
  'column.disposition': 'Disposition',
  'column.context': 'Context',
  'column.malware': 'File',
  'column.family': 'Family',
  'column.cloud_app': 'Application',
  'column.publisher': 'Publisher',
  'column.verified': 'Publisher verified',

  'heading.assets': 'Assets',
  'heading.accounts': 'Accounts',
  'heading.network_indicators': 'Network indicators',
  'heading.malware': 'Malware',
  'heading.cloud_apps': 'Cloud applications',

  'empty.assets': 'No assets recorded.',
  'empty.accounts': 'No accounts recorded.',
  'empty.indicators': 'No network indicators recorded.',
  'empty.malware': 'No malware recorded.',
  'empty.cloud_apps': 'No cloud applications recorded.',

  'empty.timeline': 'No timeline entries recorded.',

  /**
   * A figure that could not be drawn says which of the three things happened,
   * because the analyst can act on each differently: choose an image, restore
   * the record, or re-attach the file.
   */
  'figure.unplaced': 'No image chosen for this figure.',
  'figure.missing': 'The evidence record for this figure is no longer in the case.',
  'figure.unavailable': 'This install does not hold the image for this record.',
  'empty.evidence': 'No evidence recorded.',
  'empty.methods': 'No methods recorded.',
  'empty.actions': 'No response actions recorded.',
}
