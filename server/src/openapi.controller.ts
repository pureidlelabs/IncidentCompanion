/**
 * `GET /api/openapi.json` - the API's own description, for a client that is
 * not the React app.
 */
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { Controller, Get, Injectable, NotFoundException } from '@nestjs/common'
import { Public } from '@thallesp/nestjs-better-auth'
import type { OpenAPIObject } from '@nestjs/swagger'

/**
 * Where the built document is kept.
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
