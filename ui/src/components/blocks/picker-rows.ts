/**
 * What the picker's panes are drawn on.
 */

import type { CaseSummary } from '@/api/case'
import type { AccountRow } from '@/components/blocks/account-table'
import type { AuditRow } from '@/components/blocks/activity-log'
import type { LibraryRow } from '@/components/blocks/library-collection'
import { matchesWords } from '@/lib/word-match'

/** A roster carrying every state the chip has a tone for. */
export const PICKER_ACCOUNTS: readonly AccountRow[] = [
  { id: 'a1', username: 'r.okonkwo', displayName: 'Rachel Okonkwo', role: 'admin', state: 'active' },
  { id: 'a2', username: 't.brennan', displayName: 'Tomas Brennan', role: 'analyst', state: 'active' },
  { id: 'a3', username: 's.iqbal', displayName: 'Sana Iqbal', role: 'analyst', state: 'active' },
  { id: 'a4', username: 'm.delacroix', displayName: 'Margot Delacroix', role: 'analyst', state: 'locked out' },
  { id: 'a5', username: 'd.novak', displayName: '', role: 'analyst', state: 'disabled' },
]

/**
 * The instant `PICKER_AUDIT` is read against, carried beside the rows so the
 * two cannot drift apart.
 */
export const PICKER_AUDIT_NOW = Date.parse('2026-08-24T15:00:00.000Z')

/** Newest first, and wide enough that the pager has a second page to offer. */
export const PICKER_AUDIT: readonly AuditRow[] = [
  audit('v1', '2026-08-24T14:32:00.000Z', 'Low', 'Sign-in', 'authentication', 'Success', 'r.okonkwo', null, '10.20.4.18', 1),
  audit('v2', '2026-08-24T14:29:00.000Z', 'High', 'Sign-in failed', 'authentication', 'Failure', null, 'm.delacroix', '198.51.100.24', 6),
  audit('v3', '2026-08-24T13:58:00.000Z', 'Medium', 'Account locked', 'administration', 'Success', null, 'm.delacroix', '198.51.100.24', 1),
  audit('v4', '2026-08-24T11:04:00.000Z', 'Low', 'Case opened', 'case', 'Success', 't.brennan', 'Meridian Logistics ransomware', '10.20.4.31', 1),
  audit('v5', '2026-08-24T10:47:00.000Z', 'Informational', 'Report exported', 'case', 'Success', 't.brennan', 'Customer RCA', '10.20.4.31', 1),
  audit('v6', '2026-08-23T16:20:00.000Z', 'Critical', 'Case deleted', 'case', 'Success', 'r.okonkwo', 'Exposed S3 bucket', '10.20.4.18', 1),
  audit('v7', '2026-08-23T16:02:00.000Z', 'High', 'Role changed', 'administration', 'Success', 'r.okonkwo', 's.iqbal', '10.20.4.18', 1),
  audit('v8', '2026-08-23T09:15:00.000Z', 'Low', 'Account created', 'administration', 'Success', 'r.okonkwo', 'd.novak', '10.20.4.18', 1),
  audit('v9', '2026-08-22T22:41:00.000Z', 'Medium', 'Request refused', 'operations', 'Failure', null, null, '203.0.113.9', 44),
  audit('v10', '2026-08-22T08:00:00.000Z', 'Informational', 'Installation started', 'operations', 'Success', null, null, null, 1),
]

function audit(
  id: string,
  at: string,
  severity: AuditRow['severity'],
  activity: string,
  channel: AuditRow['channel'],
  outcome: AuditRow['outcome'],
  actor: string | null,
  target: string | null,
  source: string | null,
  runLength: number,
): AuditRow {
  return { id, at, severity, activity, channel, outcome, actor, target, source, runLength }
}

/** The three checklists a new case can start from. */
export const PICKER_TEMPLATES: readonly LibraryRow[] = [
  entry('ransomware', 'Ransomware', 'built-in'),
  entry('bec', 'Business email compromise', 'built-in'),
  entry('meridian-retainer', 'Meridian retainer', 'yours'),
]

/** The layouts a report can start from. */
export const PICKER_LAYOUTS: readonly LibraryRow[] = [
  entry('customer-rca', 'Customer RCA', 'built-in'),
  entry('bsi-early-warning', 'BSI early warning', 'built-in'),
  entry('executive-brief', 'Executive brief', 'built-in'),
  entry('gdpr-notification', 'GDPR notification', 'built-in'),
  entry('technical-appendix', 'Technical appendix', 'built-in'),
  entry('handover', 'Shift handover', 'built-in'),
  entry('meridian-monthly', 'Meridian monthly', 'yours'),
]

