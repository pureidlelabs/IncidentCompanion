/**
 * TLP 2.0's colour for a marking, spelled per level so Tailwind can see it.
 *
 * `AMBER+STRICT` takes AMBER's colour by the standard's own choice.
 */
const TONE: Readonly<Record<string, string>> = {
  'TLP:CLEAR': 'text-tlp-clear',
  'TLP:GREEN': 'text-tlp-green',
  'TLP:AMBER': 'text-tlp-amber',
  'TLP:AMBER+STRICT': 'text-tlp-amber',
  'TLP:RED': 'text-tlp-red',
}

/**
 * The ink class for a marking.
 *
 * A level this map has not heard of -- one added server-side before the map
 * hears about it -- keeps `TLP:CLEAR`'s white rather than the page foreground:
 * the ground is black in both themes, so a foreground ink is near-invisible on
 * a light screen. Nothing enumerates the vocabulary to decide whether a marking
 * may be shown.
 */
export function tlpTone(tlp: string): string {
  return TONE[tlp.toUpperCase()] ?? 'text-tlp-clear'
}
