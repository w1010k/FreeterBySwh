/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { WidgetApi } from '@/widgets/appModules';
import { TextFileContent } from '@common/base/fs';
import { debounce } from '@/widgets/helpers';
import { Component, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MDXEditor, MDXEditorMethods, codeBlockPlugin, codeMirrorPlugin, frontmatterPlugin, headingsPlugin, imagePlugin, linkDialogPlugin,
  linkPlugin, listsPlugin, markdownShortcutPlugin, quotePlugin, tablePlugin, thematicBreakPlugin
} from '@mdxeditor/editor';
import styles from './widget.module.scss';

/** Delay after the last edit before the file is written. */
export const saveDelayMs = 500;
/** How often the active tab checks its file for changes made by other apps. */
export const externalCheckIntervalMs = 1000;

/**
 * MDXEditor always emits LF line endings and trims both ends of the document
 * (`trim()` also strips a UTF-8 BOM). Give `markdown` the BOM, line endings and
 * final newline of `fileText` (the file as it is on disk), so an edit does not
 * also rewrite those.
 */
export function matchFileFormat(markdown: string, fileText: string): string {
  const eol = fileText.includes('\r\n') ? '\r\n' : '\n';
  const body = eol === '\r\n' ? markdown.replace(/\r?\n/g, '\r\n') : markdown;
  const bom = fileText.startsWith('\uFEFF') && !body.startsWith('\uFEFF') ? '\uFEFF' : '';
  return bom + (fileText.endsWith('\n') ? body + eol : body);
}

type LoadState = { kind: 'loading' } | { kind: 'unreadable' } | { kind: 'ready', text: string };

interface DocEditorProps {
  /** Absolute path of the Markdown file. Fixed for the component's life (the parent keys it by path). */
  path: string;
  /** Only the active tab is visible, checks for external changes, and keeps unsaved edits pending. */
  active: boolean;
  fs: WidgetApi['fs'];
}

/** The syntax this editor understands. Anything else is a parse error, and the tab turns read-only. */
function createPlugins() {
  return [
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    tablePlugin(),
    imagePlugin(),
    frontmatterPlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: '' }),
    // Plain code editing for any fence language (an empty language list still
    // matches every fence without meta). Language support would load extra
    // webpack chunks on demand.
    codeMirrorPlugin({ codeBlockLanguages: {}, autoLoadLanguageSupport: false }),
    markdownShortcutPlugin()
  ];
}

/**
 * One tab: a WYSIWYG editor bound to one Markdown file. It saves edits a
 * moment after typing stops and reloads the file when another app changes it.
 * Rules that protect the file:
 * - Opening a file never writes it. The editor's first normalization pass is skipped.
 * - A file the editor cannot fully parse is read-only, so a lossy parse is never saved.
 * - An external change wins over an unsaved local edit: the edit is dropped and the file reloaded.
 */
