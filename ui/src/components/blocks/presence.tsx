// Premise: presence-marks-design
/**
 * Who wrote this, in that person's own colour.
 *
 * The three marks a multi-user screen owes: who wrote this (`Attribution`),
 * who else is on the case (`PresenceStack`) and who is holding this row
 * (`ClaimBadge`); the last two read `useCasePresence`.
 *
 * A person's hue is derived from their name unless they have chosen one, so
 * one analyst reads as the same colour on every screen with no coordination.
 * The name is always on screen beside it -- hue is a locator, never the sole
 * carrier of who is who.
 */

import { AnimatePresence, motion, type Variants } from 'motion/react'
import { createContext, useContext, useEffect, type ReactNode } from 'react'

import { avatarUrl } from '@/api/appearance'
import { cn } from '@/lib/cn'
import { SCALE, transition } from '@/lib/motion'

import { Avatar, initialsOf, type AvatarProps } from '@/components/ui/avatar'

export interface Person {
  /** As displayed. Also what the hue is derived from, absent a choice. */
  name: string
  /**
   * What an avatar URL is built from, where it is known.
   *
   * Optional because `Person` is a display concept used well past the presence
   * roster - a note's author, a timeline row's attributer, the rail - and only
   * the roster carries an id. Without one, initials render rather than a
   * picture: `user.name` is not unique on the server, so a name-keyed picture
   * would show two analysts called Sam each other's face.
   */
  userId?: string
  /** The signed-in analyst, who takes the accent instead of a presence hue. */
  you?: boolean
  /**
   * The tone this analyst chose, as a palette index.
   *
   * Overrides the derived hue when set, which is how two colleagues given
   * similar hues pull them apart. Absent for anyone who has not chosen, which
   * is everybody until they do.
   */
  tone?: number | undefined
  /** Their own initials, at most two characters, instead of the derived ones. */
  initials?: string | undefined
  /** Their uploaded image, if they have one. Initials stay the fallback. */
  avatarVersion?: number | undefined
}

/** What one person's colour is worth, as whole class names. */
export interface PresenceTone {
  /** A filled disc or badge: the ground plus the ink that survives on it. */
  fill: string
  /** A held row's ground. Deliberately faint - it sits under body text. */
  tint: string
  /** The edge beside a tint, because 8% alone does not read in isolation. */
  edge: string
  /** The person's colour as lettering, where no fill is wanted. */
  ink: string
  /** A caret or a state dot. */
  caret: string
}

/**
 * Assembled nowhere. Tailwind scans source text, so `bg-presence-${n}`
 * compiles to no CSS and the disc renders unpainted.
 */
const TONES: readonly PresenceTone[] = [
  {
    fill: 'bg-presence-1 text-on-presence',
    tint: 'bg-presence-1/8',
    edge: 'border-l-presence-1',
    ink: 'text-presence-1',
    caret: 'bg-presence-1',
  },
  {
    fill: 'bg-presence-2 text-on-presence',
    tint: 'bg-presence-2/8',
    edge: 'border-l-presence-2',
    ink: 'text-presence-2',
    caret: 'bg-presence-2',
  },
  {
    fill: 'bg-presence-3 text-on-presence',
    tint: 'bg-presence-3/8',
    edge: 'border-l-presence-3',
    ink: 'text-presence-3',
    caret: 'bg-presence-3',
  },
]

const MINE: PresenceTone = {
  fill: 'bg-primary text-on-primary',
  tint: 'bg-primary/8',
  edge: 'border-l-primary',
  ink: 'text-primary',
  caret: 'bg-primary',
}

/**
 * The tone for a person, stable across screens and sessions.
 *
 * A sum of char codes, not a cryptographic hash -- the requirement is stable
 * and spread, not unguessable.
 */
export function presenceTone(person: Person): PresenceTone {
  // A chosen tone wins even for you: picking a colour is a decision, being
  // signed in is only a default.
  if (person.tone !== undefined) return TONES.at(person.tone) ?? MINE
  if (person.you) return MINE
  return TONES.at(toneIndex(person.name)) ?? MINE
}

function toneIndex(name: string): number {
  let sum = 0
  for (let index = 0; index < name.length; index += 1) {
    sum = (sum + name.charCodeAt(index) * (index + 1)) % 9973
  }
  return sum % TONES.length
}

