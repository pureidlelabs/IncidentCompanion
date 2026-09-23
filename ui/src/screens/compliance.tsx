import { Building2, FileWarning, Gavel, Scale, ScrollText } from 'lucide-react'
import { useMemo } from 'react'

import { type ComplianceRecord, type ComplianceVerdict } from '@/api/compliance'
import { useRowDraft } from '@/api/rowDraft'
import type { Read } from '@/api/rowWrite'
import { complianceCards, type Specs } from '@/api/specs'
import { enabledRegimes, type Regimes } from '@/api/regimes'
import { ComplianceControl, typedAnswer } from '@/components/blocks/compliance-field'
import { useWriterOf } from '@/components/blocks/detail-grid'
import { FormCell, FormSection } from '@/components/blocks/form-section'
import { FieldConflict } from '@/components/blocks/merge-review'
import { VerdictCard } from '@/components/blocks/verdict-card'
import { Section } from '@/components/blocks/section'
import { SectionMeta } from '@/components/blocks/section-head'
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
 * Where a compliance answer leaves the screen: the answers by field name, and
 * the version of the record they were read at.
 *
 * **Nothing converts on the way out.** The control emits what the record
 * stores -- `string[]` for the sets, `null` for a question taken back or an
 * emptied count -- so the value goes on as it arrives.
 * -> `components/blocks/compliance-field.test.tsx`
 */
export interface ComplianceWrites {
  save: (values: Record<string, unknown>, read: Read) => Promise<unknown>
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
  writes,
  busy = false,
  problem,
  onRetry,
}: ComplianceScreenProps) {
  const cards = useMemo(
    () => (specs ? complianceCards(specs, enabledRegimes(regimes)) : []),
    [specs, regimes],
  )

  // Held here, above the cards, so an answer still being written survives its
  // card folding shut.
  const answers = useRowDraft(record, writes?.save, true)
  const writerOf = useWriterOf('case_compliance', record?.caseId)
  const draft = record && (answers.view as ComplianceRecord)

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


  return (
    <Section
      title="Compliance"
      measure="form"
      meta={
        <SectionMeta>{`${String(filled)} of ${String(total)} answered`}</SectionMeta>
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
        {/* Above the cards rather than beside the field: a card folds shut once
            every question in it is answered, and a band drawn inside a shut
            card is one nobody sees. */}
        {cards.flatMap((card) =>
          card.fields.flatMap((spec) => [
            ...(answers.problems[spec.name] === undefined
              ? []
              : [
                  <p key={`${spec.name}-problem`} role="alert" className="text-sm text-destructive">
                    {`${spec.label}: ${answers.problems[spec.name] ?? ''}`}
                  </p>,
                ]),
            <FieldConflict key={spec.name} draft={answers} field={spec.name} label={spec.label} by={writerOf} />,
          ]),
        )}
        {verdicts.length > 0 && (
          <div data-part="compliance-verdicts" className="flex flex-col gap-3">
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
                      {...(typedAnswer(spec)
                        ? { onSet: answers.set, onLeave: answers.leave }
                        : { onSet: answers.commit })}
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
