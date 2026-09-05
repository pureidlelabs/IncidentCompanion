/*
 * The regulatory vocabularies.
 *
 * **This file is the only copy.** It was generated from a Python tier that was
 * removed on 2026-08-29, so there is no longer a source to regenerate from and
 * nothing that disagrees when a value here changes.
 *
 * These are closed sets from law and from published taxonomies, not product
 * choices: the RSIT classes are ENISA's, the severity weights are what a GDPR
 * risk assessment is computed from, and the member states are the Union's.
 * **Editing a value here is a regulatory claim, and it reaches a regulator's
 * report with nothing in between** - a missing option is one an analyst cannot
 * pick, and a wrong weight is a severity band computed wrongly. Change one only
 * against the published text, and say which in the commit message.
 */

/** ENISA RSIT, the incident taxonomy a report is classified under. */
export const RSIT_SOURCE_COMMIT = '901c69c124ae33c7827b07a396424d57a1a43645'
export const RSIT_SOURCE_REPO = 'enisaeu/Reference-Security-Incident-Taxonomy-Task-Force'

export const RSIT_CLASSES = [
  { value: 'abusive-content', label: 'Abusive Content' },
  { value: 'malicious-code', label: 'Malicious Code' },
  { value: 'information-gathering', label: 'Information Gathering' },
  { value: 'intrusion-attempts', label: 'Intrusion Attempts' },
  { value: 'intrusions', label: 'Intrusions' },
  { value: 'availability', label: 'Availability' },
  { value: 'information-content-security', label: 'Information Content Security' },
  { value: 'fraud', label: 'Fraud' },
  { value: 'vulnerable', label: 'Vulnerable' },
  { value: 'other', label: 'Other' },
  { value: 'test', label: 'Test' },
] as const

/** The types each class offers. Empty for a class with none. */
export const RSIT_TYPES: Record<string, { value: string; label: string }[]> = {
  'abusive-content': [
    { value: 'spam', label: 'Spam' },
    { value: 'harmful-speech', label: 'Harmful Speech' },
    { value: 'violence', label: '(Child) Sexual Exploitation/Sexual/Violent Content' },
  ],
  'malicious-code': [
    { value: 'infected-system', label: 'Infected System' },
    { value: 'c2-server', label: 'C2 Server' },
    { value: 'malware-distribution', label: 'Malware Distribution' },
    { value: 'malware-configuration', label: 'Malware Configuration' },
  ],
  'information-gathering': [
    { value: 'scanner', label: 'Scanning' },
    { value: 'sniffing', label: 'Sniffing' },
    { value: 'social-engineering', label: 'Social Engineering' },
  ],
  'intrusion-attempts': [
    { value: 'ids-alert', label: 'Exploitation of Known Vulnerabilities' },
    { value: 'brute-force', label: 'Login Attempts' },
    { value: 'exploit', label: 'New Attack Signature' },
  ],
  intrusions: [
    { value: 'privileged-account-compromise', label: 'Privileged Account Compromise' },
    { value: 'unprivileged-account-compromise', label: 'Unprivileged Account Compromise' },
    { value: 'application-compromise', label: 'Application Compromise' },
    { value: 'system-compromise', label: 'System Compromise' },
    { value: 'burglary', label: 'Burglary' },
  ],
  availability: [
    { value: 'dos', label: 'Denial of Service' },
    { value: 'ddos', label: 'Distributed Denial of Service' },
    { value: 'misconfiguration', label: 'Misconfiguration' },
    { value: 'sabotage', label: 'Sabotage' },
    { value: 'outage', label: 'Outage' },
  ],
  'information-content-security': [
    { value: 'unauthorised-information-access', label: 'Unauthorised Access to Information' },
    {
      value: 'unauthorised-information-modification',
      label: 'Unauthorised Modification of Information',
    },
    { value: 'data-loss', label: 'Data Loss' },
    { value: 'data-leak', label: 'Leak of Confidential Information' },
  ],
  fraud: [
    { value: 'unauthorised-use-of-resources', label: 'Unauthorised Use of Resources' },
    { value: 'copyright', label: 'Copyright' },
    { value: 'masquerade', label: 'Masquerade' },
    { value: 'phishing', label: 'Phishing' },
  ],
  vulnerable: [
    { value: 'weak-crypto', label: 'Weak Cryptography' },
    { value: 'ddos-amplifier', label: 'DDoS Amplifier' },
    { value: 'potentially-unwanted-accessible', label: 'Potentially Unwanted Accessible Services' },
    { value: 'information-disclosure', label: 'Information Disclosure' },
    { value: 'vulnerable-system', label: 'Vulnerable System' },
  ],
  other: [
    { value: 'other', label: 'Uncategorised' },
    { value: 'undetermined', label: 'Undetermined' },
  ],
  test: [{ value: 'test', label: 'Test' }],
}

