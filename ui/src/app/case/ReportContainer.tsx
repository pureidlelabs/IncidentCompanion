import { useCase } from '@/api/case'
import { regimeEnabled, useRegimes } from '@/api/regimes'
import { useEntryBulkCreate } from '@/api/useEntryBulkCreate'
import { useReportBlockKinds } from '@/api/reportBlockKinds'
import { useReportLayouts } from '@/api/reportLayouts'
import { useEntryCreate } from '@/api/useEntryCreate'
import { useCaseId } from '@/app/useCaseId'
import { ReportSectionScreen } from '@/screens/report-section'

import { announcing } from './entryWrites'

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
  const seedBlocks = useEntryBulkCreate(caseId, 'report_blocks')

  return (
    <ReportSectionScreen
      kase={kase.data}
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
      onCreate={(choice) => {
        void announcing('the report', () =>
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
          void announcing("the report's sections", () =>
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
      }}
    />
  )
}
