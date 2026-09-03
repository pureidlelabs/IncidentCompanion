/**
 * `PUT /api/cases/:caseId/customer` - who this case is for.
 *
 * **Its own act, which is what `caseFormSchema` defers to** by leaving
 * `customerId` read-only: who a case is for decides who may reach it, so it is
 * not a field among fields on the edit form.
 *
 * **The level is `write` on the customer the case has now**, derived by
 * `levelNeeded` from the shape of this path, and that is the whole of the
 * check. An analyst working a case is who learns whose incident it is, so
 * requiring an administrator would leave them with nowhere to say so -- which
 * is the gap #218 is about. Reaching the destination is deliberately not
 * required: the case they are attributing is usually for an organisation they
 * do not yet work for, and demanding reach there refuses the ordinary use.
 *
 * **What that permits is a case moved out of the mover's own reach**, which is
 * the second scenario's premise rather than a hole: they already reached the
 * case, so nothing is gained, the line names both records, and an
 * administrator can move it back.
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
