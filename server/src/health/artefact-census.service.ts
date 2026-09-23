/**
 * What this install expects beside it, what it cannot find, and what nothing
 * names.
 *
 * Asks each case what its rows name and asks the store what it holds. Removes
 * nothing. -> `openspec/specs/state/design.md`
 */
import { Inject, Injectable } from '@nestjs/common'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { EvidenceStore } from '../evidence/store.js'
import { artefactsNamed } from '../report/artefacts-named.js'

/** What the install expects, how much of it is not there, and what it holds that nothing names. */
export interface Census {
  /** Artefacts the rows name, once per case holding one. */
  expected: number
  /** How many of those the install cannot find. */
  missing: number
  /** Stored artefacts no case's rows or sent reports name. */
  unnamed: number
}

/** What this install says at start, a line per finding. */
export function saysAtStart(held: Census): { level: 'log' | 'warn'; message: string }[] {
  const said: { level: 'log' | 'warn'; message: string }[] = []
  if (held.expected > 0 && held.missing === 0) {
    said.push({
      level: 'log',
      message: `All ${String(held.expected)} attached artefacts are beside this install.`,
    })
  }
  if (held.missing > 0) {
    said.push({
      level: 'warn',
      message:
        `${String(held.missing)} of ${String(held.expected)} attached artefacts are not beside ` +
        'this install. A database restored without its evidence directory reads as well until ' +
        'somebody opens a case that has evidence on it.',
    })
  }
  if (held.unnamed > 0) {
    said.push({
      level: 'warn',
      message:
        `${String(held.unnamed)} stored artefacts are named by no case in this database. ` +
        'They are kept: a database older than its evidence directory, or not its own, ' +
        'has no row for bytes that may be the only copy.',
    })
  }
  return said
}

@Injectable()
export class ArtefactCensus {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly store: EvidenceStore,
  ) {}

  /** Count what each case's rows name against what the store holds. */
  async take(): Promise<Census> {
    let expected = 0
    let missing = 0
    const kept = new Map<string, Set<string>>()
    for (const [caseId, named] of await artefactsNamed(this.db)) {
      kept.set(caseId, named.kept)
      if (named.stored.size === 0) continue
      const held = await this.store.held(caseId)
      expected += named.stored.size
      for (const hash of named.stored) if (!held.has(hash)) missing += 1
    }
    return { expected, missing, unnamed: await this.store.unnamed(kept) }
  }
}