/** ENISA severity, the bands a GDPR breach is scored into. */
export const GDPR_SEVERITY_BANDS = ['low', 'medium', 'high', 'very high'] as const

/** `DATA_CONTEXTS` - the weight is what the score is computed from. */
export const GDPR_DATA_CONTEXTS = [
  { value: 'simple', weight: 1.0, label: 'Simple data (name, contact details)' },
  { value: 'behavioural', weight: 2.0, label: 'Behavioural data (location, traffic, habits)' },
  { value: 'financial', weight: 3.0, label: 'Financial data (payment, transactions)' },
  {
    value: 'sensitive',
    weight: 4.0,
    label: 'Sensitive data (Article 9: health, biometric, beliefs)',
  },
] as const

/** `IDENTIFIABILITY` - the weight is what the score is computed from. */
export const GDPR_IDENTIFIABILITY = [
  {
    value: 'negligible',
    weight: 0.25,
    label: 'Negligible -- identification is practically impossible',
  },
  { value: 'limited', weight: 0.5, label: 'Limited -- identification is possible with effort' },
  { value: 'significant', weight: 0.75, label: 'Significant -- identification is straightforward' },
  { value: 'maximum', weight: 1.0, label: 'Maximum -- individuals are directly identified' },
] as const

/** `BREACH_CIRCUMSTANCES` - the weight is what the score is computed from. */
export const GDPR_CIRCUMSTANCES = [
  { value: 'confidentiality', weight: 0.25, label: 'Loss of confidentiality' },
  { value: 'integrity', weight: 0.25, label: 'Loss of integrity' },
  { value: 'availability', weight: 0.25, label: 'Loss of availability' },
  { value: 'malicious', weight: 0.5, label: 'Malicious intent' },
] as const

/** The Union's member states, for the affected-states set. */
export const EU_MEMBER_STATES = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
] as const

/** NIS2 Art 23: whether the incident is suspected unlawful or malicious. */
export const NIS2_SUSPICION = ['suspected', 'not suspected'] as const

/**
 * NIS2, what the entity is - which decides whether the regime applies.
 *
 * **The empty member is dropped, here and below.** Python leads each of
 * these with `''` for 'not assessed'; on this side an unanswered question
 * is null, so a sentinel inside the vocabulary would be a second spelling
 * for it - and the one that survives into a report as an answer.
 */
export const NIS2_ENTITY_CLASSES = ['essential', 'important', 'out of scope'] as const
export const NIS2_ENTITY_TYPES = [
  'dns',
  'tld',
  'cloud',
  'datacentre',
  'cdn',
  'msp',
  'mssp',
  'marketplace',
  'search',
  'social',
  'trust',
  'other',
] as const

/** NIS2 Art 23: whether the incident crosses the significance threshold. */
export const NIS2_SIGNIFICANCE = ['significant', 'not significant'] as const

