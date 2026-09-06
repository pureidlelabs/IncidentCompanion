/**
 * A language pack, once it is data rather than code.
 *
 * The pure half: how a pack falls back, what counts as carried, which keys are
 * real. `language.service.ts` owns where packs are stored and who may write one.
 *
 * **English is the floor and the schema, and stays compiled in.** Every other
 * pack falls through it key by key and coverage is measured against its key
 * set, which is why an upload naming `en` is refused rather than merged.
 */
import { EN } from './labels.en.js'

export const EN_KEYS: readonly string[] = Object.keys(EN)

const KEYS = new Set(EN_KEYS)

export interface Pack {
  code: string
  label: string
  strings: Record<string, string>
}

/**
 * A pack from whatever was uploaded, with nothing trusted.
 *
 * Keys English does not have are dropped rather than stored: they cannot
 * render, and keeping them would make the row disagree with its own coverage.
 * `unknownKeysIn` is what tells the uploader about them.
 */
export function packFrom(input: Pack): Pack {
  const strings: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.strings)) {
    if (KEYS.has(key) && value !== '') strings[key] = value
  }
  return { code: input.code, label: input.label, strings }
}

export function unknownKeysIn(strings: Record<string, string>): string[] {
  return Object.keys(strings).filter((key) => !KEYS.has(key))
}

/**
 * How much of English a pack carries, 0 to 1.
 *
 * **Counted against English's keys, not against the pack's own**, so a pack of
 * invented keys cannot report as more complete than one that translated half
 * the real ones. An empty string is not carried: it renders as a missing
 * heading rather than falling back.
 */
export function coverageIn(strings: Record<string, string>): number {
  if (EN_KEYS.length === 0) return 0
  const carried = EN_KEYS.filter((key) => {
    const value = strings[key]
    return value !== undefined && value !== ''
  }).length
  return carried / EN_KEYS.length
}

export type Translate = (key: string) => string

/**
 * A translator bound to one pack, never reading a global. An unknown key
 * returns the key: a heading reading `field.contained` gets reported, and a
 * blank one is a document that looks finished.
 */
export function translatorFor(pack: Pack | undefined): Translate {
  return (key: string) => {
    const own = pack?.strings[key]
    if (own !== undefined && own !== '') return own
    return EN[key] ?? key
  }
}

/**
 * The translator for a document in English.
 *
 * Named rather than spelled `translatorFor(undefined)` at every fixture: the
 * argument being absent is what *makes* it English, which reads as an omission
 * unless it has a name.
 */
export function english(): Translate {
  return translatorFor(undefined)
}

export interface LanguageEntry {
  code: string
  label: string
  coverage: number
  builtin: boolean
}

/**
 * The order the report form offers languages in: English leads, being the floor
 * the rest fall through, and the rest sort by their own name so the list does
 * not reorder itself when a pack is uploaded.
 */
export function orderedLanguages(stored: LanguageEntry[]): LanguageEntry[] {
  const rest = stored
    .filter((entry) => entry.code !== 'en')
    .sort((a, b) => a.label.localeCompare(b.label))
  return [{ code: 'en', label: 'English', coverage: 1, builtin: true }, ...rest]
}
