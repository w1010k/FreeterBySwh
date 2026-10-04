/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AnalyticsServer } from '@/application/interfaces/analyticsServer';
import { DataStorage } from '@common/application/interfaces/dataStorage';
import { TelemetryEntitiesSnapshot, telemetryEventsKey, telemetryEventsKeyPrefix } from '@common/base/telemetry';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';

/**
 * The browser Analytics page can't read local files on its own (file:// pages
 * are barred from fetching them), so main serves the page plus read-only views
 * of the raw telemetry files over loopback. The data is sensitive (visited URLs,
 * window titles), so every request must:
 * - arrive on 127.0.0.1 with the exact Host we listen on (blocks DNS rebinding),
 * - carry the per-run random token as its first path segment (blocks other
 *   sites and local processes that don't know it; CORS is never granted).
 */

export interface AnalyticsRequest {
  method: string;
  url: string;
  host: string | undefined;
}

export interface AnalyticsResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
}

export interface AnalyticsRequestDeps {
  token: string;
  /** Exact Host header we accept, e.g. '127.0.0.1:53124'. */
  host: string;
  storage: Pick<DataStorage, 'getText' | 'getKeys' | 'clear'>;
  /** Reads a built page asset by bare file name; undefined when missing. */
  readPageFile: (name: string) => Promise<Buffer | undefined>;
  getEntities: () => TelemetryEntitiesSnapshot;
}

const baseHeaders: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  // The token lives in the URL path; never leak it to a page the user clicks through to.
  'Referrer-Policy': 'no-referrer',
};

const pageCsp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; "
  + "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const contentTypes: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  map: 'application/json; charset=utf-8',
};

const reDate = /^\d{4}-\d{2}-\d{2}$/;
/** A bare asset file name: no slashes, no leading dot (so no '..'). */
const reAssetName = /^[\w-][\w.-]*$/;

const json = (body: string): AnalyticsResponse => ({ status: 200, headers: { ...baseHeaders, 'Content-Type': contentTypes.map }, body });
const fail = (status: number): AnalyticsResponse => ({ status, headers: { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' }, body: `${status}` });

/**
 * Concatenates the raw day files in [from, to] into `[{"date","events"}, …]`
 * without parsing them, so main does no per-event work even for a year of data.
 */
async function eventsResponse(storage: AnalyticsRequestDeps['storage'], from: string | null, to: string | null): Promise<AnalyticsResponse> {
  if ((from !== null && !reDate.test(from)) || (to !== null && !reDate.test(to))) {
    return fail(400);
  }
  const dates = (await storage.getKeys())
    .filter(k => k.startsWith(telemetryEventsKeyPrefix))
    .map(k => k.slice(telemetryEventsKeyPrefix.length))
    .filter(date => reDate.test(date) && (!from || date >= from) && (!to || date <= to))
    .sort();
  const parts = await Promise.all(dates.map(async date => {
    const text = (await storage.getText(telemetryEventsKey(date)))?.trim() ?? '';
    // A day file cut short (crash mid-write, or read while a flush rewrites it) or
    // holding a non-array would break the whole concatenated response, so such a
    // day is served as empty instead.
    // ponytail: bracket check, not a full parse (a year is ~40MB and parsing would
    // stall main); garbage that still starts with '[' and ends with ']' slips through.
    const events = text.startsWith('[') && text.endsWith(']') ? text : '[]';
    return `{"date":"${date}","events":${events}}`;
  }));
  return json(`[${parts.join(',')}]`);
}

export async function handleAnalyticsRequest(req: AnalyticsRequest, deps: AnalyticsRequestDeps): Promise<AnalyticsResponse> {
  if (req.host !== deps.host) {
    return fail(403);
  }
  const url = new URL(req.url, `http://${deps.host}`);
  const prefix = `/${deps.token}/`;
  if (!url.pathname.startsWith(prefix)) {
    return fail(404);
  }
  const route = url.pathname.slice(prefix.length);

  if (route === 'api/clear') {
    if (req.method !== 'POST') {
      return fail(405);
    }
    await deps.storage.clear();
    return json('{}');
  }
  if (req.method !== 'GET') {
    return fail(405);
  }
  if (route === 'api/events') {
    return eventsResponse(deps.storage, url.searchParams.get('from'), url.searchParams.get('to'));
  }
  if (route === 'api/entities') {
    return json(JSON.stringify(deps.getEntities()));
  }

  const name = route || 'index.html';
  const ext = name.slice(name.lastIndexOf('.') + 1);
  if (!reAssetName.test(name) || !contentTypes[ext]) {
    return fail(404);
  }
  const body = await deps.readPageFile(name);
  if (!body) {
    return fail(404);
  }
  return {
    status: 200,
    headers: { ...baseHeaders, 'Content-Type': contentTypes[ext], ...(ext === 'html' ? { 'Content-Security-Policy': pageCsp } : {}) },
    body,
  };
}

interface Deps {
  /** Directory holding the built page (index.html + bundle). */
  pageDir: string;
  storage: AnalyticsRequestDeps['storage'];
}

export function createAnalyticsServer({ pageDir, storage }: Deps): AnalyticsServer {
  let entities: TelemetryEntitiesSnapshot = { projects: [], workflows: [], widgets: [] };
  /**
   * In-flight or finished start; shared so concurrent opens don't start two
   * servers, and awaited by stop() so a stop during startup still closes it.
   */
  let starting: Promise<{ srv: Server; url: string }> | null = null;

  const readPageFile = async (name: string) => {
    try {
      return await readFile(join(pageDir, name));
    } catch {
      return undefined;
    }
  }

  const start = async (): Promise<{ srv: Server; url: string }> => {
    const token = randomBytes(24).toString('hex');
    const srv = createServer();
    await new Promise<void>((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(0, '127.0.0.1', () => resolve());
    });
    const host = `127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const deps: AnalyticsRequestDeps = { token, host, storage, readPageFile, getEntities: () => entities };
    srv.on('request', (req, res) => {
      handleAnalyticsRequest({ method: req.method ?? 'GET', url: req.url ?? '/', host: req.headers.host }, deps)
        .catch(() => fail(500))
        .then(r => {
          res.writeHead(r.status, r.headers);
          res.end(r.body);
        });
    });
    return { srv, url: `http://${host}/${token}/` };
  }

  return {
    open: (snapshot) => {
      entities = snapshot;
      if (!starting) {
        starting = start().catch(err => {
          starting = null;
          throw err;
        });
      }
      return starting.then(({ url }) => url);
    },
    stop: () => {
      const pending = starting;
      starting = null;
      pending?.then(({ srv }) => {
        srv.close();
        // Keep-alive browser connections would otherwise hold the port open.
        srv.closeAllConnections();
      }, () => undefined);
    },
  }
}