/**
 * Paragraphs to drop into a written section.
 */
export const PICKER_SNIPPETS: readonly LibraryRow[] = [
  entry('scope-statement', 'Scope statement', 'built-in'),
  entry('containment-summary', 'Containment summary', 'built-in'),
  entry('no-exfiltration', 'No exfiltration observed', 'built-in'),
  entry('exfiltration-confirmed', 'Exfiltration confirmed', 'built-in'),
  entry('mfa-recommendation', 'Enforce multi-factor', 'built-in'),
  entry('backup-recommendation', 'Offline backups', 'built-in'),
  entry('gdpr-72-hours', 'GDPR 72-hour window', 'built-in'),
  entry('gdpr-no-notification', 'GDPR, no notification owed', 'built-in'),
  entry('log-retention-gap', 'Log retention gap', 'built-in'),
  entry('patch-gap', 'Missing patch', 'built-in'),
  entry('phishing-entry', 'Phishing as entry', 'built-in'),
  entry('rdp-entry', 'Exposed RDP as entry', 'built-in'),
  entry('meridian-boilerplate', 'Meridian boilerplate', 'yours'),
  entry('meridian-closing', 'Meridian closing paragraph', 'yours'),
]

function entry(name: string, label: string, origin: LibraryRow['origin']): LibraryRow {
  return { id: name, name, label, origin }
}

/** A language a report may be written in. */
export interface LanguageRow {
  id: string
  code: string
  label: string
  /** Between 0 and 1. Floored for display, never rounded up. */
  coverage: number
  builtin: boolean
}

/** How many strings a complete pack carries. */
export const LANGUAGE_KEY_COUNT = 412

export const PICKER_LANGUAGES: readonly LanguageRow[] = [
  { id: 'en', code: 'en', label: 'English', coverage: 1, builtin: true },
  { id: 'nl', code: 'nl', label: 'Nederlands', coverage: 1, builtin: true },
  { id: 'de', code: 'de', label: 'Deutsch', coverage: 0.968, builtin: true },
  { id: 'fr', code: 'fr', label: 'Fran\u00E7ais', coverage: 0.874, builtin: false },
  { id: 'pt-BR', code: 'pt-BR', label: 'Portugu\u00EAs (Brasil)', coverage: 0.412, builtin: false },
]

/**
 * A pack's coverage, floored.
 */
export function coveragePercent(coverage: number): string {
  return `${String(Math.floor(coverage * 100))}%`
}

/** A worked case an analyst can look around without starting work. */
export interface DemoRow {
  id: string
  title: string
  scenario: string
  scale: string
  summary: string
}

export const PICKER_DEMOS: readonly DemoRow[] = [
  {
    id: 'demo-ransomware',
    title: 'Worked ransomware campaign',
    scenario: 'ransomware',
    scale: 'large',
    summary:
      'A human-operated intrusion across a logistics estate: phishing in, credential theft, then encryption on the third night.',
  },
  {
    id: 'demo-bec',
    title: 'Finance mailbox compromise',
    scenario: 'business email compromise',
    scale: 'small',
    summary:
      'One mailbox read in bulk through the Graph API, a forwarding rule, and an invoice altered before it was paid.',
  },
]

/** One dependency this install talks to, and whether it is answering. */
export interface ServingRow {
  label: string
  up: boolean
  detail: string
}

export const PICKER_SERVING: readonly ServingRow[] = [
  { label: 'Server', up: true, detail: 'answering' },
  { label: 'Postgres', up: true, detail: 'reachable' },
  { label: 'Redis', up: false, detail: 'connection refused' },
]

/**
 * What the health pane says when presence has gone.
 */
export const REDIS_DOWN_NOTE =
  'Cases are still writable. What stops is presence, claims and the live repaint \u2014 another analyst\u2019s screen will not update until they reload.'

/** A quantity against a known ceiling. */
export interface GaugeRow {
  label: string
  used: number
  total: number
  /** How the two numbers read: binary bytes, a bare count, or a load average. */
  unit: 'bytes' | 'count' | 'load'
}

