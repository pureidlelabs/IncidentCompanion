/**
 * TLP 2.0's colour for a marking, spelled per level so Tailwind can see it.
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
 */
export function tlpTone(tlp: string): string {
  return TONE[tlp.toUpperCase()] ?? 'text-tlp-clear'
}
