/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetApi } from '@/widgets/appModules';
import { DocEditor, DocErrorBoundary, matchFileFormat } from '@/widgets/markdown-editor/docEditor';
import { act, render, screen } from '@testing-library/react';
// moduleNameMapper redirects this to the manual mock (tests/__mocks__/mdxEditor.js).
import * as mdxEditor from '@mdxeditor/editor';

interface MockInstance {
  props: {
    markdown: string;
    readOnly?: boolean;
    onChange: (markdown: string, initialMarkdownNormalize: boolean) => void;
    onError: (payload: { error: string, source: string }) => void;
  };
  setMarkdown: jest.Mock;
}
const editorMock = mdxEditor as unknown as { __getInstances: () => MockInstance[], __reset: () => void };

const path = '/notes/doc.md';

function makeFs(fs: Partial<WidgetApi['fs']> = {}): WidgetApi['fs'] {
  return {
    readDir: jest.fn(async () => []),
    getHomeDir: jest.fn(async () => ''),
    readTextFile: jest.fn(async () => ({ text: '# A', mtimeMs: 1 })),
    writeTextFile: jest.fn(async () => 2),
    getMtime: jest.fn(async () => 1),
    ...fs
  };
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function setup(fs: WidgetApi['fs'], active = true) {
  const comp = render(<DocEditor path={path} active={active} fs={fs} />);
  await advance(0);
  return { comp, editor: () => editorMock.__getInstances()[0] };
}

jest.useFakeTimers();

beforeEach(() => {
  jest.clearAllMocks();
  editorMock.__reset();
})

describe('Markdown Editor DocEditor', () => {
  it('should open the file in the editor without writing it', async () => {
    const fs = makeFs();
    const { editor } = await setup(fs);

    expect(editor().props.markdown).toBe('# A');
    act(() => editor().props.onChange('# A\n', true));
    await advance(2000);

    expect(fs.writeTextFile).not.toHaveBeenCalled();
  })

  it('should save a real edit once typing pauses', async () => {
    const fs = makeFs();
    const { editor } = await setup(fs);

    act(() => editor().props.onChange('# B', false));
    await advance(499);
    expect(fs.writeTextFile).not.toHaveBeenCalled();
    await advance(1);

    expect(fs.writeTextFile).toHaveBeenCalledWith(path, '# B');
  })

  it('should turn read-only on a parse error and drop the pending edit', async () => {
    const fs = makeFs();
    const { editor } = await setup(fs);

    act(() => editor().props.onChange('# B', false));
    act(() => editor().props.onError({ error: 'Unsupported markdown syntax', source: '' }));
    await advance(1000);

    expect(fs.writeTextFile).not.toHaveBeenCalled();
    expect(screen.getByTestId('mdx-editor')).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  })

  it('should reload an external change and drop the pending edit', async () => {
    const fs = makeFs({
      getMtime: jest.fn().mockResolvedValueOnce(1).mockResolvedValue(5),
      readTextFile: jest.fn()
        .mockResolvedValueOnce({ text: '# A', mtimeMs: 1 })
        .mockResolvedValue({ text: '# External', mtimeMs: 5 })
    });
    const { editor } = await setup(fs);

    await advance(800);
    act(() => editor().props.onChange('# Mine', false));
    await advance(200);
    expect(editor().setMarkdown).toHaveBeenCalledWith('# External');
    await advance(1000);

    expect(fs.writeTextFile).not.toHaveBeenCalled();
  })

  it('should not reload after its own save', async () => {
    const fs = makeFs({ writeTextFile: jest.fn(async () => 2), getMtime: jest.fn().mockResolvedValueOnce(1).mockResolvedValue(2) });
    const { editor } = await setup(fs);

    act(() => editor().props.onChange('# B', false));
    await advance(3000);

    expect(fs.writeTextFile).toHaveBeenCalledTimes(1);
    expect(fs.readTextFile).toHaveBeenCalledTimes(1);
    expect(editor().setMarkdown).not.toHaveBeenCalled();
  })

  it('should ignore a read that a save overtook', async () => {
    let resolveRead: (v: { text: string, mtimeMs: number }) => void = () => undefined;
    const fs = makeFs({
      getMtime: jest.fn().mockResolvedValueOnce(1).mockResolvedValue(9),
      readTextFile: jest.fn()
        .mockResolvedValueOnce({ text: '# A', mtimeMs: 1 })
        .mockImplementationOnce(() => new Promise(r => { resolveRead = r; })),
      writeTextFile: jest.fn(async () => 10),
    });
    const { editor } = await setup(fs);

    await advance(1000);
    act(() => editor().props.onChange('# B', false));
    await advance(500);
    expect(fs.writeTextFile).toHaveBeenCalledWith(path, '# B');
    // The read was issued before the save, so it returns the old bytes.
    resolveRead({ text: '# A', mtimeMs: 9 });
    await advance(0);

    expect(editor().setMarkdown).not.toHaveBeenCalled();
  })

  it('should treat a changed mtime with its own content as no change', async () => {
    const fs = makeFs({ getMtime: jest.fn().mockResolvedValueOnce(1).mockResolvedValue(9), readTextFile: jest.fn(async () => ({ text: '# A', mtimeMs: 9 })) });
    const { editor } = await setup(fs);

    await advance(1000);

    expect(fs.readTextFile).toHaveBeenCalledTimes(2);
    expect(editor().setMarkdown).not.toHaveBeenCalled();
  })

  it('should write a pending edit at once on unmount', async () => {
    const fs = makeFs();
    const { comp, editor } = await setup(fs);

    act(() => editor().props.onChange('# B', false));
    comp.unmount();

    expect(fs.writeTextFile).toHaveBeenCalledWith(path, '# B');
  })

  it('should write a pending edit at once when the tab is hidden, and stop checking the file', async () => {
    const fs = makeFs();
    const { comp, editor } = await setup(fs);

    act(() => editor().props.onChange('# B', false));
    comp.rerender(<DocEditor path={path} active={false} fs={fs} />);
    expect(fs.writeTextFile).toHaveBeenCalledWith(path, '# B');
    const checks = (fs.getMtime as jest.Mock).mock.calls.length;
    await advance(3000);

    expect(fs.getMtime).toHaveBeenCalledTimes(checks);
  })

  it('should show a message for a file it cannot read', async () => {
    await setup(makeFs({ readTextFile: jest.fn(async () => null) }));

    expect(screen.getByText(/cannot open this file/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mdx-editor')).not.toBeInTheDocument();
  })

  it('should keep the file\'s CRLF line endings and final newline when saving', async () => {
    const fs = makeFs({ readTextFile: jest.fn(async () => ({ text: '# A\r\n\r\ntext\r\n', mtimeMs: 1 })) });
    const { editor } = await setup(fs);

    act(() => editor().props.onChange('# A\n\ntext edited', false));
    await advance(500);

    expect(fs.writeTextFile).toHaveBeenCalledWith(path, '# A\r\n\r\ntext edited\r\n');
  })

  it('should open a file that becomes readable later while its tab is visible', async () => {
    const fs = makeFs({ readTextFile: jest.fn().mockResolvedValueOnce(null).mockResolvedValue({ text: '# Late', mtimeMs: 1 }) });
    await setup(fs);
    expect(screen.getByText(/cannot open this file/i)).toBeInTheDocument();

    await advance(1000);

    expect(screen.getByTestId('mdx-editor')).toHaveTextContent('# Late');
  })

  it('should not retry an unreadable file while its tab is hidden', async () => {
    const fs = makeFs({ readTextFile: jest.fn(async () => null) });
    await setup(fs, false);

    await advance(3000);

    expect(fs.readTextFile).toHaveBeenCalledTimes(1);
  })

  it('should show a notice when the file disappears', async () => {
    await setup(makeFs({ getMtime: jest.fn(async () => null) }));

    expect(screen.getByText(/no longer exists/i)).toBeInTheDocument();
  })
})

describe('matchFileFormat()', () => {
  it('should follow the file\'s line endings and final newline', () => {
    expect(matchFileFormat('a\nb', 'x\n')).toBe('a\nb\n');
    expect(matchFileFormat('a\nb', 'x')).toBe('a\nb');
    expect(matchFileFormat('a\nb', 'x\r\ny\r\n')).toBe('a\r\nb\r\n');
    expect(matchFileFormat('a\nb', '')).toBe('a\nb');
    expect(matchFileFormat('a', '\uFEFFx\n')).toBe('\uFEFFa\n');
  })
})

describe('DocErrorBoundary', () => {
  function Crash(): never {
    throw new Error('Parsing of the following markdown structure failed');
  }

  it('should keep an editor crash inside the tab and show the file as read-only text', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const fs = makeFs({ readTextFile: jest.fn(async () => ({ text: '| 1<br>2 |', mtimeMs: 1 })) });
    render(<div><span>other widget</span><DocErrorBoundary path={path} fs={fs}><Crash /></DocErrorBoundary></div>);
    await advance(0);

    expect(screen.getByText('other widget')).toBeInTheDocument();
    expect(screen.getByText(/shown as read-only text/i)).toBeInTheDocument();
    expect(screen.getByText('| 1<br>2 |')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(fs.writeTextFile).not.toHaveBeenCalled();
    (console.error as jest.Mock).mockRestore();
  })
})
