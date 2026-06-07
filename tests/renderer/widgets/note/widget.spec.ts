/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { widgetComp } from '@/widgets/note/widget'
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { SetupWidgetSutOptional, setupWidgetSut } from '@tests/widgets/setupSut'
import { SHARED_DATA_CHANGED_EVENT } from '@/base/sharedDataEvents';

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
  }
  return { Editor };
});

jest.useFakeTimers();

function setupNoteWidgetSut(optional?: SetupWidgetSutOptional) {
  return setupWidgetSut(widgetComp, { spellCheck: false, markdown: false, sharedKeyId: null }, optional);
}

describe('Note Widget', () => {
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