/**
 * VERIS action classes - what kind of incident this is.
 *
 * **`unknown` is dropped deliberately.** Python carries it as a real value
 * and then needs `stated_incident_class()` to strip it again, because a
 * sentinel meaning 'not stated' reads as an answer: it titled a MISP event
 * `CASE-1 - unknown` and printed `Incident class: unknown` on a customer
 * report. Here the absence of an answer is null, which needs no helper.
 */
export const VERIS_ACTIONS = [
  'hacking',
  'malware',
  'social',
  'misuse',
  'physical',
  'error',
  'environmental',
] as const

/**
 * DORA, from the ITS's own wording - Commission Implementing Regulation
 * CELEX 32025R0302. **Do not reword these.** A report names the
 * technique and the root cause back to a supervisor, and a paraphrase is a
 * different claim from the one the Regulation lists.
 */
export const DORA_CELEX = '32025R0302'
export const DORA_THREAT_TECHNIQUES = [
  'Social engineering (including phishing)',
  '(D)DoS',
  'Identity theft',
  'Data encryption for impact, including ransomware',
  'Resource hijacking',
  'Data exfiltration and manipulation, including identity theft',
  'Data destruction',
  'Defacement',
  'Supply-chain attack',
  'Other (please specify)',
] as const
export const DORA_ROOT_CAUSE_HIGH = [
  'malicious actions',
  'process failure',
  'system failure / malfunction',
  'human error',
  'external event',
] as const

/** The detailed causes each high-level cause offers. */
export const DORA_ROOT_CAUSE_DETAILED: Record<string, readonly string[]> = {
  'malicious actions': [
    'malicious actions: deliberate internal actions',
    'malicious actions: deliberate physical damage/manipulation/theft',
    'malicious actions: fraudulent actions',
  ],
  'process failure': [
    'process failure: insufficient monitoring or failure of monitoring and control',
    'process failure: i nsufficient/unclear roles and responsibilities',
    'process failure: ICT risk management process failure',
    'process failure: insufficient or failure of ICT operations and ICT security operations',
    'process failure: insufficient or failure of ICT project management',
    'process failure: inadequacy of internal policies, procedures and documentation',
    'Process failure: inadequate ICT systems acquisition, development, and maintenance',
    'process failure: other (please specify)',
  ],
  'system failure': [
    'system failure: hardware capacity and performance',
    'system failure: hardware maintenance',
    'system failure: hardware obsolescence/ageing',
    'system failure: software compatibility/configuration',
    'system failure: software performance',
    'system failure: network configuration',
    'system failure: physical damage',
    'system failure: other (please specify)',
  ],
  'human error': [
    'human error: omission',
    'human error: mistake',
    'human error: skills & knowledge',
    'human error: inadequate human resources',
    'human error miscommunication',
    'human error: other (please specify)',
  ],
  'external event': [
    'external event: natural disasters/force majeure',
    'external event: third-party failures',
    'external event: other (please specify)',
  ],
}

/** And the additional causes each detailed cause offers. */
export const DORA_ROOT_CAUSE_ADDITIONAL: Record<string, readonly string[]> = {
  'process failure: insufficient monitoring or failure of monitoring and control': [
    'monitoring of policy adherence',
    'monitoring of third-party service providers',
    'monitoring and verification of remediation of vulnerabilities',
    'identity and access management',
    'encryption and cryptography',
    'logging',
  ],
  'process failure: ICT risk management process failure': [
    'failure in specifying accurate risk tolerance levels',
    'insufficient vulnerability and threat assessments',
    'inadequate risk treatment measures',
    'poor management of residual ICT risks',
  ],
  'process failure: insufficient or failure of ICT operations and ICT security operations': [
    'vulnerability and patch management',
    'change management',
    'capacity and performance management',
    'ICT asset management and information classification',
    'backup and restore',
    'error handling',
  ],
  'Process failure: inadequate ICT systems acquisition, development, and maintenance': [
    'inadequate ICT systems acquisition, development, and maintenance',
    'insufficient or failure of software testing',
  ],
}
