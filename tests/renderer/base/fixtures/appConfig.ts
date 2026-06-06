/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppConfig } from '@/base/appConfig';
import { deepFreeze } from '@common/helpers/deepFreeze';

const appConfig: AppConfig = {
  mainHotkey: '',
  memSaver: {
    activateWorkflowsOnProjectSwitch: true,
    workflowInactiveAfter: -1
  },
  uiTheme: 'light',
  downloadDir: '',
  bgColor: '',
  bgImage: '',
  bgImageMode: 'cover',
  bgOpacity: 100
}

export const fixtureAppConfig = (testData?: Partial<AppConfig>): AppConfig => deepFreeze({
  ...appConfig,
  ...testData
})
