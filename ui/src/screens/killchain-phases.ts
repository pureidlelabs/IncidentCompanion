import { isEvent, type Case, type TimelineEntry } from '@/api/model'
import type { Specs } from '@/api/specs'

/**
 * What the kill chain accounts for on this case, and what it does not.
 *
 * **The page does not draw the chain.** Three other surfaces already answer
 * what happened; the question none of them can answer is whether the chain is
 * accounted for, which is a table of every phase and the evidence behind it.
 */

/**
 * The served vocabulary member that is not a phase.
 *
 * `ukcPhase` publishes it so an entry can be filed as neither attack nor
 * response, and the chain has no stage for it - so it is counted as an absence
 * rather than drawn as a nineteenth row.
 */
const NOT_A_PHASE = 'policy violation'

/** Where a phase sits in the intrusion: getting in, moving, getting out. */
export type Cycle = 'in' | 'through' | 'out' | ''

export interface CoveragePhase {
  phase: string
  /** Its place in the canonical order, from 1. */
  num: number
  cycle: Cycle
  observed: boolean
  /** The hosts the entries in this phase name, by display name. */
  hosts: readonly string[]
  entries: number
  techniques: readonly string[]
  /** Observed, and resting on a single host. */
  thin: boolean
}

export interface Coverage {
  phases: readonly CoveragePhase[]
  /** Assets no phased entry places anywhere on the chain. */
  unplaced: readonly string[]
  hostTotal: number
  /**
   * What each absence is made of, named rather than counted.
   *
   * **Names, not counts, because the count is the question and the names are
   * the answer.** An analyst reading *4 events carry no phase* goes looking for
   * the four; the screen holds them already, so making the door hand them over
   * costs a length where a number stood.
   *
   * Counted events filed against the vocabulary member that is not a phase.
   */
  notAPhase: readonly string[]
  /** Counted events carrying no phase at all. */
  untagged: readonly string[]
  /** Events the analyst has taken off the graph. */
  hidden: readonly string[]
  /** The phases resting on a single host. */
  thin: readonly string[]
}

/** The phases the install publishes, in canonical order. */
export function phasesOf(specs: Specs): readonly string[] {
  return (specs.vocabularies.ukcPhase ?? []).filter((phase) => phase !== NOT_A_PHASE)
}

const cycleOf = (entry: TimelineEntry): Cycle => {
  const value = typeof entry.ukcCycle === 'string' ? entry.ukcCycle.trim() : ''
  return value === 'in' || value === 'through' || value === 'out' ? value : ''
}

/** How an entry names itself in an absence list. */
function titleOf(entry: { description: string }): string {
  return entry.description.trim() || '(no description)'
}

/**
 * The whole account, derived and never stored.
 *
 * **Two answers, not three.** `observed` and `not observed` is all the case
 * can know: *ruled out* against *not examined* is a judgement and needs a field
 * nothing writes yet, which is why the table is shaped for a third state it
 * does not have.
 */
export function coverageOf(kase: Case, specs: Specs): Coverage {
  const events = kase.timeline.filter(isEvent)
  const counted = events.filter((entry) => !entry.hideFromGraph)
  const hostNames = new Map(kase.systems.map((row) => [row.id, row.hostname]))

  const placed = new Set<string>()
  const phases = phasesOf(specs).map((phase, at): CoveragePhase => {
    const own = counted.filter((entry) => entry.ukcPhase.trim().toLowerCase() === phase)
    const hosts = new Set<string>()
    for (const entry of own) {
      for (const id of [entry.systemId, entry.sourceSystemId]) {
        if (typeof id !== 'string' || id === '') continue
        placed.add(id)
        hosts.add(hostNames.get(id) ?? '(unknown host)')
      }
    }
    const techniques = [
      ...new Set(own.map((entry) => entry.technique.trim()).filter(Boolean)),
    ].sort()
    return {
      phase,
      num: at + 1,
      // The first cycle any entry in the phase declares. Never derived from
      // the phase's position: the server owns that mapping and a second copy
      // here would disagree the day it moves.
      cycle: own.map(cycleOf).find((value) => value !== '') ?? '',
      observed: own.length > 0,
      hosts: [...hosts].sort(),
      entries: own.length,
      techniques,
      thin: own.length > 0 && hosts.size === 1,
    }
  })

  return {
    phases,
    unplaced: kase.systems
      .filter((row) => !placed.has(row.id))
      .map((row) => row.hostname)
      .sort(),
    hostTotal: kase.systems.length,
    notAPhase: counted
      .filter((entry) => entry.ukcPhase.trim().toLowerCase() === NOT_A_PHASE)
      .map(titleOf),
    untagged: counted.filter((entry) => entry.ukcPhase.trim() === '').map(titleOf),
    hidden: events.filter((entry) => entry.hideFromGraph).map(titleOf),
    thin: phases.filter((phase) => phase.thin).map((phase) => phase.phase),
  }
}

/**
 * The phase name at the width a one-row ribbon gives it.
 *
 * Eighteen names in one strip is about 40px each; the six that do not fit are
 * shortened the way an analyst says them out loud.
 */
export function abbreviatePhase(phase: string): string {
  const short: Readonly<Record<string, string>> = {
    'command & control': 'C2',
    'social engineering': 'social eng.',
    'privilege escalation': 'priv. esc.',
    'defense evasion': 'def. evasion',
    'lateral movement': 'lateral mov.',
    'credential access': 'cred. access',
  }
  return short[phase] ?? phase
}

/** The colour a cycle takes on the ribbon and the phase pill. */
export const CYCLE_FILL: Readonly<Record<Cycle, string>> = {
  in: 'bg-severity-info',
  through: 'bg-severity-medium',
  out: 'bg-severity-critical',
  '': 'bg-severity-none',
}
