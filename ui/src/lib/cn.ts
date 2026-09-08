import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import { createTV } from 'tailwind-variants'

/**
 * The scale names `tokens.css` adds to Tailwind's own, so a merge can tell
 * `text-micro` is a size. An unknown `text-*` is filed as a colour and dropped
 * against the next tone class; `mergeConfig` is what `cn` and `tv` share.
 */
export const mergeConfig = {
  extend: {
    theme: {
      text: ['micro', 'data', '2xs'],
      tracking: ['micro'],
    },
  },
}

const merge = extendTailwindMerge(mergeConfig)

/** Merge class lists so a caller's utility beats the component's default. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}

/** `tailwind-variants`' `tv`, merging on the same scale `cn` knows. */
export const tv = createTV({ twMergeConfig: mergeConfig })
