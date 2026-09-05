/**
 * The shapes the report menus and the New report form are served as.
 *
 * **Their own module because a controller has side effects at import.**
 * `report.controller.ts` refuses an incomplete environment while it is being
 * loaded, so anything importing it for a *type* pays the whole boot check -
 * which is what took the response-verification suite down when these lived
 * there. A schema file imports nothing but Zod and can be read by a test.
 */
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * **What the report menus and the New report form are made of.**
 *
 * These three are read by one screen each and never written, so they are
 * envelopes rather than stored documents - declared here, where they are
 * served, instead of in `domain/`.
 */
export const reportSnippetsSchema = z.object({
  snippets: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      group: z.string(),
      hint: z.string(),
      body: z.string(),
      builtin: z.boolean(),
      language: z
        .string()
        .describe('The language actually served, which is "en" when the asked-for one is absent.'),
      languages: z.array(z.string()).describe('Every language this snippet carries.'),
    }),
  ),
  problems: z
    .array(z.string())
    .describe('Drop-ins that would not load. Always empty here \u2014 nothing parses a snippet file yet.'),
})

export type ReportSnippets = z.infer<typeof reportSnippetsSchema>

export const blockKindsSchema = z.object({
  groups: z.array(
    z.object({
      heading: z.string(),
      kinds: z.array(
        z.object({ kind: z.string(), label: z.string() }),
      ),
    }),
  ),
})

export type BlockKinds = z.infer<typeof blockKindsSchema>

export const reportLayoutsSchema = z.object({
  layouts: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      summary: z
        .string()
        .describe('One line saying what the report is for and who reads it, drawn on the card it is picked from.'),
      builtin: z.boolean(),
      nis2: z
        .boolean()
        .describe(
          'Whether a NIS2 stage applies, which is the layout requiring the nis2 feature. Groups the layout on the New report card list, and decides whether that form offers a reporting stage.',
        ),
      blocks: z.array(
        z.object({
          kind: z.string(),
          position: z.number().int(),
          /** The literal a layout wrote, where it wrote one. */
          heading: z.string(),
          /**
           * **The key a layout titles a written section by**, which every
           * shipped one uses in place of a literal. The client seeds a new
           * report's blocks from these, and a block created without it resolves
           * to no heading at all and to an identity no layout spec matches.
           */
          headingKey: z.string(),
          /** What a chip shows: the heading resolved in the language asked for. */
          label: z.string(),
        }),
      ),
    }),
  ),
  stages: z.array(z.string()).describe('Leading empty entry: "no stage" is a real choice.'),
  tlp: z.array(z.string()).describe('Leading empty entry, for the same reason as stages.'),
  languages: z.array(z.object({ code: z.string(), label: z.string() })),
  /**
   * Every heading key the pack resolves, in the language asked for: the pack
   * stays on the server, and what crosses is what it resolved.
   *
   * **Pairs rather than a map**, because the client camelCases every key it
   * receives and cannot tell a field name from a value.
   */
  headings: z.array(z.object({ key: z.string(), label: z.string() })),
})

export type ReportLayouts = z.infer<typeof reportLayoutsSchema>

export class ReportSnippetsDto extends createZodDto(reportSnippetsSchema) {}
export class BlockKindsDto extends createZodDto(blockKindsSchema) {}
export class ReportLayoutsDto extends createZodDto(reportLayoutsSchema) {}
