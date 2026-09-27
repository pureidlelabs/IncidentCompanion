import { useMemo, useState } from 'react'

import type { ComplianceRecord } from '@/api/compliance'
import type { Case } from '@/api/model'
import { useRowDraft } from '@/api/rowDraft'
import { fieldsOf, formSpec, type Specs } from '@/api/specs'
import type { QueueRow } from '@/components/blocks/case-queue'
import { CasePicturePane } from '@/components/blocks/case-picture-pane'
import { CaseRecordForm, type CaseWrites } from '@/components/blocks/case-record-form'
import { paneHoldingName } from '@/components/blocks/case-record-groups'
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
 * **The fields being changed are held here, above both panes**, so a change
 * still being written survives a move between tabs.
 *
 * **A field in dispute selects the tab that holds it.** A merge review drawn
 * on a pane nobody is looking at is a choice the analyst never sees, so the
 * screen goes to the field rather than waiting to be found.
 */
export interface OverviewScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  record: ComplianceRecord | undefined
  /** A field an open item sends the analyst to, by name. Opens its tab. */
  focusField?: string | undefined
  /** Opens the section a queue row is answered on. */
  onOpen?: ((row: QueueRow) => void) | undefined
  /** The moment the clocks are read at, in epoch milliseconds. */
  now: number
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
  focusField,
  onOpen,
  now,
  writes,
  busy = false,
  problem,
  onRetry,
}: OverviewScreenProps) {
  const fields = useMemo(() => (specs ? fieldsOf(formSpec(specs, 'CASE_FIELDS')) : []), [specs])
  const draft = useRowDraft(kase, writes?.save, true)
  // A dispute outranks a door: the door is where the analyst was going, the
  // dispute is a change of theirs that has not stood.
  const disputed = Object.entries(draft.holds).find(([, hold]) => hold.theirs)?.[0]
  const wanted = useMemo(() => {
    const named = disputed ?? (focusField === '' ? undefined : focusField)
    const pane = named === undefined ? undefined : paneHoldingName(fields, named)
    if (pane === undefined) return READ
    return pane === 'times' ? TIMES : PROPERTIES
  }, [fields, disputed, focusField])

  const [tab, setTab] = useState<string>(wanted)
  // A dispute arriving after the screen was drawn is the repaint that another
  // analyst's write caused, and it has to move the tab as an opening door
  // would. Held against the wanted tab, so a re-render with the same dispute
  // does not drag the analyst back.
  const [was, setWas] = useState(wanted)
  if (was !== wanted) {
    setWas(wanted)
    // Pushed onto a pane, never pulled off one. A door is spent the moment the
    // cursor is in the field it named, and returning to Read on that repaint
    // would undo the press that got here.
    if (wanted !== READ) setTab(wanted)
  }

  const day = dayNumber(kase?.detectedAt, kase?.openedAt, new Date(now))
  const onTimes = wanted === TIMES

  return (
    <Section
      title="Case overview"
      measure="full"
      meta={
        <span className="text-sm text-ink-muted">
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
            draft={draft}
            caseId={kase?.id}
            specs={specs}
            pane="details"
            focusField={onTimes ? undefined : focusField}
          />
        </TabPanel>

        <TabPanel id={TIMES}>
          <CaseRecordForm
            draft={draft}
            caseId={kase?.id}
            specs={specs}
            pane="times"
            focusField={onTimes ? focusField : undefined}
          />
        </TabPanel>
      </Tabs>
    </Section>
  )
}
