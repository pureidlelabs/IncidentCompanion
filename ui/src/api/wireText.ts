/**
 * Read a string field the generated types call required and the wire may omit.
 */
export function text(value: string | null | undefined): string {
  return value ?? ''
}
