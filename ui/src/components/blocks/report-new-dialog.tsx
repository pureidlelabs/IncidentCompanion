import { FilePlus2, FileText, LayoutTemplate, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { LayoutBlock, ReportLayout } from '@/api/reportLayouts'
import { PickPane } from '@/components/blocks/pick-pane'
import { DialogFrame } from '@/components/blocks/dialog-frame'
import { DialogPaneRow, DialogPanes } from '@/components/blocks/dialog-panes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ListBoxItem } from '@/components/ui/list-box'
import { TlpChip } from '@/components/blocks/tlp-chip'
import { Select } from '@/components/ui/select'
import { TextField } from '@/components/ui/text-field'

import {
  layoutsMatching,
  layoutsOffered,
  stageOf,
} from './report-layouts'

/**
 * New report: the shape it starts from, and the three facts that go on the
 * document.
 */
export interface NewReportChoice {
  /** The layout's own name, which is a registry key rather than a title. */
  layout: string
  label: string
  stage: string
  tlp: string
  /** The sections this layout seeds, in order. Empty for a shape that seeds none. */
  blocks: readonly LayoutBlock[]
}

export interface ReportNewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every shape this install ships, as the registry serves them. */
  layouts: readonly ReportLayout[] | undefined
  /** The sharing markings a document can carry. */
  markings: readonly string[] | undefined
  /** Whether this install surfaces NIS2 at all. */
  nis2Enabled?: boolean
  onCreate?: (choice: NewReportChoice) => void
}

/** The line beside Create: what is about to be made. */
export function summarise(layout: ReportLayout): string {
  const sections =
    layout.blocks.length === 0
      ? 'No sections'
      : `${String(layout.blocks.length)} section${layout.blocks.length === 1 ? '' : 's'}`
  return `${sections} \u00b7 ${layout.label}`
}

/** A rail row: what it narrows to, and how it decides. */
interface Category {
  key: string
  label: string
  hint: string
  icon: typeof FileText
  layouts: readonly ReportLayout[]
}

/** One identity for the absent list, so a memo reading it is not rebuilt per render. */
const NONE: readonly never[] = Object.freeze([])

