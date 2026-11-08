/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { CreateSettingsState, ReactComponent, SettingsEditorReactComponentProps, SettingBlock } from '@/widgets/appModules';
import { AgentEffort, AgentTool, agentEfforts, agentTools } from '@common/ai/agent';

export interface Settings {
  tool: AgentTool;
  /** Model name as the CLI takes it; empty = the CLI's default. */
  model: string;
  /** Empty = the CLI's default. */
  effort: AgentEffort | '';
}

const toolNames: Record<AgentTool, string> = { claude: 'Claude Code', codex: 'Codex' };

export const createSettingsState: CreateSettingsState<Settings> = (settings) => ({
  tool: agentTools.includes(settings.tool as AgentTool) ? settings.tool as AgentTool : 'claude',
  model: typeof settings.model === 'string' ? settings.model : '',
  effort: agentEfforts.includes(settings.effort as AgentEffort) ? settings.effort as AgentEffort : '',
})

export function toolName(tool: AgentTool): string {
  return toolNames[tool];
}

function SettingsEditorComp({settings, settingsApi}: SettingsEditorReactComponentProps<Settings>) {
  const {updateSettings} = settingsApi;
  return (
    <>
      <SettingBlock titleForId='ai-chat-tool' title='AI Tool' moreInfo='The CLI installed on this computer that answers. A change starts a new conversation.'>
        <select id="ai-chat-tool" value={settings.tool} onChange={e => updateSettings({ ...settings, tool: e.target.value as AgentTool })}>
          {agentTools.map(t => <option key={t} value={t}>{toolNames[t]}</option>)}
        </select>
      </SettingBlock>
      <SettingBlock titleForId='ai-chat-model' title='Model' moreInfo='As the CLI takes it, e.g. sonnet or haiku (Claude Code), gpt-5 (Codex). Empty: the CLI default.'>
        <input type="text" id="ai-chat-model" value={settings.model} placeholder="(default)" onChange={e => updateSettings({ ...settings, model: e.target.value.trim() })}/>
      </SettingBlock>
      <SettingBlock titleForId='ai-chat-effort' title='Reasoning Effort'>
        <select id="ai-chat-effort" value={settings.effort} onChange={e => updateSettings({ ...settings, effort: e.target.value as Settings['effort'] })}>
          <option value="">(default)</option>
          {agentEfforts.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </SettingBlock>
      <p>
        The AI can read and change Freeter (projects, workflows, widgets, settings). Each change asks you first, unless
        &quot;AI actions: always allow&quot; is on in the app settings (actions that can run programs still ask).
      </p>
    </>
  )
}

export const settingsEditorComp: ReactComponent<SettingsEditorReactComponentProps<Settings>> = {
  type: 'react',
  Comp: SettingsEditorComp
}
