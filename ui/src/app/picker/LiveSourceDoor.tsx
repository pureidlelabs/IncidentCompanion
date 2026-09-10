import { useNavigate } from 'react-router-dom'

import { ImportSentinelContainer } from '@/app/case/ImportSentinelContainer'
import { ENTRY_SLUG } from '@/components/blocks/case-sections'

/**
 * Starting a case from an incident, in one act.
 *
 * **Above the panes rather than inside one**, for the reason `ArchiveDoor`
 * gives: the pane in view is the route's state, and a dialog held inside one
 * goes when the pane behind it does.
 *
 * The dialog is the screen's own, because a container may draw a screen and
 * not kit markup. -> `a-container-draws-nothing.rule.test.ts`
 */
export function LiveSourceDoor({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <ImportSentinelContainer
      startsACase
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      onCreated={(caseId) => {
        onClose()
        void navigate(`/cases/${encodeURIComponent(caseId)}/${ENTRY_SLUG}`)
      }}
    />
  )
}
