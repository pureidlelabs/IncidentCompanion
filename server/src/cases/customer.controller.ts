/**
 * `PUT /api/cases/:caseId/customer` - who this case answers for.
 */
import { Body, Controller, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common'
import { Session, type UserSession } from '@thallesp/nestjs-better-auth'
import { ZodResponse, createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { IncomingHttpHeaders } from 'node:http'

import { CaseAccessGuard } from '../access/case-access.guard.js'
import { InstallActivityService } from '../install-activity/install-activity.service.js'
import { CasesService } from './cases.service.js'

const attributeSchema = z.object({ customerId: z.uuid() }).strict()

class AttributedDto extends createZodDto(
  z.object({ done: z.literal(true), from: z.string().nullable() }),
) {}

class AttributeBodyDto extends createZodDto(attributeSchema) {}

@UseGuards(CaseAccessGuard)
@Controller('api/cases/:caseId/customer')
export class CaseCustomerController {
  constructor(
    private readonly cases: CasesService,
    private readonly activity: InstallActivityService,
  ) {}

  /**
   * Answers the customer it left, so a client can say what changed rather than
   * only that something did.
   */
  @Put()
  @ZodResponse({
    status: 200,
    type: AttributedDto,
    description: 'The case now answers for that customer.',
  })
  async attribute(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() body: AttributeBodyDto,
    @Session() session: UserSession,
    @Req() request: { headers: IncomingHttpHeaders },
  ): Promise<{ done: true; from: string | null }> {
    const { customerId } = attributeSchema.parse(body)
    const { from, title } = await this.cases.attribute(caseId, customerId, session.user.id)

    await this.activity.caseAttributed(
      { session, headers: request.headers, request },
      caseId,
      title,
      { from, to: customerId },
    )
    return { done: true, from }
  }
}
