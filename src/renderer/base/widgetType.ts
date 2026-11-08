/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetAiAction } from '@/base/ai/widgetAiAction';
import { Entity } from '@/base/entity';
import { SharedStateSliceName } from '@/base/state/shared';
import { WidgetSettings } from '@/base/widget';
import { WidgetApiModuleName } from '@/base/widgetApi';

export interface WidgetTypeComponent {
  /** Component type. Only 'react' supported now.
   *  TODO Add support for 'vanilla' if there will be need in vanilla components.*/
  readonly type: string;
}

export type CreateSettingsState<TSettings> = (curSettings: Partial<TSettings> & WidgetSettings) => TSettings;

export interface WidgetType<TSettings = WidgetSettings> extends Entity {
  readonly name: string;
  readonly icon: string;
  readonly minSize: {
    readonly w: number;
    readonly h: number;
  }
  readonly description: string;
  readonly maximizable?: boolean;
  readonly widgetComp: WidgetTypeComponent;
  readonly settingsEditorComp: WidgetTypeComponent;
  readonly createSettingsState: CreateSettingsState<TSettings>;
  readonly requiresApi?: WidgetApiModuleName[]; // specifies WidgetAPI modules it requires access to
  readonly requiresState?: SharedStateSliceName[];
  /** What AI agents may do with a widget of this type (see base/ai/widgetAiAction.ts). */
  readonly aiActions?: readonly WidgetAiAction[];
  /**
   * The widget runs programs or shell commands on the PC, or hands paths or URLs of any scheme to the OS (Commander,
   * File Opener, File Explorer, Terminal, Link Opener, Web Query): AI actions on it
   * and AI changes to its settings always ask, even with "always allow" on.
   */
  readonly runsPrograms?: boolean;
  /** Settings whose change by an AI always asks, even with "always allow" on: they run code (e.g. Webpage injectedJS). */
  readonly confirmSettings?: readonly string[];
  /** Called once the widget left the app state (deleted): ends what it runs outside its view. */
  readonly onDeleted?: (widgetId: string) => void;
}
