/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { computeCounts, widgetComp } from '@/widgets/note/widget'
import { Settings } from '@/widgets/note/settings';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut'
import { SHARED_DATA_CHANGED_EVENT } from '@/base/sharedDataEvents';
import { Editor } from 'tiny-markdown-editor';

// Lightweight stand-in for the markdown editor so we can assert the widget
// drives it via setContent() on remote reloads (jsdom can't host the real
// contenteditable editor reliably). markdown:false tests never construct it.
jest.mock('tiny-markdown-editor', () => {
  class Editor {
    static last: Editor | null = null;
    e: HTMLDivElement;
    private content: string;
    constructor(props?: { content?: string }) {
      this.content = props?.content ?? '';
      this.e = document.createElement('div');
      this.e.className = 'TinyMDE';
      document.body.appendChild(this.e);
      Editor.last = this;
    }
    addEventListener() { /* no-op for tests */ }
    setContent(c: string) { this.content = c; }
    getContent() { return this.content; }
    destroy = jest.fn(() => this.e.remove());
  }
  return { Editor };
});

jest.useFakeTimers();

function setupNoteWidgetSut(optional?: SetupWidgetSutOptional) {
  return setupWidgetSut<Settings>(widgetComp, { spellCheck: false, markdown: false, sharedKeyId: null }, optional);
}

describe('computeCounts()', () => {
  it('should count whitespace-separated words and all chars', () => {
    expect(computeCounts('hello world')).toEqual({ words: 2, chars: 11 });
    expect(computeCounts('  ')).toEqual({ words: 0, chars: 2 });
  })
  it('should count each Han/kana character as a word (no whitespace segmentation)', () => {
    expect(computeCounts('日本語のテスト')).toEqual({ words: 7, chars: 7 });
  })
  it('should keep counting Korean by spaces', () => {
    expect(computeCounts('안녕하세요 세계')).toEqual({ words: 2, chars: 8 });
  })
  it('should count mixed CJK and latin text', () => {
    expect(computeCounts('한국어 and 漢字')).toEqual({ words: 4, chars: 10 });
  })
})