export function DocEditor({ path, active, fs }: DocEditorProps) {
  const editorRef = useRef<MDXEditorMethods>(null);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [parseError, setParseError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const plugins = useMemo(() => createPlugins(), []);

  // The file content and mtime as last read or written by this tab. A changed
  // mtime whose content still equals diskText is this tab's own write.
  const diskText = useRef('');
  const diskMtime = useRef(0);
  // While a write is in flight the file's mtime is ahead of diskMtime, so the
  // external check would mistake the write for a change. It waits instead.
  const writesInFlight = useRef(0);
  // Counts every write started. A write that starts and finishes while the
  // check awaits a read leaves writesInFlight at 0, but the read may still
  // return the bytes from before that write; the changed count reveals it.
  const writesStarted = useRef(0);
  const checking = useRef(false);

  const writeFile = useCallback((text: string) => {
    writesInFlight.current += 1;
    writesStarted.current += 1;
    fs.writeTextFile(path, text).then(mtime => {
      if (mtime === null) {
        setSaveFailed(true);
        return;
      }
      diskText.current = text;
      diskMtime.current = mtime;
      setSaveFailed(false);
    }, () => setSaveFailed(true)).finally(() => {
      writesInFlight.current -= 1;
    });
  }, [fs, path]);
  const save = useMemo(() => debounce(writeFile, saveDelayMs), [writeFile]);

  /** Make a successful read the editor's initial state. */
  const applyLoaded = useCallback((res: TextFileContent) => {
    diskText.current = res.text;
    diskMtime.current = res.mtimeMs;
    setLoad({ kind: 'ready', text: res.text });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fs.readTextFile(path).catch(() => null).then(res => {
      if (!cancelled) {
        if (res) {
          applyLoaded(res);
        } else {
          setLoad({ kind: 'unreadable' });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fs, path, applyLoaded]);

  // An unreadable file (missing, over 10 MB) is retried while its tab is
  // visible, so a file created or shrunk later opens without reopening the tab.
  useEffect(() => {
    if (!active || load.kind !== 'unreadable') {
      return undefined;
    }
    let cancelled = false;
    const timer = setInterval(() => {
      fs.readTextFile(path).catch(() => null).then(res => !cancelled && res && applyLoaded(res));
    }, externalCheckIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, load.kind, fs, path, applyLoaded]);

  // Write a pending edit at once when the app window unloads or the tab goes
  // away (tab closed, widget unmounted). Saves on unload are fire-and-forget
  // (decisions.md D35), as in the Note widget.
  useEffect(() => {
    const flush = () => save.flush();
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [save]);

  // A hidden tab is not checked for external changes, so it must not keep an
  // edit pending that a later check would drop.
  useEffect(() => {
    if (!active) {
      save.flush();
    }
  }, [active, save]);

  const checkExternalChange = useCallback(async () => {
    if (checking.current || writesInFlight.current > 0) {
      return;
    }
    checking.current = true;
    const startedBefore = writesStarted.current;
    const wroteMeanwhile = () => writesInFlight.current > 0 || writesStarted.current !== startedBefore;
    try {
      const mtime = await fs.getMtime(path);
      setMissing(mtime === null);
      if (mtime === null || mtime === diskMtime.current || wroteMeanwhile()) {
        return;
      }
      const res = await fs.readTextFile(path);
      if (!res || wroteMeanwhile()) {
        return;
      }
      diskMtime.current = res.mtimeMs;
      if (res.text === diskText.current) {
        return;
      }
      save.cancel();
      diskText.current = res.text;
      // The new content gets a fresh parse; onError sets the flag again if it still fails.
      setParseError(null);
      // setMarkdown keeps the undo history, and it does not fire onChange.
      editorRef.current?.setMarkdown(res.text);
    } finally {
      checking.current = false;
    }
  }, [fs, path, save]);

  // ponytail: polls the file's mtime once a second (one IPC stat). fs.watch would
  // react faster, but it needs main-side watcher lifetimes and misses
  // rename-over saves on some platforms.
  useEffect(() => {
    if (!active || load.kind !== 'ready') {
      return undefined;
    }
    checkExternalChange();
    const timer = setInterval(checkExternalChange, externalCheckIntervalMs);
    return () => clearInterval(timer);
  }, [active, load.kind, checkExternalChange]);

  const onChange = useCallback((markdown: string, initialMarkdownNormalize: boolean) => {
    // The first call only reports the editor's normalized form of the loaded
    // text. Saving it would rewrite a file the user only opened.
    if (initialMarkdownNormalize) {
      return;
    }
    save(matchFileFormat(markdown, diskText.current));
  }, [save]);

  const onError = useCallback(({ error }: { error: string }) => {
    save.cancel();
    setParseError(error);
  }, [save]);

  if (load.kind === 'loading') {
    return null;
  }
  if (load.kind === 'unreadable') {
    return <div className={styles['message']}>Cannot open this file. It may be missing, larger than 10 MB, or unreadable. It opens by itself once it can be read.</div>;
  }
  return (
    <>
      {missing && <div className={styles['notice']}>This file no longer exists. Edits are not saved.</div>}
      {!missing && saveFailed && <div className={styles['notice']}>Could not save this file. The next edit tries again.</div>}
      {parseError !== null && (
        <div className={styles['notice']} title={parseError}>
          This file contains syntax the editor does not support, so it is read-only. Edit it in another app.
        </div>
      )}
      <MDXEditor
        ref={editorRef}
        className={styles['mdx']}
        contentEditableClassName={styles['mdx-content']}
        markdown={load.text}
        plugins={plugins}
        onChange={onChange}
        onError={onError}
        readOnly={parseError !== null}
        // Plain Markdown, not MDX: with HTML processing on, prose such as
        // `a<b` or `x <= y` is parsed as JSX and the file turns read-only
        // (measured, see CHANGES #91).
        suppressHtmlProcessing={true}
      />
    </>
  );
}

/** The file as plain read-only text, for a file the editor failed to show. */
function DocFallback({ path, fs, error, onRetry }: { path: string, fs: WidgetApi['fs'], error: string, onRetry: () => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fs.readTextFile(path).then(res => !cancelled && setText(res?.text ?? null), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [fs, path]);
  return (
    <>
      <div className={styles['notice']} title={error}>
        The editor cannot show this file (unsupported syntax, such as HTML in a table), so it is shown as read-only text.{' '}
        <button onClick={onRetry}>Retry</button>
      </div>
      {text !== null && <pre className={styles['raw']}>{text}</pre>}
    </>
  );
}

interface DocErrorBoundaryProps {
  path: string;
  fs: WidgetApi['fs'];
  children: ReactNode;
}

/**
 * Keeps an editor crash inside its tab. MDXEditor parses table cells lazily in
 * their own editors and throws on syntax it does not support (e.g. `<br>` in a
 * cell) instead of calling onError. Without this boundary the shell's
 * WidgetErrorBoundary would replace the whole widget, closing every tab.
 */
export class DocErrorBoundary extends Component<DocErrorBoundaryProps, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.error === null) {
      return this.props.children;
    }
    return <DocFallback path={this.props.path} fs={this.props.fs} error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}