/** The same tone as a CSS variable, for a consumer writing its own style. */
export function presenceColor(person: Person): string {
  if (person.tone !== undefined) return `var(--presence-${String(person.tone + 1)})`
  if (person.you) return 'var(--primary)'
  return `var(--presence-${String(toneIndex(person.name) + 1)})`
}

/**
 * The tone resolved to a real colour, for the collaborative caret -- a CSS
 * variable will not resolve on the wire.
 *
 * Read at call time rather than cached, since the tokens change with the
 * ground.
 *
 * Undefined when the token does not resolve, rather than a literal fallback:
 * `tokens.test.ts` refuses a hardcoded colour, and `y-tiptap` substitutes its
 * own default for a missing one.
 */
export function caretColor(person: Person): string | undefined {
  if (typeof window === 'undefined') return undefined
  const token = person.tone !== undefined
    ? `--presence-${String(person.tone + 1)}`
    : person.you
      ? '--primary'
      : `--presence-${String(toneIndex(person.name) + 1)}`
  return getComputedStyle(document.documentElement)
    .getPropertyValue(token).trim() || undefined
}

/**
 * One person, as a disc of initials in their own tone.
 *
 * Takes a `Person` and supplies the kit `Avatar` with the picture URL, the
 * initials and the tone classes derived from it. `size` and `tone` are the
 * kit's own props and pass straight through; the tone classes go through
 * `className` rather than `tone`, so the palette stays in `TONES`.
 */
export function PersonAvatar({
  person,
  className,
  ...props
}: { person: Person } & Omit<AvatarProps, 'name' | 'src' | 'initials'>) {
  const src = person.userId ? avatarUrl(person.userId, person.avatarVersion) : undefined
  return (
    <Avatar
      // The title carries the suffix; the accessible name (`Avatar` reads it
      // from `name`) does not.
      title={person.you ? `${person.name} (you)` : person.name}
      name={person.name}
      {...(src === undefined ? {} : { src })}
      // `||`, not `??`: cleared initials arrive as an empty string, which
      // `??` would render as a disc with no letters.
      initials={person.initials || initialsOf(person.name)}
      {...props}
      className={cn(presenceTone(person).fill, 'font-semibold', className)}
    />
  )
}

/**
 * `You . 2 min ago` - who last wrote this, once nobody is holding it.
 *
 * Never shown beside `ClaimBadge` on the same row; see that component's
 * docstring for why.
 */
export function Attribution({
  person,
  when,
  className,
}: {
  person: Person
  when: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 font-mono text-2xs text-ink-muted',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', presenceTone(person).caret)}
      />
      {/* The separator belongs to the time, not between the two: a record
          with no timestamp otherwise signs off `Ada . `, which reads as a
          date that failed to load. */}
      {person.you ? 'You' : person.name}{when && ` \u00b7 ${when}`}
    </span>
  )
}

/**
 * A person joining the case, and leaving it. The exit takes `transition.slow`
 * against the entry's `transition.base`, inverting the usual rule; see
 *
 * `SCALE.glyph`, not `SCALE.surface`: a disc is 24px across, where four
 * percent is nothing at all.
 *
 * Under `prefers-reduced-motion` Motion drops the transform and keeps the
 * opacity, so an arrival still appears rather than growing -- presence stays
 * legible rather than degrading to nothing.
 *
 * Exported for `presence.motion.test.ts`: a story cannot assert the exit's
 * shape without racing the 280ms it lasts.
 */
export const joining: Variants = {
  hidden: { opacity: 0, scale: SCALE.glyph },
  shown: { opacity: 1, scale: 1, transition: transition.base },
  gone: { opacity: 0, scale: SCALE.glyph, transition: transition.slow },
}

/**
 * Who else is in this case, as a row of discs.
 *
 * `people` is collapsed by username before it reaches here -- one analyst
 * with three tabs is one entry, not three -- and includes the signed-in
 * analyst, first.
 */
