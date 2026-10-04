/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { TelemetryEntitiesSnapshot } from '@common/base/telemetry';

/** Local-only HTTP server that feeds the browser Analytics page. */
export interface AnalyticsServer {
  /**
   * Starts the server (or reuses the running one), swaps in the latest id→name
   * snapshot, and resolves to the page URL (carries the per-run access token).
   */
  open(entities: TelemetryEntitiesSnapshot): Promise<string>;
  /** Stops serving. A later open() starts over with a new port and token. */
  stop(): void;
}
