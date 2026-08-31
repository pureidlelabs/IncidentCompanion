import { Clock3 } from 'lucide-react'
import { useState } from 'react'

import type { Case } from '@/api/model'
import type { Specs } from '@/api/specs'
import type { Problems } from '@/api/validateDraft'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'

import { CaseRecordForm } from './case-record-form'

/**
 * The five stage times, over whatever screen the analyst is on.
 *
 * The panel draws `CaseRecordForm` on the `times` pane, which is the same
 * block the case overview's own Key times tab draws - so the two cannot come
 * to hold different fields.
 *
 * Uncontrolled by default. Pass `isOpen` with `onOpenChange` to drive it from
 * outside, which is what a story does to show the panel open.
 */
export interface CaseKeyTimesSheetProps {
  kase?: Case
  specs?: Specs
  /** A write another analyst got in first with. */
  refusal?: { field: string; by: string } | undefined
  /** Fields the last submit was refused on, by name. */
  refused?: Problems
  /** Drives the panel from outside; without it the trigger owns the state. */
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CaseKeyTimesSheet({
  kase,
  specs,
  refusal,
  refused,
  isOpen,
  onOpenChange,
}: CaseKeyTimesSheetProps) {
  const [own, setOwn] = useState(false)
  const open = isOpen ?? own
  const setOpen = (next: boolean) => {
    setOwn(next)
    onOpenChange?.(next)
  }

  return (
    <>
      {/* The glyph carries it: the panel is one of several a screen can pull
          out, and a labelled button for each spends the header on words the
          analyst reads once. The name reaches the keyboard and the screen
          reader through `aria-label` and the tooltip. */}
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Key times"
          data-slot="key-times-trigger"
          onPress={() => {
            setOpen(true)
          }}
        >
          <Clock3 aria-hidden />
        </Button>
        <Tooltip>Key times</Tooltip>
      </TooltipTrigger>
      <Sheet
        side="right"
        title="Key times"
        isOpen={open}
        onOpenChange={setOpen}
        onClose={() => {
          setOpen(false)
        }}
      >
        <CaseRecordForm
          pane="times"
          refusal={refusal}
          kase={kase}
          specs={specs}
          {...(refused ? { refused } : {})}
        />
      </Sheet>
    </>
  )
}
