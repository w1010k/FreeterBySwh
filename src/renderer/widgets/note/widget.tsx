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
import { useSharedDataChangedEffect } from '@/widgets/sharedDataSync';

const keyNote = 'note';
const noteWidgetType = 'note';

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

  // Live sync via shared storage; skip reload while the user is typing in
  // this textarea, since their own debounced save echoes back as a broadcast
  // and we don't want to clobber unsaved keystrokes.
  useSharedDataChangedEffect(
    noteWidgetType,
    settings.sharedKeyId,
    () => document.activeElement === textAreaRef.current,
    loadNote
  );

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
