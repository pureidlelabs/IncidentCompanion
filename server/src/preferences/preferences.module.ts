/**
 * Preferences, in both scopes - one module, two tables, because they are the
 * same subject with different owners.
 */
import { Module } from '@nestjs/common'

import { InstallPreferencesService } from './install.service.js'
import { PreferencesController } from './preferences.controller.js'
import { PreferencesService } from './preferences.service.js'
import { RegimesController } from './regimes.controller.js'

@Module({
  controllers: [PreferencesController, RegimesController],
  providers: [PreferencesService, InstallPreferencesService],
  exports: [PreferencesService, InstallPreferencesService],
})
export class PreferencesModule {}
