/**
 * The controlled vocabularies as plain lists, importable without zod.
 *
 * `vocabularies.ts` builds a `z.enum` over each of these and re-exports them,
 * so the server keeps one import. The client value-imports this module for the
 * two lists it fills a picker from; the schemas beside them would put zod and
 * every schema in `server/src/domain` into the browser bundle, which is what
 * `ui/tsconfig.app.json` and the `no-restricted-imports` rule in
 * `ui/eslint.config.js` exist to prevent.
 *
 * **This file imports nothing, and that is its whole contract.**
 * `vocabularies.lists.test.ts` asserts it.
 */

/** Incident severity. **OCSF `severity_id`**, without its `fatal`. */
export const SEVERITY = ['critical', 'high', 'medium', 'low', 'informational'] as const

/**
 * How sure the analyst is that an event actually happened. **OCSF
 * `confidence_id`.**
 *
 * **Unset is a real state and is not in this list.** An entry built outside a
 * form - a CSV import, a template, demo data - must not assert a confidence
 * nobody gave, so the column is nullable rather than defaulted.
 */
export const CONFIDENCE = ['low', 'medium', 'high'] as const

/**
 * What a network indicator is assessed to be. Practice, not a spec:
 * VirusTotal and MISP converge on these four and no standard mandates them.
 *
 * **`suspicious` is the low-confidence-malicious bucket**, which is why an
 * indicator carries no separate confidence field. A STIX export maps it to
 * malicious-at-low-confidence at the boundary.
 */
export const DISPOSITION = ['malicious', 'suspicious', 'benign', 'unknown'] as const

/**
 * What kind of thing a network indicator is.
 *
 * **Stored rather than guessed.** The kind was re-derived from the value's
 * shape at export time -- a slash meant a URL, anything else a domain -- which
 * made `1.2.3.4` as an address and `1.2.3.4` as a domain one indicator. STIX
 * names each of these as its own observable type.
 *
 * **No hash kinds.** A file hash is malware, which has its own table; an
 * indicator here is something seen on the network.
 */
export const INDICATOR_TYPE = ['ipv4', 'ipv6', 'domain', 'url'] as const

/**
 * Where the analyst is with an indicator, as distinct from what they think of
 * it. Shaped after OCSF `status_id`.
 *
 * **`untriaged` is not `disposition: unknown`** - nobody having looked and
 * having looked without deciding are separate states, and only the first
 * answers how much of a case is outstanding.
 */
export const TRIAGE = ['untriaged', 'investigating', 'assessed'] as const

/**
 * Where an asset stands in the intrusion. No published standard; this is the
 * product's own vocabulary and stays as written.
 *
 * `clean` is correct here - "the host is clean" is how a report reads - and is
 * deliberately not aligned with the indicator's `benign`.
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
 *
 * **Not OCSF's finding status**, which has no `blocked` and no `cancelled`.
 * A task that cannot proceed and a task nobody will do are both real states
 * and neither is "suppressed".
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
   * Somebody outside told us - a CERT notification, a customer, a supplier,
   * law enforcement, an extortion note. The counterpart of `analyst
   * observation`, and not `other`: a regulator asks about this provenance.
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
 * What kind of thing an asset is. **OCSF's device types**, then the two groups
 * OCSF has no room for: collaboration surfaces and rented attacker
 * infrastructure.
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
 * them** - kill-chain order, never alphabetical. The kill-chain coverage
 * screen counts entries per tactic, so the spelling is the join key.
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
 *
 * **No empty member** - unset is `unsettable()`'s job, not a phase of an
 * intrusion. **`command & control` keeps the UKC's ampersand**, unlike
 * ATT&CK's `command and control` above.
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
 * in. **The CIA triad, not a list of attacks** - a regulator asks which of the
 * three was lost, and a method does not answer it.
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
   *
   * **Not `unknown`.** A judgement that nothing was lost is a finding an
   * analyst had to make, and a regulator asks for it; `unknown` is the absence
   * of one.
   */
  'untouched',
  /** Believed involved, disposition not established. */
  'unknown',
] as const

/**
 * What kind of data it is.
 *
 * **Separate from the GDPR data context**, which is a weight in a severity
 * formula. This is what the dataset *is*; that is how badly it scores.
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
 *
 * **Served rather than client-only.** `actionType` is a `kind: 'select'`, so
 * a vocabulary the server does not name leaves the dialog drawing a select
 * that offers nothing and the value reachable only from an import or the demo
 * case. `ui/src/lib/action-class.ts` maps each of these to one of three
 * classes and paints the rail from it; this is the same set, on the side that
 * publishes vocabularies.
 *
 * **Distinct from `TASK_TYPE`, which reads similarly and is not this.** That
 * one classifies a row in the Actions collection - a piece of work somebody
 * owns and closes. This one classifies a thing that happened, on the
 * timeline, at a time.
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
 *
 * **One shape, several kinds**, so an importer run, a forensic acquisition, a
 * console query and a colleague's mail are the same row with different kinds
 * rather than four half-built surfaces. The app never runs any of them: a
 * method is a lab note about an act that happened somewhere else.
 * -> `openspec/specs/collections/spec.md`
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
 *
 * **The four the kit's `CodeBlock` carries, and no fifth for a transcript.**
 * A PowerShell transcript is PowerShell *output*, not PowerShell source, so a
 * source highlighter marks up prompts and result rows as keywords and is wrong
 * more often than right - `''` leaves it plain, which is the honest rendering
 * and costs nothing. -> `ui/src/components/ui/code-block.tsx`
 */
export const QUERY_GRAMMAR = ['kql', 'powershell', 'bash', 'json'] as const
