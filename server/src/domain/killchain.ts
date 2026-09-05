/**
 * Where an entry sits in the Unified Kill Chain, derived rather than stored.
 *
 * **Derived on the server so no client copies the mapping.** The phase is a
 * function of what the analyst already recorded - the ATT&CK tactic, the
 * technique, and an override for the cases ATT&CK cannot express - and a
 * second field they had to fill in would be double entry that disagrees with
 * the first. Every screen that groups by phase reads `ukcPhase` off the row;
 * the alternative is each of them carrying this table.
 *
 * **The kill-chain coverage screen could not work without it.** Measured
 * 2026-08-10 against the running stack: with the phase vocabulary served but
 * no phase on any row, it read *"Reached 0 of 18 kill chain phases"* over a
 * case with 83 tagged events.
 *
 * ## Two published models, and the join between them is the content here
 *
 * ATT&CK says *what* was done; the UKC says *where in the intrusion* it sits.
 * They are not the same axis, so most of the mapping is one-to-one and the
 * interesting part is where it is not:
 *
 * - **Initial Access is three UKC phases**, and the technique decides which.
 *   Phishing is social engineering, an exploited public-facing app is
 *   exploitation, and neither is "delivery". That is what makes storing ATT&CK
 *   lossless rather than merely standard.
 * - **Two phases nothing derives.** `objectives` is the UKC's terminal state -
 *   whether the actor got what they came for is a judgement about the
 *   incident, not an observed technique - and `policy violation` is not an
 *   attack at all. Neither is in either table below, so both are
 *   override-only. (`pivoting` is reachable, but only from a technique.)
 */
import { UKC_PHASE } from './vocabularies.js'

const PHASES: ReadonlySet<string> = new Set(UKC_PHASE)

/**
 * ATT&CK tactic -> its default UKC phase.
 *
 * Mostly the same word, and the two that are not are the point: ATT&CK's
 * `command and control` is the UKC's `command & control` (two published
 * vocabularies, each keeping its own spelling), and `initial access` defaults
 * to `delivery` only because the technique usually says better.
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
 *
 * **Sub-techniques inherit their parent**, so `T1566.001` resolves through
 * `T1566` and only a genuinely divergent sub-technique would need a row.
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
 *
 * **Precedence is override, then technique, then tactic**, because each is
 * strictly more specific than the next: an override is the analyst saying the
 * derivation is wrong for this entry, and a technique distinguishes a phishing
 * link from an exploited web server where Initial Access alone cannot.
 *
 * `''` rather than an "unclassified" phase: every consumer already treats it
 * as "leave it out of the chain", and a nineteenth column holding everything
 * nobody tagged would be the widest one on the screen.
 */
export function ukcPhase(tactic: string, technique = '', override = ''): string {
  if (override) return PHASES.has(override) ? override : ''
  const fromTechnique = FROM_TECHNIQUE[baseTechnique(technique)]
  if (fromTechnique) return fromTechnique
  return FROM_TACTIC[tactic] ?? ''
}

/**
 * The three cycles the UKC groups its phases into.
 *
 * **In, through, out** - getting a foothold, moving around behind it, and
 * acting on the objective. A phase belongs to exactly one.
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
 *
 * A map rather than three membership tests at each call site: three answers
 * computed separately are three places to disagree about a phase that moved.
 */
const CYCLE_OF: Readonly<Record<string, string>> = Object.fromEntries([
  ...UKC_IN.map((phase) => [phase, 'in'] as const),
  ...UKC_THROUGH.map((phase) => [phase, 'through'] as const),
  ...UKC_OUT.map((phase) => [phase, 'out'] as const),
])

/**
 * Which cycle a phase sits in, or `''`.
 *
 * `''` covers an untagged entry and `policy violation`, which is **outside**
 * the kill chain rather than at the end of it - not every incident is an
 * attack. A fourth cycle name for those two would be one more value every
 * consumer has to learn.
 */
export function ukcCycle(phase: string): string {
  return CYCLE_OF[phase] ?? ''
}
