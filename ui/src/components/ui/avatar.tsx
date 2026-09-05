import { useState, type ComponentProps } from 'react'
import { tv } from 'tailwind-variants'

/**
 * A person, as a disc: their picture, or their initials on a coloured ground.
 */
const avatar = tv({
  base: [
    'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-medium',
    // A hairline over the disc, so a light picture still reads as a disc on a
    // light ground. Blend mode rather than a colour.
    'after:pointer-events-none after:absolute after:inset-0',
    'after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten',
  ],
  variants: {
    /**
     * **Three radii move together or the shape is wrong**: the box, the hairline
     * over it, and a picture inside it.
     */
    shape: {
      circle: 'rounded-full after:rounded-full [&>img]:rounded-full',
      square: 'rounded-md after:rounded-md [&>img]:rounded-md',
    },
    size: {
      xs: 'size-5 text-micro',
      sm: 'size-6 text-micro',
      md: 'size-(--control-h-sm) text-2xs',
      lg: 'size-(--control-h-md) text-xs',
      xl: 'size-(--control-h-lg) text-sm',
    },
    tone: {
      muted: 'bg-muted text-ink-muted',
      accent: 'bg-accent text-on-accent',
      primary: 'bg-primary text-on-primary',
      'presence-1': 'bg-presence-1 text-on-presence',
      'presence-2': 'bg-presence-2 text-on-presence',
      'presence-3': 'bg-presence-3 text-on-presence',
    },
  },
  defaultVariants: { shape: 'circle', size: 'md', tone: 'muted' },
})

/**
 * Up to two initials from a name, upper-cased. `?` when there is nothing to
 * take a letter from.
 */
export function initialsOf(name: string): string {
  const local = name.split('@')[0] ?? name
  const words = local.split(/[\s._-]+/).filter(Boolean)
  const first = words.at(0)
  if (first === undefined) return '?'
  const last = words.length > 1 ? (words.at(-1) ?? '') : ''
  return (first.charAt(0) + last.charAt(0)).toUpperCase()
}

export interface AvatarLook {
  /**
   * A disc, or a rounded square where the avatar sits in a row of square
   * marks and a circle would be the odd one out.
   */
  shape?: 'circle' | 'square'
  /** Diameter. `md` and up sit on the `--control-h-*` scale. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Ground for the fallback. The `presence-*` three are the analyst colours. */
  tone?: 'muted' | 'accent' | 'primary' | 'presence-1' | 'presence-2' | 'presence-3'
}

export interface AvatarProps extends Omit<ComponentProps<'span'>, 'children'>, AvatarLook {
  /** The person. Supplies the accessible name and, by default, the initials. */
  name: string
  /** Picture. Falls back to the initials when absent or when it fails to load. */
  src?: string | undefined
  /** Initials to draw instead of the ones taken from `name`. */
  initials?: string | undefined
}

/** An avatar. Give it a `name`; everything else is optional. */
export function Avatar({ name, src, initials, shape, size, tone, className, ...props }: AvatarProps) {
  const [failed, setFailed] = useState(false)
  const showImage = src !== undefined && src !== '' && !failed

  return (
    <span
      data-slot="avatar"
      role="img"
      aria-label={name}
      {...props}
      className={avatar({ shape, size, tone, className })}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          data-slot="avatar-image"
          className="aspect-square size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden data-slot="avatar-fallback" className="leading-none">
          {/* `||`, not `??`: an analyst who clears their initials sends `''`,
              and an empty disc carries no attribution at all. `src` two lines
              up already guards the same way. */}
          {initials || initialsOf(name)}
        </span>
      )}
    </span>
  )
}

export { avatar as avatarVariants }
