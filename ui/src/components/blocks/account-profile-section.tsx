import { useRef, useState } from 'react'

import { SettingsRow, SettingsSection } from '@/components/blocks/settings-section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PersonAvatar } from '@/components/blocks/presence'
import { TextField } from '@/components/ui/text-field'
import { ToggleButton } from '@/components/ui/toggle-button'
import { cn } from '@/lib/cn'

/**
 * Tailwind scans source text, so `bg-presence-${index}` compiles to no CSS at
 * all and every swatch renders unpainted.
 */
const TONES: readonly string[] = ['bg-presence-1', 'bg-presence-2', 'bg-presence-3']

/** Where a profile choice leaves the section. */
export interface AccountProfileWrites {
  setPicture: (file: File) => void
  clearPicture: () => void
  /** The chosen swatch; `null` for automatic. */
  setTone: (tone: 0 | 1 | 2 | null) => void
  /** Committed once the field is left. */
  setInitials: (initials: string) => void
}

export interface AccountProfileSectionProps {
  /** How the analyst is named on a case. */
  name: string
  /** Which presence tone is chosen. `undefined` is automatic. */
  tone?: 0 | 1 | 2
  /** The two characters drawn when no picture has loaded. */
  initials?: string
  /** Whether a picture has been stored. */
  hasPicture?: boolean
  /** The server's words for a picture it would not store. */
  pictureRefusal?: string
  /** Omitted in the gallery, where a choice is held and sent nowhere. */
  writes?: AccountProfileWrites
}

/**
 * The analyst's own name, picture and colour, as the other analysts on a case
 * see them.
 */
export function AccountProfileSection({
  name,
  tone,
  initials = '',
  hasPicture = false,
  pictureRefusal,
  writes,
}: AccountProfileSectionProps) {
  const [chosenTone, setChosenTone] = useState<number | undefined>(tone)
  // Re-synced whenever the incoming value moves, the same shape
  // `CaseRecordForm` uses to fold a prop change back into local state without
  // an effect.
  const [givenTone, setGivenTone] = useState(tone)
  if (givenTone !== tone) {
    setGivenTone(tone)
    setChosenTone(tone)
  }

  const [letters, setLetters] = useState(initials)
  const [givenInitials, setGivenInitials] = useState(initials)
  if (givenInitials !== initials) {
    setGivenInitials(initials)
    setLetters(initials)
  }

  const you = {
    name,
    you: true,
    ...(chosenTone === undefined ? {} : { tone: chosenTone }),
    ...(letters === '' ? {} : { initials: letters.toUpperCase() }),
  }

  return (
    <SettingsSection
      title="Profile"
      summary="What the other analysts on a case see beside your writing."
    >
      <SettingsRow label="You">
        <div className="flex items-center gap-3">
          <PersonAvatar person={you} className="size-10 text-sm" />
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
        </div>
      </SettingsRow>

      <SettingsRow
        label="Picture"
        description="PNG, JPEG, WebP or GIF, under 2MB. Stored as a small square."
      >
        <PictureRow held={hasPicture} {...(writes ? { writes } : {})} />
      </SettingsRow>

      {pictureRefusal !== undefined && (
        <SettingsRow label="Picture refused">
          <Alert variant="destructive">
            <AlertTitle>That image was not stored</AlertTitle>
            <AlertDescription>{pictureRefusal}</AlertDescription>
          </Alert>
        </SettingsRow>
      )}

      <SettingsRow label="Colour" description="Shown wherever your picture has not loaded.">
        {/* Automatic first: it is where everybody starts, and putting it
            last reads as the odd one out. */}
        <div className="flex items-center gap-2">
          <Swatch
            label="Automatic"
            chosen={chosenTone === undefined}
            paint="bg-muted"
            onChoose={() => {
              setChosenTone(undefined)
              writes?.setTone(null)
            }}
          />
          {TONES.map((paint, index) => (
            <Swatch
              key={paint}
              label={`Colour ${String(index + 1)}`}
              chosen={chosenTone === index}
              paint={paint}
              onChoose={() => {
                setChosenTone(index)
                writes?.setTone(index as 0 | 1 | 2)
              }}
            />
          ))}
        </div>
      </SettingsRow>

      <SettingsRow label="Initials" description="Two characters. Blank uses the ones from your name.">
        <TextField
          aria-label="Initials"
          maxLength={2}
          placeholder="from your name"
          value={letters}
          onChange={setLetters}
          onBlur={() => {
            writes?.setInitials(letters)
          }}
          className="w-40"
        />
      </SettingsRow>
    </SettingsSection>
  )
}

/**
 * The picture door, and what it chose.
 */
function PictureRow({
  held,
  writes,
}: {
  held: boolean
  writes?: AccountProfileWrites
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const something = held || chosen !== null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            input.current?.click()
          }}
        >
          {something ? 'Replace picture' : 'Choose picture'}
        </Button>
        {something && (
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              setChosen(null)
              writes?.clearPicture()
            }}
          >
            Remove
          </Button>
        )}
      </div>
      {chosen !== null && writes === undefined && (
        <p data-slot="picture-chosen" className="text-xs text-ink-muted">
          {`${chosen} \u2014 not uploaded from here.`}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          setChosen(file.name)
          writes?.setPicture(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}

/**
 * One colour, as a control rather than a decoration.
 */
function Swatch({
  label,
  chosen,
  paint,
  onChoose,
}: {
  label: string
  chosen: boolean
  paint: string
  onChoose: () => void
}) {
  return (
    <ToggleButton
      size="icon-sm"
      variant="ghost"
      ground={false}
      aria-label={label}
      isSelected={chosen}
      onChange={onChoose}
      className={cn(
        'size-6 rounded-full p-0 ring-offset-2 ring-offset-background',
        paint,
        chosen && 'ring-2 ring-ink',
      )}
    />
  )
}
