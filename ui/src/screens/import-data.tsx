import { Download, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { formForCollection } from '@/api/entityTargets'
import {
  COLLECTION_LABELS,
  COLLECTION_TO_CASE_KEY,
  type Case,
  type CollectionName,
} from '@/api/model'
import { fieldsOf, type Specs } from '@/api/specs'
import { EmptyState } from '@/components/blocks/empty-state'
import { Section } from '@/components/blocks/section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SectionMeta } from '@/components/blocks/section-head'
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
  /** The tables `GET /api/collections` marks batch-creatable. */
  collections: readonly CollectionName[] | undefined
  /**
   * The screen draws no empty state while this holds: an empty state is an
   * answer, and a read that has not returned does not have one.
   */
  busy?: boolean
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
  /** How many the case already held, left as they were. */
  skipped: number
  /** How many already-present rows the import overwrote, having been asked to. */
  replaced: number
  /**
   * How many it refused: a replacement somebody else had already changed, or
   * was holding open in a merge review.
   */
  refused: number
  /**
   * How many references the destination could not resolve.
   *
   * **Not a refusal.** The row landed; the link did not, because this case
   * does not hold what the file pointed at. They ask different things of an
   * analyst -- a refused row is one to fix and send again, a lost reference is
   * a thing to bring across -- so they are drawn apart.
   */
  unlinked: number
  /** The same total, by the kind of thing the lost references pointed at. */
  unlinkedBy: Readonly<Record<string, number>>
}

/**
 * What was lost, in the analyst's own words: *2 to hosts, 1 to methods*.
 *
 * Ordered by how many, because the biggest gap is the one worth closing first.
 */
function lostReferences(by: Readonly<Record<string, number>>): string {
  return Object.entries(by)
    .sort(([, mine], [, theirs]) => theirs - mine)
    .map(([collection, count]) => {
      // **The collection's own name, or its key.** The server answers with
      // whatever a reference points at, and a target the screen has no label
      // for is still worth naming badly rather than dropping.
      const label = (COLLECTION_LABELS as Record<string, string | undefined>)[collection]
      return `${String(count)} to ${label ?? collection}`
    })
    .join(', ')
}

/**
 * What the import met that the case already held: *28 already there, 4
 * replaced*, trailed by a space for whatever is said next.
 */
function duplicates(result: ImportResult): string {
  const said = [
    result.skipped > 0 ? `${String(result.skipped)} already there` : '',
    result.replaced > 0 ? `${String(result.replaced)} replaced` : '',
  ].filter((part) => part !== '')
  return said.length === 0 ? '' : `${said.join(', ')}. `
}

/**
 * The headline over an import that refused nothing.
 *
 * A file every row of which the case already held wrote nothing new, and
 * *0 rows imported* over *28 already there* reads as an import that did
 * nothing at all.
 */
function headline(result: ImportResult): string {
  const label = COLLECTION_LABELS[result.collection]
  if (result.written === 0 && result.skipped + result.replaced > 0) {
    return `Nothing new in ${label}`
  }
  return `${String(result.written)} rows imported into ${label}`
}

/**
 * What an import carried, said either way.
 *
 * **Silence would mean both "nothing was lost" and "nobody looked".** A case
 * quietly less connected than the file that made it is found later by somebody
 * who cannot tell which. -> `openspec/specs/data-exchange/spec.md`
 *
 * A lost reference is not a refusal and is never called one: the row landed,
 * the link did not. A refused row is one to fix and send again; a lost
 * reference is a thing to bring across.
 */
function carriage(result: ImportResult): string {
  if (result.unlinked === 0) return 'Every reference was carried.'

  const many = result.unlinked === 1 ? 'reference' : 'references'
  return `${String(result.unlinked)} ${many} could not be carried: ${lostReferences(
    result.unlinkedBy,
  )}. The rows landed without them.`
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
  collections,
  busy = false,
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
      (collections ?? []).map((collection) => {
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
        <SectionMeta>{`${String(rows.length)} tables`}</SectionMeta>
      }
      blurb="Every table the batch doors write to, with a template and an importer of its own."
    >
      <div className="flex flex-col gap-4">
        {showing && result.refused === 0 && (
          <Alert variant="success">
            <AlertTitle>{headline(result)}</AlertTitle>
            <AlertDescription>
              {/* **Said either way.** Silence would mean both "nothing was
                  lost" and "nobody looked", and a case quietly less connected
                  than its file is found later by somebody who cannot tell
                  which. -> `openspec/specs/data-exchange/spec.md` */}
              <p className="mb-1">{`${duplicates(result)}${carriage(result)}`}</p>
              <Button
                variant="link"
                size="xs"
                // `-my-1 py-1`: a link button keeps its line box, which falls
                // under the 24px target floor without them.
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

        {/* **The refusals stay on the screen, beside the row they were sent
            from.** A row the server would not take is the one thing an analyst
            has to act on afterwards. */}
        {showing && result.refused > 0 && (
          <Alert variant="destructive">
            <AlertTitle>
              {`${String(result.written)} rows imported, ${String(result.refused)} refused`}
            </AlertTitle>
            <AlertDescription>{`${duplicates(result)}${carriage(result)}`}</AlertDescription>
          </Alert>
        )}

        {rows.length === 0 && !busy && (
          <EmptyState
            icon={Upload}
            title="No importable tables"
            detail="This install offers no batch door yet."
          />
        )}

        {rows.length > 0 && (
          // `ItemGroup` carries `role="list"` and `Item` is a `div`: the kit's
          // row takes no element of its own, so a real `ul`/`li` is not
          // available here.
          <ItemGroup className="gap-0 divide-y divide-border border-y border-border">
            {rows.map((row) => (
              <Item key={row.collection} role="listitem" variant="default">
                {/* `flex-wrap` and `min-w-0`: forced onto one line the title
                    clips at a narrow measure, and `ItemTitle` is
                    `line-clamp-1`, so it clips without an ellipsis. */}
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
                    variant="ghost"
                    size="sm"
                    href={templateHref(row.fields)}
                    download={`${row.collection}-template.csv`}
                    data-part="template"
                  >
                    <Download aria-hidden />
                    Template
                  </ButtonLink>
                  {/* Absent rather than greyed where no form is served: a
                      disabled importer is a promise about a table this install
                      cannot describe. */}
                  {row.fields.length > 0 && (
                    <Button
                      variant="ghost"
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
