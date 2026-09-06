import { useMemo, useState, type KeyboardEvent } from 'react'
import { TextField } from 'react-aria-components'

import { parseTags, serialiseTags } from '@/lib/tags'
import { cn } from '@/lib/cn'
import { FieldGroup, GroupInput } from './field'
import { Tag, TagGroup } from './tag-group'

/**
 * Tags, as chips over the one comma-separated string the field actually is.
 *
 * **The value in and out is the CSV string, not an array.** `tags` is a
 * string on every entry schema, a list is refused with 422, and the server
 * stores whatever string it is sent verbatim. Handing callers an array would
 * put the serialisation back at every call site, which is where it would be
 * got wrong once per screen. `lib/tags.ts` holds the parsing rule and where it
 * is measured from.
 *
 * A comma typed into the field ends the tag rather than entering one: the
 * storage shape has a single separator and no escape, so a comma inside a tag
 * cannot survive a read either way. Splitting on it is the same outcome,
 * visibly.
 *
 * **A `TagGroup` over a `GroupInput`, so the box is a `textbox` and not a
 * `combobox`.** There is no vocabulary behind this field, so nothing announces
 * a list to open - a test reaching for it asks for the textbox by `label`.
 *
 * Enter commits what is typed and never reaches the form around it; Backspace
 * over an empty box takes the last chip; Escape drops the draft, and only
 * reaches the dialog behind it once the box is empty.
 */
export interface TagsInputProps {
  /** The control's accessible name. */
  label: string
  /** The stored CSV string. */
  value: string
  /** The next CSV string, already normalised - safe to PATCH as-is. */
  onChange: (csv: string) => void
  disabled?: boolean | undefined
  id?: string | undefined
  'aria-describedby'?: string | undefined
  className?: string | undefined
}

export function TagsInput({
  label,
  value,
  onChange,
  disabled = false,
  id,
  'aria-describedby': describedBy,
  className,
}: TagsInputProps) {
  const [draft, setDraft] = useState('')

  const tags = useMemo(() => parseTags(value), [value])
  // The collection, memoised on the parse rather than rebuilt each render:
  // React Aria re-derives the tag list whenever `items` changes identity.
  const rows = useMemo(() => tags.map((tag) => ({ id: tag })), [tags])

  /** Normalise, clear the box, and say nothing when the set is unchanged. */
  const commit = (next: readonly string[]) => {
    const csv = serialiseTags([...next])
    setDraft('')
    if (csv !== value) onChange(csv)
  }

  const take = (next: string) => {
    // A comma commits rather than being typed, so a pasted "phishing, exfil"
    // lands as two chips instead of one tag that reads back as two.
    if (!next.includes(',')) {
      setDraft(next)
      return
    }
    const parts = next.split(',')
    const trailing = parts.pop() ?? ''
    const csv = serialiseTags([...tags, ...parts])
    setDraft(trailing.trim())
    if (csv !== value) onChange(csv)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Held back from the form around it: Enter in this box adds a tag, and
      // a dialog whose default action fires on it would submit instead.
      event.preventDefault()
      // No guard on a blank draft: `serialiseTags` drops it, so the set is
      // unchanged and `commit` says nothing.
      commit([...tags, draft])
      return
    }
    if (event.key === 'Escape') {
      // Only swallowed while there is a draft to drop. An empty box lets it
      // through, so Escape still shuts the dialog the field sits in.
      if (draft === '') return
      event.stopPropagation()
      setDraft('')
      return
    }
    if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      commit(tags.slice(0, -1))
    }
  }

  return (
    <div data-slot="tags-input" className={cn('flex w-full flex-col gap-1.5', className)}>
      {rows.length > 0 && (
        <TagGroup
          // Named apart from the box, which carries `label`: two controls
          // answering to one name is a picker nobody can address.
          aria-label={`Chosen ${label}`}
          items={rows}
          {...(disabled
            ? {}
            : {
                onRemove: (keys) => {
                  commit(tags.filter((tag) => !keys.has(tag)))
                },
              })}
        >
          {(row: { id: string }) => (
            // No `data-slot` of its own: the kit `Tag` writes `data-slot="tag"`
            // after the caller's props, so one passed here never reaches the
            // DOM. A test hook on a chip goes on `data-testid`.
            <Tag id={row.id} className="font-mono text-data">
              {row.id}
            </Tag>
          )}
        </TagGroup>
      )}
      <TextField
        aria-label={label}
        value={draft}
        onChange={take}
        isDisabled={disabled}
        className="flex w-full flex-col gap-1.5"
      >
        <FieldGroup>
          <GroupInput
            onKeyDown={onKeyDown}
            {...(id === undefined ? {} : { id })}
            {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
          />
        </FieldGroup>
      </TextField>
    </div>
  )
}
