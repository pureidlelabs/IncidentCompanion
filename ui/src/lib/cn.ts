import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The type scale's own names, which tailwind-merge cannot infer.
 *
 * **It reads `text-*` by shape, and a name it does not know is a colour.** So
 * `text-micro` and `text-data` were filed under text-colour and dropped
 * whenever a colour followed them: `twMerge('text-micro text-ink-muted')`
 * returns `text-ink-muted` alone, and `twMerge('text-ink font-mono text-data')`
 * drops `text-ink`. Tailwind's own scale is safe because the library ships that
 * list; this project's additions have to be declared.
 *
 * Every name here is a `--text-*` in `scale.css` that is not one of Tailwind's,
 * and `cn.test.ts` holds the two lists together.
 */
export const OWN_TEXT_SIZES = ['micro', 'data', '2xs'] as const

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...OWN_TEXT_SIZES] }] } },
})

/** Merge class lists so a caller's utility beats the component's default. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
