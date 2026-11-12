/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetType } from '@/widgets/appModules';
import { settingsEditorComp, Settings, createSettingsState } from './settings';
import { widgetComp } from './widget';
import { widgetSvg } from './icons';
import { webpageAiActions } from './aiActions';

const widgetType: WidgetType<Settings> = {
  id: 'webpage',
  icon: widgetSvg,
  name: 'Webpage',
  minSize: {
    w: 4,
    h: 2
  },
  description: 'The Webpage widget allows you to make most frequently used web applications and webpages easily accessible by embedding them into workflow tabs.',
  maximizable: true,
  createSettingsState,
  settingsEditorComp,
  widgetComp,
  requiresApi: ['clipboard', 'shell', 'process', 'dataStorage', 'translate'],
  // Scripts and CSS run in the page with the user's login (CSS can send data out through url());
  // a URL, and the user agent sent with every request, can carry what the agent read to any site. The session settings
  // decide whose logins (cookies) the page runs with.
  confirmSettings: ['injectedJS', 'injectedCSS', 'customActions', 'url', 'tabs', 'userAgent', 'sessionScope', 'sessionPersist'],
  aiActions: webpageAiActions
}

export default widgetType;
