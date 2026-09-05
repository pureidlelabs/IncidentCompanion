import { CloudDownload, FilePlus2 } from 'lucide-react'

import { ChoiceRows } from '@/components/blocks/choice-row'
import { Section } from '@/components/blocks/section'

/**
 * Where a case starts: two doors, then the same five fields.
 */
export interface StartCasePaneProps {
  /** Open the blank-case form. Without it the tile is inert, which a story wants. */
  onBlank?: (() => void) | undefined
  /** Open the same form landing in the importer. Absent when none is enabled. */
  onImport?: (() => void) | undefined
}

export function StartCasePane({ onBlank, onImport }: StartCasePaneProps) {
  return (
    <Section title="Start a case" blurb="Pick where the case comes from.">
      <ChoiceRows
        // Two across: they are a pair to weigh against each other rather than a
        // list to read down, and the pane is the width of the screen.
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
        ]}
      />
    </Section>
  )
}
