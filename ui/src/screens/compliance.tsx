import { Building2, FileWarning, Gavel, Scale, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'

import { type ComplianceRecord, type ComplianceVerdict } from '@/api/compliance'
import { complianceCards, type ComplianceFieldSpec, type Specs } from '@/api/specs'
import { enabledRegimes, type Regimes } from '@/api/regimes'
import { ComplianceControl } from '@/components/blocks/compliance-field'
import { FormCell, FormSection } from '@/components/blocks/form-section'
import { MergeReview } from '@/components/blocks/merge-review'
import { VerdictCard } from '@/components/blocks/verdict-card'
import { Section } from '@/components/blocks/section'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/ui/progress-bar'

import { isAnswered } from '@/components/blocks/compliance-answers'

/**
 * The regulatory record: what NIS2, GDPR and DORA each need said about this
 * incident, and how much of it has been.
 *
 * **Which cards exist is an install preference.** A regime switched off takes
 * its card with it, or falls back to the reduced form the served card names -
 * so the screen never asks a question this install has no obligation for.
 *
 * The verdicts are the server's arithmetic over these answers and never this
 * screen's: whether an incident is reportable is a reading of the law, not a
 * rendering decision.
 */
export interface ComplianceScreenProps {
  record: ComplianceRecord | undefined
  specs: Specs | undefined
  regimes: Regimes | undefined
  /** The served verdicts. Absent draws no verdict band at all. */
  verdicts?: readonly ComplianceVerdict[]
  /** An answer another analyst got in first with. */
  refusal?: { field: string; by: string }
  /** Omitted in the gallery, where an answer is given and never sent. */
  writes?: ComplianceWrites
  /**
   * The record is still being read.
   *
   * Nothing is drawn while this holds: the fixture default is the demo
   * record, so an ungated pending state offers another case's answers.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/**
 * Where a compliance answer leaves the screen.
 *
 * **The spec travels with the value, not just the field name.** Several kinds
 * share one control and it emits a string for all of them, while the record
 * stores an array for the sets and null for an unanswered question -- so the
 * conversion needs the descriptor, and it is the container's to make.
 * -> `api/complianceWire.ts`
 */
export interface ComplianceWrites {
  save: (spec: ComplianceFieldSpec, value: unknown) => Promise<unknown>
}

/** A tinted tile per card, by the card's own served title. */
const GLYPHS: Readonly<Record<string, typeof Building2>> = {
  Entity: Building2,
  'Incident facts': FileWarning,
  Findings: Scale,
  GDPR: ScrollText,
  DORA: Gavel,
}

export function ComplianceScreen({
  record,
  specs,
  regimes,
  verdicts = [],
  refusal,
  writes,
  busy = false,
  problem,
  onRetry,
}: ComplianceScreenProps) {
  const cards = useMemo(
    () => (specs ? complianceCards(specs, enabledRegimes(regimes)) : []),
    [specs, regimes],
  )

  const [draft, setDraft] = useState<ComplianceRecord | undefined>(record)
  const [given, setGiven] = useState(record)
  if (given !== record) {
    setGiven(record)
    setDraft(record)
  }

  const total = cards.reduce((sum, card) => sum + card.fields.length, 0)
  const filled = cards.reduce(
    (sum, card) => sum + card.fields.filter((spec) => draft && isAnswered(draft, spec)).length,
    0,
  )
  // The first card that is not finished opens: the analyst's next answer is in
  // it, and every card shut is a form that reads as having nothing in it.
  const firstUnfinished = cards.find(
    (card) =>
      card.fields.filter((spec) => draft && isAnswered(draft, spec)).length < card.fields.length,
  )?.title

  const set = (name: string, value: unknown) => {
    setDraft((was) => (was ? { ...was, [name]: value } : was))
  }

  /** The draft answer, and the same answer on its way to the server. */
  const answer = (spec: ComplianceFieldSpec, value: unknown) => {
    set(spec.name, value)
    if (writes) void writes.save(spec, value)
  }

  return (
    <Section
      title="Compliance"
      measure="form"
      meta={
        <Badge variant="outlined" size="xs">
          {`${String(filled)} of ${String(total)} answered`}
        </Badge>
      }
      blurb="What the report has to be able to say, per regime this install is under."
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
    >
      <div className="flex flex-col gap-6">
        {refusal && <MergeReview field={refusal.field} by={refusal.by} />}

        {verdicts.length > 0 && (
          <div data-slot="compliance-verdicts" className="flex flex-col gap-3">
            {verdicts.map((verdict) => (
              <VerdictCard key={`${verdict.regime}-${verdict.article}`} verdict={verdict} />
            ))}
          </div>
        )}

        {total > 0 && (
          <ProgressBar
            label="Answered"
            valueLabel={`${String(filled)} of ${String(total)}`}
            value={Math.round((filled / total) * 100)}
          />
        )}

        {draft &&
          cards.map((card) => {
            const answered = card.fields.filter((spec) => isAnswered(draft, spec)).length
            return (
              <FormSection
                key={card.title}
                title={card.title}
                columns={2}
                {...(GLYPHS[card.title] ? { icon: GLYPHS[card.title] } : {})}
                chip={
                  answered === 0
                    ? 'Not started'
                    : answered === card.fields.length
                      ? 'All answered'
                      : `${String(answered)} of ${String(card.fields.length)}`
                }
                foldCount={{ total: card.fields.length, set: answered }}
                foldOpen={card.title === firstUnfinished}
                folded={card.fields.map((spec) => (
                  <FormCell
                    key={spec.name}
                    span={spec.kind === 'multi_csv' || spec.kind === 'multi_lines' ? 'row' : 'cell'}
                  >
                    <ComplianceControl
                      spec={spec}
                      record={draft}
                      onSet={(_name, value) => {
                        answer(spec, value)
                      }}
                    />
                  </FormCell>
                ))}
              />
            )
          })}
      </div>
    </Section>
  )
}
