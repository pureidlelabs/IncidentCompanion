import { Kbd, KbdGroup, type KbdKeyName } from '@/components/ui/kbd'
import type { Chord } from '@/lib/chords'

export type { Chord }

/** The caps one chord prints, in the order a keyboard reads them. */
export function chordCaps(chord: Chord): { keyName?: KbdKeyName; label?: string }[] {
  const caps: { keyName?: KbdKeyName; label?: string }[] = []
  if (chord.mod === true) caps.push({ keyName: 'mod' })
  if (chord.shift === true) caps.push({ keyName: 'shift' })
  caps.push({ label: chord.key.length === 1 ? chord.key.toUpperCase() : chord.key })
  return caps
}

/** What a screen reader hears instead of three separate caps. */
export function chordLabel(chord: Chord): string {
  const parts: string[] = []
  if (chord.mod === true) parts.push('Mod')
  if (chord.shift === true) parts.push('Shift')
  parts.push(chord.key)
  return parts.join('+')
}

/**
 * A shortcut's chords, printed as key caps.
 */
export function ChordKeys({ chords }: { chords: readonly Chord[] }) {
  if (chords.length === 0) return null
  return (
    <span data-slot="chord-keys" className="inline-flex items-center gap-1.5">
      {chords.map((chord) => (
        <KbdGroup key={chordLabel(chord)} aria-label={chordLabel(chord)}>
          {chordCaps(chord).map((cap, at) =>
            cap.keyName === undefined ? (
              <Kbd key={`${String(at)}:${cap.label ?? ''}`}>{cap.label}</Kbd>
            ) : (
              <Kbd key={`${String(at)}:${cap.keyName}`} keyName={cap.keyName} />
            ),
          )}
        </KbdGroup>
      ))}
    </span>
  )
}