export const PICKER_GAUGES: readonly GaugeRow[] = [
  { label: 'Heap', used: 214_958_080, total: 402_653_184, unit: 'bytes' },
  { label: 'Memory, this container', used: 1_181_116_006, total: 2_147_483_648, unit: 'bytes' },
  { label: 'Disk holding /app/evidence', used: 41_875_931_136, total: 68_719_476_736, unit: 'bytes' },
  { label: 'Load, 1 min (8 cores)', used: 2.31, total: 8, unit: 'load' },
]

/** Connections, drawn apart from the machine's own gauges. */
export const PICKER_CONNECTIONS: GaugeRow = {
  label: 'Connections, all clients',
  used: 6,
  total: 100,
  unit: 'count',
}

/**
 * A quantity written the way the health pane writes it.
 */
export function healthFigure(value: number, unit: GaugeRow['unit']): string {
  if (unit === 'load') return value.toFixed(2)
  if (unit === 'count') return String(value)
  return bytes(value)
}

/** Binary bytes, one decimal below ten in any unit above bytes. */
export function bytes(value: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let at = 0
  let left = value
  while (left >= 1024 && at < units.length - 1) {
    left /= 1024
    at += 1
  }
  const digits = at > 0 && left < 10 ? 1 : 0
  return `${left.toFixed(digits)} ${units[at] ?? 'B'}`
}

/** One headline number on the Postgres card. */
export interface FigureRow {
  label: string
  value: string
  /** One line under the number. */
  note?: string
  /** Draw the note as a warning: this is a state somebody has to act on. */
  warn?: boolean
}

export const PICKER_FIGURES: readonly FigureRow[] = [
  { label: 'Cases', value: '6', note: '1 demo' },
  { label: 'Open', value: '3', note: '3 closed' },
  { label: 'Accounts', value: '5', note: '1 admin' },
  { label: 'Database', value: '184 MiB' },
]

/** A table in the case database, largest first. */
export interface TableRow {
  name: string
  approximateRows: number
  bytes: number
}

export const PICKER_TABLES: readonly TableRow[] = [
  { name: 'timeline_entry', approximateRows: 48_112, bytes: 96_468_992 },
  { name: 'audit_event', approximateRows: 31_044, bytes: 41_943_040 },
  { name: 'case_compliance', approximateRows: 4_180, bytes: 8_388_608 },
  { name: 'network_indicator', approximateRows: 2_907, bytes: 5_242_880 },
  { name: 'account', approximateRows: 5, bytes: 32_768 },
]

/** How long this install has been up, written the way the pane writes it. */
export const PICKER_UPTIME = 'up 3d 4h'

/** One setting on the administration pane, and the choices it offers. */
export interface BoundRow {
  id: string
  label: string
  /** One line under the label. Absent where the label is the whole of it. */
  description?: string
  /** The words in the select, in order. */
  choices: readonly string[]
  /** Which of them is set. */
  chosen: string
  /**
   * Where a choice goes.
   */
  onChoose?: (choice: string) => void
}

/** A regime a case can be assessed against. */
export interface RegimeRow {
  id: string
  label: string
  on: boolean
}

export const PICKER_REGIMES: readonly RegimeRow[] = [
  { id: 'gdpr', label: 'GDPR', on: true },
  { id: 'nis2', label: 'NIS2', on: true },
  { id: 'dora', label: 'DORA', on: false },
]

export const AUDIT_BOUNDS: readonly BoundRow[] = [
  {
    id: 'retention',
    label: 'Retention window',
    description: 'Sign-ins, account changes and case deletions.',
    choices: ['30 days', '90 days', '180 days', '365 days', '730 days'],
    chosen: '365 days',
  },
  {
    id: 'operational',
    label: 'Operational lines',
    description: 'Requests, socket connections and refused floods.',
    choices: ['7 days', '14 days', '30 days', '90 days', '180 days'],
    chosen: '30 days',
  },
  {
    id: 'run-window',
    label: 'Run window',
    choices: ['1 minutes', '5 minutes', '15 minutes', '30 minutes', '60 minutes'],
    chosen: '5 minutes',
  },
]

export const SIGN_IN_BOUNDS: readonly BoundRow[] = [
  {
    id: 'lock-after',
    label: 'Lock after',
    choices: ['3 failures', '5 failures', '10 failures', '20 failures', '50 failures'],
    chosen: '10 failures',
  },
  {
    id: 'locked-for',
    label: 'Locked for',
    choices: ['5 minutes', '15 minutes', '30 minutes', '60 minutes', '240 minutes'],
    chosen: '15 minutes',
  },
  {
    id: 'shortest-password',
    label: 'Shortest password',
    choices: ['12 characters', '14 characters', '16 characters', '20 characters', '24 characters'],
    chosen: '12 characters',
  },
]

