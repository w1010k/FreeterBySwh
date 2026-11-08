/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { noteAiActions } from '@/widgets/note/aiActions';
import { WidgetAiAction } from '@/base/ai/widgetAiAction';

function setup(initial: string | undefined, busy = false, confirmed = false) {
  let text = initial;
  const set = jest.fn((t: string, allowedByUser?: boolean) => { if (busy && !allowedByUser) { return false; } text = t; return true; });
  const api = { note: { get: () => text, set } };
  const get = (name: string) => noteAiActions.find(a => a.name === name) as WidgetAiAction;
  const exec = (name: string, input: Record<string, unknown>) => {
    const parsed = get(name).parse(input);
    if (parsed === undefined) {
      throw new Error('parse failed');
    }
    return Promise.resolve(get(name).run({ api, settings: {}, confirmed }, parsed));
  };
  return { get, exec, text: () => text, set };
}

describe('noteAiActions', () => {
  it('setText tells the note that the user allowed the write in the box (the note takes it while being edited)', async () => {
    const s = setup('a', true, true);
    await expect(s.exec('setText', { text: 'c' })).resolves.toEqual({ ok: true, value: null });
    expect(s.set).toHaveBeenCalledWith('c', true);
  });

  it('getText returns the note', async () => {
    await expect(setup('hello').exec('getText', {})).resolves.toEqual({ ok: true, value: { text: 'hello' } });
  });

  it('returns not_ready while the note is still loading', async () => {
    await expect(setup(undefined).exec('getText', {})).resolves.toMatchObject({ ok: false, code: 'not_ready' });
  });

  it('setText replaces and appendText adds on a new line', async () => {
    const s = setup('a');
    await expect(s.exec('appendText', { text: 'b' })).resolves.toEqual({ ok: true, value: null });
    expect(s.text()).toBe('a\nb');
    await s.exec('setText', { text: 'c' });
    expect(s.text()).toBe('c');
    const empty = setup('');
    await empty.exec('appendText', { text: 'x' });
    expect(empty.text()).toBe('x');
  });

  it('answers failed when the user is typing in the note', async () => {
    const s = setup('a', true);
    await expect(s.exec('setText', { text: 'c' })).resolves.toMatchObject({ ok: false, code: 'failed' });
    expect(s.text()).toBe('a');
  });

  it('parse needs a string text', () => {
    const { get } = setup('');
    expect(get('setText').parse({ text: 3 })).toBeUndefined();
    expect(get('appendText').parse({ text: '' })).toBeUndefined();
    expect(get('setText').parse({ text: '' })).toEqual({ text: '' });
  });

  it('describes writes for the confirm dialog with the text size', () => {
    const { get } = setup('');
    expect(get('setText').describe({ text: 'abc' }, 'Ideas', {})).toBe('Replace the text of note "Ideas" (3 characters)');
    expect(get('appendText').describe({ text: 'ab' }, 'Ideas', {})).toBe('Append 2 characters to note "Ideas"');
  });
});
