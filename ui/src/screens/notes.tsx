import type { Editor } from '@tiptap/core'
import { NotebookPen, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { Case, CollectionEntry } from '@/api/model'
import { labelsOf, formSpec, type Specs } from '@/api/specs'
import { AsyncBoundary } from '@/components/ui/async-boundary'
import { EmptyState } from '@/components/blocks/empty-state'
import { AddAction, CountBadge } from '@/components/blocks/section-head'
import { Split } from '@/components/blocks/split'
import { Section } from '@/components/blocks/section'
import { Button } from '@/components/ui/button'
import { caretColor, PersonAvatar } from '@/components/blocks/presence'
import { ConfirmDeleteDialog } from '@/components/blocks/confirm-delete-dialog'
import { ProseBody } from '@/components/blocks/prose-body'
import { useProseSync } from '@/api/proseSync'
import { stampOf } from '@/lib/case-time'
import { cn } from '@/lib/cn'

import { isBlank, newestFirst, openingOf, withoutBlank } from './notes-index'

/** The caret's colour, omitted rather than undefined when no token resolves. */
function tone(name: string): { color?: string } {
  const color = caretColor({ name, you: true })
  return color ? { color } : {}
}

/**
 * The one fragment a note's document holds, spelled the same at both ends.
 */
const NOTE_FRAGMENT = 'note'

/** One case note, as the case document carries it. */
type CaseNote = CollectionEntry['casenotes']
import { localId } from '@/components/blocks/row-editing'

/**
 * Where a note leaves the screen.
 */
export interface NoteWrites {
  create: (fields: Partial<CaseNote>) => Promise<CaseNote>
  /**
   * Take the note away, on the version the screen read.
   */
  remove: (entry: CaseNote) => Promise<void>
}

/**
 * The analyst's scratchpad: what was seen, in the words it was seen in.
 */

export interface NotesScreenProps {
  kase: Case | undefined
  specs: Specs | undefined
  /**
   * The case whose socket carries the notes' documents.
   */
  caseId?: string
  /** Which note opens with the screen. Defaults to the newest. */
  openId?: string
  /** Who is writing. What a new note is signed with. */
  analyst?: string
  /** Omitted in the gallery, where a note is written and never sent. */
  writes?: NoteWrites
  /**
   * The case is still being read.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

export function NotesScreen({
  kase,
  specs,
  caseId,
  openId,
  analyst = 'Demo Analyst',
  writes,
  busy = false,
  problem,
  onRetry,
}: NotesScreenProps) {
  const [written, setWritten] = useState(kase?.casenotes ?? [])
  const notes = useMemo(() => newestFirst(written), [written])
  const labels = useMemo(() => (specs ? labelsOf(formSpec(specs, 'CASENOTE_FIELDS')) : {}), [specs])

  const [picked, setPicked] = useState<string | undefined>(openId ?? notes[0]?.id)
  /** The note whose field takes the caret on its next mount. */
  const [caretOn, setCaretOn] = useState<string | undefined>(undefined)
  /** The note the delete dialog is asking about. `null` while it is closed. */
  const [deleting, setDeleting] = useState<CaseNote | null>(null)
  const [given, setGiven] = useState(kase)
  if (given !== kase) {
    setGiven(kase)
    setWritten(kase?.casenotes ?? [])
    setPicked(openId ?? newestFirst(kase?.casenotes ?? [])[0]?.id)
    setCaretOn(undefined)
  }

  // Cleared once it has been used, so returning to a note later does not take
  // the caret away from wherever the analyst put it.
  useEffect(() => {
    if (caretOn === undefined) return
    const done = setTimeout(() => {
      setCaretOn(undefined)
    }, 0)
    return () => {
      clearTimeout(done)
    }
  }, [caretOn])

  /** Open a note, discarding the one being left if nothing was written in it. */
  const pick = (id: string) => {
    setWritten((current) => (id === picked ? [...current] : withoutBlank(current, picked)))
    setPicked(id)
  }

  /** A note goes into the index and is opened, which is where it is written. */
  const make = () => {
    // Stamped at the moment it is made, so it sorts to the top of an index
    // that is newest-first.
    const note: CaseNote = {
      ...BLANK_NOTE,
      id: localId('note'),
      author: analyst,
      createdAt: new Date().toISOString(),
    }
    setWritten((current) => [...withoutBlank(current, picked), note])
    setPicked(note.id)
    setCaretOn(note.id)
  }

  const write = (id: string, text: string) => {
    setWritten((current) =>
      current.map((note) => (note.id === id ? { ...note, note: text } : note)),
    )
  }

  /**
   * Create the row for a note that has only ever been on this screen.
   */
  const commit = (id: string) => {
    if (!writes) return
    const local = written.find((note) => note.id === id)
    if (!local) return
    if ((kase?.casenotes ?? []).some((note) => note.id === id)) return
    if (local.note.trim() === '') return
    void writes.create({ note: local.note, author: local.author })
  }

  const open = notes.find((note) => note.id === picked)

  /**
   * Take a note away, and open whichever is left where it was.
   */
  const drop = async (note: CaseNote) => {
    const stored = (kase?.casenotes ?? []).some((one) => one.id === note.id)
    if (stored && writes) await writes.remove(note)
    setWritten((current) => current.filter((one) => one.id !== note.id))
    setPicked((current) => {
      if (current !== note.id) return current
      const left = newestFirst(written.filter((one) => one.id !== note.id))
      return left[0]?.id
    })
  }

  /**
   * **The row has to exist before the document can.**
   */
  const shareable =
    Boolean(caseId) &&
    open !== undefined &&
    (kase?.casenotes ?? []).some((note) => note.id === open.id)
  const { channel, status, settled } = useProseSync(
    shareable ? (caseId ?? '') : '',
    shareable ? `casenotes:${open.id}:document` : '',
    // The identity is what draws this analyst's caret on everybody else's
    // screen. A name with no colour is still a named caret.
    analyst ? { name: analyst, ...tone(analyst) } : undefined,
  )
  /**
   * **`field` is named here and `tsc` cannot check that it is.**
   */
  const sharing = channel ? { sync: { channel, status, field: NOTE_FRAGMENT } } : {}

  /**
   * Put the caret in a note that was just made.
   */
  const wantsCaret = open !== undefined && caretOn === open.id
  const takeCaret = useCallback(
    (editor: Editor | null) => {
      if (editor && wantsCaret) editor.commands.focus('end')
    },
    [wantsCaret],
  )

  return (
    <Section
      title="Case notes"
      fills
      meta={<CountBadge total={notes.length} noun="note" />}
      actions={<AddAction label="New note" onPress={make} />}
    >
      <AsyncBoundary
        isPending={busy}
        isError={problem !== undefined}
        error={problem}
        {...(onRetry ? { refetch: onRetry } : {})}
      >
        <Split
          className="rounded-sm border border-border"
          measure="default"
          listHead={
            <p className="text-micro uppercase tracking-micro text-ink-muted">Newest first</p>
          }
          list={
            notes.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-ink-muted">Nothing written yet.</p>
            ) : (
              <nav aria-label="Case notes">
                {notes.map((note) => (
                  <Button
                    key={note.id}
                    variant="ghost"
                    data-testid="note-row"
                    {...(note.id === picked ? { 'aria-current': 'true' as const } : {})}
                    // `h-auto` overrides the kit's single-line heights: an index
                    // row here is an opening line over its byline.
                    className={cn(
                      'h-auto w-full flex-col items-start gap-1 px-2 py-2 text-left font-normal',
                      note.id === picked && 'bg-accent',
                    )}
                    onPress={() => {
                      pick(note.id)
                    }}
                  >
                    {/* `w-full whitespace-normal`, and both are load-bearing.
                      The row is `flex-col items-start`, so a child sizes to its
                      content rather than stretching -- and the kit's `Button`
                      base is `whitespace-nowrap`, so the line never wrapped and
                      `line-clamp-2` never engaged. The opening ran past the
                      pane and was sliced mid-word at its border. */}
                    <span
                      className={cn(
                        'line-clamp-2 w-full text-sm leading-snug whitespace-normal',
                        isBlank(note) && 'italic text-ink-muted',
                      )}
                    >
                      {/* A note being written has no opening line yet, and a row
                        with nothing in it reads as a row that failed to load. */}
                      {isBlank(note) ? 'Nothing written yet' : openingOf(note)}
                    </span>
                    {/* `w-full min-w-0`, for the same reason the opening line
                      above needs it: the row is `flex-col items-start`, so
                      this sized to its content and ran the stamp past the
                      pane's edge. The name gives way and the stamp does not --
                      a half-drawn timestamp is unreadable where a shortened
                      name is still a name. */}
                    <span className="flex w-full min-w-0 items-center gap-1.5 text-2xs text-ink-muted">
                      <PersonAvatar
                        person={{ name: note.author || 'unsigned', you: false }}
                        className="size-4 shrink-0 text-[0.5rem]"
                      />
                      <span className="truncate">{note.author || 'Unsigned'}</span>
                      <span aria-hidden className="shrink-0">
                        {'\u00b7'}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">
                        {stampOf(note.createdAt)}
                      </span>
                    </span>
                  </Button>
                ))}
              </nav>
            )
          }
          {...(open
            ? {
                detailHead: (
                  <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    {/* The same two facts the index row carries, drawn the same
                      way: who wrote it, and when. */}
                    <span className="flex items-center gap-2">
                      <PersonAvatar
                        person={{ name: open.author || 'unsigned', you: false }}
                        className="size-5 text-[0.6rem]"
                      />
                      <span className="text-sm font-semibold">{open.author || 'Unsigned'}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-2xs tabular-nums text-ink-muted">
                        {stampOf(open.createdAt)}
                      </span>
                      {/* The only destructive control on the screen, and it acts
                        on the note that is open rather than on a row under the
                        pointer - there is one note being read, and it is this
                        one. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="delete-note"
                        className="text-ink-muted hover:text-destructive"
                        onPress={() => {
                          setDeleting(open)
                        }}
                      >
                        <Trash2 aria-hidden />
                        Delete
                      </Button>
                    </span>
                  </div>
                ),
                detail: settled ? (
                  <ProseBody
                    // Keyed on the note, so opening another one mounts its own
                    // body rather than carrying the caret and the scroll of the
                    // last across.
                    key={open.id}
                    label={labels.note ?? 'Note'}
                    /**
                     * The body is the pane, and it grows rather than scrolling.
                     */
                    className="min-h-full max-w-(--content-max)"
                    value={open.note}
                    placeholder="Write what you're seeing&#x2026;"
                    onReady={takeCaret}
                    onChange={(text) => {
                      write(open.id, text)
                    }}
                    // **Nothing to send once the row exists.** The document is
                    // the record and the server re-derives `casenotes.note` from
                    // it; this creates the row the first time and then does
                    // nothing. -> `commit` above
                    onCommit={() => {
                      commit(open.id)
                    }}
                    {...sharing}
                  />
                ) : (
                  // **Not an empty box.** The channel has not said whether the
                  // server holds anything yet, and building the editor before it
                  // has either seeds a document twice or throws the instance
                  // away. The saved opening is what is on screen meanwhile, so
                  // this is truncated prose rather than a grey rectangle.
                  // -> `api/proseSync`
                  <p
                    className="max-w-(--content-max) animate-pulse text-[15px]
                             leading-relaxed text-ink-muted"
                    aria-label={labels.note ?? 'Note'}
                    role="status"
                    aria-busy="true"
                  >
                    {openingOf(open) || ' '}
                  </p>
                ),
              }
            : {})}
          placeholder={
            <EmptyState
              icon={NotebookPen}
              title={notes.length === 0 ? 'No case notes yet' : 'Nothing open'}
              detail={
                notes.length === 0
                  ? "The analyst's scratchpad. Nothing written here reaches the report unless you put it there."
                  : 'Pick a note from the index.'
              }
              {...(notes.length === 0
                ? {
                    action: (
                      <Button variant="outline" onPress={make}>
                        <Plus aria-hidden />
                        New note
                      </Button>
                    ),
                  }
                : {})}
            />
          }
        />
      </AsyncBoundary>

      <ConfirmDeleteDialog
        ids={deleting ? [deleting.id] : null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null)
        }}
        onConfirm={() => {
          const doomed = deleting
          if (!doomed) return
          // Returned rather than awaited: the dialog keeps itself open and
          // shows the reason when a delete is refused.
          return drop(doomed)
        }}
        title={() => 'Delete this note?'}
        consequence="The note goes, and everything written in it."
      />
    </Section>
  )
}

/** What a note carries that nothing on this screen types. */
const BLANK_NOTE: Omit<CaseNote, 'id' | 'author' | 'createdAt'> = {
  version: 1,
  note: '',
  /** Served by `CASENOTE_FIELDS` and not drawn here. */
  tags: '',
}
