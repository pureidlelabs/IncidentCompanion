/**
 * The controlled vocabularies as plain lists, importable without zod.
 */

/** Incident severity. **OCSF `severity_id`**, without its `fatal`. */
export const SEVERITY = ['critical', 'high', 'medium', 'low', 'informational'] as const

/**
 * How sure the analyst is that an event actually happened. **OCSF
 * `confidence_id`.**
 */
export const CONFIDENCE = ['low', 'medium', 'high'] as const

/**
 * What a network indicator is assessed to be. Practice, not a spec:
 * VirusTotal and MISP converge on these four and no standard mandates them.
 */
export const DISPOSITION = ['malicious', 'suspicious', 'benign', 'unknown'] as const

/**
 * What kind of thing a network indicator is.
 */
export const INDICATOR_TYPE = ['ipv4', 'ipv6', 'domain', 'url'] as const

/**
 * Where the analyst is with an indicator, as distinct from what they think of
 * it. Shaped after OCSF `status_id`.
 */
export const TRIAGE = ['untriaged', 'investigating', 'assessed'] as const

/**
 * Where an asset stands in the intrusion. No published standard; this is the
 * product's own vocabulary and stays as written.
 */
export const ASSET_VERDICT = [
  'unknown',
  'suspected',
  'compromised',
  'accessed',
  'commodity infection',
  'clean',
] as const

/**
 * Task workflow, for an investigation action and an asset's analysis alike.
 */
export const TASK_STATUS = ['open', 'in progress', 'blocked', 'completed', 'cancelled'] as const

/** Where an observation came from - the *class* of log, not the product. */
export const EVENT_SOURCE = [
  'endpoint edr',
  'windows event log',
  'syslog',
  'network sensor',
  'email gateway',
  'identity provider',
  'cloud audit log',
  'saas audit log',
  'siem alert',
  'threat intel',
  'forensic artifact',
  'analyst observation',
  /**
   * Somebody outside told us - a CERT notification, a customer, a supplier, law
   * enforcement, an extortion note.
   */
  'external report',
  'other',
] as const

/**
 * The IR lifecycle phases a task belongs to. **NIST SP 800-61**: containment,
 * eradication and recovery are the standard's own phase names.
 */
export const TASK_TYPE = [
  'analysis',
  'containment',
  'eradication',
  'recovery',
  'information request',
  'notification',
  'deliverable',
  'other',
] as const

/** Forensic acquisition categories, named the way current practice names them. */
export const EVIDENCE_TYPE = [
  'file',
  /**
   * A message, not a file: the chain of custody is about a mail item -
   * headers, a mailbox and a sender - not about bytes copied off a disk.
   */
  'email message',
  /** Captured from a screen, so it has no original to be hashed against. */
  'screenshot',
  'disk image',
  'memory dump',
  'triage collection',
  'system logs',
  'network logs',
  'packet capture',
  'cloud audit export',
  'external source',
  'other',
] as const

/**
 * What kind of thing an asset is.
 */
export const SYSTEM_TYPE = [
  'server',
  'desktop',
  'laptop',
  'tablet',
  'mobile',
  'virtual',
  'iot device',
  'network device',
  'browser',
  'attacker infra',
  'mailbox',
  'sharepoint site',
  'teams team',
  'onedrive',
  'saas app',
  'cloud tenant',
  'other',
] as const

/**
 * Network segment, VLAN-style rather than a flat internal/external. Bare
 * `internal` is the uncategorised fallback beside its own sub-segments.
 */
export const ZONE = [
  'external',
  'dmz',
  'guest',
  'internal',
  'internal - client',
  'internal - network',
  'internal - server',
  'cloud',
] as const

/** Who approved an OAuth grant. An admin grant covers the whole tenant. */
export const CONSENT_TYPE = ['admin', 'user'] as const

/**
 * Whether the publisher passed Microsoft's verification. **`unknown` is not
 * `unverified`** - only the second is evidence.
 */
export const VERIFIED_PUBLISHER = ['verified', 'unverified', 'unknown'] as const

/**
 * MITRE ATT&CK Enterprise v18's fourteen tactics, **ordered as ATT&CK orders
 * them** - kill-chain order, never alphabetical.
 */
export const TACTIC = [
  'reconnaissance',
  'resource development',
  'initial access',
  'execution',
  'persistence',
  'privilege escalation',
  'defense evasion',
  'credential access',
  'discovery',
  'lateral movement',
  'collection',
  'command and control',
  'exfiltration',
  'impact',
] as const

/**
 * The Unified Kill Chain phase an entry is placed in, when ATT&CK's tactic is
 * not the phase the report should show.
 */
export const UKC_PHASE = [
  'reconnaissance',
  'weaponization',
  'delivery',
  'social engineering',
  'exploitation',
  'persistence',
  'defense evasion',
  'command & control',
  'pivoting',
  'discovery',
  'privilege escalation',
  'execution',
  'credential access',
  'lateral movement',
  'collection',
  'exfiltration',
  'impact',
  'objectives',
  'policy violation',
] as const

/**
 * What happened to a body of data, in the terms the regulations are written
 * in.
 */
export const DATA_DISPOSITION = [
  /** Confidentiality: somebody else has it now. */
  'exfiltrated',
  /** Confidentiality, weaker claim: reachable, no evidence it was taken. */
  'accessed',
  /** Availability: encrypted in place, or otherwise unusable. */
  'encrypted',
  /** Availability, permanent. */
  'destroyed',
  /** Integrity: still here, no longer trustworthy. */
  'altered',
  /**
   * Assessed, and nothing happened to it.
   */
  'untouched',
  /** Believed involved, disposition not established. */
  'unknown',
] as const

/**
 * What kind of data it is.
 */
export const DATA_CATEGORY = [
  'personal data',
  'special category data',
  'credentials',
  'financial records',
  'commercial or trade secret',
  'operational or technical',
  'other',
] as const

/**
 * What a SOC activity on the timeline *is*.
 */
export const ACTIVITY_ACTION = [
  'external notification sent',
  'external notification received',
  'internal notification',
  'escalation',
  'containment action',
  'remediation action',
  'investigation started',
  'ticket created',
  'evidence collected',
  'other',
] as const

/**
 * How a finding was obtained - the shape of the act a method record describes.
 */
export const METHOD_KIND = [
  'siem query',
  'log search',
  'endpoint query',
  'shell session',
  'importer run',
  'forensic acquisition',
  'manual observation',
  'third-party report',
  'interview',
  'other',
] as const

/**
 * What a method's recorded text is written in, so the screen can highlight it.
 */
export const QUERY_GRAMMAR = ['kql', 'powershell', 'bash', 'json'] as const
