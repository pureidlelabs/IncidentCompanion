/**
 * The install's language packs, for anything that prints in one.
 *
 * **Its own module because two features need it and neither may import the
 * other.** A report was the first thing to print in a language and the
 * reference is the second; `specs` may not import `report`, so the service
 * that answers *which packs are stored* belongs to neither of them.
 */
import { Module } from '@nestjs/common'

import { LanguageService } from './language.service.js'

@Module({
  providers: [LanguageService],
  exports: [LanguageService],
})
export class LanguagesModule {}
