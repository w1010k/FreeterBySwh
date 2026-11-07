/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AppStore } from '@/application/interfaces/store';
import { asRecord, okNull } from '@/application/useCases/ai/actions/inputs';
import { AiAction } from '@/base/ai/aiAction';
import { AppConfig } from '@/base/appConfig';
import { uiThemes } from '@/base/uiTheme';

type Deps = {
  appStore: AppStore;
}

/**
 * The app settings an agent may change, each with its own check. Left out on purpose:
 * `telemetry` (the user's consent to usage statistics), `mainHotkey` (a bad value leaves
 * no way to bring up the window), and `memSaver` (nested config).
 */
const isString = (v: unknown) => typeof v === 'string';
const oneOf = (values: readonly string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
const editable = {
  uiTheme: (v: unknown) => uiThemes.some(t => t.id === v),
  bgColor: isString,
  bgImage: isString,
  bgImageMode: oneOf(['cover', 'contain', 'center', 'tile']),
  bgOpacity: (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100,
  workflowBarPos: oneOf(['top', 'bottom', 'left', 'right']),
  workflowBarWidth: (v: unknown) => Number.isInteger(v) && (v as number) > 0,
  downloadDir: isString,
} satisfies Partial<Record<keyof AppConfig, (v: unknown) => boolean>>;

type EditableKey = keyof typeof editable;
type EditableSettings = Partial<Pick<AppConfig, EditableKey>>;
const editableKeys = Object.keys(editable) as EditableKey[];

export function createSettingsAiActions({ appStore }: Deps): AiAction[] {
  const getSettings: AiAction<Record<string, never>> = {
    id: 'app.getSettings',
    description: `Read the app settings an agent may change: ${editableKeys.join(', ')}.`,
    kind: 'read',
    inputSchema: { type: 'object', properties: {} },
    parse: (input) => (asRecord(input) ? {} : undefined),
    describe: () => 'Read app settings',
    run: () => {
      const { appConfig } = appStore.get().ui;
      return { ok: true, value: Object.fromEntries(editableKeys.map(k => [k, appConfig[k]])) };
    }
  };

  const updateSettings: AiAction<EditableSettings> = {
    id: 'app.updateSettings',
    description: 'Change app settings. Keys: uiTheme (dark|light), bgColor, bgImage (file path), bgImageMode (cover|contain|center|tile), '
      + 'bgOpacity (0-100), workflowBarPos (top|bottom|left|right), workflowBarWidth (px), downloadDir (folder path).',
    kind: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        uiTheme: { enum: uiThemes.map(t => t.id) },
        bgColor: { type: 'string' },
        bgImage: { type: 'string' },
        bgImageMode: { enum: ['cover', 'contain', 'center', 'tile'] },
        bgOpacity: { type: 'integer', minimum: 0, maximum: 100 },
        workflowBarPos: { enum: ['top', 'bottom', 'left', 'right'] },
        workflowBarWidth: { type: 'integer', minimum: 1 },
        downloadDir: { type: 'string' },
      },
      additionalProperties: false
    },
    parse: (input) => {
      const o = asRecord(input);
      if (!o) {
        return undefined;
      }
      const entries = Object.entries(o);
      const valid = entries.length > 0 && entries.every(([k, v]) => Object.hasOwn(editable, k) && editable[k as EditableKey](v));
      return valid ? o as EditableSettings : undefined;
    },
    describe: (settings) => `Change app settings: ${Object.entries(settings).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join('; ')}`,
    run: (settings) => {
      const state = appStore.get();
      appStore.set({ ...state, ui: { ...state.ui, appConfig: { ...state.ui.appConfig, ...settings } } });
      return okNull;
    }
  };

  return [getSettings, updateSettings] as AiAction[];
}
