/**
 * Where an entry sits in the Unified Kill Chain, derived rather than stored.
 */
import { UKC_PHASE } from './vocabularies.js'

const PHASES: ReadonlySet<string> = new Set(UKC_PHASE)

/**
 * ATT&CK tactic -> its default UKC phase.
 */
const FROM_TACTIC: Readonly<Record<string, string>> = {
  reconnaissance: 'reconnaissance',
  'resource development': 'weaponization',
  'initial access': 'delivery',
  execution: 'execution',
  persistence: 'persistence',
  'privilege escalation': 'privilege escalation',
  'defense evasion': 'defense evasion',
  'credential access': 'credential access',
  discovery: 'discovery',
  'lateral movement': 'lateral movement',
  collection: 'collection',
  'command and control': 'command & control',
  exfiltration: 'exfiltration',
  impact: 'impact',
}

/**
 * Technique -> UKC phase, where the technique is more specific than its tactic.
 */
const FROM_TECHNIQUE: Readonly<Record<string, string>> = {
  // Initial Access -> social engineering: the human was the vulnerability.
  T1566: 'social engineering', // Phishing
  T1660: 'social engineering', // Phishing (mobile)
  // Execution, and the human is still the mechanism.
  T1204: 'social engineering', // User Execution
  // Initial Access -> exploitation: a technical vulnerability was the door.
  T1190: 'exploitation', // Exploit Public-Facing Application
  T1189: 'exploitation', // Drive-by Compromise
  T1203: 'exploitation', // Exploitation for Client Execution
  // Command and Control -> pivoting: tunnelling onward through a foothold,
  // which is the only route to that column and why it is not override-only.
  T1090: 'pivoting', // Proxy
  T1572: 'pivoting', // Protocol Tunneling
}

/** `T1566.001` -> `T1566`. Every lookup folds to the parent first. */
export function baseTechnique(technique: string): string {
  return technique ? (technique.split('.', 1)[0] ?? '').trim().toUpperCase() : ''
}

/**
 * The phase this entry belongs in, or `''` for untagged.
 */
export function ukcPhase(tactic: string, technique = '', override = ''): string {
  if (override) return PHASES.has(override) ? override : ''
  const fromTechnique = FROM_TECHNIQUE[baseTechnique(technique)]
  if (fromTechnique) return fromTechnique
  return FROM_TACTIC[tactic] ?? ''
}

/**
 * The three cycles the UKC groups its phases into.
 */
export const UKC_IN = [
  'reconnaissance',
  'weaponization',
  'delivery',
  'social engineering',
  'exploitation',
  'persistence',
  'defense evasion',
  'command & control',
] as const

export const UKC_THROUGH = [
  'pivoting',
  'discovery',
  'privilege escalation',
  'execution',
  'credential access',
  'lateral movement',
] as const

export const UKC_OUT = ['collection', 'exfiltration', 'impact', 'objectives'] as const

/**
 * Phase -> cycle, built once from the three lists.
 */
const CYCLE_OF: Readonly<Record<string, string>> = Object.fromEntries([
  ...UKC_IN.map((phase) => [phase, 'in'] as const),
  ...UKC_THROUGH.map((phase) => [phase, 'through'] as const),
  ...UKC_OUT.map((phase) => [phase, 'out'] as const),
])

/**
 * Which cycle a phase sits in, or `''`.
 */
export function ukcCycle(phase: string): string {
  return CYCLE_OF[phase] ?? ''
}
