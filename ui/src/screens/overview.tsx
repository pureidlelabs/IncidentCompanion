import { useMemo, useState } from 'react'

import type { ComplianceRecord } from '@/api/compliance'
import type { Case } from '@/api/model'
import { fieldsOf, formSpec, type Specs } from '@/api/specs'
import type { Problems } from '@/api/validateDraft'
import type { QueueRow } from '@/components/blocks/case-queue'
import { CasePicturePane } from '@/components/blocks/case-picture-pane'
import { CaseRecordForm, type CaseWrites } from '@/components/blocks/case-record-form'
import { paneHoldingLabel } from '@/components/blocks/case-record-groups'
import { Section } from '@/components/blocks/section'
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/tabs'
import { dayNumber } from '@/lib/statutory-clock'

/**
 * The case overview: where it stands, what it is, and when each stage of it
 * happened.
 *
 * Three tabs over one record. `read` is the pane an analyst lands on;
 * `properties` and `times` are the two halves of the case's own form, and each
 * is `CaseRecordForm` rather than markup of this screen's.
 *
 * **A refusal selects the tab that holds the field it names.** A merge review
 * drawn on a pane nobody is looking at is a lost write reported as a clean
 * save, so the screen goes to the field rather than waiting to be found.
 */
export interface OverviewScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  record: ComplianceRecord | undefined
  /** A field write another analyst got in first with. */
  refusal?: { field: string; by: string }
  /** Fields the last submit was refused on, by name. */
  refused?: Problems
  /** Opens the section a queue row is answered on. */
  onOpen?: ((row: QueueRow) => void) | undefined
  /** The moment the clocks are read at, in epoch milliseconds. */
  now?: number
  /** Omitted in the gallery, where a field is typed into and never sent. */
  writes?: CaseWrites
  /**
   * The case is still being read.
   *
   * Nothing is drawn while this holds: a read that has not returned is not
   * an answer, and an ungated pending state offers another case's record to edit.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/** The tabs, in the order they are read. */
const READ = 'read'
const PROPERTIES = 'properties'
const TIMES = 'times'

export function OverviewScreen({
  kase,
  specs,
  record,
  refusal,
  refused,
  onOpen,
  now = Date.parse('2026-08-19T09:00:00.000Z'),
  writes,
  busy = false,
  problem,
  onRetry,
}: OverviewScreenProps) {
  const fields = useMemo(() => (specs ? fieldsOf(formSpec(specs, 'CASE_FIELDS')) : []), [specs])
  const wanted = useMemo(
    () =>
      refusal === undefined
        ? READ
        : paneHoldingLabel(fields, refusal.field) === 'times'
          ? TIMES
          : PROPERTIES,
    [fields, refusal],
  )

  const [tab, setTab] = useState<string>(wanted)
  // A refusal arriving after the screen was drawn is the repaint that another
  // analyst's write caused, and it has to move the tab as an opening refusal
  // would. Held against the wanted tab rather than the refusal object, so a
  // re-render with an equal refusal does not drag the analyst back.
  const [was, setWas] = useState(wanted)
  if (was !== wanted) {
    setWas(wanted)
    setTab(wanted)
  }

  const day = dayNumber(kase?.detectedAt, kase?.openedAt, new Date(now))
  const onTimes = wanted === TIMES

  return (
    <Section
      title="Case overview"
      measure="full"
      meta={
        <span className="font-mono text-xs text-ink-muted">
          {[kase?.customer, kase?.status, `day ${String(day)}`].filter(Boolean).join(' \u00b7 ')}
        </span>
      }
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
    >
      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => {
          setTab(String(key))
        }}
        className="w-full max-w-(--content-max)"
      >
        <TabList aria-label="Case overview">
          <Tab id={READ}>Read</Tab>
          <Tab id={PROPERTIES}>Properties</Tab>
          <Tab id={TIMES}>Key times</Tab>
        </TabList>

        <TabPanel id={READ}>
          <CasePicturePane
            kase={kase}
            specs={specs}
            record={record}
            now={now}
            {...(onOpen ? { onOpen } : {})}
          />
        </TabPanel>

        <TabPanel id={PROPERTIES}>
          <CaseRecordForm
            kase={kase}
            specs={specs}
            pane="details"
            refusal={onTimes ? undefined : refusal}
            {...(refused ? { refused } : {})}
            {...(writes ? { writes } : {})}
          />
        </TabPanel>

        <TabPanel id={TIMES}>
          <CaseRecordForm
            kase={kase}
            specs={specs}
            pane="times"
            refusal={onTimes ? refusal : undefined}
            {...(refused ? { refused } : {})}
            {...(writes ? { writes } : {})}
          />
        </TabPanel>
      </Tabs>
    </Section>
  )
}
