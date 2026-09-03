import { Download, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { formForCollection } from '@/api/entityTargets'
import {
  BATCH_CREATABLE_COLLECTION_NAMES,
  COLLECTION_LABELS,
  COLLECTION_TO_CASE_KEY,
  type Case,
  type CollectionName,
} from '@/api/model'
import { fieldsOf, type Specs } from '@/api/specs'
import { EmptyState } from '@/components/blocks/empty-state'
import { Section } from '@/components/blocks/section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonLink } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'

/**
 * Every table the batch doors write to, with a template and an importer of its
 * own.
 *
 * Nothing else in the app offers import across every table at once; a table's
 * own toolbar carries the same control for that one table, and both write
 * through the same route.
 *
 * **The rows come from what the server marks batch-creatable, not from a name
 * list**, so a table newly opened to batch writes appears here with no code
 * change - and the three the flag excludes never need a name check to stay off
 * the screen. Evidence is out because its bytes arrive on their own route; the
 * two report tables because anything written into a report is reviewable and a
 * bulk selection has never been able to name one.
 *
 * **The template leaves from here; the import does not.** A template is the
 * served field names on one line, so it is built in the browser and handed
 * over on a real `<a download>`. An import writes rows, which is a route this
 * tier has none of, so that control is drawn refused rather than opening a
 * picker onto nothing.
 */
export interface ImportDataScreenProps {
  /** The case the counts are read from. */
  kase: Case | undefined
  /** The served forms, which decide each template's columns. */
  specs: Specs | undefined
  /** Which collections this install offers. Defaults to the batch-creatable set. */
  collections?: readonly CollectionName[]
  /** What the last import into one table produced. */
  result?: ImportResult
  /**
   * Takes one table's CSV. Without it the import control is drawn refused.
   *
   * The screen holds no file picker of its own: it asks for the file and
   * hands it over, so the route, the duplicate policy and the refusal all sit
   * with the caller.
   */
  onImport?: ((collection: CollectionName, file: File) => void) | undefined
  /** An import is running, by the collection it is aimed at. */
  importing?: CollectionName | undefined
}

/**
 * A table's template: the served field names, one header line, nothing else.
 *
 * A `data:` URL rather than a blob, for the reason the indicator export gives
 * - an object URL has to be revoked, and there is no moment this code can
 * observe the download starting.
 */
function templateHref(fields: readonly string[]): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(`${fields.join(',')}\n`)}`
}

/** What came back from an import, by the collection it was aimed at. */
export interface ImportResult {
  collection: CollectionName
  /** How many rows the server wrote. */
  written: number
  /**
   * How many it refused.
   *
   * **A count, because that is what the route answers.** It returns
   * `{ added, skipped, replaced, refused }` and no line numbers, so a screen
   * that could only report refusals it had lines for reported none of them --
   * and an analyst read an unqualified success over a file taken in part.
   */
  refused: number
  /** Which lines, and why, where the caller knows. */
  refusals?: readonly { row: number; detail: string }[]
}

/** One row of the screen: a table, its count, and the columns a template holds. */
interface ImportRow {
  collection: CollectionName
  label: string
  count: number
  fields: readonly string[]
}

export function ImportDataScreen({
  kase,
  specs,
  collections = BATCH_CREATABLE_COLLECTION_NAMES,
  result,
  onImport,
  importing,
}: ImportDataScreenProps) {
  const [dismissed, setDismissed] = useState(false)

  /**
   * The browser's own picker, behind the row's button.
   *
   * **One input, re-aimed rather than one per row.** Twelve hidden inputs is
   * twelve elements the probes have to exclude, and only one can be open at a
   * time anyway. `aimed` is which table the next chosen file belongs to.
   */
  const picker = useRef<HTMLInputElement>(null)
  const aimed = useRef<CollectionName | null>(null)
  const pick = (collection: CollectionName) => {
    aimed.current = collection
    picker.current?.click()
  }

  const rows = useMemo<ImportRow[]>(
    () =>
      collections.map((collection) => {
        const form = specs ? formForCollection(specs, collection) : undefined
        return {
          collection,
          label: COLLECTION_LABELS[collection],
          count: kase?.[COLLECTION_TO_CASE_KEY[collection]].length ?? 0,
          fields: form ? fieldsOf(form).map((field) => field.name) : [],
        }
      }),
    [collections, kase, specs],
  )

  const showing = result !== undefined && !dismissed

  return (
    <Section
      title="Import data"
      meta={
        <Badge variant="outlined" size="xs">
          {`${String(rows.length)} tables`}
        </Badge>
      }
      blurb="Every table the batch doors write to, with a template and an importer of its own."
    >
      <div className="flex flex-col gap-4">
        {showing && result.refused === 0 && (
          <Alert variant="success">
            <AlertTitle>{`${String(result.written)} rows imported into ${COLLECTION_LABELS[result.collection]}`}</AlertTitle>
            <AlertDescription>
              <Button
                variant="link"
                size="xs"
                // `-my-1 py-1`: a link button keeps its line box, which
                // measured 18px against the 24px target floor.
                className="h-auto -my-1 px-0 py-1"
                onPress={() => {
                  setDismissed(true)
                }}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* **The refusals are on the screen rather than in the dialog that sent
            them.** The dialog is gone by the time the server answers, and a row
            the server would not take is the one thing an analyst has to act on
            afterwards. */}
        {showing && result.refused > 0 && (
          <Alert variant="destructive">
            <AlertTitle>
              {`${String(result.written)} rows imported, ${String(result.refused)} refused`}
            </AlertTitle>
            {/* The lines where the caller has them. The count above is what
                the route answers today, and it is the half that has to be
                said: a partial import reported as whole is the one reading an
                analyst acts on and should not. */}
            {result.refusals !== undefined && result.refusals.length > 0 && (
              <AlertDescription>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {result.refusals.map((one) => (
                    <li key={one.row} className="text-xs">
                      <span className="font-mono tabular-nums">{`Row ${String(one.row)}`}</span>
                      {` - ${one.detail}`}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="No importable tables"
            detail="This install offers no batch door yet."
          />
        ) : (
          // `ItemGroup` carries `role="list"` and `Item` is a `div`: the kit's
          // row takes no element of its own, so a real `ul`/`li` is not
          // available here.
          <ItemGroup className="gap-0 divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((row) => (
              <Item key={row.collection} role="listitem" variant="default">
                {/* `flex-wrap` and `min-w-0`: forced onto one line the title
                    clipped by 6px at 420px, and `ItemTitle` is `line-clamp-1`
                    so it clipped without an ellipsis. */}
                <ItemContent className="min-w-0 flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
                  <ItemTitle className="min-w-0">{row.label}</ItemTitle>
                  <span className="text-sm font-normal text-ink-muted tabular-nums">
                    {`${String(row.count)} ${row.count === 1 ? 'row' : 'rows'}`}
                  </span>
                  <span className="text-2xs text-ink-muted">
                    {row.fields.length === 0
                      ? 'no form served'
                      : `${String(row.fields.length)} columns`}
                  </span>
                </ItemContent>
                <ItemActions>
                  <ButtonLink
                    variant="outline"
                    size="sm"
                    href={templateHref(row.fields)}
                    download={`${row.collection}-template.csv`}
                    data-slot="template"
                  >
                    <Download aria-hidden />
                    Template
                  </ButtonLink>
                  {/* Absent rather than greyed where no form is served: a
                      disabled importer is a promise about a table this install
                      cannot describe. */}
                  {row.fields.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={!onImport}
                      isPending={importing === row.collection}
                      aria-label={`Import CSV into ${row.label}`}
                      {...(onImport
                        ? {
                            onPress: () => {
                              pick(row.collection)
                            },
                          }
                        : {})}
                    >
                      <Upload aria-hidden />
                      Import CSV
                    </Button>
                  )}
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>
      {/* Off-screen rather than `hidden`: a hidden input cannot be clicked
          in every browser, and `sr-only` keeps it focusable and clickable
          while drawing nothing. */}
      <input
        ref={picker}
        type="file"
        accept="text/csv,.csv"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          const collection = aimed.current
          if (file && collection && onImport) onImport(collection, file)
          // Cleared, or choosing the same file twice fires no change event.
          event.target.value = ''
        }}
      />
    </Section>
  )
}
