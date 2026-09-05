import type { TimelineEntry } from '@/api/model'

/**
 * A timeline entry as a *graph* reads it, which is not as the case stores it.
 *
 * **Its own module because it outlived the one it was declared in.**
 * `timelineLayout.ts` drew the SVG timeline graph; the cascade replaced that
 * and the file went, but every graph still needs this type. A type left behind
 * in a deleted module's file keeps ~600 lines of dead layout code compiling -
 * and `structure.test.ts` cannot see that, because `import type` erases at
 * build and still counts as a product import.
 */
export type GraphEntry = TimelineEntry
