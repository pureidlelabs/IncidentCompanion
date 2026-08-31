/**
 * How a report prints a timestamp.
 *
 * **The pack registry that used to live here is gone.** It held English and
 * Dutch as an object literal, and its own docstring said adding a language was
 * "adding an entry here and nothing else" -- which meant a code change and a
 * rebuild. Packs are rows now: `packs.ts` decides what a pack *is*,
 * `language.service.ts` owns where they are stored, and the translator a
 * document prints with is resolved once and carried on `ReportInput`.
 *
 * What is left is the one piece of report vocabulary that is not a string in a
 * pack, because it is a format rather than a translation.
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
