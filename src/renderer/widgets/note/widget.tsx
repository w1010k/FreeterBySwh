/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { debounce } from '@/widgets/helpers';
import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import styles from './widget.module.scss';
import { Settings } from './settings';
import { ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContextMenuFactory, textAreaContextId } from '@/widgets/note/contextMenu';
import { createActionBarItems } from '@/widgets/note/actionBar';
import { Editor } from 'tiny-markdown-editor';
import { useSharedDataChangedEffect } from '@/widgets/sharedDataSync';

const keyNote = 'note';
const noteWidgetType = 'note';

// Han ideographs and kana aren't whitespace-separated, so each counts as one
// word (the convention word processors use). Hangul stays whitespace-based —
// Korean is written with spaces.
const cjkCharRe = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

export function computeCounts(text: string) {
  const cjkChars = text.match(cjkCharRe)?.length ?? 0;
  const rest = text.replace(cjkCharRe, ' ').trim();
  return { words: (rest === '' ? 0 : rest.split(/\s+/).length) + cjkChars, chars: text.length };
}

function NoteInner({widgetApi, settings}: WidgetReactComponentProps<Settings>) {
  const {updateActionBar, setContextMenuFactory, dataStorage} = widgetApi;
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const loadedNote = useRef('');
  // A remote change that arrived while this note was focused: applied on blur
  // so a focused note doesn't stay stale until the next broadcast.
  const pendingReload = useRef(false);
  // The tiny-markdown-editor instance when markdown mode is on (else null).
  // External reloads must go through its setContent(); writing textarea.value
  // alone wouldn't update the editor's own rendered DOM.
  const editorRef = useRef<Editor | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });

  // Update the word/char count off the keystroke path: the textarea is
  // uncontrolled (defaultValue + ref) precisely to avoid a re-render per
  // keystroke, so we debounce the count's setState to keep that property.
  const updateCounts = useMemo(() => debounce((text: string) => setCounts(computeCounts(text)), 250), []);

  useEffect(() => {
    if (isLoaded) {
      updateActionBar(createActionBarItems(textAreaRef.current, widgetApi));
      setContextMenuFactory(createContextMenuFactory(textAreaRef.current, widgetApi));
    }
  }, [isLoaded, updateActionBar, setContextMenuFactory, widgetApi]);

  // Save shortly after typing stops (was 3s — too long, made sibling notes feel
  // out of sync). Leaving the field flushes immediately (see handleBlur).
  const saveNote = useMemo(() => debounce((note: string) => dataStorage.setText(keyNote, note), 800), [dataStorage]);
  const updNote = useCallback((note: string) => {
    loadedNote.current = note;
    saveNote(note);
    updateCounts(note);
  }, [saveNote, updateCounts])

  const loadNote = useCallback(async function () {
    pendingReload.current = false;
    const next = await dataStorage.getText(keyNote) || '';
    loadedNote.current = next;
    setCounts(computeCounts(next));
    if (editorRef.current) {
      // Markdown mode: drive the editor so its rendered view updates too.
      if (editorRef.current.getContent() !== next) {
        editorRef.current.setContent(next);
      }
    } else if (textAreaRef.current && textAreaRef.current.value !== next) {
      textAreaRef.current.value = next;
    }
    setIsLoaded(true);
  }, [dataStorage]);

  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>((e) => {
    const newNote = e.target.value;
    updNote(newNote)
  }, [updNote])

  // On blur: persist the pending edit right away (don't wait out the debounce),
  // then apply any remote change that was deferred while the field was focused.
  const handleBlur = useCallback(() => {
    saveNote.flush();
    if (pendingReload.current) {
      loadNote();
    }
  }, [saveNote, loadNote])

  useEffect(() => {
    loadNote();
  }, [loadNote])

  // Persist a pending edit when the app quits (beforeunload) or the widget
  // unmounts (e.g. switching workflows) — otherwise a change made within the
  // debounce window would be lost.
  useEffect(() => {
    const flush = () => saveNote.flush();
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [saveNote])

  // Live sync via shared storage; skip reload while the user is typing in
  // this textarea, since their own debounced save echoes back as a broadcast
  // and we don't want to clobber unsaved keystrokes.
  useSharedDataChangedEffect(
    noteWidgetType,
    settings.sharedKeyId,
    () => {
      // While the user is editing this note, defer the remote change to blur
      // (handleBlur) instead of dropping it — otherwise a focused note would
      // stay stale until the next broadcast. In markdown mode the focused
      // element is the tiny-markdown-editor div, not the textarea.
      const editorEl = editorRef.current?.e;
      const editing = editorEl
        ? editorEl.contains(document.activeElement)
        : document.activeElement === textAreaRef.current;
      if (editing) {
        pendingReload.current = true;
        return true;
      }
      return false;
    },
    loadNote
  );

  // Markdown editor lifecycle. Create the tiny-markdown-editor when markdown is
  // on, wiring its change → save and its blur (focusout) → flush/deferred-reload
  // so the same sync guarantees as the plain textarea hold. Tear it down (and
  // remove its DOM, which lives outside React's tree) on cleanup.
  useEffect(() => {
    // Gated on isLoaded so it runs once the textarea is actually mounted.
    const textarea = textAreaRef.current;
    if (!isLoaded || !textarea || !settings.markdown) {
      return undefined;
    }
    const editor = new Editor({ textarea, content: loadedNote.current });
    editorRef.current = editor;
    editor.addEventListener('change', e => updNote(e.content));
    const editorEl = editor.e;
    if (editorEl) {
      editorEl.spellcheck = settings.spellCheck;
      editorEl.addEventListener('focusout', handleBlur);
    }
    return () => {
      editorRef.current = null;
      if (editorEl) {
        editorEl.removeEventListener('focusout', handleBlur);
        editorEl.remove();
      }
    };
  }, [isLoaded, settings.markdown, settings.spellCheck, updNote, handleBlur])

  return (
    isLoaded
    ? <>
        <textarea
          key={settings.markdown?'md':undefined} // resets element after disabling markdown
          ref={textAreaRef}
          className={styles['textarea']}
          defaultValue={loadedNote.current}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder='Write a note here'
          data-widget-context={textAreaContextId}
          spellCheck={settings.spellCheck}
        ></textarea>
        <div className={styles['note-count']}>{counts.words} words · {counts.chars} chars</div>
      </>
    : <>Loading Note...</>
  )
}

function WidgetComp(props: WidgetReactComponentProps<Settings>) {
  // Remount the inner component when the shared key changes so the `useEffect`
  // that loads from `dataStorage` runs against the new storage; the memoized
  // widgetApi keeps the same reference and won't otherwise trigger a reload.
  return <NoteInner key={props.settings.sharedKeyId ?? '__self__'} {...props} />;
}

export const widgetComp: ReactComponent<WidgetReactComponentProps<Settings>> = {
  type: 'react',
  Comp: WidgetComp
}
