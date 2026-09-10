import { useSearchParams } from 'react-router-dom'

import { useCase } from '@/api/case'
import { regimeEnabled, useRegimes } from '@/api/regimes'
import { useEntryBulkCreate } from '@/api/useEntryBulkCreate'
import { useReportBlockKinds } from '@/api/reportBlockKinds'
import { useReportLayouts } from '@/api/reportLayouts'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useEntryMutation } from '@/api/useEntryMutation'
import { useEntryReorder } from '@/api/useEntryReorder'
import { useCaseId } from '@/app/useCaseId'
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
  const open = address.get('report')
  const kase = useCase(caseId)
  const regimes = useRegimes()

  // `''` asks for no `?lang`, which is the install's own default.
  const layouts = useReportLayouts('')
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
        // clears `?do=` outside the router, so composing from the router's
        // copy writes a command that has already run back into the bar.
        const next = new URLSearchParams(window.location.search)
        if (id === null) next.delete('report')
        else next.set('report', id)
        setAddress(next, { replace: true })
      }}
      onReorder={(ids) => {
        void announced('the order', () => orderBlocks.mutateAsync({ ids }))
      }}
      {...(layouts.data ? { languages: layouts.data.languages } : {})}
      onLanguage={(report, language) => {
        // **What the export renders in, not what this screen draws in.** The
        // headings on screen come from a hardcoded map; only the produced
        // document is resolved through the report's language. -> #513
        void announced('the language', () =>
          patchReport.mutateAsync({
            entryId: report.id,
            version: report.version,
            fields: { language },
            base: report,
          }),
        )
      }}
      reports={kase.data?.reports}
      blocks={kase.data?.reportBlocks}
      layouts={layouts.data?.layouts}
      markings={layouts.data?.tlp}
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
