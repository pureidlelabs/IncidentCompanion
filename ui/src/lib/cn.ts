import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The `--text-*` names `scale.css` adds beyond Tailwind's own.
 *
 * **tailwind-merge reads `text-*` by shape, so a size it does not know is a
 * colour** -- and one filed that way is dropped whenever a colour follows it.
 * A size added to the scale belongs here too, which `cn.test.ts` enforces.
 */
export const OWN_TEXT_SIZES = [
  'micro',
  'data',
  '2xs',
  'prose',
  'prose-heading',
  'prose-subheading',
] as const

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...OWN_TEXT_SIZES] }] } },
})

/** Merge class lists so a caller's utility beats the component's default. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
