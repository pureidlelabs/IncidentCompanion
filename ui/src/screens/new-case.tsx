import { useState, type SyntheticEvent } from 'react'
import { ClipboardList, FilePlus2, LibraryBig } from 'lucide-react'

import type { LibraryEntry } from '@/api/library'
import { formSpec, type Specs } from '@/api/specs'
import type { CreatedCase, NewCaseFields } from '@/api/useCreateCase'
import { CaseFields } from '@/components/blocks/case-fields'
import { DialogPaneRow, DialogPanes } from '@/components/blocks/dialog-panes'
import { PickPane } from '@/components/blocks/pick-pane'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { DialogColumn, DialogColumns } from '@/components/ui/dialog-columns'
import { Problem } from '@/components/ui/problem'

/**
 * The dialog a case is minted from: two identity fields, the incident
 * summary, and a case template to seed it from.
 */
export interface NewCaseScreenProps {
  templates: readonly LibraryEntry[] | undefined
  specs: Specs | undefined
  /** Whether the dialog is open. The caller decides; there is no trigger here. */
  isOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  /** Fired once the case exists, with its id. */
  onCreated?: (caseId: string) => void
  /** Omitted in the gallery, where a submit resolves nothing. */
  writes?: NewCaseWrites
  /** The library and the form are still being read. */
  busy?: boolean
  /** Why the library or the form failed to load. */
  problem?: unknown
}

export interface NewCaseWrites {
  create: (fields: NewCaseFields) => Promise<CreatedCase>
}

const BLANK = { title: '', summary: '', customer: '', reference: '', template: '' }

/** What the template rail narrows by - the only thing a template carries that divides them. */
const ORIGINS = [
  {
    key: 'all' as const,
    label: 'All',
    hint: 'Everything the library holds',
    icon: LibraryBig,
    holds: () => true,
  },
  {
    key: 'shipped' as const,
    label: 'Shipped',
    hint: 'The investigations that come with the app',
    icon: ClipboardList,
    holds: (one: { origin?: string | undefined }) => one.origin !== 'yours',
  },
  {
    key: 'yours' as const,
    label: 'Yours',
    hint: 'Templates you dropped in',
    icon: FilePlus2,
    holds: (one: { origin?: string | undefined }) => one.origin === 'yours',
  },
]

export function NewCaseScreen({
  templates: templatesGiven,
  specs,
  isOpen = true,
  onOpenChange,
  onCreated,
  writes,
  busy = false,
  problem,
}: NewCaseScreenProps) {
  const templates = templatesGiven ?? []
  const [fields, setFields] = useState(BLANK)
  const [refused, setRefused] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [refusal, setRefusal] = useState<string | undefined>(undefined)
  const [source, setSource] = useState<'all' | 'shipped' | 'yours'>('all')
  const [typed, setTyped] = useState('')

  const caseForm = specs ? formSpec(specs, 'CASE_FIELDS') : undefined

  const rows = [
    {
      value: '',
      title: 'None',
      detail: 'An empty case. Add sections as the investigation finds them.',
      icon: FilePlus2,
      origin: undefined as string | undefined,
      chip: undefined as string | undefined,
    },
    ...templates.map((template) => ({
      value: template.name,
      title: template.label,
      detail: template.description,
      icon: ClipboardList,
      origin: template.origin,
      chip: template.origin === 'yours' ? 'Yours' : undefined,
    })),
  ]

  const query = typed.trim().toLowerCase()
  const shown = rows.filter((row) => {
    if (row.value === '') return true
    const origin = ORIGINS.find((one) => one.key === source)
    if (origin && !origin.holds(row)) return false
    if (query === '') return true
    return `${row.title} ${row.detail}`.toLowerCase().includes(query)
  })

  const close = () => {
    onOpenChange?.(false)
  }

  function submit(event: SyntheticEvent) {
    event.preventDefault()
    if (!fields.title.trim()) {
      setRefused({ title: 'Required.' })
      document.querySelector<HTMLElement>('[data-field="title"] input')?.focus()
      return
    }
    setRefused({})
    if (!writes) return

    const filled = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value.trim() !== ''),
    ) as unknown as NewCaseFields

    setPending(true)
    setRefusal(undefined)
    writes
      .create(filled)
      .then((created) => {
        setFields(BLANK)
        onCreated?.(created.id)
      })
      .catch((error: unknown) => {
        setRefusal(error instanceof Error ? error.message : 'The server refused.')
      })
      .finally(() => {
        setPending(false)
      })
  }

  return (
    <Dialog
      isOpen={isOpen}
      // **A workbench, not a form.** This dialog browses the template library
      // beside its fields, and `form` caps a height rather than setting one --
      // so the panes, which scroll inside the height the frame hands them,
      // were handed nothing and collapsed into a strip with its own
      // scrollbars.
      size="workbench"
      onOpenChange={(next) => {
        if (!next) close()
      }}
      dialogProps={{ 'aria-label': 'New case' }}
    >
      <DialogHeader
        title="New case"
        description="The title is the only field that has to be filled."
        onClose={close}
      />
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <DialogColumns className="shrink-0 gap-6 px-4">
          <DialogColumn title="Details">
            {caseForm && (
              <CaseFields
                form={caseForm}
                names={['title', 'customer', 'reference']}
                required={['title']}
                autoFocus="title"
                problems={refused}
                values={fields}
                hints={{ reference: 'The ticket this was raised under, if there is one.' }}
                onChange={(name, next) => {
                  setFields((f) => ({ ...f, [name]: next }))
                }}
              />
            )}
          </DialogColumn>

          <DialogColumn title="In brief">
            {/* The served spec draws this too: `summary` is a textarea in
                `CASE_FIELDS`, and a hand-written control here is the drift
                `CaseFields` exists to prevent. */}
            {caseForm && (
              <CaseFields
                form={caseForm}
                names={['summary']}
                values={fields}
                onChange={(name, next) => {
                  setFields((f) => ({ ...f, [name]: next }))
                }}
              />
            )}
          </DialogColumn>
        </DialogColumns>

        {templates.length > 0 && (
          <DialogPanes
            railLabel="Where the template came from"
            rail={ORIGINS.map((origin) => (
              <DialogPaneRow
                key={origin.key}
                icon={origin.icon}
                label={origin.label}
                hint={origin.hint}
                active={origin.key === source}
                count={
                  origin.key === 'all' ? templates.length : templates.filter(origin.holds).length
                }
                countLabel="templates"
                onSelect={() => {
                  setSource(origin.key)
                }}
              />
            ))}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PickPane
                search={typed}
                onSearch={setTyped}
                searchLabel="Search the case templates"
                searchPlaceholder="Search by name or by what it covers&#x2026;"
                legend="Template"
                value={fields.template}
                onValueChange={(next) => {
                  setFields((f) => ({ ...f, template: next }))
                }}
                rows={shown.map((template) => ({
                  value: template.value,
                  title: template.title,
                  detail: template.detail,
                  icon: template.icon,
                  tone: template.value === '' ? ('quiet' as const) : ('default' as const),
                  ...(template.chip === undefined ? {} : { chip: template.chip }),
                }))}
              />
            </div>
          </DialogPanes>
        )}

        <Problem className="mx-4 mt-3">
          {problem === undefined
            ? (refusal ?? null)
            : problem instanceof Error
              ? problem.message
              : 'That could not be read.'}
        </Problem>

        <DialogFooter>
          <Button type="button" variant="outline" onPress={close}>
            Back
          </Button>
          <Button
            type="submit"
            data-testid="new-case-submit"
            isDisabled={pending || busy}
            isPending={pending}
          >
            Create case
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
