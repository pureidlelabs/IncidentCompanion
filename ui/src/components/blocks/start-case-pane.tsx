import { FilePlus2 } from 'lucide-react'

import { DOOR_LABELS, SECTIONS } from '@/components/blocks/case-sections'
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
   * **Not the same as `onImport`**, which makes an empty case first and lands
   * in the file importer.
   */
  onLiveSource?: (() => void) | undefined
}

export function StartCasePane({ onBlank, onImport, onLiveSource }: StartCasePaneProps) {
  return (
    <Section title="Start a case" blurb="Pick where the case comes from.">
      <ChoiceRows
        // Across rather than down: they are weighed against each other, and
        // the pane is the width of the screen. Three, so the last one is not
        // an orphan on a row of its own.
        columns={3}
        className="max-w-4xl"
        choices={[
          {
            title: 'Blank case',
            detail: 'An empty case, or one seeded from a case template.',
            icon: FilePlus2,
            ...(onBlank ? { onSelect: onBlank } : {}),
          },
          {
            title: DOOR_LABELS.import ?? '',
            detail: 'Start a case and bring rows in from a CSV.',
            // **The glyph the section it opens draws.** A door wearing another
            // section's glyph says it goes somewhere it does not, and the rail
            // draws that glyph again on the row that owns it.
            icon: SECTIONS.import?.icon ?? FilePlus2,
            ...(onImport ? { onSelect: onImport } : {}),
          },
          {
            title: DOOR_LABELS['import-sentinel'] ?? '',
            detail: 'Pull an incident from Sentinel. The case is made at the end, not the start.',
            icon: SECTIONS['import-sentinel']?.icon ?? FilePlus2,
            ...(onLiveSource ? { onSelect: onLiveSource } : {}),
          },
        ]}
      />
    </Section>
  )
}
