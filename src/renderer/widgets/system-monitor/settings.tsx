/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';

export type Settings = Record<string, never>;

export const createSettingsState: CreateSettingsState<Settings> = () => ({});

function SettingsEditorComp(_props: SettingsEditorReactComponentProps<Settings>) {
  return (
    <SettingBlock title='System Monitor'>
      <div>This widget has no settings. It shows live CPU, RAM, system drive, Freeter&apos;s own usage, battery (when present) and uptime.</div>
    </SettingBlock>
  );
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
