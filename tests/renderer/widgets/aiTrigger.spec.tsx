/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { render } from '@testing-library/react';
import { createTriggerAiAction, useExposedAiFunction } from '@/widgets/aiTrigger';
import { linkOpenerAiActions } from '@/widgets/link-opener/aiActions';
import { fileOpenerAiActions } from '@/widgets/file-opener/aiActions';
import { commanderAiActions } from '@/widgets/commander/aiActions';

describe('createTriggerAiAction', () => {
  const action = createTriggerAiAction({ name: 'go', description: 'Go', apiKey: 'go', describe: (n) => `Go "${n}"` });

  it('calls the exposed function', async () => {
    const go = jest.fn();
    await expect(Promise.resolve(action.run({ api: { go }, settings: {} }, {}))).resolves.toEqual({ ok: true, value: null });
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('answers not_ready when the function is not exposed', async () => {
    await expect(Promise.resolve(action.run({ api: { other: 1 }, settings: {} }, {}))).resolves.toMatchObject({ ok: false, code: 'not_ready' });
  });

  it('is a write action without input', () => {
    expect(action.kind).toBe('write');
    expect(action.parse({})).toEqual({});
    expect(action.describe({}, 'W', {})).toBe('Go "W"');
  });
});

describe('useExposedAiFunction', () => {
  function Comp({ exposeApi, fn }: { exposeApi: (api: object) => void; fn: () => void }) {
    useExposedAiFunction(exposeApi, 'go', fn);
    return null;
  }

  it('exposes a function that calls the latest callback, and clears it on unmount', () => {
    const exposeApi = jest.fn();
    const first = jest.fn();
    const second = jest.fn();
    const { rerender, unmount } = render(<Comp exposeApi={exposeApi} fn={first} />);
    rerender(<Comp exposeApi={exposeApi} fn={second} />);
    (exposeApi.mock.calls.at(-1)?.[0] as { go: () => void }).go();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    unmount();
    expect(exposeApi).toHaveBeenLastCalledWith({});
  });
});

describe('trigger widgets', () => {
  it('Link Opener names the links it will open', () => {
    const [open] = linkOpenerAiActions;
    expect(open.name).toBe('openLinks');
    expect(open.describe({}, 'Docs', { urls: ['https://a.test', '', 'https://b.test'] })).toBe('Open 2 links from "Docs": https://a.test, https://b.test');
  });

  it('File Opener names the files or folders it will open', () => {
    const [open] = fileOpenerAiActions;
    expect(open.name).toBe('openFiles');
    expect(open.describe({}, 'Proj', { type: 1, files: ['C:\\a.txt'], folders: ['C:\\x'] })).toBe('Open 1 file(s) from "Proj": C:\\a.txt');
    expect(open.describe({}, 'Proj', { type: 2, files: [], folders: ['C:\\x'] })).toBe('Open 1 folder(s) from "Proj": C:\\x');
  });

  it('Commander shows the command lines and folder it will run', () => {
    const [run] = commanderAiActions;
    expect(run.name).toBe('runCommands');
    expect(run.describe({}, 'Build', { cmds: ['yarn build', ''], cwd: 'C:\\repo' })).toBe('Run in a terminal from "Build": yarn build (in C:\\repo)');
    expect(run.describe({}, 'Build', { cmds: ['ls'], cwd: '' })).toBe('Run in a terminal from "Build": ls');
  });
});
