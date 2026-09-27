import { useSearchParams } from 'react-router-dom'

import { useCase } from '@/api/case'
import { regimeEnabled, useRegimes } from '@/api/regimes'
import { useEntryBulkCreate } from '@/api/useEntryBulkCreate'
import { useReportBlockKinds } from '@/api/reportBlockKinds'
import { headingLabelsByKey, useReportLayouts } from '@/api/reportLayouts'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useEntryReorder } from '@/api/useEntryReorder'
import { drawn } from '@/api/rowWrite'
import { useCaseId } from '@/app/useCaseId'
import { REPORT_PARAM, reportQuery } from '@/lib/reportAddress'
import { useSession } from '@/api/useSession'
import { ReportSectionScreen } from '@/screens/report-section'

import { announced, announcing } from './entryWrites'

import type { Report as ReportEntry } from '@/api/model'

/**
 * `ReportSectionScreen` bound to the case's reports and the door that starts
 * one.
 *
 * **Starting a report is two writes**, which is why the screen hands the
 * choice over rather than making them: the document, then the sections its
 * layout seeds, and the seeds need the id the first write returns. A layout
 * that seeds none stops after the first.
 *
 * The blocks come from the case document rather than their own query -- one
 * read already carries every report and every block in the case.
 */
export function ReportContainer() {
  const caseId = useCaseId()
  const session = useSession()
  /** Which report is open, in the address. -> #397 */
  const [address, setAddress] = useSearchParams()
  const open = address.get(REPORT_PARAM)
  const kase = useCase(caseId)
  const regimes = useRegimes()

  /**
   * **Keyed on the open report's own language, not the install's.** A report
   * is produced in the language it carries, so the headings drawn above it are
   * resolved in that language too -- the screen used to read a map in the
   * bundle and disagree with the file it was previewing. `''` asks for no
   * `?lang`, which is the install's default, and is what the index list gets.
   * -> #513
   */
  const shown = kase.data?.reports.find((one) => one.id === open)
  const layouts = useReportLayouts(shown?.language ?? '')
  /**
   * **The install's own, for everything that is not the open report.** The
   * layout chips and markings in the new-report dialog describe a report that
   * does not exist yet, and `onCreate` names no language -- so it is made in
   * the install's. Drawing them from the open report's pack offers Dutch
   * section names for a report that will be English. Two keys, both cached
   * without expiry, so the second costs one request per install language.
   * -> #513
   */
  const installLayouts = useReportLayouts('')
  // **The insert menu's list comes from here, not from the bundle.** The
  // client ships a copy as a fixture, and a menu drawing it offers whatever
  // that copy last said -- which is how a kind the report renders became one
  // nobody could insert.
  const blockKinds = useReportBlockKinds('')
  const createReport = useEntryCreate(caseId, 'reports')
  const patchReport = useEntryMutation(caseId, 'reports')
  const seedBlocks = useEntryBulkCreate(caseId, 'report_blocks')
  // **Scoped by `reportId` on the server**, which is why the outline hands
  // over every section of the open report and not only the one that moved:
  // *"A reorder names every row in the reportId, once each."*
  const orderBlocks = useEntryReorder(caseId, 'report_blocks')

  return (
    <ReportSectionScreen
      kase={kase.data}
      caseId={caseId}
      {...(session?.username ? { analyst: session.username } : {})}
      openId={open}
      onOpenChange={(id) => {
        // **The address bar, not the router's copy.** `useCommandRequest`
        // clears `?do=` outside the router, so the router's copy still names a
        // command that has already run.
        setAddress(reportQuery(window.location.search, id), { replace: true })
      }}
      onReorder={(ids) => {
        void announced('the order', () => orderBlocks.mutateAsync({ ids }))
      }}
      {...(installLayouts.data ? { languages: installLayouts.data.languages } : {})}
      headings={headingLabelsByKey(layouts.data)}
      onLanguage={(report, language) => {
        void announced('the language', () =>
          patchReport.mutateAsync({
            entryId: report.id,
            version: drawn(report).version,
            fields: { language },
            base: report,
          }),
        )
      }}
      reports={kase.data?.reports}
      blocks={kase.data?.reportBlocks}
      layouts={installLayouts.data?.layouts}
      markings={installLayouts.data?.tlp}
      {...(blockKinds.data === undefined ? {} : { blockKinds: blockKinds.data })}
      {...(regimes.data ? { nis2Enabled: regimeEnabled(regimes.data, 'nis2') } : {})}
      busy={kase.isPending}
      {...(kase.error === null ? {} : { problem: kase.error })}
      onRetry={() => {
        void kase.refetch()
      }}
      onCreate={(choice) =>
        // **Returned, not discarded.** The dialog waits on this before closing,
        // so a refused report keeps the layout, the name, the stage and the
        // marking on screen rather than making the analyst choose them again.
        // -> #194
        announcing('the report', () =>
          createReport.mutateAsync({
            fields: {
              label: choice.label,
              // `''` for Blank, which keeps a blank report out of the
              // missing-required walk: that reads `report.template`.
              template: choice.layout === '__blank__' ? '' : choice.layout,
              stage: (choice.stage || null) as ReportEntry['stage'],
              tlp: (choice.tlp || null) as ReportEntry['tlp'],
            },
          }),
        ).then((created) => {
          if (choice.blocks.length === 0) return
          // Announced and let go: the report is already stored, so this
          // second write is not the dialog's business. -> #469
          void announced("the report's sections", () =>
            seedBlocks.mutateAsync(
              choice.blocks.map((seed) => ({
                report_id: created.id,
                position: seed.position,
                kind: seed.kind,
                heading: seed.heading,
                heading_key: seed.headingKey,
              })),
            ),
          )
        })
      }
    />
  )
}
