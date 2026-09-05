/**
 * How a report prints a timestamp.
 */
export function formatTimestamp(
  value: Date | string | null | undefined,
  options: { zone?: boolean } = {},
): string {
  if (!value) return ''
  const when = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(when.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${String(when.getUTCFullYear())}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())} ` +
    `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}`
  // **The zone is dropped only where a column title carries it.** Four
  // characters per cell wrapped every timestamp in the timeline over two lines;
  // a fact standing on its own keeps it, because there is no header to say it.
  return options.zone === false ? stamp : `${stamp} UTC`
}
