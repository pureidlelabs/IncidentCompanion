/**
 * `GET /api/openapi.json` - the API's own description, for a client that is
 * not the React app.
 *
 * **A Nest controller rather than `SwaggerModule.setup()`**, which mounts
 * through the HTTP adapter and is then never asked.
 *
 * **`@Public()` on the line the SPA shell and `/api/health` sit on: what the
 * response *contains*.** This is route shapes; `/api/health/resources` stays
 * guarded because it describes the machine. Both halves are asserted in
 * `openapi.test.ts`.
 */
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { Controller, Get, Injectable, NotFoundException } from '@nestjs/common'
import { Public } from '@thallesp/nestjs-better-auth'
import type { OpenAPIObject } from '@nestjs/swagger'

/**
 * Where the built document is kept. **A box rather than a factory, because it
 * cannot be built by a provider**: `SwaggerModule.createDocument` needs the
 * whole `INestApplication`, which is still being constructed while providers
 * resolve. `main.ts` builds it once the app exists and calls `set`; nothing
 * else does, so any other entry point serves the 404 below.
 */
@Injectable()
export class OpenApiStore {
  private document: OpenAPIObject | undefined

  set(document: OpenAPIObject): void {
    this.document = document
  }

  get(): OpenAPIObject | undefined {
    return this.document
  }
}

/**
 * This document, describing itself.
 *
 * **Loose, and it has to be.** Vendor extensions like `x-tagGroups` are part of
 * what this one serves, so a closed schema would refuse the very bytes the
 * route returns. The three required members are named so a generator can tell
 * it is looking at an OpenAPI document.
 */
const openApiDocumentSchema = z.looseObject({
  openapi: z.string().describe('The specification version, for example 3.0.0.'),
  info: z.looseObject({ title: z.string(), version: z.string() }),
  paths: z.record(z.string(), z.unknown()),
})

class OpenApiDocumentDto extends createZodDto(openApiDocumentSchema) {}

type PublishedDocument = z.infer<typeof openApiDocumentSchema>

@Controller('api')
export class OpenApiController {
  constructor(private readonly store: OpenApiStore) {}

  @Public()
  @Get('openapi.json')
  @ZodResponse({
    status: 200,
    type: OpenApiDocumentDto,
    description: 'This document. Readable without a session.',
  })
  read(): PublishedDocument {
    const document = this.store.get()
    if (!document) {
      // A 404 rather than an empty document: `{paths:{}}` reads as "this API
      // has no routes", which a generator consumes happily.
      throw new NotFoundException('The OpenAPI document was not built for this process.')
    }
    /**
     * Cast rather than loosening the schema: `OpenAPIObject` marks members
     * optional that a built document always has, and widening the schema to
     * match would stop the reference saying what a caller can rely on.
     */
    return document as unknown as PublishedDocument
  }
}
