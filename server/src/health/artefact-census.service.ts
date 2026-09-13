/**
 * What this install expects to find beside it, and what it cannot.
 *
 * **A database copy names its artefacts implicitly** -- every evidence row
 * carries the digest of the file it stands for -- and nothing read that at
 * start. So an operator who restored the database and forgot the artefact
 * directory had an install that looked entirely well until an analyst opened
 * a case with evidence on it, which is the discovery route the requirement
 * rules out in those words. -> `openspec/specs/state/spec.md`
 *
 * **Existence, never content.** Nothing here opens, expands or interprets an
 * artefact; whether a name is present in the directory is the whole question.
 *
 * **One directory listing, not a `stat` per row.** The answer is a set
 * difference, and an install holds as many artefacts as it has evidence -- a
 * `stat` apiece is a cost that grows with the case load for an answer one read
 * already contains.
 *
 * **Case by case, because the question is install-wide and the table is not.**
 * `evidence` is case-scoped, and row-level security answers an unscoped read
 * with an empty table rather than with an error -- so the obvious single query
 * reports *nothing expected* on every install, which is the same answer a
 * healthy one gives. Scoping to each case in turn asks only what the
 * application may already ask, and costs a transaction per case once per
 * census. -> `db/schema/scoped.ts`, `db/case-scope.test.ts`
 */
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { readdir } from 'node:fs/promises'

import { DATABASE } from '../db/db.module.js'
import type { Database } from '../db/client.js'
import { withCase } from '../db/scope.js'
import { cases } from '../db/schema/case.js'
import { evidence } from '../db/schema/entities.js'

/** What the install expects, and how much of it is not there. */
export interface Census {
  /** Distinct artefacts the rows name. */
  expected: number
  /** How many of those the install cannot find. */
  missing: number
}

/**
 * The line this install says at start, or null when it has nothing to say.
 *
 * **Never a refusal to start.** An install short of an artefact still holds
 * every case and every record, so failing here would take the whole product
 * away to report a gap in part of it.
 */
export function saysAtStart(held: Census): { level: 'log' | 'warn'; message: string } | null {
  if (held.expected === 0) return null
  if (held.missing === 0) {
    return {
      level: 'log',
      message: `All ${String(held.expected)} attached artefacts are beside this install.`,
    }
  }
  return {
    level: 'warn',
    message:
      `${String(held.missing)} of ${String(held.expected)} attached artefacts are not beside ` +
      'this install. A database restored without its evidence directory reads as well until ' +
      'somebody opens a case that has evidence on it.',
  }
}

@Injectable()
export class ArtefactCensus {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService,
  ) {}

  /**
   * Count what the rows name against what is on disk.
   *
   * A directory that is not there is read as holding nothing, which is the
   * state this exists to report rather than an error to raise: an install
   * restored without its artefacts has no such directory at all.
   */
  async take(): Promise<Census> {
    const open = await this.db.select({ id: cases.id }).from(cases)

    // **Deduplicated once, here.** Two rows naming one artefact are one file,
    // and so are two cases holding the same one; a second pass anywhere else
    // would be a copy of that claim that nothing can tell apart from this one
    // when either breaks.
    const wanted = new Set<string>()
    for (const one of open) {
      const named = await withCase(this.db, one.id, (tx) =>
        tx.select({ hash: evidence.hash }).from(evidence),
      )
      for (const row of named) if (row.hash) wanted.add(row.hash)
    }
    if (wanted.size === 0) return { expected: 0, missing: 0 }

    const root = this.config.get<string>('EVIDENCE_DIR') ?? '.evidence'
    let held: Set<string>
    try {
      held = new Set(await readdir(root))
    } catch {
      held = new Set()
    }

    let missing = 0
    for (const hash of wanted) if (!held.has(hash)) missing += 1
    return { expected: wanted.size, missing }
  }
}