export function PresenceStack({
  people,
  max = 4,
  className,
}: {
  people: readonly Person[]
  max?: number
  className?: string
}) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const hidden = people.slice(max)
  return (
    <div
      className={cn('flex items-center', className)}
      /* Labelled as a whole. Read disc by disc it is three unrelated images
         with initials in them, which says nothing about what they are. */
      aria-label={`In this case: ${people.map((person) => person.name).join(', ')}`}
      /* A handle for the browser tier, which cannot assert on the label: it
         names everyone in the case, so matching it means already knowing the
         answer. */
      data-testid="presence-stack"
    >
      <AnimatePresence initial={false}>
        {shown.map((person) => (
          <motion.span
            key={person.name}
            /* `layout`, so the neighbours slide into the gap a departure
               leaves rather than jumping across it. It animates position
               only - the arrival owns `opacity` and `scale`, and the two do
               not meet on one property. */
            layout
            variants={joining}
            initial="hidden"
            animate="shown"
            exit="gone"
            /* The overlap moves onto the wrapper, because the wrapper is now
               the flex child - left on the disc it would be measured from
               inside a box that starts where the margin was meant to pull it
               back from. */
            className="-ml-1.5 inline-flex first:ml-0"
          >
            <PersonAvatar
              person={person}
              /* Ringed in the page ground so the disc behind does not show
                 through the gap between them. */
              className="size-6 text-2xs ring-2 ring-background"
              data-testid="presence-person"
            />
          </motion.span>
        ))}
      </AnimatePresence>
      {hidden.length > 0 && (
        <motion.span
          layout
          variants={joining}
          initial="hidden"
          animate="shown"
          title={hidden.map((person) => person.name).join(', ')}
          className={cn(
            'inline-flex size-6 shrink-0 items-center justify-center rounded-full',
            '-ml-1.5 bg-muted text-2xs font-semibold text-ink-muted',
            'ring-2 ring-background',
          )}
        >
          +{hidden.length}
        </motion.span>
      )}
    </div>
  )
}

/**
 * Who is holding which row, for every table at once.
 *
 * A context rather than a direct import of the case socket, because these
 * blocks also render in the picker and in stories with no case and no
 * `QueryClient`. Undefined there, and the hooks below answer "nobody".
 */
export interface RowClaims {
  holderOf: (
    table: string,
    entryId: string,
  ) => { user_id: string; username: string } | undefined
  claim: (table: string, entryId: string) => void
  release: (table: string, entryId: string) => void
  /**
   * The signed-in analyst's id -- not their name, since `user.name` is not
   * unique and two colleagues sharing one would read each other's claim as
   * their own. Undefined before the session lands: nobody is you, rather
   * than everybody.
   */
  you: string | undefined
}

const ClaimsContext = createContext<RowClaims | undefined>(undefined)

export function ClaimsProvider(
  { value, children }: { value: RowClaims | undefined; children: ReactNode },
) {
  return <ClaimsContext.Provider value={value}>{children}</ClaimsContext.Provider>
}

/** Who else is in this row, or undefined - including when there is no case. */
export function useRowHolder(table: string, entryId: string): Person | undefined {
  const claims = useContext(ClaimsContext)
  const held = claims?.holderOf(table, entryId)
  if (!held) return undefined
  return {
    name: held.username,
    userId: held.user_id,
    you: claims?.you !== undefined && held.user_id === claims.you,
  }
}

/**
 * Hold a row while this surface is open on it, and give it back on close.
 *
 * The release is the half that gets forgotten - a dialog closed with Escape, a
 * route change, a component that throws - so it is an effect's cleanup rather
 * than a call anyone has to remember. Silent when there is no case.
 */
export function useHoldRow(table: string, entryId: string | undefined,
                           active: boolean): void {
  const claims = useContext(ClaimsContext)
  const take = claims?.claim
  const give = claims?.release
  useEffect(() => {
    if (!active || !entryId || !take || !give) return undefined
    take(table, entryId)
    return () => give(table, entryId)
  }, [active, table, entryId, take, give])
}

/** The badge for one row, drawn where the row's controls are. */
export function RowClaim({ table, entryId }: { table: string; entryId: string }) {
  const holder = useRowHolder(table, entryId)
  if (!holder) return null
  return <ClaimBadge person={holder} />
}

/**
 * `R. Okonkwo editing` - somebody else is in this row right now.
 *
 * Says who in words rather than hue alone, since a claim is the one state
 * where guessing the colour wrong costs the edit you were about to make.
 *
 * Renders nothing for yourself: your own second tab holds the row as *you*,
 * and a badge saying you are editing the field you are editing is noise.
 *
 * Never drawn beside `Attribution` on the same row -- one says who may write
 * now, the other says who already did, and both together put two names on
 * one row saying different things.
 */
export function ClaimBadge({
  person,
  className,
}: {
  person: Person
  className?: string
}) {
  if (person.you) return null
  const tone = presenceTone(person)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5',
        'text-2xs font-medium',
        tone.tint,
        tone.ink,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', tone.caret)} />
      {person.name} editing
    </span>
  )
}