describe('Note Widget', () => {
  it('flushes the previous note to its captured storage when the shared key changes', async () => {
    const values: Record<string, string> = { self: 'private', shared: 'shared original' };
    let current = 'self';
    const dataStorage = {
      getText: jest.fn(async () => values[current]),
      setText: jest.fn(async (_key: string, text: string) => { values[current] = text; }),
      captureTextWriter: () => {
        const captured = current;
        return async (_key: string, text: string) => { values[captured] = text; };
      },
    };
    const { setSettings } = setupNoteWidgetSut({ mockWidgetApi: { dataStorage } });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('private'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'private edit' } });
    current = 'shared';
    setSettings({ spellCheck: false, markdown: false, sharedKeyId: 'KEY' });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('shared original'));
    expect(values.self).toBe('private edit');
    expect(values.shared).toBe('shared original');
  });
  it('destroys the markdown editor and its document listeners on unmount', async () => {
    const { comp } = setupWidgetSut(widgetComp, { spellCheck: false, markdown: true, sharedKeyId: null }, {
      mockWidgetApi: { dataStorage: { getText: jest.fn().mockResolvedValue('saved note') } }
    });
    await waitFor(() => expect(document.querySelector('.TinyMDE')).toBeInTheDocument());
    const editor = (Editor as unknown as { last: { destroy: jest.Mock } }).last;
    comp.unmount();
    expect(editor.destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.TinyMDE')).not.toBeInTheDocument();
  });

  it('keeps unread data protected after a storage read failure', async () => {
    const setText = jest.fn();
    setupNoteWidgetSut({ mockWidgetApi: { dataStorage: {
      getText: jest.fn().mockRejectedValue(new Error('EACCES')), setText
    } } });
    expect(await screen.findByText(/Unable to load note/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(setText).not.toHaveBeenCalled();
  });

  it('should show the loading status and hide the textbox on start', async () => {
    setupNoteWidgetSut();

    await waitFor(() => {
      expect(screen.getByText('Loading Note...')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    })
  })

  it('should hide the loading status and show the textbox after loading data', async () => {
    setupNoteWidgetSut();

    await waitFor(() => {
      expect(screen.getByText('Loading Note...')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading Note...')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    })
  })

  it('should get the note stored in DataStorage on start', async () => {
    const testNote = 'TEST NOTE';
    const getText = jest.fn().mockResolvedValue(testNote);
    setupNoteWidgetSut({
      mockWidgetApi: {
        dataStorage: {
          getText
        }
      }
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    })

    expect(getText).toHaveBeenCalledWith('note');
    expect(screen.getByRole<HTMLTextAreaElement>('textbox')).toHaveValue(testNote);
  })

  it('should have an empty note when DataStorage does not have the note data', async () => {
    const getText = jest.fn().mockResolvedValue(undefined);
    setupNoteWidgetSut({
      mockWidgetApi: {
        dataStorage: {
          getText
        }
      }
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    })

    expect(getText).toHaveBeenCalledWith('note');
    expect(screen.getByRole<HTMLTextAreaElement>('textbox')).toHaveValue('');
  })

  it('should update the note in DataStorage after an ~800ms idle delay, resetting on each keystroke', async () => {
    const setText = jest.fn();
    const { userEvent } = setupNoteWidgetSut({
      mockWidgetApi: {
        dataStorage: {
          setText
        }
      }
    });
    const user = userEvent.setup({ delay: null });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    })

    const textbox = screen.getByRole('textbox');

    await user.type(textbox, 'AB');
    act(() => jest.advanceTimersByTime(500));
    expect(setText).toHaveBeenCalledTimes(0);

    // Another keystroke resets the debounce timer.
    await user.type(textbox, 'CD');
    act(() => jest.advanceTimersByTime(500));
    expect(setText).toHaveBeenCalledTimes(0);

    act(() => jest.advanceTimersByTime(800));
    expect(setText).toHaveBeenCalledTimes(1);
    expect(setText).toHaveBeenCalledWith('note', 'ABCD');
  })

  it('should flush the pending save immediately on blur (no debounce wait)', async () => {
    const setText = jest.fn();
    const { userEvent } = setupNoteWidgetSut({
      mockWidgetApi: {
        dataStorage: {
          setText
        }
      }
    });
    const user = userEvent.setup({ delay: null });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    })

    const textbox = screen.getByRole('textbox');
    await user.type(textbox, 'HELLO');
    expect(setText).toHaveBeenCalledTimes(0); // still within the debounce window

    act(() => { fireEvent.blur(textbox); });
    expect(setText).toHaveBeenCalledWith('note', 'HELLO');
  })

  it('should flush the pending save on app quit (beforeunload)', async () => {
    const setText = jest.fn();
    const { userEvent } = setupNoteWidgetSut({
      mockWidgetApi: {
        dataStorage: {
          setText
        }
      }
    });
    const user = userEvent.setup({ delay: null });

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    })

    await user.type(screen.getByRole('textbox'), 'BYE');
    expect(setText).toHaveBeenCalledTimes(0); // still within the debounce window

    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    expect(setText).toHaveBeenCalledWith('note', 'BYE');
  })

  it('should defer a remote change while the note is focused and apply it on blur', async () => {
    const getText = jest.fn().mockResolvedValue('OLD');
    setupWidgetSut(widgetComp, { spellCheck: false, markdown: false, sharedKeyId: 'K' }, {
      mockWidgetApi: { dataStorage: { getText } }
    });

    await waitFor(() => expect(screen.getByRole<HTMLTextAreaElement>('textbox')).toHaveValue('OLD'));
    const textbox = screen.getByRole<HTMLTextAreaElement>('textbox');

    act(() => { textbox.focus(); });
    getText.mockResolvedValue('NEW'); // a sibling note changed the shared data

    act(() => {
      window.dispatchEvent(new CustomEvent(SHARED_DATA_CHANGED_EVENT, { detail: { widgetType: 'note', sharedKeyId: 'K' } }));
    });

    // Focused → the reload is deferred, not dropped.
    expect(textbox).toHaveValue('OLD');

    act(() => { fireEvent.blur(textbox); });
    await waitFor(() => expect(textbox).toHaveValue('NEW'));
  })

  it('should preserve edits made while a shared-note reload is pending', async () => {
    let resolveReload!: (text: string) => void;
    const getText = jest.fn().mockResolvedValueOnce('OLD').mockImplementationOnce(
      () => new Promise<string>(resolve => { resolveReload = resolve; })
    );
    const setText = jest.fn();
    setupWidgetSut(widgetComp, { spellCheck: false, markdown: false, sharedKeyId: 'K' }, {
      mockWidgetApi: { dataStorage: { getText, setText } }
    });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('OLD'));

    act(() => {
      window.dispatchEvent(new CustomEvent(SHARED_DATA_CHANGED_EVENT, { detail: { widgetType: 'note', sharedKeyId: 'K' } }));
    });
    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: 'MY EDIT' } });
    await act(async () => { resolveReload('REMOTE'); });

    expect(textbox).toHaveValue('MY EDIT');
    act(() => jest.advanceTimersByTime(800));
    expect(setText).toHaveBeenLastCalledWith('note', 'MY EDIT');
  });

  it('should ignore a shared-note reload superseded by a newer reload', async () => {
    let resolveOlder!: (text: string) => void;
    const getText = jest.fn().mockResolvedValueOnce('OLD').mockImplementationOnce(
      () => new Promise<string>(resolve => { resolveOlder = resolve; })
    ).mockResolvedValueOnce('NEWEST');
    setupWidgetSut(widgetComp, { spellCheck: false, markdown: false, sharedKeyId: 'K' }, {
      mockWidgetApi: { dataStorage: { getText } }
    });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('OLD'));
    const broadcast = () => window.dispatchEvent(new CustomEvent(SHARED_DATA_CHANGED_EVENT, {
      detail: { widgetType: 'note', sharedKeyId: 'K' }
    }));
    act(() => { broadcast(); broadcast(); });
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('NEWEST'));
    await act(async () => { resolveOlder('STALE'); });

    expect(screen.getByRole('textbox')).toHaveValue('NEWEST');
  });

  it('markdown mode: should drive the editor via setContent() on a remote change', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Editor } = require('tiny-markdown-editor') as { Editor: { last: { getContent(): string } | null } };
    const getText = jest.fn().mockResolvedValue('OLD');
    setupWidgetSut(widgetComp, { spellCheck: false, markdown: true, sharedKeyId: 'K' }, {
      mockWidgetApi: { dataStorage: { getText } }
    });

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());
    const editor = Editor.last!;
    expect(editor).toBeTruthy();

    getText.mockResolvedValue('NEW'); // a sibling note changed the shared data
    act(() => {
      window.dispatchEvent(new CustomEvent(SHARED_DATA_CHANGED_EVENT, { detail: { widgetType: 'note', sharedKeyId: 'K' } }));
    });

    // Not focused → reload runs and pushes content into the editor (not just the textarea).
    await waitFor(() => expect(editor.getContent()).toBe('NEW'));
  })

  it('should show the word/char count of the loaded note', async () => {
    setupNoteWidgetSut({
      mockWidgetApi: { dataStorage: { getText: jest.fn().mockResolvedValue('Hello world') } }
    });

    await waitFor(() => expect(screen.getByText('2 words · 11 chars')).toBeInTheDocument());
  })

  it('should live-update the word/char count after typing (debounced)', async () => {
    const { userEvent } = setupNoteWidgetSut({
      mockWidgetApi: { dataStorage: { getText: jest.fn().mockResolvedValue('') } }
    });
    const user = userEvent.setup({ delay: null });

    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument());
    expect(screen.getByText('0 words · 0 chars')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'one two three');
    act(() => jest.advanceTimersByTime(250));

    expect(screen.getByText('3 words · 13 chars')).toBeInTheDocument();
  })
})
