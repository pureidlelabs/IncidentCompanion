import { Module } from '@nestjs/common'

import { LibraryController } from './library.controller.js'
import { LibraryService } from './library.service.js'

/**
 * What a case, a report or a written section starts from. Install-level, so it
 * opens no case and scopes nothing. -> `db/schema/library.ts`
 */
// **Exported, because the report's New form reads layouts and styles from
// here.** One registry for every drop-in kind is what makes an analyst's own
// file appear without a code change; a second reader with its own query would
// be the second answer that eventually disagrees.
@Module({
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
