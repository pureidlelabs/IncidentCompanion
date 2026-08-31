/**
 * Run queries one after another on a connection that can only carry one - a
 * transaction, never a pool, where `Promise.all` is still right.
 *
 * Takes thunks rather than query builders, so nothing is issued early. A
 * rejection stops the run: the queries behind a failing one are never sent.
 */
export async function inSeries<T extends readonly (() => PromiseLike<unknown>)[]>(
  ...thunks: [...T]
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const answers: unknown[] = []
  for (const thunk of thunks) {
    answers.push(await thunk())
  }
  return answers as { [K in keyof T]: Awaited<ReturnType<T[K]>> }
}
