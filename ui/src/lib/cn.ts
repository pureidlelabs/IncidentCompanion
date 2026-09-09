import { clsx, type ClassValue } from 'clsx'
import {
  extendTailwindMerge,
  type ConfigExtension,
  type DefaultClassGroupIds,
  type DefaultThemeGroupIds,
} from 'tailwind-merge'
import { createTV } from 'tailwind-variants'

/**
 * The scale names `tokens.css` adds to Tailwind's own, so a merge can tell
 * `text-micro` is a size, and the kit's own `icon-N` utility, so two of them
 * resolve to the last. An unknown `text-*` is filed as a colour and dropped
 * against the next tone class; an unknown utility is kept beside its rival
 * and the stylesheet's order decides. `mergeConfig` is what `cn` and `tv`
 * share.
 */
export const mergeConfig: ConfigExtension<DefaultClassGroupIds | 'icon', DefaultThemeGroupIds> = {
  extend: {
    theme: {
      text: ['micro', 'data', '2xs'],
      tracking: ['micro'],
    },
    classGroups: {
      icon: [{ icon: [(value: string) => /^\d+(\.\d+)?$/.test(value)] }],
    },
  },
}

const merge = extendTailwindMerge<'icon'>(mergeConfig)

/** Merge class lists so a caller's utility beats the component's default. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}

/** `tailwind-variants`' `tv`, merging on the same scale `cn` knows. */
export const tv = createTV({ twMergeConfig: mergeConfig })
