/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { debounce } from '@/widgets/helpers';
import { ReactComponent, WidgetReactComponentProps } from '@/widgets/appModules';
import * as styles from './widget.module.scss';
import { Settings } from './settings';
import { ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContextMenuFactory, textAreaContextId } from '@/widgets/note/contextMenu';
import { createActionBarItems } from '@/widgets/note/actionBar';
import { Editor } from 'tiny-markdown-editor';

const keyNote = 'note';

function NoteInner({widgetApi, settings}: WidgetReactComponentProps<Settings>) {
  const {updateActionBar, setContextMenuFactory, dataStorage} = widgetApi;
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const loadedNote = useRef('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      updateActionBar(createActionBarItems(textAreaRef.current, widgetApi));
      setContextMenuFactory(createContextMenuFactory(textAreaRef.current, widgetApi));
    }
  }, [isLoaded, updateActionBar, setContextMenuFactory, widgetApi]);

  const saveNote = useMemo(() => debounce((note: string) => dataStorage.setText(keyNote, note), 3000), [dataStorage]);
  const updNote = useCallback((note: string) => {
    loadedNote.current = note;
    saveNote(note);
  }, [saveNote])

  const loadNote = useCallback(async function () {
    const next = await dataStorage.getText(keyNote) || '';
    loadedNote.current = next;
    if (textAreaRef.current && textAreaRef.current.value !== next) {
      textAreaRef.current.value = next;
    }
    setIsLoaded(true);
  }, [dataStorage]);

  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>((e) => {
    const newNote = e.target.value;
    updNote(newNote)
  }, [updNote])

  useEffect(() => {
    loadNote();
  }, [loadNote])

  // Live sync: when another widget sharing the same key writes to storage,
  // main broadcasts a `freeter:shared-data-changed` event. Reload from storage
  // unless the user is currently typing here (so we don't clobber unsaved
  // keystrokes — their own save is already in flight via the debounce).
  useEffect(() => {
    const sharedKeyId = settings.sharedKeyId;
    if (!sharedKeyId) {
      return undefined;
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ widgetType: string; sharedKeyId: string }>).detail;
      if (!detail || detail.widgetType !== 'note' || detail.sharedKeyId !== sharedKeyId) {
        return;
      }
      // Skip reload when the user is currently typing in this textarea —
      // their own debounced save will propagate here as a broadcast echo and
      // reloading would blow away in-progress keystrokes.
      if (document.activeElement === textAreaRef.current) {
        return;
      }
      loadNote();
    };
    window.addEventListener('freeter:shared-data-changed', handler);
    return () => window.removeEventListener('freeter:shared-data-changed', handler);
  }, [settings.sharedKeyId, loadNote]);

  useEffect(() => {
    if (textAreaRef.current) {
      if (settings.markdown) {
        const tinyMDE = new Editor({textarea: textAreaRef.current});
        tinyMDE.addEventListener('change', (e) => updNote(e.content));
        (textAreaRef.current.nextSibling as HTMLElement).spellcheck = settings.spellCheck;
      } else {
        loadedNote.current = textAreaRef.current.value;
        Array.from(textAreaRef.current.parentElement?.children || [])
          .filter(child => child.classList.contains('TinyMDE'))
          .forEach(child => child.remove());
      }
    }
  })

  return (
    isLoaded
    ? <textarea
        key={settings.markdown?'md':undefined} // resets element after disabling markdown
        ref={textAreaRef}
        className={styles['textarea']}
        defaultValue={loadedNote.current}
        onChange={handleChange}
        placeholder='Write a note here'
        data-widget-context={textAreaContextId}
        spellCheck={settings.spellCheck}
      ></textarea>
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
