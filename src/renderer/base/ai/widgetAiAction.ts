/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AiRpcResult } from '@common/ai/protocol';

/** What a widget action gets when it runs. */
export interface WidgetAiActionContext {
  /** What the mounted widget passed to `widgetApi.exposeApi`. */
  api: Record<string, unknown>;
  settings: unknown;
}

/**
 * An AI action a widget type declares (WidgetType.aiActions). It is exposed as
 * '<widget type id>.<name>' with a `widgetId` input added. It runs only while the
 * widget is mounted, through the API the widget exposes, so the widget's own state
 * and save path stay the single writer.
 */
export interface WidgetAiAction<I = unknown> {
  name: string;
  /** English, read by the agent. */
  description: string;
  kind: 'read' | 'write';
  /** JSON Schema properties besides `widgetId`. */
  properties: Record<string, object>;
  required?: string[];
  /** Type guard for the untrusted input (without `widgetId`). */
  parse(input: Record<string, unknown>): I | undefined;
  /** English one-liner for the confirm dialog; `settings` lets it name what will run (links, commands). */
  describe(input: I, widgetName: string, settings: unknown): string;
  run(ctx: WidgetAiActionContext, input: I): Promise<AiRpcResult> | AiRpcResult;
}
