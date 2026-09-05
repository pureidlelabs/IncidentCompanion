/**
 * A language pack, once it is data rather than code.
 */
import { EN } from './labels.en.js'

/** Every key a pack may carry. Anything else can never render. */
export const EN_KEYS: readonly string[] = Object.keys(EN)

const KEYS = new Set(EN_KEYS)

export interface Pack {
  code: string
  label: string
  strings: Record<string, string>
}

/**
 * A pack from whatever was uploaded, with nothing trusted.
 */
export function packFrom(input: Pack): Pack {
  const strings: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.strings)) {
    if (KEYS.has(key) && value !== '') strings[key] = value
  }
  return { code: input.code, label: input.label, strings }
}

/** The keys an upload carried that English has no place for. */
export function unknownKeysIn(strings: Record<string, string>): string[] {
  return Object.keys(strings).filter((key) => !KEYS.has(key))
}

/**
 * How much of English a pack carries, 0 to 1.
 */
export function coverageIn(strings: Record<string, string>): number {
  if (EN_KEYS.length === 0) return 0
  const carried = EN_KEYS.filter((key) => {
    const value = strings[key]
    return value !== undefined && value !== ''
  }).length
  return carried / EN_KEYS.length
}

/** What a document prints with, resolved once for the language it is in. */
export type Translate = (key: string) => string

/**
 * A translator bound to one pack, never reading a global.
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
