
import { cn, tv } from '@/lib/cn'

/**
 * A square tinted tile holding one glyph.
 *
 * Decorative by default: it is `aria-hidden`, so the row's own text carries
 * the meaning. A child `svg` with no `size-*` of its own is sized by the tile.
 */
const iconTile = tv({
  base: [
    'inline-flex shrink-0 items-center justify-center align-middle',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  variants: {
    tone: {
      /** The quiet default: a grey ground for a row or a toolbar. */
      muted: 'bg-muted text-ink-muted',
      /** A tinted ground carrying the primary hue. */
      primary: 'bg-primary/10 text-primary',
      /** The hover ground, for a tile inside a row that is already tinted. */
      accent: 'bg-highlight text-on-highlight',
      /** A tinted ground for something that failed or is about to. */
      destructive: 'bg-destructive/10 text-destructive',
      /** Filled, for the one tile a view leads with. */
      solid: 'bg-primary text-on-primary',
      /** Bordered and unfilled, for a tile on an already tinted ground. */
      outline: 'border border-border bg-background text-ink',
    },
    size: {
      xs: 'size-6 icon-3.5',
      sm: 'size-(--control-h-md) icon-4',
      default: 'size-(--control-h-lg) icon-4.5',
      lg: 'size-12 icon-5.5',
      xl: 'size-14 icon-7',
    },
    radius: {
      /** A rounded-sm square. */
      default: '',
      /** A circle. */
      full: 'rounded-full',
    },
  },
  compoundVariants: [
    // The corner is clamped to `min(--radius-md, tile/3)`, which resolves to
    // `--radius-md` at every size the kit draws - so one radius, not a ladder.
    { radius: 'default', size: 'xs', class: 'rounded-md' },
    { radius: 'default', size: 'sm', class: 'rounded-md' },
    { radius: 'default', size: 'default', class: 'rounded-md' },
    { radius: 'default', size: 'lg', class: 'rounded-md' },
    { radius: 'default', size: 'xl', class: 'rounded-md' },
  ],
  defaultVariants: { tone: 'muted', size: 'default', radius: 'default' },
})

/** The look this component takes. Spelled out so the docs generator can read it. */
export interface IconTileLook {
  /** Which ground the tile paints, from the token roles. */
  tone?: 'muted' | 'primary' | 'accent' | 'destructive' | 'solid' | 'outline'
  /** Tile size. `sm` and `default` sit on the `--control-h-*` scale. */
  size?: 'xs' | 'sm' | 'default' | 'lg' | 'xl'
  /** A rounded-sm square, or a circle. */
  radius?: 'default' | 'full'
}

export interface IconTileProps extends React.ComponentProps<'span'>, IconTileLook {}

export function IconTile({ tone, size, radius, className, ...props }: IconTileProps) {
  return (
    <span
      aria-hidden
      data-part="icon-tile"
      data-tone={tone ?? 'muted'}
      data-size={size ?? 'default'}
      className={cn(iconTile({ tone, size, radius }), className)}
      {...props}
    />
  )
}

export { iconTile as iconTileVariants }