/**
 * The two windows a session is held to, which are the settings this install
 * really serves and the only rows here that write.
 */
export const SESSION_BOUNDS: readonly BoundRow[] = [
  {
    id: 'session-idle',
    label: 'Sign out when idle for',
    description: 'How long a session survives with nobody at the keyboard.',
    choices: ['15 minutes', '30 minutes', '1 hour', '2 hours'],
    chosen: '30 minutes',
    onChoose: () => undefined,
  },
  {
    id: 'session-lifetime',
    label: 'Sign out after',
    description: 'How long a session lasts however busy it is.',
    choices: ['4 hours', '8 hours', '12 hours', '24 hours'],
    chosen: '8 hours',
    onChoose: () => undefined,
  },
]

export const LIMIT_BOUNDS: readonly BoundRow[] = [
  {
    id: 'one-attachment',
    label: 'One attachment',
    choices: ['64 MB', '128 MB', '256 MB', '512 MB', '1024 MB', '2048 MB'],
    chosen: '256 MB',
  },
  {
    id: 'one-archive',
    label: 'One archive',
    choices: ['128 MB', '256 MB', '512 MB', '1024 MB', '2048 MB', '4096 MB'],
    chosen: '1024 MB',
  },
  {
    id: 'archive-passphrase',
    label: 'Archive passphrase',
    choices: ['8 characters', '12 characters', '16 characters', '20 characters', '32 characters'],
    chosen: '16 characters',
  },
]

/** A setting this install does not offer, named rather than drawn as a dead switch. */
export interface AbsentSetting {
  label: string
  description: string
}

export const ABSENT_SIGN_IN: readonly AbsentSetting[] = [
  { label: 'Second factor', description: 'One-time codes from an authenticator app.' },
  { label: 'Microsoft Entra ID', description: 'Your own tenant, on the server.' },
]

export const ABSENT_FORWARDING: readonly AbsentSetting[] = [
  { label: 'Syslog', description: 'To a syslog collector, as it happens.' },
  { label: 'SIEM', description: 'Read on a schedule, in OCSF.' },
]

/**
 * Whether a case matches what is typed in the case list's search box.
 */
export function matchesCase(row: CaseSummary, query: string): boolean {
  return matchesWords(row.title, query)
}

/**
 * A case row, so a roster reads as a table rather than as seven object
 * literals.
 */
function caseRow(
  id: string,
  title: string,
  customer: string,
  reference: string | null,
  status: string,
  updatedAt: string,
  isDemo: boolean,
): CaseSummary {
  return {
    id,
    title,
    customer,
    reference,
    summary: null,
    status,
    openedAt: updatedAt,
    closedAt: status === 'closed' ? updatedAt : null,
    isDemo,
    version: 1,
    updatedAt,
  }
}

/** A roster wide enough to sort, narrow and run out of room in. */
export const PICKER_CASES: readonly CaseSummary[] = [
  caseRow('1ee22e6d', 'Meridian Logistics ransomware', 'Meridian Logistics', 'INC-2026-0447', 'open', '2026-08-13T06:12:00.000Z', false),
  caseRow('7c1a4b90', 'Finance mailbox compromise', 'Northwind Freight', 'INC-2026-0431', 'open', '2026-08-11T14:40:00.000Z', false),
  caseRow('2b55e173', 'Payroll credential stuffing', 'Kestrel Health', 'INC-2026-0424', 'open', '2026-08-09T08:05:00.000Z', false),
  caseRow('9f0c33ad', 'Supplier invoice fraud', 'Meridian Logistics', 'INC-2026-0410', 'closed', '2026-07-30T16:22:00.000Z', false),
  caseRow('4d8e21bf', 'Stolen laptop, unencrypted', 'Kestrel Health', 'INC-2026-0398', 'closed', '2026-07-24T09:15:00.000Z', false),
  caseRow('6a3f7c52', 'Exposed S3 bucket', 'Northwind Freight', null, 'closed', '2026-07-18T11:47:00.000Z', false),
  caseRow('0e91d4c8', 'Worked example: ransomware campaign', 'Demo Customer', 'DEMO-0001', 'open', '2026-08-13T12:16:00.000Z', true),
]
