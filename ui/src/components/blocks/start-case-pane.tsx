import { CloudDownload, FilePlus2, Radio } from 'lucide-react'

import { ChoiceRows } from '@/components/blocks/choice-row'
import { Section } from '@/components/blocks/section'

/**
 * Where a case starts: two doors, then the same five fields.
 *
 * The form itself opens over this pane rather than replacing it, so nothing is
 * drawn here for it - backing out of a wizard the analyst had not started once
 * meant leaving a picker they had.
 */
export interface StartCasePaneProps {
  /** Open the blank-case form. Without it the tile is inert, which a story wants. */
  onBlank?: (() => void) | undefined
  /** Open the same form landing in the importer. Absent when none is enabled. */
  onImport?: (() => void) | undefined
  /**
   * Open the wizard that makes the case out of an incident.
   *
   * **Not the same as `onImport`.** That one makes an empty case and lands in
   * the importer, so a wizard abandoned halfway leaves a case behind; this
   * writes the case and its rows in one act. -> #420
   */
  onLiveSource?: (() => void) | undefined
}

export function StartCasePane({ onBlank, onImport, onLiveSource }: StartCasePaneProps) {
  return (
    <Section title="Start a case" blurb="Pick where the case comes from.">
      <ChoiceRows
        // Two across: they are weighed against each other rather than read down
        // a list, and the pane is the width of the screen.
        columns={2}
        className="max-w-4xl"
        choices={[
          {
            title: 'Blank case',
            detail: 'An empty case, or one seeded from a case template.',
            icon: FilePlus2,
            ...(onBlank ? { onSelect: onBlank } : {}),
          },
          {
            title: 'Import incidents',
            detail: 'Import incidents into a new case.',
            icon: CloudDownload,
            ...(onImport ? { onSelect: onImport } : {}),
          },
          {
            title: 'Start from a live source',
            detail: 'Pull an incident from Sentinel. The case is made when the rows are.',
            icon: Radio,
            ...(onLiveSource ? { onSelect: onLiveSource } : {}),
          },
        ]}
      />
    </Section>
  )
}