export function ReportNewDialog({
  open,
  onOpenChange,
  layouts: layoutsGiven,
  markings: markingsGiven,
  nis2Enabled = true,
  onCreate,
}: ReportNewDialogProps) {
  const layouts = layoutsGiven ?? NONE
  const markings = markingsGiven ?? []
  const [picked, setPicked] = useState('')
  const [label, setLabel] = useState('')
  const [tlp, setTlp] = useState('')
  const [kind, setKind] = useState('all')
  const [typed, setTyped] = useState('')

  const offered = useMemo(() => layoutsOffered(layouts, nis2Enabled), [layouts, nis2Enabled])
  // The first shape, until the analyst says otherwise: the grid always has one
  // card chosen, so Create is never a control that quietly does nothing.
  const chosen = offered.find((one) => one.name === picked) ?? offered[0]
  // Derived, not asked: the four NIS2 layouts are the four stages.
  const stage = stageOf(chosen, nis2Enabled)

  /**
   * What the rail offers, and it is a filter rather than a heading.
   */
  const categories = useMemo<Category[]>(() => {
    const filings = offered.filter((one) => one.nis2)
    const rest = offered.filter((one) => !one.nis2)
    const all: Category = {
      key: 'all',
      label: 'All reports',
      hint: 'Every shape offered here',
      icon: LayoutTemplate,
      layouts: offered,
    }
    if (filings.length === 0 || rest.length === 0) return [all]
    return [
      all,
      { key: 'case', label: 'Case reports', hint: 'Written for the customer', icon: FileText,
        layouts: rest },
      { key: 'regulatory', label: 'Regulatory filings', hint: 'Filed to a deadline', icon: Scale,
        layouts: filings },
    ]
  }, [offered])

  const inKind = categories.find((one) => one.key === kind)?.layouts ?? offered
  const shown = useMemo(() => layoutsMatching(inKind, typed), [inKind, typed])

  function close() {
    setPicked('')
    setLabel('')
    setTlp('')
    setTyped('')
    setKind('all')
    onOpenChange(false)
  }

  function create() {
    if (chosen === undefined) return
    onCreate?.({
      layout: chosen.name,
      // The layout's own label, so a new report reads as the shape it is rather
      // than as the file's stem, which is a key and not a name anyone chose.
      label: label.trim() || chosen.label,
      stage,
      tlp,
      blocks: chosen.blocks,
    })
    close()
  }

  return (
    <Dialog
      isOpen={open}
      size="workbench"
      onOpenChange={(next) => {
        if (!next) close()
      }}
      dialogProps={{ 'aria-label': 'New report' }}
    >
      <DialogFrame
        title="New report"
        subtitle="Pick the shape it starts from. Every section can be added or removed afterwards."
        bleed
        footnote={
          chosen === undefined ? undefined : (
            // What is about to be made, beside the button that makes it: the
            // cards scroll, so the choice can be off screen by the time
            // somebody reaches Create. One string rather than three nodes, so
            // it reads as one line to a screen reader and to a test.
            <span className="text-xs text-ink-muted">{summarise(chosen)}</span>
          )
        }
        actions={
          <>
            <Button variant="ghost" onPress={close}>
              Cancel
            </Button>
            <Button variant="default" isDisabled={chosen === undefined} onPress={create}>
              Create
            </Button>
          </>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogPanes
            railLabel="Kinds of report"
            showRailLabel
            rail={categories.map((category) => (
              <DialogPaneRow
                key={category.key}
                icon={category.icon}
                label={category.label}
                hint={category.hint}
                active={category.key === kind}
                count={category.layouts.length}
                countLabel={`${String(category.layouts.length)} to start from`}
                onSelect={() => {
                  setKind(category.key)
                }}
              />
            ))}
          >
            <PickPane
              search={typed}
              onSearch={setTyped}
              searchLabel="Search the report shapes"
              searchPlaceholder="Search by name or by what it carries&#x2026;"
              legend="Start from"
              value={chosen?.name ?? ''}
              onValueChange={setPicked}
              rows={shown.map((one) => ({
                value: one.name,
                title: one.label,
                // Who reads it. The chips below already name every section, so
                // a summary listing them would be the same information twice.
                ...(one.summary === '' ? {} : { detail: one.summary }),
                // **Chosen from what the layout is**, never from its name: a
                // filing carries an obligation and reads as one, a shape that
                // seeds nothing reads quieter.
                icon: one.nis2 ? Scale : one.blocks.length === 0 ? FilePlus2 : FileText,
                tone: one.nis2 ? ('flag' as const)
                  : one.blocks.length === 0 ? ('quiet' as const)
                  : ('default' as const),
                ...(one.blocks.length === 0
                  ? {}
                  : {
                      extra: (
                        <span className="flex flex-wrap gap-1">
                          {one.blocks.map((block) => (
                            <Badge
                              key={`${block.kind}-${String(block.position)}`}
                              variant="outlined"
                              size="xs"
                            >
                              {block.label}
                            </Badge>
                          ))}
                        </span>
                      ),
                    }),
              }))}
            />
          </DialogPanes>

          {/* Below the panes and out of the scroller: these describe the
              document rather than the shape it starts from, and a band that
              scrolled away with the cards put the name somebody is typing off
              screen. */}
          <div className="flex shrink-0 items-start gap-4 border-t border-border px-4 pt-4 pb-4">
            <TextField
              label="Name"
              className="min-w-0 max-w-md flex-1"
              value={label}
              // A password manager reads a field called Name inside a dialog as
              // an identity field and offers a saved one. The vendor attribute
              // is what stops it; `autoComplete` alone does not.
              autoComplete="off"
              data-1p-ignore
              placeholder={chosen?.label ?? ''}
              onChange={setLabel}
            />

            <Select
              label="Marking"
              className="w-52 shrink-0"
              placeholder="Unmarked"
              selectedKey={tlp}
              onSelectionChange={(key) => {
                setTlp(typeof key === 'string' ? key : '')
              }}
            >
              {/* The marking as the chip itself, in the list and in the
                  trigger, rather than as a coloured dot beside a label.

                  `textValue` because React Aria cannot derive typeahead or a
                  screen-reader name from a row drawn as an element. */}
              <ListBoxItem id="" textValue="Unmarked">
                Unmarked
              </ListBoxItem>
              {markings.map((one) => (
                <ListBoxItem key={one} id={one} textValue={one}>
                  <TlpChip tlp={one} />
                </ListBoxItem>
              ))}
            </Select>
          </div>
        </div>
      </DialogFrame>
    </Dialog>
  )
}
