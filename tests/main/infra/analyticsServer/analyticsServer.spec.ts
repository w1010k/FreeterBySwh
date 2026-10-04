/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { AnalyticsRequestDeps, handleAnalyticsRequest } from '@/infra/analyticsServer/analyticsServer';

const token = 'tok123';
const host = '127.0.0.1:5000';

function setup() {
  const files: Record<string, string> = {
    'events-2026-03-01': '[{"ts":1,"type":"app_focus"}]',
    'events-2026-03-02': '[{"ts":2,"type":"app_blur"}]',
    'events-2026-03-03': '[]',
    'events-2026-03-04': '[{"ts":4,"type":"app_fo',
    'events-2026-03-05': 'null',
    'other-key': 'x',
  };
  const deps: AnalyticsRequestDeps = {
    token,
    host,
    storage: {
      getKeys: jest.fn(async () => Object.keys(files)),
      getText: jest.fn(async (key: string) => files[key]),
      clear: jest.fn(async () => undefined),
    },
    readPageFile: jest.fn(async (name: string) => (name === 'index.html' || name === 'analytics.js' ? Buffer.from(name) : undefined)),
    getEntities: () => ({ projects: [{ id: 'p', name: 'P' }], workflows: [], widgets: [] }),
  };
  const get = (url: string, over: Partial<{ method: string; host: string }> = {}) =>
    handleAnalyticsRequest({ method: over.method ?? 'GET', url, host: over.host ?? host }, deps);
  return { deps, get };
}

describe('handleAnalyticsRequest', () => {
  it('rejects a foreign Host (DNS rebinding) and a missing/wrong token', async () => {
    const { get } = setup();
    expect((await get(`/${token}/`, { host: 'evil.example:5000' })).status).toBe(403);
    expect((await get('/api/events')).status).toBe(404);
    expect((await get('/nope/api/events')).status).toBe(404);
  });

  it('serves the page with a CSP, and only bare asset names', async () => {
    const { get } = setup();
    const page = await get(`/${token}/`);
    expect(page.status).toBe(200);
    expect(String(page.body)).toBe('index.html');
    expect(page.headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(page.headers['Referrer-Policy']).toBe('no-referrer');
    expect((await get(`/${token}/analytics.js`)).headers['Content-Type']).toContain('javascript');
    expect((await get(`/${token}/..%2Fmain.js`)).status).toBe(404);
    expect((await get(`/${token}/sub/analytics.js`)).status).toBe(404);
  });

  it('concatenates raw day files within the range without touching other keys', async () => {
    const { get } = setup();
    const res = await get(`/${token}/api/events?from=2026-03-02&to=2026-03-03`);
    expect(JSON.parse(String(res.body))).toEqual([
      { date: '2026-03-02', events: [{ ts: 2, type: 'app_blur' }] },
      { date: '2026-03-03', events: [] },
    ]);
    expect((await get(`/${token}/api/events?from=../x`)).status).toBe(400);
  });

  it('serves a truncated or non-array day file as empty so one bad day cannot break the report', async () => {
    const { get } = setup();
    const res = await get(`/${token}/api/events?from=2026-03-04&to=2026-03-05`);
    expect(JSON.parse(String(res.body))).toEqual([{ date: '2026-03-04', events: [] }, { date: '2026-03-05', events: [] }]);
  });

  it('serves entities and clears only on POST', async () => {
    const { get, deps } = setup();
    expect(JSON.parse(String((await get(`/${token}/api/entities`)).body)).projects).toEqual([{ id: 'p', name: 'P' }]);
    expect((await get(`/${token}/api/clear`)).status).toBe(405);
    expect(deps.storage.clear).not.toHaveBeenCalled();
    expect((await get(`/${token}/api/clear`, { method: 'POST' })).status).toBe(200);
    expect(deps.storage.clear).toHaveBeenCalledTimes(1);
  });
});
